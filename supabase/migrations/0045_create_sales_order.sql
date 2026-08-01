-- ============================================================================
-- 0045_create_sales_order.sql
-- The atomic entry point for Sales Order creation. Header creation only —
-- all pricing/discount/free-item/totals logic lives in the single shared
-- recalculate_sales_order_totals() function (0046), called by both this
-- function and update_draft_sales_order_items(), so the create and edit
-- paths can never compute a price or discount differently from each other.
--
-- Explicitly NOT implemented here (Part 2 territory per the requirements
-- doc): stock reservation, credit validation, order approval, backorders.
-- Stock is looked up for DISPLAY only in the client; nothing is deducted
-- or reserved here.
-- ============================================================================

create or replace function create_sales_order(
  p_customer_id uuid,
  p_order_type_code text,
  p_items jsonb, -- [{product_id, variant_id, unit_id, batch_id, quantity, requested_price, price_override_reason, manual_discount_pct, manual_discount_amount, item_notes}]
  p_client_uuid text,
  p_branch_id uuid default null,
  p_route_id uuid default null,
  p_beat_plan_id uuid default null,
  p_daily_visit_plan_id uuid default null,
  p_customer_visit_id uuid default null,
  p_salesman_id uuid default null,
  p_van_id uuid default null,
  p_warehouse_id uuid default null,
  p_delivery_address_id uuid default null,
  p_contact_person text default null,
  p_expected_delivery_date date default null,
  p_payment_type text default null,
  p_payment_term_id uuid default null,
  p_customer_reference text default null,
  p_customer_po text default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_is_direct_order boolean default true,
  p_direct_order_type text default null,
  p_manual_order_number text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_order_id uuid;
  v_existing_id uuid;
  v_order_type sales_order_types%rowtype;
  v_customer customers%rowtype;
  v_order_number text;
  v_initial_status text;
begin
  if v_company_id is null then raise exception 'No company context for current user'; end if;

  -- Idempotency: offline retries with the same client_uuid return the
  -- already-created order rather than duplicating it.
  select id into v_existing_id from sales_orders where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then return v_existing_id; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  select * into v_customer from customers where id = p_customer_id and company_id = v_company_id;
  if not found then raise exception 'Customer not found'; end if;
  if v_customer.status != 'active' and not has_permission('sales_orders:create_for_inactive') then
    raise exception 'Customer % is % — inactive customers require additional authorization', v_customer.business_name, v_customer.status;
  end if;

  select * into v_order_type from sales_order_types
  where code = p_order_type_code and (company_id is null or company_id = v_company_id) and is_active
  order by company_id nulls last limit 1;
  if not found then raise exception 'Unknown or inactive order type: %', p_order_type_code; end if;

  -- Order number: manual entry uses the same create permission as order
  -- creation itself (this doc doesn't list a separate numbering permission)
  -- and is stored with is_manual_number for audit visibility.
  if p_manual_order_number is not null and p_manual_order_number != '' then
    v_order_number := p_manual_order_number;
  else
    v_order_number := next_sales_order_no(p_order_type_code);
  end if;

  v_initial_status := case when p_is_offline then 'sync_pending' else 'draft' end;

  insert into sales_orders (
    company_id, branch_id, order_number, is_manual_number, customer_id, delivery_address_id, contact_person,
    order_type_id, expected_delivery_date, route_id, beat_plan_id, daily_visit_plan_id, customer_visit_id,
    salesman_id, van_id, warehouse_id, payment_type, payment_term_id, customer_reference, customer_po,
    notes, internal_notes, status, is_direct_order, direct_order_type, client_uuid, latitude, longitude, created_by, updated_by
  ) values (
    v_company_id, p_branch_id, v_order_number, p_manual_order_number is not null, p_customer_id, p_delivery_address_id, p_contact_person,
    v_order_type.id, p_expected_delivery_date, p_route_id, p_beat_plan_id, p_daily_visit_plan_id, p_customer_visit_id,
    p_salesman_id, p_van_id, p_warehouse_id, p_payment_type, p_payment_term_id, p_customer_reference, p_customer_po,
    p_notes, p_internal_notes, v_initial_status, p_is_direct_order, p_direct_order_type,
    p_client_uuid, p_latitude, p_longitude, auth.uid(), auth.uid()
  ) returning id into v_order_id;

  -- All pricing/discount/free-item/totals logic lives here — shared with
  -- the draft-edit path so both can never drift apart.
  perform recalculate_sales_order_totals(v_order_id, p_items, p_customer_id);

  insert into sales_order_status_history (company_id, order_id, old_status, new_status, changed_by)
  values (v_company_id, v_order_id, null, v_initial_status, auth.uid());

  -- Visit integration: the link is already stored on the order header; this
  -- records a lightweight "order taken" note against the plan item rather
  -- than inventing an unsupported visit_status value (Part 2 owns full
  -- visit outcome tracking).
  if p_daily_visit_plan_id is not null then
    update daily_visit_plan_items set plan_notes = coalesce(plan_notes || E'\n', '') || 'Order ' || v_order_number || ' taken'
    where plan_id = p_daily_visit_plan_id and customer_id = p_customer_id;
  end if;

  return v_order_id;
end;
$$;
grant execute on function create_sales_order(
  uuid, text, jsonb, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, text, uuid, text, text, text, text, boolean, text, text, numeric, numeric, boolean
) to authenticated;
