-- ============================================================================
-- 0061_order_to_invoice_conversion.sql
-- Continues 0059-0060.
-- ============================================================================

create table sales_invoice_order_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  conversion_date timestamptz not null default now(),
  conversion_status text not null default 'partial' check (conversion_status in ('partial', 'full')),
  conversion_user uuid references app_users(id),
  unique (invoice_id, order_id)
);
create index idx_sales_invoice_order_links_order on sales_invoice_order_links(order_id);
create index idx_sales_invoice_order_links_invoice on sales_invoice_order_links(invoice_id);

alter table sales_invoice_order_links enable row level security;
create policy sales_invoice_order_links_isolation on sales_invoice_order_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_order_item_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_item_id uuid not null references sales_invoice_items(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  converted_quantity numeric(14,3) not null,
  remaining_quantity_at_conversion numeric(14,3) not null,
  conversion_date timestamptz not null default now(),
  conversion_user uuid references app_users(id)
);
create index idx_sales_invoice_order_item_links_order_item on sales_invoice_order_item_links(order_item_id);
create index idx_sales_invoice_order_item_links_invoice_item on sales_invoice_order_item_links(invoice_item_id);

alter table sales_invoice_order_item_links enable row level security;
create policy sales_invoice_order_item_links_isolation on sales_invoice_order_item_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function order_item_remaining_to_convert(p_order_item_id uuid)
returns numeric language sql stable as $$
  select oi.ordered_quantity
    - coalesce((select sum(converted_quantity) from sales_invoice_order_item_links where order_item_id = p_order_item_id), 0)
    - coalesce((select sum(cancelled_quantity) from sales_order_item_cancellations where order_item_id = p_order_item_id), 0)
  from sales_order_items oi where oi.id = p_order_item_id;
$$;
grant execute on function order_item_remaining_to_convert(uuid) to authenticated;

