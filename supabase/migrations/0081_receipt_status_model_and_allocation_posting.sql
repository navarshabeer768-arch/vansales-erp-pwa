-- ============================================================================
-- 0081_receipt_status_model_and_allocation_posting.sql
-- Phase 5B.2 Part 2: Receipt Posting, Customer Balance Settlement,
-- Invoice Allocation, Advance Payments, Cheque Control, Collection
-- Approvals, Reversals, Receipt Printing, Offline Revalidation.
-- ============================================================================

alter table sales_invoices add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'overpaid', 'disputed'));
alter table sales_invoices add column if not exists paid_amount numeric(14,2) not null default 0;
alter table sales_invoices add column if not exists settlement_date timestamptz;

alter table receipt_vouchers drop constraint if exists receipt_vouchers_status_check;
alter table receipt_vouchers add constraint receipt_vouchers_status_check check (status in (
  'draft', 'pending_validation', 'validation_failed', 'pending_submission', 'pending_approval', 'approved',
  'returned_for_correction', 'on_hold', 'ready_to_post', 'posting', 'posting_failed', 'posted', 'partially_allocated',
  'fully_allocated', 'unallocated', 'advance', 'cancelled_before_posting', 'reversal_requested', 'reversed',
  'sync_pending', 'sync_failed', 'conflict', 'submitted', 'expired'
));

alter table receipt_vouchers drop constraint if exists receipt_vouchers_posting_status_check;
alter table receipt_vouchers add constraint receipt_vouchers_posting_status_check check (posting_status in (
  'not_posted', 'posting', 'posted', 'posting_failed', 'reversal_pending', 'reversed'
));

alter table receipt_vouchers add column if not exists is_on_hold boolean not null default false;
alter table receipt_vouchers add column if not exists final_number_generated_at timestamptz;
alter table receipt_vouchers add column if not exists final_number_generated_by uuid references app_users(id);
alter table receipt_vouchers add column if not exists validation_status text not null default 'not_validated' check (validation_status in ('not_validated', 'valid', 'validation_failed'));
alter table receipt_vouchers add column if not exists approval_status text not null default 'not_required';
alter table receipt_vouchers add column if not exists version integer not null default 1;

create or replace function change_receipt_status(p_receipt_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from receipt_vouchers where id = p_receipt_id;
  if v_old is null then raise exception 'Receipt not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_validation' then p_new_status in ('validation_failed', 'pending_submission', 'pending_approval', 'ready_to_post', 'cancelled_before_posting')
    when 'validation_failed' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled_before_posting', 'draft')
    when 'pending_approval' then p_new_status in ('approved', 'returned_for_correction', 'on_hold', 'cancelled_before_posting')
    when 'approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled_before_posting')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'ready_to_post', 'cancelled_before_posting')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled_before_posting')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled_before_posting')
    when 'posted' then p_new_status in ('reversal_requested', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance')
    when 'partially_allocated' then p_new_status in ('reversal_requested')
    when 'fully_allocated' then p_new_status in ('reversal_requested')
    when 'unallocated' then p_new_status in ('reversal_requested', 'partially_allocated', 'fully_allocated')
    when 'advance' then p_new_status in ('reversal_requested', 'partially_allocated', 'fully_allocated')
    when 'reversal_requested' then p_new_status in ('reversed', 'posted', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled_before_posting')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled_before_posting')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled_before_posting' then false
    when 'reversed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move receipt from % to %', v_old, p_new_status; end if;

  update receipt_vouchers set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_receipt_id;
  insert into receipt_status_history (company_id, receipt_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_receipt_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_receipt_status(uuid, text, text) to authenticated;

create table posted_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  invoice_id uuid not null references sales_invoices(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  invoice_outstanding_before numeric(14,2) not null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  invoice_outstanding_after numeric(14,2) not null,
  allocation_date timestamptz not null default now(),
  allocation_sequence integer not null default 0,
  payment_method_summary text,
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  posted_by uuid references app_users(id),
  reversed boolean not null default false
);
create index idx_posted_receipt_allocations_receipt on posted_receipt_allocations(receipt_id);
create index idx_posted_receipt_allocations_invoice on posted_receipt_allocations(invoice_id);

alter table posted_receipt_allocations enable row level security;
create policy posted_receipt_allocations_isolation on posted_receipt_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function revalidate_invoice_allocation(p_invoice_id uuid, p_customer_id uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare
  v_invoice sales_invoices%rowtype;
  v_current_outstanding numeric;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.posting_status != 'posted' then raise exception 'Invoice % is not posted', v_invoice.invoice_number; end if;
  if v_invoice.customer_id != p_customer_id then raise exception 'Invoice % does not belong to this customer', v_invoice.invoice_number; end if;
  if v_invoice.status in ('void_requested', 'voided') then raise exception 'Invoice % has been voided', v_invoice.invoice_number; end if;

  v_current_outstanding := v_invoice.net_amount - v_invoice.paid_amount;
  if v_current_outstanding <= 0 then raise exception 'Invoice % has no outstanding balance', v_invoice.invoice_number; end if;
  if p_amount > v_current_outstanding + 0.001 then
    raise exception 'Allocation of % exceeds current outstanding % on invoice %', p_amount, v_current_outstanding, v_invoice.invoice_number;
  end if;

  return v_current_outstanding;
end;
$$;
grant execute on function revalidate_invoice_allocation(uuid, uuid, numeric) to authenticated;

create or replace function post_invoice_allocation(
  p_receipt_id uuid, p_invoice_id uuid, p_customer_id uuid, p_amount numeric,
  p_sequence integer, p_payment_summary text
) returns uuid language plpgsql security definer as $$
declare
  v_outstanding_before numeric;
  v_outstanding_after numeric;
  v_company_id uuid;
  v_allocation_id uuid;
  v_new_paid_amount numeric;
  v_new_payment_status text;
begin
  v_outstanding_before := revalidate_invoice_allocation(p_invoice_id, p_customer_id, p_amount);
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;

  v_outstanding_after := v_outstanding_before - p_amount;

  insert into posted_receipt_allocations (
    company_id, receipt_id, invoice_id, customer_id, invoice_outstanding_before, allocated_amount,
    invoice_outstanding_after, allocation_sequence, payment_method_summary, posted_by
  ) values (
    v_company_id, p_receipt_id, p_invoice_id, p_customer_id, v_outstanding_before, p_amount,
    v_outstanding_after, p_sequence, p_payment_summary, auth.uid()
  ) returning id into v_allocation_id;

  select paid_amount + p_amount into v_new_paid_amount from sales_invoices where id = p_invoice_id;
  v_new_payment_status := case when v_outstanding_after <= 0.001 then 'paid' else 'partially_paid' end;

  update sales_invoices set
    paid_amount = v_new_paid_amount, payment_status = v_new_payment_status,
    settlement_date = case when v_new_payment_status = 'paid' then now() else settlement_date end
  where id = p_invoice_id;

  return v_allocation_id;
end;
$$;
grant execute on function post_invoice_allocation(uuid, uuid, uuid, numeric, integer, text) to authenticated;
