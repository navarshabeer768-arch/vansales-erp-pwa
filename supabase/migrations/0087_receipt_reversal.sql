-- ============================================================================
-- 0087_receipt_reversal.sql
-- Continues 0081-0086.
-- ============================================================================

create table receipt_reversal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  reason text not null,
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  original_snapshot jsonb not null,
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_receipt_reversal_requests_receipt on receipt_reversal_requests(receipt_id);
create index idx_receipt_reversal_requests_status on receipt_reversal_requests(company_id, approval_status);

alter table receipt_reversal_requests enable row level security;
create policy receipt_reversal_requests_isolation on receipt_reversal_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  reversal_request_id uuid references receipt_reversal_requests(id) on delete set null,
  reversed_amount numeric(14,2) not null,
  invoices_reopened integer not null default 0,
  advance_reversed numeric(14,2) not null default 0,
  unallocated_reversed numeric(14,2) not null default 0,
  reversed_by uuid references app_users(id),
  reversed_at timestamptz not null default now(),
  ledger_transaction_id uuid,
  notes text
);
create index idx_receipt_reversals_receipt on receipt_reversals(receipt_id);

alter table receipt_reversals enable row level security;
create policy receipt_reversals_isolation on receipt_reversals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_partial_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  posted_allocation_id uuid references posted_receipt_allocations(id) on delete set null,
  reversed_amount numeric(14,2) not null,
  reason text,
  reversed_by uuid references app_users(id),
  reversed_at timestamptz not null default now()
);
create index idx_receipt_partial_reversals_receipt on receipt_partial_reversals(receipt_id);

alter table receipt_partial_reversals enable row level security;
create policy receipt_partial_reversals_isolation on receipt_partial_reversals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_receipt_reversal_request(p_receipt_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_snapshot jsonb;
  v_request_id uuid;
begin
  if not has_permission('receipt_vouchers:request_reversal') then raise exception 'Not permitted'; end if;
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.posting_status != 'posted' then raise exception 'Only posted receipts can have a reversal request'; end if;

  select jsonb_build_object(
    'receipt', to_jsonb(v_receipt),
    'components', (select jsonb_agg(to_jsonb(c)) from receipt_payment_components c where c.receipt_id = p_receipt_id),
    'allocations', (select jsonb_agg(to_jsonb(a)) from posted_receipt_allocations a where a.receipt_id = p_receipt_id and not a.reversed)
  ) into v_snapshot;

  insert into receipt_reversal_requests (company_id, receipt_id, reason, requested_by, original_snapshot)
  values (v_receipt.company_id, p_receipt_id, p_reason, auth.uid(), v_snapshot)
  returning id into v_request_id;

  perform change_receipt_status(p_receipt_id, 'reversal_requested', p_reason);
  return v_request_id;
end;
$$;
grant execute on function create_receipt_reversal_request(uuid, text) to authenticated;

create or replace function execute_receipt_reversal(p_reversal_request_id uuid, p_approve boolean, p_decision_reason text default null, p_notes text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_request receipt_reversal_requests%rowtype;
  v_receipt receipt_vouchers%rowtype;
  v_alloc record;
  v_advance record;
  v_unallocated record;
  v_invoices_reopened integer := 0;
  v_advance_reversed numeric := 0;
  v_unallocated_reversed numeric := 0;
  v_ledger_id uuid;
  v_reversal_id uuid;
begin
  if not has_permission('receipt_vouchers:approve_reversal') then raise exception 'Not permitted'; end if;
  select * into v_request from receipt_reversal_requests where id = p_reversal_request_id;
  if not found then raise exception 'Reversal request not found'; end if;
  if v_request.approval_status != 'pending' then raise exception 'Request already decided'; end if;

  update receipt_reversal_requests set
    approval_status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decision_reason = p_decision_reason, decided_at = now()
  where id = p_reversal_request_id;

  if not p_approve then
    perform change_receipt_status(v_request.receipt_id, 'posted', 'Reversal request rejected: ' || coalesce(p_decision_reason, ''));
    return jsonb_build_object('approved', false);
  end if;

  select * into v_receipt from receipt_vouchers where id = v_request.receipt_id for update;

  for v_alloc in select * from posted_receipt_allocations where receipt_id = v_receipt.id and not reversed loop
    update sales_invoices set
      paid_amount = greatest(paid_amount - v_alloc.allocated_amount, 0),
      payment_status = case when paid_amount - v_alloc.allocated_amount <= 0.001 then 'unpaid' else 'partially_paid' end,
      settlement_date = null
    where id = v_alloc.invoice_id;
    update posted_receipt_allocations set reversed = true where id = v_alloc.id;
    v_invoices_reopened := v_invoices_reopened + 1;
  end loop;

  for v_advance in select * from customer_advance_balances where receipt_id = v_receipt.id and status != 'reversed' loop
    update customer_advance_balances set status = 'reversed', available_amount = 0 where id = v_advance.id;
    v_advance_reversed := v_advance_reversed + v_advance.available_amount;
  end loop;

  for v_unallocated in select * from customer_unallocated_credits where receipt_id = v_receipt.id and status != 'reversed' loop
    update customer_unallocated_credits set status = 'reversed', available_amount = 0 where id = v_unallocated.id;
    v_unallocated_reversed := v_unallocated_reversed + v_unallocated.available_amount;
  end loop;

  update customers set outstanding_balance = outstanding_balance + v_receipt.receipt_amount where id = v_receipt.customer_id;

  insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
  values (v_receipt.company_id, v_receipt.customer_id, 'adjustment', 'receipt_vouchers', v_receipt.id, v_receipt.receipt_amount, 0, current_date, format('Reversal of receipt %s', coalesce(v_receipt.final_receipt_number, v_receipt.receipt_number)))
  returning id into v_ledger_id;

  insert into receipt_reversals (company_id, receipt_id, reversal_request_id, reversed_amount, invoices_reopened, advance_reversed, unallocated_reversed, reversed_by, ledger_transaction_id, notes)
  values (v_receipt.company_id, v_receipt.id, p_reversal_request_id, v_receipt.receipt_amount, v_invoices_reopened, v_advance_reversed, v_unallocated_reversed, auth.uid(), v_ledger_id, p_notes)
  returning id into v_reversal_id;

  update receipt_vouchers set status = 'reversed', posting_status = 'reversed' where id = v_receipt.id;

  return jsonb_build_object('approved', true, 'reversal_id', v_reversal_id, 'invoices_reopened', v_invoices_reopened);
end;
$$;
grant execute on function execute_receipt_reversal(uuid, boolean, text, text) to authenticated;