create or replace function convert_sales_order_to_invoice(
  p_order_id uuid, p_item_selections jsonb, p_client_uuid text,
  p_delivery_date date default null, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_customer customers%rowtype;
  v_selection jsonb;
  v_order_item sales_order_items%rowtype;
  v_remaining numeric;
  v_qty numeric;
  v_items_payload jsonb := '[]'::jsonb;
  v_invoice_id uuid;
  v_invoice_type_code text;
  v_all_full boolean := true;
  v_total_order_items integer;
  v_selected_count integer;
begin
  if not has_permission('sales_invoices:convert_sales_order') then raise exception 'Not permitted'; end if;

  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;

  if v_order.status not in ('approved', 'partially_approved', 'ready_for_reservation', 'partially_reserved', 'fully_reserved', 'ready_for_fulfilment', 'partially_converted') then
    raise exception 'Order must be approved to convert (currently %)', v_order.status;
  end if;
  if v_order.is_on_hold then raise exception 'Order is on hold and cannot be converted'; end if;
  if v_order.expiry_date is not null and v_order.expiry_date < now() then raise exception 'Order has expired and cannot be converted'; end if;

  select * into v_customer from customers where id = v_order.customer_id;
  if v_customer.status != 'active' then raise exception 'Customer % is not active', v_customer.business_name; end if;

  if p_item_selections is null or jsonb_array_length(p_item_selections) = 0 then
    raise exception 'At least one item must be selected for conversion';
  end if;

  for v_selection in select * from jsonb_array_elements(p_item_selections) loop
    select * into v_order_item from sales_order_items where id = (v_selection->>'order_item_id')::uuid and order_id = p_order_id;
    if not found then raise exception 'Order item % not found on this order', v_selection->>'order_item_id'; end if;
    if v_order_item.is_free_item then continue; end if;

    v_qty := (v_selection->>'quantity')::numeric;
    v_remaining := order_item_remaining_to_convert(v_order_item.id);
    if v_qty > v_remaining then
      raise exception 'Cannot convert % of "%": only % remains approved and unconverted', v_qty, v_order_item.product_id, v_remaining;
    end if;
    if v_qty < v_remaining then v_all_full := false; end if;

    v_items_payload := v_items_payload || jsonb_build_object(
      'product_id', v_order_item.product_id, 'variant_id', v_order_item.variant_id, 'unit_id', v_order_item.unit_id,
      'batch_id', v_order_item.batch_id, 'quantity', v_qty,
      'order_approved_price', v_order_item.applied_price, 'order_discount_pct', v_order_item.discount_pct,
      'order_item_id', v_order_item.id, 'item_notes', v_order_item.item_notes
    );
  end loop;

  for v_order_item in select * from sales_order_items where order_id = p_order_id and is_free_item loop
    if order_item_remaining_to_convert(v_order_item.id) > 0 then
      v_items_payload := v_items_payload || jsonb_build_object(
        'product_id', v_order_item.product_id, 'unit_id', v_order_item.unit_id, 'quantity', v_order_item.ordered_quantity,
        'order_approved_price', 0, 'order_discount_pct', 100, 'order_item_id', v_order_item.id
      );
    end if;
  end loop;

  select count(*) into v_total_order_items from sales_order_items where order_id = p_order_id and not is_free_item;
  select jsonb_array_length(p_item_selections) into v_selected_count;
  if v_selected_count < v_total_order_items then v_all_full := false; end if;

  v_invoice_type_code := case when v_all_full then 'sales_order_invoice' else 'partial_order_invoice' end;

  v_invoice_id := create_sales_invoice(
    p_invoice_type_code := v_invoice_type_code,
    p_items := v_items_payload,
    p_client_uuid := p_client_uuid,
    p_customer_id := v_order.customer_id,
    p_route_id := v_order.route_id,
    p_beat_plan_id := v_order.beat_plan_id,
    p_daily_visit_plan_id := v_order.daily_visit_plan_id,
    p_customer_visit_id := v_order.customer_visit_id,
    p_salesman_id := v_order.salesman_id,
    p_van_id := v_order.van_id,
    p_warehouse_id := v_order.warehouse_id,
    p_delivery_address_id := v_order.delivery_address_id,
    p_contact_person := v_order.contact_person,
    p_delivery_date := coalesce(p_delivery_date, v_order.expected_delivery_date),
    p_payment_type := v_order.payment_type,
    p_payment_term_id := v_order.payment_term_id,
    p_customer_reference := v_order.customer_reference,
    p_customer_po := v_order.customer_po,
    p_notes := coalesce(p_notes, v_order.notes),
    p_is_direct_invoice := false
  );

  insert into sales_invoice_order_links (company_id, invoice_id, order_id, conversion_status, conversion_user)
  values (v_order.company_id, v_invoice_id, p_order_id, case when v_all_full then 'full' else 'partial' end, auth.uid())
  on conflict (invoice_id, order_id) do nothing;

  for v_selection in select * from jsonb_array_elements(p_item_selections) loop
    select * into v_order_item from sales_order_items where id = (v_selection->>'order_item_id')::uuid;
    v_qty := (v_selection->>'quantity')::numeric;
    v_remaining := order_item_remaining_to_convert(v_order_item.id);

    insert into sales_invoice_order_item_links (company_id, invoice_item_id, order_item_id, converted_quantity, remaining_quantity_at_conversion, conversion_user)
    select v_order.company_id, ii.id, v_order_item.id, v_qty, v_remaining - v_qty, auth.uid()
    from sales_invoice_items ii where ii.invoice_id = v_invoice_id and ii.order_item_id = v_order_item.id;
  end loop;

  if not exists (
    select 1 from sales_order_items oi where oi.order_id = p_order_id and not oi.is_free_item and order_item_remaining_to_convert(oi.id) > 0
  ) then
    perform change_sales_order_status(p_order_id, 'fully_converted', 'All approved quantities converted to invoice(s)');
  else
    perform change_sales_order_status(p_order_id, 'partially_converted', 'Partially converted to invoice');
  end if;

  return v_invoice_id;
end;
$$;
grant execute on function convert_sales_order_to_invoice(uuid, jsonb, text, date, text) to authenticated;

create or replace function sales_order_conversion_summary(p_order_id uuid)
returns table (
  order_item_id uuid, product_name text, ordered_quantity numeric, previously_converted_quantity numeric,
  cancelled_quantity numeric, remaining_quantity numeric, backorder_quantity numeric, is_free_item boolean
) language plpgsql stable as $$
begin
  return query
  select
    oi.id, p.name, oi.ordered_quantity,
    coalesce((select sum(l.converted_quantity) from sales_invoice_order_item_links l where l.order_item_id = oi.id), 0),
    coalesce((select sum(c.cancelled_quantity) from sales_order_item_cancellations c where c.order_item_id = oi.id), 0),
    order_item_remaining_to_convert(oi.id),
    coalesce((select sum(b.backorder_quantity) from sales_order_backorders b where b.order_item_id = oi.id and b.status not in ('cancelled', 'closed', 'fulfilled')), 0),
    oi.is_free_item
  from sales_order_items oi join products p on p.id = oi.product_id
  where oi.order_id = p_order_id
  order by oi.sequence;
end;
$$;
grant execute on function sales_order_conversion_summary(uuid) to authenticated;
