-- ============================================================================
-- 0062_invoice_editing_cancellation_notes.sql
-- Continues 0059-0061.
-- ============================================================================

create table sales_invoice_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  note text not null,
  note_type text not null default 'general' check (note_type in ('general', 'delivery', 'customer', 'internal', 'visit')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_invoice_notes_invoice on sales_invoice_notes(invoice_id);

alter table sales_invoice_notes enable row level security;
create policy sales_invoice_notes_isolation on sales_invoice_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function update_draft_sales_invoice_items(p_invoice_id uuid, p_items jsonb)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_item jsonb;
  v_order_item_id uuid;
  v_remaining numeric;
  v_already_converted numeric;
begin
  if not has_permission('sales_invoices:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status != 'draft' then raise exception 'Only draft invoices can be edited (currently %)', v_invoice.status; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_order_item_id := nullif(v_item->>'order_item_id', '')::uuid;
    if v_order_item_id is not null then
      select coalesce(sum(converted_quantity), 0) into v_already_converted
      from sales_invoice_order_item_links l join sales_invoice_items ii on ii.id = l.invoice_item_id
      where l.order_item_id = v_order_item_id and ii.invoice_id = p_invoice_id;

      v_remaining := order_item_remaining_to_convert(v_order_item_id) + v_already_converted;
      if (v_item->>'quantity')::numeric > v_remaining then
        raise exception 'Quantity exceeds the remaining approved order quantity (% available)', v_remaining;
      end if;
    end if;
  end loop;

  delete from sales_invoice_order_item_links where invoice_item_id in (select id from sales_invoice_items where invoice_id = p_invoice_id);
  delete from sales_invoice_items where invoice_id = p_invoice_id;

  perform recalculate_sales_invoice_totals(p_invoice_id, p_items, v_invoice.customer_id);

  insert into sales_invoice_order_item_links (company_id, invoice_item_id, order_item_id, converted_quantity, remaining_quantity_at_conversion, conversion_user)
  select v_invoice.company_id, ii.id, ii.order_item_id, ii.invoice_quantity, order_item_remaining_to_convert(ii.order_item_id) - ii.invoice_quantity, auth.uid()
  from sales_invoice_items ii where ii.invoice_id = p_invoice_id and ii.order_item_id is not null;
end;
$$;
grant execute on function update_draft_sales_invoice_items(uuid, jsonb) to authenticated;

create or replace function update_draft_sales_invoice_header(
  p_invoice_id uuid, p_customer_id uuid default null, p_billing_address_id uuid default null, p_delivery_address_id uuid default null,
  p_payment_type text default null, p_price_list_id uuid default null, p_delivery_date date default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('sales_invoices:edit_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status != 'draft' then raise exception 'Only draft invoices can be edited (currently %)', v_status; end if;

  update sales_invoices set
    customer_id = coalesce(p_customer_id, customer_id),
    billing_address_id = coalesce(p_billing_address_id, billing_address_id),
    delivery_address_id = coalesce(p_delivery_address_id, delivery_address_id),
    payment_type = coalesce(p_payment_type, payment_type),
    price_list_id = coalesce(p_price_list_id, price_list_id),
    delivery_date = coalesce(p_delivery_date, delivery_date),
    notes = coalesce(p_notes, notes),
    updated_by = auth.uid(), updated_at = now()
  where id = p_invoice_id;
end;
$$;
grant execute on function update_draft_sales_invoice_header(uuid, uuid, uuid, uuid, text, uuid, date, text) to authenticated;

create or replace function cancel_sales_invoice(p_invoice_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_invoice sales_invoices%rowtype;
begin
  if not has_permission('sales_invoices:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled_before_posting' then return; end if;
  if v_invoice.posting_status != 'not_posted' then raise exception 'Posted invoices cannot be cancelled through this function'; end if;

  perform change_sales_invoice_status(p_invoice_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into sales_invoice_notes (company_id, invoice_id, note, note_type, created_by)
    values (v_invoice.company_id, p_invoice_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_sales_invoice(uuid, text, text) to authenticated;

create or replace function delete_unsynced_invoice_draft(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('sales_invoices:delete_unsynced_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from sales_invoices where id = p_invoice_id;
end;
$$;
grant execute on function delete_unsynced_invoice_draft(uuid) to authenticated;

create or replace function create_repeat_invoice_draft(p_source_invoice_id uuid, p_client_uuid text)
returns uuid language plpgsql security definer as $$
declare
  v_source sales_invoices%rowtype;
  v_source_type text;
  v_items_payload jsonb;
  v_new_invoice_id uuid;
begin
  if not has_permission('sales_invoices:create') then raise exception 'Not permitted'; end if;
  select * into v_source from sales_invoices where id = p_source_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Source invoice not found'; end if;

  select code into v_source_type from sales_invoice_types where id = v_source.invoice_type_id;

  select jsonb_agg(jsonb_build_object('product_id', product_id, 'variant_id', variant_id, 'unit_id', unit_id, 'quantity', invoice_quantity))
  into v_items_payload
  from sales_invoice_items where invoice_id = p_source_invoice_id and not is_free_item and item_status = 'active';

  v_new_invoice_id := create_sales_invoice(
    p_invoice_type_code := v_source_type,
    p_items := v_items_payload,
    p_client_uuid := p_client_uuid,
    p_customer_id := v_source.customer_id,
    p_walk_in_name := v_source.walk_in_name, p_walk_in_phone := v_source.walk_in_phone,
    p_route_id := v_source.route_id, p_van_id := v_source.van_id, p_warehouse_id := v_source.warehouse_id,
    p_payment_type := v_source.payment_type, p_payment_term_id := v_source.payment_term_id,
    p_is_direct_invoice := true, p_direct_invoice_source := 'repeat_invoice'
  );

  update sales_invoices set repeat_of_invoice_id = p_source_invoice_id where id = v_new_invoice_id;

  return v_new_invoice_id;
end;
$$;
grant execute on function create_repeat_invoice_draft(uuid, text) to authenticated;
