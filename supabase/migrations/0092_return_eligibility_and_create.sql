-- ============================================================================
-- 0092_return_eligibility_and_create.sql
-- Continues 0091.
-- ============================================================================

-- Extends the visit_outcome set (5B.2 Part 1, 0076) with return-related
-- values before create_sales_return_draft() can write them.
alter table customer_visits drop constraint if exists customer_visits_visit_outcome_check;
alter table customer_visits add constraint customer_visits_visit_outcome_check check (visit_outcome in (
  'payment_collected', 'partial_payment_collected', 'payment_promised', 'no_payment',
  'return_requested', 'damaged_return_requested', 'replacement_requested'
) or visit_outcome is null);

create or replace function invoice_item_returned_quantity(p_invoice_item_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(sri.base_return_quantity), 0)
  from sales_return_items sri join sales_returns sr on sr.id = sri.return_id
  where sri.original_invoice_item_id = p_invoice_item_id and sri.item_status = 'active'
    and sr.status not in ('cancelled_before_posting', 'expired');
$$;
grant execute on function invoice_item_returned_quantity(uuid) to authenticated;

create or replace function invoice_eligible_for_return(p_invoice_id uuid, p_customer_id uuid)
returns boolean language plpgsql stable as $$
declare v_invoice sales_invoices%rowtype;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  if not found then return false; end if;
  if v_invoice.posting_status != 'posted' then return false; end if;
  if v_invoice.status in ('void_requested', 'voided') then return false; end if;
  if v_invoice.customer_id != p_customer_id then return false; end if;
  if v_invoice.company_id != current_company_id() then return false; end if;
  return true;
end;
$$;
grant execute on function invoice_eligible_for_return(uuid, uuid) to authenticated;

create or replace function invoice_returnable_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, sku text, uom_label text,
  invoice_quantity numeric, base_quantity numeric, previously_returned_quantity numeric,
  remaining_returnable_quantity numeric, is_free_item boolean, unit_price numeric,
  discount_amount numeric, tax_amount numeric, tax_rate numeric, tax_inclusive boolean,
  batch_required boolean, serial_required boolean
) language plpgsql stable as $$
begin
  return query
  select
    sii.id, sii.product_id, p.name, p.sku, coalesce(u.code, 'unit'),
    sii.invoice_quantity, sii.base_quantity, invoice_item_returned_quantity(sii.id),
    sii.base_quantity - invoice_item_returned_quantity(sii.id),
    sii.is_free_item, sii.applied_price, sii.discount_amount, sii.tax_amount, sii.tax_rate, sii.tax_inclusive,
    coalesce(p.track_batches, false), coalesce(p.track_serials, false)
  from sales_invoice_items sii
  join products p on p.id = sii.product_id
  left join units u on u.id = sii.uom_id
  where sii.invoice_id = p_invoice_id
    and sii.base_quantity - invoice_item_returned_quantity(sii.id) > 0.001
  order by sii.sequence;
end;
$$;
grant execute on function invoice_returnable_items(uuid) to authenticated;

create or replace function calculate_return_reversal_preview(p_invoice_item_id uuid, p_return_base_quantity numeric)
returns table (
  unit_price numeric, gross_amount numeric, discount_reversal numeric, promotion_reversal numeric,
  tax_reversal numeric, net_amount numeric
) language plpgsql stable as $$
declare
  v_item sales_invoice_items%rowtype;
  v_ratio numeric;
begin
  select * into v_item from sales_invoice_items where id = p_invoice_item_id;
  if not found then raise exception 'Invoice item not found'; end if;
  if v_item.base_quantity <= 0 then raise exception 'Invoice item has zero quantity'; end if;

  v_ratio := p_return_base_quantity / v_item.base_quantity;

  unit_price := v_item.applied_price;
  gross_amount := round(v_item.applied_price * p_return_base_quantity, 2);
  discount_reversal := round(coalesce(v_item.discount_amount, 0) * v_ratio, 2);
  promotion_reversal := case when v_item.is_free_item then gross_amount else 0 end;
  tax_reversal := round(coalesce(v_item.tax_amount, 0) * v_ratio, 2);
  net_amount := gross_amount - discount_reversal - promotion_reversal + case when v_item.tax_inclusive then 0 else tax_reversal end;

  return next;
