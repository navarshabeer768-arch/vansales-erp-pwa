-- ============================================================================
-- 0078_receipt_editing_promises_notes.sql
-- Continues 0076-0077.
-- ============================================================================

create table receipt_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  note text not null,
  note_type text not null default 'general' check (note_type in ('general', 'customer', 'internal', 'visit')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_receipt_notes_receipt on receipt_notes(receipt_id);

alter table receipt_notes enable row level security;
create policy receipt_notes_isolation on receipt_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function update_draft_receipt(
  p_receipt_id uuid, p_customer_id uuid default null, p_collection_type_code text default null,
  p_receipt_date date default null, p_reference_number text default null, p_remarks text default null
) returns void language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_collection_type_id uuid;
begin
  if not has_permission('receipt_vouchers:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status != 'draft' then raise exception 'Only draft receipts can be edited (currently %)', v_receipt.status; end if;

  if p_collection_type_code is not null then
    select id into v_collection_type_id from collection_types where code = p_collection_type_code and (company_id is null or company_id = v_receipt.company_id) order by company_id nulls last limit 1;
  end if;

  if p_customer_id is not null and p_customer_id != v_receipt.customer_id then
    update receipt_invoice_allocations set status = 'cancelled' where receipt_id = p_receipt_id;
    update receipt_vouchers set allocated_amount = 0, unallocated_amount = receipt_amount, allocation_status = 'not_allocated' where id = p_receipt_id;
  end if;

  update receipt_vouchers set
    customer_id = coalesce(p_customer_id, customer_id),
    collection_type_id = coalesce(v_collection_type_id, collection_type_id),
    receipt_date = coalesce(p_receipt_date, receipt_date),
    reference_number = coalesce(p_reference_number, reference_number),
    remarks = coalesce(p_remarks, remarks),
    updated_by = auth.uid(), updated_at = now()
  where id = p_receipt_id;
end;
$$;
grant execute on function update_draft_receipt(uuid, uuid, text, date, text, text) to authenticated;

create or replace function update_draft_receipt_allocations(p_receipt_id uuid, p_invoice_allocations jsonb, p_allocation_mode text default 'manual')
returns void language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_allocation jsonb;
  v_invoice sales_invoices%rowtype;
  v_outstanding numeric;
  v_allocated_total numeric := 0;
  v_seq integer := 0;
  v_allocation_status text;
begin
  if not has_permission('receipt_vouchers:allocate_invoice') then raise exception 'Not permitted'; end if;
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status != 'draft' then raise exception 'Only draft receipts can be edited (currently %)', v_receipt.status; end if;

  update receipt_invoice_allocations set status = 'cancelled' where receipt_id = p_receipt_id;

  if p_invoice_allocations is not null and jsonb_array_length(p_invoice_allocations) > 0 then
    select coalesce(sum((a->>'amount')::numeric), 0) into v_allocated_total from jsonb_array_elements(p_invoice_allocations) a;
    if v_allocated_total > v_receipt.receipt_amount then raise exception 'Allocated amount cannot exceed the receipt amount'; end if;

    for v_allocation in select * from jsonb_array_elements(p_invoice_allocations) loop
      v_seq := v_seq + 1;
      select * into v_invoice from sales_invoices where id = (v_allocation->>'invoice_id')::uuid;
      if v_invoice.customer_id != v_receipt.customer_id then raise exception 'Cannot allocate to another customer''s invoice'; end if;

      v_outstanding := v_invoice.net_amount - invoice_allocated_amount(v_invoice.id);
      if (v_allocation->>'amount')::numeric > v_outstanding + 0.001 then
        raise exception 'Allocation of % exceeds outstanding % on invoice %', v_allocation->>'amount', v_outstanding, v_invoice.invoice_number;
      end if;

      insert into receipt_invoice_allocations (company_id, receipt_id, invoice_id, invoice_outstanding_snapshot, allocated_amount, allocation_order, allocation_method)
      values (v_receipt.company_id, p_receipt_id, v_invoice.id, v_outstanding, (v_allocation->>'amount')::numeric, v_seq, p_allocation_mode)
      on conflict (receipt_id, invoice_id) do update set status = 'active', allocated_amount = excluded.allocated_amount, allocation_order = excluded.allocation_order;
    end loop;
  end if;

  v_allocation_status := case
    when v_allocated_total = 0 then 'not_allocated'
    when v_allocated_total >= v_receipt.receipt_amount then 'fully_allocated'
    else 'partially_allocated'
  end;

  update receipt_vouchers set
    allocated_amount = v_allocated_total, unallocated_amount = greatest(v_receipt.receipt_amount - v_allocated_total, 0),
    allocation_status = v_allocation_status, updated_by = auth.uid(), updated_at = now()
  where id = p_receipt_id;
end;
$$;
grant execute on function update_draft_receipt_allocations(uuid, jsonb, text) to authenticated;

create or replace function cancel_receipt_draft(p_receipt_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_receipt receipt_vouchers%rowtype;
begin
  if not has_permission('receipt_vouchers:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status = 'cancelled_before_posting' then return; end if;
  if v_receipt.posting_status != 'not_posted' then raise exception 'Posted receipts cannot be cancelled through this function'; end if;

  update receipt_invoice_allocations set status = 'cancelled' where receipt_id = p_receipt_id;
  perform change_receipt_status(p_receipt_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into receipt_notes (company_id, receipt_id, note, note_type, created_by)
    values (v_receipt.company_id, p_receipt_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_receipt_draft(uuid, text, text) to authenticated;

create or replace function delete_unsynced_receipt_draft(p_receipt_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('receipt_vouchers:delete_unsynced_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if v_status is null then raise exception 'Receipt not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from receipt_vouchers where id = p_receipt_id;
end;
$$;
grant execute on function delete_unsynced_receipt_draft(uuid) to authenticated;

create or replace function check_duplicate_payment_warning(
  p_customer_id uuid, p_amount numeric, p_payment_method_code text, p_reference text default null,
  p_cheque_number text default null, p_card_authorization_code text default null, p_bank_reference text default null
) returns table (receipt_id uuid, receipt_number text, receipt_date date, amount numeric, matched_on text)
language plpgsql stable as $$
begin
  return query
  select rv.id, rv.receipt_number, rv.receipt_date, rv.receipt_amount,
    case
      when p_cheque_number is not null and exists (select 1 from receipt_payment_components rpc join cheque_receipt_details cd on cd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and cd.cheque_number = p_cheque_number) then 'cheque_number'
      when p_card_authorization_code is not null and exists (select 1 from receipt_payment_components rpc join card_receipt_details crd on crd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and crd.authorization_code = p_card_authorization_code) then 'card_authorization'
      when p_bank_reference is not null and exists (select 1 from receipt_payment_components rpc join bank_transfer_receipt_details btd on btd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and btd.transfer_reference = p_bank_reference) then 'bank_reference'
      when p_reference is not null and rv.reference_number = p_reference then 'reference_number'
      else 'amount_method_customer'
    end
  from receipt_vouchers rv
  where rv.company_id = current_company_id() and rv.customer_id = p_customer_id
    and rv.status not in ('cancelled_before_posting')
    and rv.receipt_date >= current_date - 7
    and (
      rv.receipt_amount = p_amount
      or (p_cheque_number is not null and exists (select 1 from receipt_payment_components rpc join cheque_receipt_details cd on cd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and cd.cheque_number = p_cheque_number))
      or (p_card_authorization_code is not null and exists (select 1 from receipt_payment_components rpc join card_receipt_details crd on crd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and crd.authorization_code = p_card_authorization_code))
      or (p_bank_reference is not null and exists (select 1 from receipt_payment_components rpc join bank_transfer_receipt_details btd on btd.payment_component_id = rpc.id where rpc.receipt_id = rv.id and btd.transfer_reference = p_bank_reference))
      or (p_reference is not null and rv.reference_number = p_reference)
    )
  order by rv.receipt_date desc;
end;
$$;
grant execute on function check_duplicate_payment_warning(uuid, numeric, text, text, text, text, text) to authenticated;

create table payment_promises (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  customer_visit_id uuid references customer_visits(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  promised_amount numeric(14,2) not null check (promised_amount > 0),
  promise_date date not null,
  payment_method_expected text references payment_methods(code) on delete set null,
  customer_notes text,
  employee_notes text,
  follow_up_employee_id uuid references app_users(id),
  reminder_date date,
  status text not null default 'open' check (status in ('open', 'kept', 'broken', 'cancelled')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_payment_promises_customer on payment_promises(customer_id);
create index idx_payment_promises_company_status on payment_promises(company_id, status, promise_date);

alter table payment_promises enable row level security;
create policy payment_promises_isolation on payment_promises for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_payment_promise(
  p_customer_id uuid, p_promised_amount numeric, p_promise_date date, p_customer_visit_id uuid default null,
  p_route_id uuid default null, p_van_id uuid default null, p_payment_method_expected text default null,
  p_customer_notes text default null, p_employee_notes text default null, p_follow_up_employee_id uuid default null, p_reminder_date date default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid := current_company_id(); v_id uuid;
begin
  if not has_permission('receipt_vouchers:create_payment_promise') then raise exception 'Not permitted'; end if;
  insert into payment_promises (
    company_id, customer_id, customer_visit_id, route_id, van_id, promised_amount, promise_date,
    payment_method_expected, customer_notes, employee_notes, follow_up_employee_id, reminder_date, created_by
  ) values (
    v_company_id, p_customer_id, p_customer_visit_id, p_route_id, p_van_id, p_promised_amount, p_promise_date,
    p_payment_method_expected, p_customer_notes, p_employee_notes, coalesce(p_follow_up_employee_id, auth.uid()), p_reminder_date, auth.uid()
  ) returning id into v_id;

  if p_customer_visit_id is not null then
    update customer_visits set visit_outcome = 'payment_promised' where id = p_customer_visit_id;
  end if;

  return v_id;
end;
$$;
grant execute on function create_payment_promise(uuid, numeric, date, uuid, uuid, uuid, text, text, text, uuid, date) to authenticated;
