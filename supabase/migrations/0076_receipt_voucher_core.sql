-- ============================================================================
-- 0076_receipt_voucher_core.sql
-- Phase 5B.2 Part 1: Collection Entry, Receipt Vouchers, Customer Payment
-- Allocation, Mobile & PDT Collection Entry.
--
-- receipt_vouchers is a NEW draft-only layer, distinct from the existing
-- `collections` table (Phase 1). payment_methods (4A.2 Part 1) already
-- has cash/card/bank_transfer/cheque/online/wallet/credit_account —
-- reused directly, not duplicated.
-- ============================================================================

alter table customer_visits add column if not exists visit_outcome text check (visit_outcome in (
  'payment_collected', 'partial_payment_collected', 'payment_promised', 'no_payment'
) or visit_outcome is null);

create table collection_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  customer_required boolean not null default true,
  invoice_allocation_required boolean not null default false,
  requires_approval boolean not null default false,
  allowed_payment_method_codes text[] not null default '{}',
  offline_entry_allowed boolean not null default true,
  reference_required boolean not null default false,
  deposit_account_required boolean not null default false,
  cheque_details_required boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_collection_types_system_code on collection_types(code) where company_id is null;
create unique index idx_collection_types_company_code on collection_types(code, company_id) where company_id is not null;

