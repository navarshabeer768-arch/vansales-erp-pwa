-- ============================================================================
-- 0085_cheque_lifecycle.sql
-- Continues 0081-0084.
-- ============================================================================

alter table cheque_receipt_details drop constraint if exists cheque_receipt_details_cheque_status_check;
alter table cheque_receipt_details add constraint cheque_receipt_details_cheque_status_check check (cheque_status in (
  'received', 'post_dated', 'pending_verification', 'verified', 'pending_deposit', 'deposited',
  'cleared', 'returned', 'cancelled', 'replaced', 'reversed'
));
alter table cheque_receipt_details add column if not exists reminder_date date;
alter table cheque_receipt_details add column if not exists responsible_employee_id uuid references app_users(id);
alter table cheque_receipt_details add column if not exists accounting_policy text not null default 'allocate_on_receipt' check (accounting_policy in ('allocate_on_receipt', 'allocate_on_verification', 'allocate_on_deposit', 'allocate_on_clearance'));
alter table cheque_receipt_details add column if not exists verified_by uuid references app_users(id);
alter table cheque_receipt_details add column if not exists verification_date timestamptz;
alter table cheque_receipt_details add column if not exists verification_notes text;

create table cheque_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payment_component_id uuid not null references receipt_payment_components(id) on delete cascade,
  old_status text, new_status text not null, reason text, notes text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
create index idx_cheque_status_history_component on cheque_status_history(payment_component_id);

alter table cheque_status_history enable row level security;
create policy cheque_status_history_isolation on cheque_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_cheque_status(p_payment_component_id uuid, p_new_status text, p_reason text default null, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid;
begin
  select cheque_status, company_id into v_old, v_company_id from cheque_receipt_details where payment_component_id = p_payment_component_id;
  if v_old is null then raise exception 'Cheque not found'; end if;

  update cheque_receipt_details set cheque_status = p_new_status where payment_component_id = p_payment_component_id;
  insert into cheque_status_history (company_id, payment_component_id, old_status, new_status, reason, notes, changed_by)
  values (v_company_id, p_payment_component_id, v_old, p_new_status, p_reason, p_notes, auth.uid());
end;
$$;
grant execute on function change_cheque_status(uuid, text, text, text) to authenticated;

create or replace function post_cheque_component(p_payment_component_id uuid)
returns void language plpgsql security definer as $$
declare v_cheque cheque_receipt_details%rowtype;
begin
  select * into v_cheque from cheque_receipt_details where payment_component_id = p_payment_component_id;
  if not found then raise exception 'Cheque details not found for this payment component'; end if;

  if v_cheque.is_post_dated then
    perform change_cheque_status(p_payment_component_id, 'post_dated', 'Receipt posted — cheque is post-dated, awaiting deposit date');
  else
    perform change_cheque_status(p_payment_component_id, 'pending_verification', 'Receipt posted — cheque pending verification');
  end if;
end;
$$;
grant execute on function post_cheque_component(uuid) to authenticated;

create or replace function verify_cheque(p_payment_component_id uuid, p_approve boolean, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not has_permission('receipt_vouchers:verify_cheque') then raise exception 'Not permitted'; end if;
  update cheque_receipt_details set verified_by = auth.uid(), verification_date = now(), verification_notes = p_notes
  where payment_component_id = p_payment_component_id;
  perform change_cheque_status(p_payment_component_id, case when p_approve then 'verified' else 'pending_verification' end, case when p_approve then 'Verified' else 'Rejected — pending correction' end, p_notes);
end;
$$;
grant execute on function verify_cheque(uuid, boolean, text) to authenticated;

create table cheque_deposit_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  deposit_date date not null default current_date,
  bank_account text not null,
  deposit_slip_number text,
  deposited_by uuid references app_users(id),
  total_amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'deposited', 'partially_cleared', 'cleared', 'closed')),
  created_at timestamptz not null default now()
);
create index idx_cheque_deposit_batches_company on cheque_deposit_batches(company_id, deposit_date);

alter table cheque_deposit_batches enable row level security;
create policy cheque_deposit_batches_isolation on cheque_deposit_batches for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table cheque_deposit_batch_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  batch_id uuid not null references cheque_deposit_batches(id) on delete cascade,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  amount numeric(14,2) not null,
  unique (payment_component_id)
);
create index idx_cheque_deposit_batch_items_batch on cheque_deposit_batch_items(batch_id);

alter table cheque_deposit_batch_items enable row level security;
create policy cheque_deposit_batch_items_isolation on cheque_deposit_batch_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_cheque_deposit_batch(p_bank_account text, p_payment_component_ids uuid[], p_deposit_slip_number text default null)
returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_batch_id uuid;
  v_component_id uuid;
  v_total numeric := 0;
  v_amount numeric;
begin
  if not has_permission('receipt_vouchers:deposit_cheque') then raise exception 'Not permitted'; end if;

  insert into cheque_deposit_batches (company_id, bank_account, deposit_slip_number, deposited_by)
  values (v_company_id, p_bank_account, p_deposit_slip_number, auth.uid()) returning id into v_batch_id;

  foreach v_component_id in array p_payment_component_ids loop
    select amount into v_amount from receipt_payment_components where id = v_component_id;
    if v_amount is null then raise exception 'Payment component not found'; end if;

    insert into cheque_deposit_batch_items (company_id, batch_id, payment_component_id, amount)
    values (v_company_id, v_batch_id, v_component_id, v_amount);

    perform change_cheque_status(v_component_id, 'deposited', 'Deposited in batch');
    v_total := v_total + v_amount;
  end loop;

  update cheque_deposit_batches set total_amount = v_total, status = 'deposited' where id = v_batch_id;
  return v_batch_id;
