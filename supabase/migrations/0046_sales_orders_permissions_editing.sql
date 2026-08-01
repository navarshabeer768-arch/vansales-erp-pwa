-- ============================================================================
-- 0046_sales_orders_permissions_editing.sql
-- Permissions, draft-order editing (delete + reprice), and audit triggers.
-- Continues 0043-0045.
-- ============================================================================

insert into permissions (module, action, description)
select 'sales_orders', a, 'Sales orders: ' || a
from unnest(array[
  'view', 'create', 'edit_draft', 'delete_draft', 'submit', 'view_pricing',
  'request_price_override', 'request_discount_override', 'export', 'create_for_inactive'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'sales_orders'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- Draft orders may be deleted outright (not just cancelled) since nothing
-- downstream depends on them yet — no stock reservation, no invoice.
create or replace function delete_draft_sales_order(p_order_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('sales_orders:delete_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from sales_orders where id = p_order_id and company_id = current_company_id();
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only draft orders can be deleted (currently %)', v_status; end if;
  delete from sales_orders where id = p_order_id;
end;
$$;
grant execute on function delete_draft_sales_order(uuid) to authenticated;

-- Replaces a draft order's items wholesale and recalculates totals — used
-- by "Draft orders may be edited" (add/remove/change items, quantities,
-- UOM). Reuses the exact same pricing/discount/free-item logic as
-- create_sales_order() by deleting and re-running item insertion inline,
-- rather than maintaining a second copy of that logic.
create or replace function update_draft_sales_order_items(p_order_id uuid, p_items jsonb)
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_company_id uuid := current_company_id();
begin
  if not has_permission('sales_orders:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = v_company_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status != 'draft' then raise exception 'Only draft orders can be edited (currently %)', v_order.status; end if;

  delete from sales_order_items where order_id = p_order_id;

  -- Re-run item insertion + totals via a temporary reuse of create_sales_order's
  -- logic is not possible without duplicating it (it also creates the header),
  -- so totals are recalculated directly here against the existing header.
  perform recalculate_sales_order_totals(p_order_id, p_items, v_order.customer_id);
end;
$$;
grant execute on function update_draft_sales_order_items(uuid, jsonb) to authenticated;

-- Shared item-insertion + totals logic, extracted so both create and edit
-- paths compute prices/discounts/free-items identically.
create or replace function recalculate_sales_order_totals(p_order_id uuid, p_items jsonb, p_customer_id uuid)
returns void language plpgsql security definer as $$
declare
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
  v_tax_amt numeric;
  v_gross numeric;
  v_net numeric;
  v_sequence integer := 0;
  v_gross_total numeric := 0;
  v_discount_total numeric := 0;
  v_promo_discount_total numeric := 0;
  v_tax_total numeric := 0;
  v_net_total numeric := 0;
  v_total_qty numeric := 0;
  v_free_qty_total numeric := 0;
  v_base_qty_total numeric := 0;
  v_weight_total numeric := 0;
  v_volume_total numeric := 0;
  v_can_override_price boolean := has_permission('sales_orders:request_price_override');
  v_can_override_discount boolean := has_permission('sales_orders:request_discount_override');
  v_free_batches numeric;
  v_min_selling_price numeric;
  v_max_discount_pct numeric;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and company_id = v_company_id;
    if not found then raise exception 'Product % not found', v_item->>'product_id'; end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero for %', v_product.name; end if;

    if v_item->>'unit_id' is not null then
      select * into v_uom from product_uoms where product_id = v_product.id and unit_id = (v_item->>'unit_id')::uuid;
    end if;
    v_base_qty := v_qty * coalesce(v_uom.conversion_factor, 1);

    select * into v_price_resolved from resolve_customer_price(p_customer_id, v_product.id, v_base_qty);
    v_min_selling_price := v_price_resolved.min_selling_price;
    v_max_discount_pct := v_price_resolved.max_discount_pct;

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

    v_discount_pct := 0; v_discount_amt := 0; v_discount_source := null;
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

    v_gross := round(v_applied_price * v_qty, 2);
    v_tax_amt := round((v_gross - v_discount_amt) * v_product.tax_rate / 100, 2);
    v_net := v_gross - v_discount_amt + v_tax_amt;

    v_sequence := v_sequence + 1;
    insert into sales_order_items (
      company_id, order_id, product_id, variant_id, batch_id, unit_id, barcode, sku, description,
      batch_required, serial_required, conversion_factor, ordered_quantity, base_quantity,
      original_price, applied_price, price_source, requested_price, price_override_reason, price_override_requested_by,
      discount_pct, discount_amount, discount_source, tax_rate, tax_amount, gross_amount, net_amount, item_notes, sequence
    ) values (
      v_company_id, p_order_id, v_product.id, nullif(v_item->>'variant_id', '')::uuid, nullif(v_item->>'batch_id', '')::uuid,
      coalesce(v_uom.unit_id, v_product.base_unit_id), coalesce(v_uom.barcode, v_product.barcode), v_product.sku, v_product.description,
      v_product.track_batches, v_product.track_serials, coalesce(v_uom.conversion_factor, 1), v_qty, v_base_qty,
      v_price_resolved.price, v_applied_price, v_price_source,
      case when v_price_source = 'override' then v_applied_price end,
      v_item->>'price_override_reason', case when v_price_source = 'override' then auth.uid() end,
      v_discount_pct, v_discount_amt, v_discount_source, v_product.tax_rate, v_tax_amt, v_gross, v_net, v_item->>'item_notes', v_sequence
    );

    v_gross_total := v_gross_total + v_gross;
    v_discount_total := v_discount_total + v_discount_amt;
    v_tax_total := v_tax_total + v_tax_amt;
    v_total_qty := v_total_qty + v_qty;
    v_base_qty_total := v_base_qty_total + v_base_qty;
    v_weight_total := v_weight_total + coalesce(v_product.weight, 0) * v_base_qty;
    v_volume_total := v_volume_total + coalesce(v_product.volume, 0) * v_base_qty;

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
        insert into sales_order_items (
          company_id, order_id, product_id, unit_id, barcode, sku, description,
          conversion_factor, ordered_quantity, base_quantity, original_price, applied_price, price_source,
          discount_pct, discount_amount, tax_rate, tax_amount, gross_amount, net_amount, is_free_item, free_quantity_rule_id, sequence
        ) values (
          v_company_id, p_order_id, v_product.id, v_product.base_unit_id, v_product.barcode, v_product.sku, v_product.description,
          1, v_free_batches * v_free_rule.free_quantity, v_free_batches * v_free_rule.free_quantity, v_product.selling_price, 0, 'promotion_free',
          100, 0, 0, 0, 0, 0, true, v_free_rule.id, v_sequence
        );
        v_promo_discount_total := v_promo_discount_total + (v_product.selling_price * v_free_batches * v_free_rule.free_quantity);
        v_free_qty_total := v_free_qty_total + v_free_batches * v_free_rule.free_quantity;
      end if;
    end loop;
  end loop;

  v_net_total := v_gross_total - v_discount_total + v_tax_total;

  update sales_orders set
    gross_amount = v_gross_total, discount_amount = v_discount_total, promotion_discount_amount = v_promo_discount_total,
    tax_amount = v_tax_total, round_off = round(v_net_total) - v_net_total, net_amount = round(v_net_total),
    total_quantity = v_total_qty, free_quantity = v_free_qty_total, base_quantity = v_base_qty_total,
    order_weight = v_weight_total, order_volume = v_volume_total, updated_by = auth.uid(), updated_at = now()
  where id = p_order_id;
end;
$$;
grant execute on function recalculate_sales_order_totals(uuid, jsonb, uuid) to authenticated;

-- Audit trail — reuses the existing generic trigger.
drop trigger if exists trg_audit_sales_orders on sales_orders;
create trigger trg_audit_sales_orders after insert or update or delete on sales_orders
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_sales_order_items on sales_order_items;
create trigger trg_audit_sales_order_items after insert or update or delete on sales_order_items
  for each row execute function log_audit_change();