end;
$$;
grant execute on function calculate_return_reversal_preview(uuid, numeric) to authenticated;

create or replace function check_duplicate_return_warning(
  p_customer_id uuid, p_invoice_item_id uuid default null, p_product_id uuid default null,
  p_return_quantity numeric default null, p_batch_id uuid default null, p_serial_id uuid default null
) returns table (return_id uuid, return_number text, return_date date, matched_on text)
language plpgsql stable as $$
begin
  return query
  select sr.id, sr.return_number, sr.return_date,
    case
      when p_serial_id is not null and exists (select 1 from sales_return_items sri join sales_return_item_serials sris on sris.return_item_id = sri.id where sri.return_id = sr.id and sris.serial_id = p_serial_id) then 'serial'
      when p_batch_id is not null and exists (select 1 from sales_return_items sri join sales_return_item_batches srib on srib.return_item_id = sri.id where sri.return_id = sr.id and srib.batch_id = p_batch_id) then 'batch'
      when p_invoice_item_id is not null and exists (select 1 from sales_return_items sri where sri.return_id = sr.id and sri.original_invoice_item_id = p_invoice_item_id) then 'invoice_item'
      else 'product_quantity'
    end
  from sales_returns sr
  where sr.company_id = current_company_id() and sr.customer_id = p_customer_id
    and sr.status not in ('cancelled_before_posting')
    and sr.return_date >= current_date - 14
    and (
      (p_serial_id is not null and exists (select 1 from sales_return_items sri join sales_return_item_serials sris on sris.return_item_id = sri.id where sri.return_id = sr.id and sris.serial_id = p_serial_id))
      or (p_batch_id is not null and exists (select 1 from sales_return_items sri join sales_return_item_batches srib on srib.return_item_id = sri.id where sri.return_id = sr.id and srib.batch_id = p_batch_id))
      or (p_invoice_item_id is not null and exists (select 1 from sales_return_items sri where sri.return_id = sr.id and sri.original_invoice_item_id = p_invoice_item_id))
      or (p_product_id is not null and p_return_quantity is not null and exists (
        select 1 from sales_return_items sri where sri.return_id = sr.id and sri.product_id = p_product_id and sri.return_quantity = p_return_quantity
      ))
    )
  order by sr.return_date desc;
end;
$$;
grant execute on function check_duplicate_return_warning(uuid, uuid, uuid, numeric, uuid, uuid) to authenticated;

