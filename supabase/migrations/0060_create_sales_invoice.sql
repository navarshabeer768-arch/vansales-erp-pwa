-- ============================================================================
-- 0060_create_sales_invoice.sql
-- Direct invoice creation + shared totals recalculation. Same pattern as
-- create_sales_order()/recalculate_sales_order_totals() (5A.2 Part 1).
-- Continues 0059.
-- ============================================================================

create or replace function recalculate_sales_invoice_totals(p_invoice_id uuid, p_items jsonb, p_customer_id uuid)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_company_id uuid := current_company_id();
  v_item jsonb;
  v_product products%rowtype;
  v_uom product_uoms%rowtype;
  v_price_resolved record;
  v_discount_rule customer_discounts%rowtype;
  v_free_rule free_quantity_rules%rowtype;
  v_qty numeric;
  v_base_qty numeric;
  v_applied_price numeric;
  v_price_source text;
  v_discount_pct numeric;
  v_discount_amt numeric;
  v_discount_source text;
  v_is_exempt boolean;
  v_taxable numeric;
  v_tax_amt numeric;
  v_gross numeric;
  v_net numeric;
  v_sequence integer := 0;
  v_gross_total numeric := 0;
  v_item_discount_total numeric := 0;
  v_promo_discount_total numeric := 0;
  v_taxable_total numeric := 0;
  v_tax_total numeric := 0;
  v_net_total numeric := 0;
  v_total_qty numeric := 0;
  v_free_qty_total numeric := 0;
  v_base_qty_total numeric := 0;
  v_weight_total numeric := 0;
  v_volume_total numeric := 0;
  v_can_override_price boolean := has_permission('sales_invoices:request_price_override');
  v_can_override_discount boolean := has_permission('sales_invoices:request_discount_override');
  v_free_batches numeric;
  v_min_selling_price numeric;
  v_max_discount_pct numeric;
  v_rounded_net numeric;
  v_original_price numeric;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  if p_customer_id is not null then
    select * into v_customer from customers where id = p_customer_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and company_id = v_company_id;
    if not found then raise exception 'Product % not found', v_item->>'product_id'; end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero for %', v_product.name; end if;

    if v_item->>'unit_id' is not null then
      select * into v_uom from product_uoms where product_id = v_product.id and unit_id = (v_item->>'unit_id')::uuid;
    end if;
    v_base_qty := v_qty * coalesce(v_uom.conversion_factor, 1);
    v_min_selling_price := null; v_max_discount_pct := null; v_original_price := null;

    if v_item->>'order_approved_price' is not null then
      v_applied_price := (v_item->>'order_approved_price')::numeric;
      v_original_price := v_applied_price;
      v_price_source := 'order_approved_price';
    else
      select * into v_price_resolved from resolve_customer_price(p_customer_id, v_product.id, v_base_qty);
      v_min_selling_price := v_price_resolved.min_selling_price;
      v_max_discount_pct := v_price_resolved.max_discount_pct;
      v_original_price := v_price_resolved.price;

      if v_item->>'requested_price' is not null and v_can_override_price then
        v_applied_price := (v_item->>'requested_price')::numeric;
        v_price_source := 'override';
      else
        v_applied_price := v_price_resolved.price;
        v_price_source := v_price_resolved.source;
      end if;

      if v_min_selling_price is not null and v_applied_price < v_min_selling_price then
        raise exception 'Price % for % is below the minimum selling price of %', v_applied_price, v_product.name, v_min_selling_price;
      end if;
    end if;

    v_discount_pct := 0; v_discount_amt := 0; v_discount_source := null;
    if v_item->>'order_discount_pct' is not null then
      v_discount_pct := (v_item->>'order_discount_pct')::numeric;
      v_discount_amt := round(v_applied_price * v_qty * v_discount_pct / 100, 2);
      v_discount_source := 'order_approved_discount';
    else
      select * into v_discount_rule from customer_discounts
      where customer_id = p_customer_id and status = 'active'
        and (expiry_date is null or expiry_date >= current_date)
        and (discount_type = 'product' and product_id = v_product.id
          or discount_type = 'category' and category_id = v_product.category_id
          or discount_type in ('percentage', 'fixed') and product_id is null and category_id is null)
      order by case discount_type when 'product' then 1 when 'category' then 2 else 3 end
      limit 1;

      if found then
        if v_discount_rule.discount_type in ('percentage', 'product', 'category') then
          v_discount_pct := least(v_discount_rule.discount_value, coalesce(v_max_discount_pct, 100));
          v_discount_amt := round(v_applied_price * v_qty * v_discount_pct / 100, 2);
        else
          v_discount_amt := least(v_discount_rule.discount_value, coalesce(v_discount_rule.maximum_discount, v_discount_rule.discount_value));
        end if;
        v_discount_source := 'customer_discount';
      elsif (v_item->>'manual_discount_pct' is not null or v_item->>'manual_discount_amount' is not null) then
        if not v_can_override_discount then raise exception 'Not permitted to apply a manual discount'; end if;
        if v_item->>'manual_discount_pct' is not null then
          v_discount_pct := (v_item->>'manual_discount_pct')::numeric;
          if v_max_discount_pct is not null and v_discount_pct > v_max_discount_pct then
            raise exception 'Discount %% for % exceeds the maximum allowed discount of %%', v_discount_pct, v_product.name, v_max_discount_pct;
          end if;
          v_discount_amt := round(v_applied_price * v_qty * v_discount_pct / 100, 2);
        else
          v_discount_amt := (v_item->>'manual_discount_amount')::numeric;
        end if;
        v_discount_source := 'manual_discount';
      end if;
    end if;

    v_is_exempt := coalesce(v_customer.is_tax_exempt, false) or v_product.is_tax_exempt;
    v_gross := round(v_applied_price * v_qty, 2);

    if v_invoice.tax_inclusive then
      v_taxable := round((v_gross - v_discount_amt) / (1 + v_product.tax_rate / 100), 2);
      v_tax_amt := case when v_is_exempt then 0 else round((v_gross - v_discount_amt) - v_taxable, 2) end;
    else
      v_taxable := v_gross - v_discount_amt;
      v_tax_amt := case when v_is_exempt then 0 else round(v_taxable * v_product.tax_rate / 100, 2) end;
    end if;

    v_net := v_gross - v_discount_amt + (case when v_invoice.tax_inclusive then 0 else v_tax_amt end);

    v_sequence := v_sequence + 1;
    insert into sales_invoice_items (
      company_id, invoice_id, product_id, variant_id, batch_id, unit_id, barcode, sku, description,
      conversion_factor, invoice_quantity, base_quantity, original_price, applied_price, price_source, order_approved_price,
      discount_pct, discount_amount, discount_source, tax_rate, is_tax_exempt, tax_inclusive, taxable_amount, tax_amount,
      gross_amount, net_amount, order_item_id, item_notes, sequence
    ) values (
      v_company_id, p_invoice_id, v_product.id, nullif(v_item->>'variant_id', '')::uuid, nullif(v_item->>'batch_id', '')::uuid,
      coalesce(v_uom.unit_id, v_product.base_unit_id), coalesce(v_uom.barcode, v_product.barcode), v_product.sku, v_product.description,
      coalesce(v_uom.conversion_factor, 1), v_qty, v_base_qty, coalesce(v_original_price, v_applied_price), v_applied_price, v_price_source,
      case when v_item->>'order_approved_price' is not null then v_applied_price end,
      v_discount_pct, v_discount_amt, v_discount_source, v_product.tax_rate, v_is_exempt, v_invoice.tax_inclusive, v_taxable, v_tax_amt,
      v_gross, v_net, nullif(v_item->>'order_item_id', '')::uuid, v_item->>'item_notes', v_sequence
    );

    v_gross_total := v_gross_total + v_gross;
    v_item_discount_total := v_item_discount_total + v_discount_amt;
    v_taxable_total := v_taxable_total + v_taxable;
    v_tax_total := v_tax_total + v_tax_amt;
    v_total_qty := v_total_qty + v_qty;
    v_base_qty_total := v_base_qty_total + v_base_qty;
    v_weight_total := v_weight_total + coalesce(v_product.weight, 0) * v_base_qty;
    v_volume_total := v_volume_total + coalesce(v_product.volume, 0) * v_base_qty;

    if v_item->>'order_approved_price' is null then
      for v_free_rule in
        select * from free_quantity_rules
        where buy_product_id = v_product.id and is_active
          and (customer_id is null or customer_id = p_customer_id)
          and (effective_date is null or effective_date <= current_date)
          and (expiry_date is null or expiry_date >= current_date)
        order by priority
      loop
        v_free_batches := floor(v_base_qty / v_free_rule.buy_quantity);
        if v_free_batches > 0 then
          select * into v_product from products where id = v_free_rule.free_product_id;
          v_sequence := v_sequence + 1;
          insert into sales_invoice_items (
            company_id, invoice_id, product_id, unit_id, barcode, sku, description,
            conversion_factor, invoice_quantity, base_quantity, original_price, applied_price, price_source,
            discount_pct, discount_amount, tax_rate, is_tax_exempt, taxable_amount, tax_amount, gross_amount, net_amount,
            is_free_item, free_quantity_rule_id, sequence
          ) values (
            v_company_id, p_invoice_id, v_product.id, v_product.base_unit_id, v_product.barcode, v_product.sku, v_product.description,
            1, v_free_batches * v_free_rule.free_quantity, v_free_batches * v_free_rule.free_quantity, v_product.selling_price, 0, 'promotion_free',
            100, 0, 0, true, 0, 0, 0, 0, true, v_free_rule.id, v_sequence
          );
          v_promo_discount_total := v_promo_discount_total + (v_product.selling_price * v_free_batches * v_free_rule.free_quantity);
          v_free_qty_total := v_free_qty_total + v_free_batches * v_free_rule.free_quantity;
        end if;
      end loop;
    end if;
  end loop;

  v_net_total := v_gross_total - v_item_discount_total + v_tax_total;

  v_rounded_net := case v_invoice.round_off_rule
    when 'none' then v_net_total
    when 'nearest_whole' then round(v_net_total)
    when 'nearest_0_05' then round(v_net_total / 0.05) * 0.05
    when 'nearest_0_10' then round(v_net_total / 0.10) * 0.10
    else v_net_total
  end;

  update sales_invoices set
    gross_amount = v_gross_total, item_discount_amount = v_item_discount_total, promotion_discount_amount = v_promo_discount_total,
    taxable_amount = v_taxable_total, tax_amount = v_tax_total, round_off = round(v_rounded_net - v_net_total, 2), net_amount = v_rounded_net,
    total_quantity = v_total_qty, total_free_quantity = v_free_qty_total, total_base_quantity = v_base_qty_total,
    total_weight = v_weight_total, total_volume = v_volume_total, updated_by = auth.uid(), updated_at = now()
  where id = p_invoice_id;