insert into collection_types (code, company_id, label, customer_required, invoice_allocation_required, requires_approval, allowed_payment_method_codes, reference_required, cheque_details_required, is_system) values
  ('customer_collection', null, 'Customer Collection', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('invoice_payment', null, 'Invoice Payment', true, true, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('advance_payment', null, 'Advance Payment', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('on_account_payment', null, 'On-Account Payment', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('unallocated_receipt', null, 'Unallocated Receipt', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('cash_collection', null, 'Cash Collection', true, false, false, '{cash}', false, false, true),
  ('card_collection', null, 'Card Collection', true, false, false, '{card}', true, false, true),
  ('bank_transfer_collection', null, 'Bank Transfer Collection', true, false, false, '{bank_transfer}', true, false, true),
  ('cheque_collection', null, 'Cheque Collection', true, false, true, '{cheque}', false, true, true),
  ('wallet_collection', null, 'Wallet Collection', true, false, false, '{wallet}', true, false, true),
  ('online_payment', null, 'Online Payment', true, false, false, '{online}', true, false, true),
  ('mixed_payment', null, 'Mixed Payment', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('route_collection', null, 'Route Collection', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('van_collection', null, 'Van Collection', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('office_collection', null, 'Office Collection', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true),
  ('counter_collection', null, 'Counter Collection', true, false, false, '{cash,card}', false, false, true),
  ('emergency_collection', null, 'Emergency Collection', true, false, true, '{cash,card,bank_transfer}', false, false, true),
  ('custom_collection_type', null, 'Custom Collection Type', true, false, false, '{cash,card,bank_transfer,cheque,online,wallet}', false, false, true);

alter table collection_types enable row level security;
create policy collection_types_read on collection_types for select
  using (company_id is null or company_id = current_company_id());
create policy collection_types_write on collection_types for insert with check (company_id = current_company_id());
create policy collection_types_update on collection_types for update using (company_id = current_company_id());
create policy collection_types_delete on collection_types for delete using (company_id = current_company_id());

create sequence if not exists receipt_voucher_seq;

create or replace function next_receipt_no(p_collection_type_code text)
returns text language plpgsql as $$
declare
  v_num bigint;
  v_prefix text;
begin
  v_prefix := case p_collection_type_code
    when 'cash_collection' then 'CASH'
    when 'card_collection' then 'CARD'
    when 'bank_transfer_collection' then 'BANK'
    when 'cheque_collection' then 'CHQ'
    when 'wallet_collection' then 'WLT'
    when 'online_payment' then 'ONL'
    when 'advance_payment' then 'ADV'
    when 'on_account_payment' then 'ONA'
    when 'unallocated_receipt' then 'UNA'
    when 'mixed_payment' then 'MIX'
    when 'route_collection' then 'RTC'
    when 'van_collection' then 'VNC'
    when 'office_collection' then 'OFC'
    else 'RV'
  end;
  select nextval('receipt_voucher_seq') into v_num;
  return v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;

create table receipt_vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete set null,
  receipt_number text not null,
  temporary_number text,
  collection_type_id uuid not null references collection_types(id),
  receipt_date date not null default current_date,
  receipt_time timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete restrict,
  customer_contact text,
  customer_address text,
  route_id uuid references routes(id) on delete set null,
  beat_plan_id uuid references beat_plans(id) on delete set null,
  customer_visit_id uuid references customer_visits(id) on delete set null,
  daily_visit_plan_id uuid references daily_visit_plans(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  responsible_employee_id uuid references app_users(id) on delete set null,
  collection_source text not null default 'web' check (collection_source in ('web', 'mobile', 'pdt', 'offline', 'office', 'route', 'van')),
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  payment_method text,
  receipt_amount numeric(14,2) not null check (receipt_amount > 0),
  allocated_amount numeric(14,2) not null default 0,
  unallocated_amount numeric(14,2) not null default 0,
  advance_amount numeric(14,2) not null default 0,
  reference_number text,
  customer_reference text,
  remarks text,
  internal_notes text,
  status text not null default 'draft' check (status in (
    'draft', 'pending_submission', 'submitted', 'returned_for_correction', 'cancelled_before_posting',
    'expired', 'sync_pending', 'sync_failed', 'conflict'
  )),
  allocation_status text not null default 'not_allocated' check (allocation_status in (
    'not_allocated', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance', 'mixed', 'posting_pending'
  )),
  posting_status text not null default 'not_posted' check (posting_status = 'not_posted'),
  approval_status text not null default 'not_required',
  posted_by uuid references app_users(id),
  posted_date timestamptz,
  final_receipt_number text,
  settlement_status text not null default 'not_settled' check (settlement_status = 'not_settled'),
  reversal_status text not null default 'not_reversed' check (reversal_status = 'not_reversed'),
  cash_settlement_reference text,
  bank_posting_reference text,
  client_uuid text,
  device_uid text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, receipt_number),
  unique (company_id, client_uuid)
);
create index idx_receipt_vouchers_company_date on receipt_vouchers(company_id, receipt_date);
create index idx_receipt_vouchers_customer on receipt_vouchers(customer_id);
create index idx_receipt_vouchers_status on receipt_vouchers(company_id, status);
create index idx_receipt_vouchers_van on receipt_vouchers(van_id);

alter table receipt_vouchers enable row level security;
create policy receipt_vouchers_isolation on receipt_vouchers for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_receipt_vouchers_updated_at before update on receipt_vouchers
  for each row execute function set_updated_at();

create table receipt_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
create index idx_receipt_status_history_receipt on receipt_status_history(receipt_id);

alter table receipt_status_history enable row level security;
create policy receipt_status_history_isolation on receipt_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

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
    when 'draft' then p_new_status in ('pending_submission', 'submitted', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_submission' then p_new_status in ('submitted', 'returned_for_correction', 'cancelled_before_posting', 'draft')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled_before_posting')
    when 'sync_pending' then p_new_status in ('submitted', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled_before_posting')
    when 'conflict' then p_new_status in ('draft', 'sync_pending', 'cancelled_before_posting')
    when 'submitted' then p_new_status in ('cancelled_before_posting', 'expired')
    when 'cancelled_before_posting' then false
    when 'expired' then p_new_status in ('draft')
    else false
  end;
  if not v_valid then raise exception 'Cannot move receipt from % to %', v_old, p_new_status; end if;

  update receipt_vouchers set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_receipt_id;
  insert into receipt_status_history (company_id, receipt_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_receipt_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_receipt_status(uuid, text, text) to authenticated;

create table receipt_payment_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  payment_method_code text not null references payment_methods(code) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  reference text,
  bank_or_terminal text,
  status text not null default 'recorded' check (status in ('recorded', 'pending_verification', 'verified', 'on_hold', 'rejected')),
  notes text,
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_receipt_payment_components_receipt on receipt_payment_components(receipt_id);

alter table receipt_payment_components enable row level security;
create policy receipt_payment_components_isolation on receipt_payment_components for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table cheque_receipt_details (
  payment_component_id uuid primary key references receipt_payment_components(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  cheque_number text not null,
  cheque_date date not null,
  bank_name text not null,
  branch_name text,
  account_name text,
  cheque_amount numeric(14,2) not null,
  drawer_name text,
  is_post_dated boolean not null default false,
  deposit_date date,
  cheque_status text not null default 'received' check (cheque_status in (
    'received', 'post_dated', 'pending_deposit', 'pending_verification', 'on_hold', 'cancelled_before_posting'
  )),
  notes text
);
alter table cheque_receipt_details enable row level security;
create policy cheque_receipt_details_isolation on cheque_receipt_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table card_receipt_details (
  payment_component_id uuid primary key references receipt_payment_components(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  card_type text,
  terminal text,
  merchant_reference text,
  authorization_code text,
  last_four_digits text check (last_four_digits is null or length(last_four_digits) = 4),
  transaction_date timestamptz,
  notes text
);
alter table card_receipt_details enable row level security;
create policy card_receipt_details_isolation on card_receipt_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table bank_transfer_receipt_details (
  payment_component_id uuid primary key references receipt_payment_components(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  bank_account text,
  transfer_reference text,
  transaction_date timestamptz,
  value_date date,
  sender_bank text,
  sender_account_reference text,
  attachment_url text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  notes text
);
alter table bank_transfer_receipt_details enable row level security;
create policy bank_transfer_receipt_details_isolation on bank_transfer_receipt_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table wallet_receipt_details (
  payment_component_id uuid primary key references receipt_payment_components(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null,
  transaction_id text,
  reference text,
  transaction_date timestamptz,
  status text not null default 'recorded' check (status in ('recorded', 'verified', 'failed')),
  notes text
);
alter table wallet_receipt_details enable row level security;
create policy wallet_receipt_details_isolation on wallet_receipt_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete restrict,
  invoice_outstanding_snapshot numeric(14,2) not null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  allocation_order integer not null default 0,
  allocation_method text not null default 'manual' check (allocation_method in (
    'manual', 'oldest_invoice_first', 'oldest_due_date_first', 'most_overdue_first', 'smallest_balance_first', 'largest_balance_first', 'user_defined_sequence'
  )),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);
create index idx_receipt_invoice_allocations_receipt on receipt_invoice_allocations(receipt_id);
create index idx_receipt_invoice_allocations_invoice on receipt_invoice_allocations(invoice_id);

alter table receipt_invoice_allocations enable row level security;
create policy receipt_invoice_allocations_isolation on receipt_invoice_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_advance_details (
  receipt_id uuid primary key references receipt_vouchers(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  purpose text,
  expected_use text,
  expiry_date date,
  notes text
);
alter table receipt_advance_details enable row level security;
create policy receipt_advance_details_isolation on receipt_advance_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_unallocated_details (
  receipt_id uuid primary key references receipt_vouchers(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  reason text not null,
  expected_allocation_date date,
  responsible_employee_id uuid references app_users(id),
  status text not null default 'pending' check (status in ('pending', 'allocated', 'refunded')),
  notes text
);
alter table receipt_unallocated_details enable row level security;
create policy receipt_unallocated_details_isolation on receipt_unallocated_details for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());