create or replace function create_sales_return_draft(
  p_return_type_code text,
  p_customer_id uuid,
  p_items jsonb,
  p_client_uuid text,
  p_original_invoice_id uuid default null,
  p_return_reason_code text default null,
  p_route_id uuid default null,
  p_beat_plan_id uuid default null,
  p_customer_visit_id uuid default null,
  p_daily_visit_plan_id uuid default null,
  p_van_id uuid default null,
  p_warehouse_id uuid default null,
  p_responsible_employee_id uuid default null,
  p_return_source text default 'web',
  p_customer_reference text default null,
  p_customer_complaint_reference text default null,
  p_replacement_requested boolean default false,
  p_notes text default null,
  p_internal_notes text default null,
  p_device_uid text default null,
  p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_return_id uuid;
  v_existing_id uuid;
  v_return_type sales_return_types%rowtype;
  v_customer customers%rowtype;
  v_reason_id uuid;
  v_return_number text;
  v_initial_status text;
  v_item jsonb;
  v_item_id uuid;
  v_invoice_item sales_invoice_items%rowtype;
  v_product products%rowtype;
  v_remaining numeric;
  v_reversal record;
  v_batch jsonb;
  v_serial_id uuid;
  v_batch_total numeric;
  v_serial_count integer;
  v_seq integer := 0;
  v_gross_total numeric := 0;
  v_discount_total numeric := 0;
  v_promo_total numeric := 0;
  v_tax_total numeric := 0;
  v_net_total numeric := 0;
  v_qty_total numeric := 0;
  v_base_qty_total numeric := 0;
begin
  if v_company_id is null then raise exception 'No company context for current user'; end if;

  select id into v_existing_id from sales_returns where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then return v_existing_id; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A return must have at least one item'; end if;

  select * into v_return_type from sales_return_types
  where code = p_return_type_code and (company_id is null or company_id = v_company_id) and is_active
  order by company_id nulls last limit 1;
  if not found then raise exception 'Unknown or inactive return type: %', p_return_type_code; end if;

  select * into v_customer from customers where id = p_customer_id and company_id = v_company_id;
  if not found then raise exception 'Customer not found'; end if;
  if v_customer.status = 'deleted' then raise exception 'Cannot record a return for a deleted customer'; end if;

  if v_return_type.invoice_required and p_original_invoice_id is null then
    raise exception '% requires an original invoice', v_return_type.label;
  end if;
  if p_original_invoice_id is not null and not invoice_eligible_for_return(p_original_invoice_id, p_customer_id) then
    raise exception 'Invoice is not eligible for return (not posted, voided, or belongs to another customer)';
  end if;
  if p_original_invoice_id is null and not has_permission('sales_returns:create_return_without_invoice') then
    raise exception 'Not permitted to create a return without an invoice';
  end if;

  if p_return_reason_code is not null then
    select id into v_reason_id from sales_return_reasons where code = p_return_reason_code and (company_id is null or company_id = v_company_id) order by company_id nulls last limit 1;
  end if;

  v_return_number := next_return_no(p_return_type_code);
  v_initial_status := case when p_is_offline then 'sync_pending' else 'draft' end;

  insert into sales_returns (
    company_id, return_number, return_type_id, customer_id, customer_contact, original_invoice_id,
    route_id, beat_plan_id, customer_visit_id, daily_visit_plan_id, van_id, warehouse_id, responsible_employee_id,
    return_source, return_reason_id, customer_reference, customer_complaint_reference, replacement_requested,
    notes, internal_notes, status, client_uuid, device_uid, created_by, updated_by
  ) values (
    v_company_id, v_return_number, v_return_type.id, p_customer_id, v_customer.primary_phone, p_original_invoice_id,
    p_route_id, p_beat_plan_id, p_customer_visit_id, p_daily_visit_plan_id, p_van_id, p_warehouse_id, coalesce(p_responsible_employee_id, auth.uid()),
    p_return_source, v_reason_id, p_customer_reference, p_customer_complaint_reference, p_replacement_requested,
    p_notes, p_internal_notes, v_initial_status, p_client_uuid, p_device_uid, auth.uid(), auth.uid()
  ) returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_seq := v_seq + 1;
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    if not found then raise exception 'Product not found'; end if;

    if v_item->>'invoice_item_id' is not null then
      select * into v_invoice_item from sales_invoice_items where id = (v_item->>'invoice_item_id')::uuid;
      if v_invoice_item.id is null then raise exception 'Invoice item not found'; end if;

      v_remaining := v_invoice_item.base_quantity - invoice_item_returned_quantity(v_invoice_item.id);
      if (v_item->>'base_return_quantity')::numeric > v_remaining + 0.001 then
        raise exception 'Return quantity % exceeds remaining returnable quantity % for %', v_item->>'base_return_quantity', v_remaining, v_product.name;
      end if;
      if v_invoice_item.is_free_item and coalesce((v_item->>'is_free_item')::boolean, false) = false then
        raise exception 'Item % was invoiced as free — mark the return as a free item return', v_product.name;
      end if;

      select * into v_reversal from calculate_return_reversal_preview(v_invoice_item.id, (v_item->>'base_return_quantity')::numeric);
    else
      v_reversal.unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
      v_reversal.gross_amount := v_reversal.unit_price * (v_item->>'base_return_quantity')::numeric;
      v_reversal.discount_reversal := 0; v_reversal.promotion_reversal := 0; v_reversal.tax_reversal := 0;
      v_reversal.net_amount := v_reversal.gross_amount;
    end if;

    insert into sales_return_items (
      company_id, return_id, original_invoice_item_id, product_id, variant_id, description, uom_id, conversion_factor,
      return_quantity, base_return_quantity, is_free_item, unit_price, original_unit_price, discount_reversal,
      promotion_reversal, tax_reversal, gross_return_amount, net_return_amount, batch_required, serial_required,
      return_condition_id, return_reason_id, expected_stock_destination, replacement_requested, item_notes, sequence
    ) values (
      v_company_id, v_return_id, (v_item->>'invoice_item_id')::uuid, (v_item->>'product_id')::uuid, (v_item->>'variant_id')::uuid,
      v_item->>'description', (v_item->>'uom_id')::uuid, coalesce((v_item->>'conversion_factor')::numeric, 1),
      (v_item->>'return_quantity')::numeric, (v_item->>'base_return_quantity')::numeric, coalesce((v_item->>'is_free_item')::boolean, false),
      v_reversal.unit_price, v_reversal.unit_price, v_reversal.discount_reversal, v_reversal.promotion_reversal, v_reversal.tax_reversal,
      v_reversal.gross_amount, v_reversal.net_amount, coalesce(v_product.track_batches, false), coalesce(v_product.track_serials, false),
      (select id from sales_return_conditions where code = v_item->>'condition_code' and (company_id is null or company_id = v_company_id) order by company_id nulls last limit 1),
      coalesce((select id from sales_return_reasons where code = v_item->>'reason_code' and (company_id is null or company_id = v_company_id) order by company_id nulls last limit 1), v_reason_id),
      v_item->>'expected_stock_destination', coalesce((v_item->>'replacement_requested')::boolean, false), v_item->>'item_notes', v_seq
    ) returning id into v_item_id;

    if v_item->'batches' is not null and jsonb_array_length(v_item->'batches') > 0 then
      v_batch_total := 0;
      for v_batch in select * from jsonb_array_elements(v_item->'batches') loop
        insert into sales_return_item_batches (company_id, return_item_id, batch_id, return_quantity, expiry_date)
        values (v_company_id, v_item_id, (v_batch->>'batch_id')::uuid, (v_batch->>'quantity')::numeric, (v_batch->>'expiry_date')::date);
        v_batch_total := v_batch_total + (v_batch->>'quantity')::numeric;
      end loop;
      if abs(v_batch_total - (v_item->>'base_return_quantity')::numeric) > 0.001 then
        raise exception 'Batch quantities (%.3f) must equal item return quantity (%.3f) for %', v_batch_total, (v_item->>'base_return_quantity')::numeric, v_product.name;
      end if;
    end if;

    if v_item->'serials' is not null and jsonb_array_length(v_item->'serials') > 0 then
      v_serial_count := 0;
      for v_serial_id in select (jsonb_array_elements_text(v_item->'serials'))::uuid loop
        if exists (select 1 from sales_return_item_serials where serial_id = v_serial_id) then
          raise exception 'Serial % has already been returned', v_serial_id;
        end if;
        insert into sales_return_item_serials (company_id, return_item_id, serial_id) values (v_company_id, v_item_id, v_serial_id);
        v_serial_count := v_serial_count + 1;
      end loop;
      if v_serial_count != round((v_item->>'base_return_quantity')::numeric) then
        raise exception 'Serial count (%) must equal base return quantity (%.3f) for %', v_serial_count, (v_item->>'base_return_quantity')::numeric, v_product.name;
      end if;
    end if;

    v_gross_total := v_gross_total + v_reversal.gross_amount;
    v_discount_total := v_discount_total + v_reversal.discount_reversal;
    v_promo_total := v_promo_total + v_reversal.promotion_reversal;
    v_tax_total := v_tax_total + v_reversal.tax_reversal;
    v_net_total := v_net_total + v_reversal.net_amount;
    v_qty_total := v_qty_total + (v_item->>'return_quantity')::numeric;
    v_base_qty_total := v_base_qty_total + (v_item->>'base_return_quantity')::numeric;
  end loop;

  update sales_returns set
    gross_return_amount = v_gross_total, discount_reversal_amount = v_discount_total, promotion_reversal_amount = v_promo_total,
    tax_reversal_amount = v_tax_total, net_return_amount = v_net_total, total_return_quantity = v_qty_total, total_base_quantity = v_base_qty_total
  where id = v_return_id;

  insert into sales_return_status_history (company_id, return_id, old_status, new_status, changed_by)
  values (v_company_id, v_return_id, null, v_initial_status, auth.uid());

  if p_customer_visit_id is not null then
    update customer_visits set visit_outcome = case when v_return_type.stock_destination = 'damaged' then 'damaged_return_requested' when p_replacement_requested then 'replacement_requested' else 'return_requested' end
    where id = p_customer_visit_id;
  end if;

  return v_return_id;
end;
$$;
grant execute on function create_sales_return_draft(
  text, uuid, jsonb, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, boolean, text, text, text, boolean
) to authenticated;