end;
$$;
grant execute on function recalculate_sales_invoice_totals(uuid, jsonb, uuid) to authenticated;

create or replace function create_sales_invoice(
  p_invoice_type_code text,
  p_items jsonb,
  p_client_uuid text,
  p_customer_id uuid default null,
  p_walk_in_name text default null,
  p_walk_in_phone text default null,
  p_walk_in_address text default null,
  p_walk_in_tax_number text default null,
  p_branch_id uuid default null,
  p_route_id uuid default null,
  p_beat_plan_id uuid default null,
  p_daily_visit_plan_id uuid default null,
  p_customer_visit_id uuid default null,
  p_salesman_id uuid default null,
  p_van_id uuid default null,
  p_warehouse_id uuid default null,
  p_billing_address_id uuid default null,
  p_delivery_address_id uuid default null,
  p_contact_person text default null,
  p_delivery_date date default null,
  p_payment_type text default 'cash',
  p_payment_term_id uuid default null,
  p_customer_reference text default null,
  p_customer_po text default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_is_direct_invoice boolean default true,
  p_direct_invoice_source text default null,
  p_manual_invoice_number text default null,
  p_invoice_source text default 'web',
  p_device_uid text default null,
  p_tax_inclusive boolean default false,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_invoice_id uuid;
  v_existing_id uuid;
  v_invoice_type sales_invoice_types%rowtype;
  v_customer customers%rowtype;
  v_invoice_number text;
  v_initial_status text;
begin
  if v_company_id is null then raise exception 'No company context for current user'; end if;

  select id into v_existing_id from sales_invoices where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then return v_existing_id; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'An invoice must have at least one item'; end if;

  select * into v_invoice_type from sales_invoice_types
  where code = p_invoice_type_code and (company_id is null or company_id = v_company_id) and is_active
  order by company_id nulls last limit 1;
  if not found then raise exception 'Unknown or inactive invoice type: %', p_invoice_type_code; end if;

  if v_invoice_type.customer_requirement = 'required' and p_customer_id is null then
    raise exception 'This invoice type requires a customer';
  end if;
  if p_customer_id is not null then
    select * into v_customer from customers where id = p_customer_id and company_id = v_company_id;
    if not found then raise exception 'Customer not found'; end if;
    if v_customer.status != 'active' and not has_permission('sales_invoices:create_for_inactive') then
      raise exception 'Customer % is % — inactive customers require additional authorization', v_customer.business_name, v_customer.status;
    end if;
  end if;

  if p_manual_invoice_number is not null and p_manual_invoice_number != '' then
    v_invoice_number := p_manual_invoice_number;
  else
    v_invoice_number := next_sales_invoice_no(p_invoice_type_code);
  end if;

  v_initial_status := case when p_is_offline then 'sync_pending' else 'draft' end;

  insert into sales_invoices (
    company_id, branch_id, invoice_number, is_manual_number, invoice_type_id, customer_id,
    walk_in_name, walk_in_phone, walk_in_address, walk_in_tax_number, billing_address_id, delivery_address_id, contact_person,
    route_id, beat_plan_id, daily_visit_plan_id, customer_visit_id, salesman_id, van_id, warehouse_id,
    invoice_source, payment_type, payment_term_id, delivery_date, customer_reference, customer_po,
    notes, internal_notes, status, is_direct_invoice, direct_invoice_source, client_uuid, device_uid,
    tax_inclusive, latitude, longitude, created_by, updated_by
  ) values (
    v_company_id, p_branch_id, v_invoice_number, p_manual_invoice_number is not null, v_invoice_type.id, p_customer_id,
    p_walk_in_name, p_walk_in_phone, p_walk_in_address, p_walk_in_tax_number, p_billing_address_id, p_delivery_address_id, p_contact_person,
    p_route_id, p_beat_plan_id, p_daily_visit_plan_id, p_customer_visit_id, p_salesman_id, p_van_id, p_warehouse_id,
    p_invoice_source, p_payment_type, p_payment_term_id, p_delivery_date, p_customer_reference, p_customer_po,
    p_notes, p_internal_notes, v_initial_status, p_is_direct_invoice, p_direct_invoice_source, p_client_uuid, p_device_uid,
    p_tax_inclusive, p_latitude, p_longitude, auth.uid(), auth.uid()
  ) returning id into v_invoice_id;

  perform recalculate_sales_invoice_totals(v_invoice_id, p_items, p_customer_id);

  insert into sales_invoice_status_history (company_id, invoice_id, old_status, new_status, changed_by)
  values (v_company_id, v_invoice_id, null, v_initial_status, auth.uid());

  if p_daily_visit_plan_id is not null and p_customer_id is not null then
    update daily_visit_plan_items set plan_notes = coalesce(plan_notes || E'\n', '') || 'Invoice ' || v_invoice_number || ' drafted'
    where plan_id = p_daily_visit_plan_id and customer_id = p_customer_id;
  end if;

  return v_invoice_id;
end;
$$;
grant execute on function create_sales_invoice(
  text, jsonb, text, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, text, uuid, text, text,
  text, text, boolean, text, text, text, text, boolean, numeric, numeric, numeric, boolean
) to authenticated;