end;
$$;
grant execute on function create_cheque_deposit_batch(text, uuid[], text) to authenticated;

create table cheque_clearance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  clearance_date date not null default current_date,
  bank_reference text,
  cleared_by uuid references app_users(id),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_cheque_clearance_records_component on cheque_clearance_records(payment_component_id);

alter table cheque_clearance_records enable row level security;
create policy cheque_clearance_records_isolation on cheque_clearance_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table cheque_return_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  return_reason text not null check (return_reason in (
    'insufficient_funds', 'signature_mismatch', 'account_closed', 'payment_stopped', 'date_error', 'amount_mismatch', 'technical_return', 'other'
  )),
  return_date date not null default current_date,
  bank_charges numeric(10,2) not null default 0,
  returned_by uuid references app_users(id),
  customer_notified boolean not null default false,
  replacement_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_cheque_return_records_component on cheque_return_records(payment_component_id);

alter table cheque_return_records enable row level security;
create policy cheque_return_records_isolation on cheque_return_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table cheque_replacement_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  original_payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  replacement_type text not null check (replacement_type in ('new_cheque', 'cash', 'bank_transfer', 'card')),
  replacement_payment_component_id uuid references receipt_payment_components(id) on delete set null,
  replacement_receipt_id uuid references receipt_vouchers(id) on delete set null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_cheque_replacement_links_original on cheque_replacement_links(original_payment_component_id);

alter table cheque_replacement_links enable row level security;
create policy cheque_replacement_links_isolation on cheque_replacement_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function clear_cheque(p_payment_component_id uuid, p_bank_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid := current_company_id(); v_id uuid;
begin
  if not has_permission('receipt_vouchers:mark_cheque_cleared') then raise exception 'Not permitted'; end if;
  insert into cheque_clearance_records (company_id, payment_component_id, bank_reference, cleared_by, notes)
  values (v_company_id, p_payment_component_id, p_bank_reference, auth.uid(), p_notes) returning id into v_id;
  perform change_cheque_status(p_payment_component_id, 'cleared', 'Cheque cleared', p_notes);
  return v_id;
end;
$$;
grant execute on function clear_cheque(uuid, text, text) to authenticated;

create or replace function return_cheque(
  p_payment_component_id uuid, p_return_reason text, p_bank_charges numeric default 0, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_return_id uuid;
  v_receipt_id uuid;
  v_component receipt_payment_components%rowtype;
  v_alloc record;
begin
  if not has_permission('receipt_vouchers:mark_cheque_returned') then raise exception 'Not permitted'; end if;
  select * into v_component from receipt_payment_components where id = p_payment_component_id;
  if not found then raise exception 'Payment component not found'; end if;
  v_receipt_id := v_component.receipt_id;

  insert into cheque_return_records (company_id, payment_component_id, return_reason, bank_charges, returned_by, notes)
  values (v_company_id, p_payment_component_id, p_return_reason, p_bank_charges, auth.uid(), p_notes) returning id into v_return_id;

  perform change_cheque_status(p_payment_component_id, 'returned', 'Cheque returned: ' || p_return_reason, p_notes);

  for v_alloc in
    select pra.* from posted_receipt_allocations pra where pra.receipt_id = v_receipt_id and not pra.reversed
  loop
    update sales_invoices set
      paid_amount = greatest(paid_amount - v_alloc.allocated_amount, 0),
      payment_status = case when paid_amount - v_alloc.allocated_amount <= 0.001 then 'unpaid' else 'partially_paid' end,
      settlement_date = null
    where id = v_alloc.invoice_id;

    update posted_receipt_allocations set reversed = true where id = v_alloc.id;
  end loop;

  update customers set outstanding_balance = outstanding_balance + v_component.amount
  where id = (select customer_id from receipt_vouchers where id = v_receipt_id);

  insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
  values (
    v_company_id, (select customer_id from receipt_vouchers where id = v_receipt_id), 'adjustment', 'receipt_payment_components', p_payment_component_id,
    v_component.amount, 0, current_date, format('Cheque returned: %s', p_return_reason)
  );

  return v_return_id;
end;
$$;
grant execute on function return_cheque(uuid, text, numeric, text) to authenticated;

create or replace function replace_cheque(p_original_component_id uuid, p_replacement_type text, p_replacement_component_id uuid default null, p_replacement_receipt_id uuid default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid := current_company_id(); v_id uuid;
begin
  if not has_permission('receipt_vouchers:replace_returned_cheque') then raise exception 'Not permitted'; end if;
  insert into cheque_replacement_links (company_id, original_payment_component_id, replacement_type, replacement_payment_component_id, replacement_receipt_id, created_by)
  values (v_company_id, p_original_component_id, p_replacement_type, p_replacement_component_id, p_replacement_receipt_id, auth.uid())
  returning id into v_id;
  perform change_cheque_status(p_original_component_id, 'replaced', 'Replacement payment linked');
  return v_id;
end;
$$;
grant execute on function replace_cheque(uuid, text, uuid, uuid) to authenticated;
