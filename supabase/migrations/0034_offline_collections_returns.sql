-- ============================================================================
-- 0034_offline_collections_returns.sql
-- Extends offline-queue support (previously Sales-only) to Collections and
-- Returns. Sales already uses a client_uuid idempotency key + one atomic
-- RPC per transaction so a retried sync can never double-apply — this adds
-- the same pattern to Collections (insert + balance update were two
-- separate calls before; now one atomic, idempotent RPC) and Returns
-- (insert of return + items was already atomic-ish via two calls in one
-- request, but had no idempotency key at all).
-- ============================================================================

alter table collections add column if not exists client_uuid uuid;
create unique index if not exists idx_collections_client_uuid on collections(client_uuid) where client_uuid is not null;

alter table returns add column if not exists client_uuid uuid;
create unique index if not exists idx_returns_client_uuid on returns(client_uuid) where client_uuid is not null;

-- Atomic, idempotent collection: insert + apply against customer balance/sale
-- in one call. If a collection with this client_uuid already exists (the
-- device queued it, went online, and is retrying because the response
-- itself got lost), returns the existing id instead of creating a duplicate.
create or replace function create_collection_offline(
  p_customer_id uuid, p_method text, p_amount numeric, p_reference_no text,
  p_cheque_date date, p_applied_to_sale_id uuid, p_notes text, p_client_uuid uuid
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_existing_id uuid;
  v_collection_id uuid;
begin
  if p_client_uuid is not null then
    select id into v_existing_id from collections where client_uuid = p_client_uuid;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;

  insert into collections (
    company_id, receipt_no, customer_id, collected_by, method, amount,
    reference_no, cheque_date, applied_to_sale_id, notes, client_uuid
  ) values (
    v_company_id, 'RCT-' || to_char(now(), 'YYMM') || '-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
    p_customer_id, auth.uid(), p_method, p_amount, p_reference_no, p_cheque_date, p_applied_to_sale_id, p_notes, p_client_uuid
  ) returning id into v_collection_id;

  update customers set outstanding_balance = outstanding_balance - p_amount where id = p_customer_id;

  if p_applied_to_sale_id is not null then
    update sales set paid_amount = paid_amount + p_amount where id = p_applied_to_sale_id;
  end if;

  return v_collection_id;
end;
$$;

grant execute on function create_collection_offline(uuid, text, numeric, text, date, uuid, text, uuid) to authenticated;

-- Atomic, idempotent return creation (return + all line items in one call).
-- Stays 'pending' just like the existing flow — approval is unchanged and
-- still applies stock/balance effects, so there's nothing to double-apply
-- here even without an idempotency guard on the effect itself.
create or replace function create_return_offline(
  p_return_type text, p_customer_id uuid, p_supplier_id uuid, p_location_type text,
  p_location_id uuid, p_items jsonb, p_client_uuid uuid
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_existing_id uuid;
  v_return_id uuid;
  v_total numeric := 0;
  v_item jsonb;
begin
  if p_client_uuid is not null then
    select id into v_existing_id from returns where client_uuid = p_client_uuid;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  select coalesce(sum((it->>'quantity')::numeric * (it->>'unit_price')::numeric), 0) into v_total
  from jsonb_array_elements(p_items) it;

  insert into returns (
    company_id, return_no, return_type, customer_id, supplier_id, location_type, location_id,
    status, note_type, total_amount, created_by, client_uuid
  ) values (
    v_company_id, 'RET-' || to_char(now(), 'YYMM') || '-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
    p_return_type, p_customer_id, p_supplier_id, p_location_type, p_location_id,
    'pending', case when p_return_type = 'sales_return' then 'credit_note' else 'debit_note' end,
    v_total, auth.uid(), p_client_uuid
  ) returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into return_items (return_id, product_id, batch_id, quantity, unit_price, line_total)
    values (
      v_return_id, (v_item->>'product_id')::uuid, nullif(v_item->>'batch_id', '')::uuid,
      (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric
    );
  end loop;

  return v_return_id;
end;
$$;

grant execute on function create_return_offline(text, uuid, uuid, text, uuid, jsonb, uuid) to authenticated;
