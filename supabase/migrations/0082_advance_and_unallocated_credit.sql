-- ============================================================================
-- 0082_advance_and_unallocated_credit.sql
-- Continues 0081.
-- ============================================================================

create table customer_advance_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  original_amount numeric(14,2) not null check (original_amount > 0),
  available_amount numeric(14,2) not null,
  allocated_amount numeric(14,2) not null default 0,
  currency text not null default 'QAR',
  receipt_date date not null default current_date,
  expiry_date date,
  status text not null default 'available' check (status in (
    'available', 'partially_allocated', 'fully_allocated', 'expired', 'on_hold', 'reversed', 'cancelled'
  )),
  created_at timestamptz not null default now()
);
create index idx_customer_advance_balances_customer on customer_advance_balances(customer_id, status);

alter table customer_advance_balances enable row level security;
create policy customer_advance_balances_isolation on customer_advance_balances for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_advance_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  advance_id uuid not null references customer_advance_balances(id) on delete restrict,
  invoice_id uuid not null references sales_invoices(id) on delete restrict,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  advance_balance_before numeric(14,2) not null,
  advance_balance_after numeric(14,2) not null,
  invoice_outstanding_before numeric(14,2) not null,
  invoice_outstanding_after numeric(14,2) not null,
  allocated_by uuid references app_users(id),
  allocation_date timestamptz not null default now(),
  reference text,
  reversed boolean not null default false
);
create index idx_customer_advance_allocations_advance on customer_advance_allocations(advance_id);

alter table customer_advance_allocations enable row level security;
create policy customer_advance_allocations_isolation on customer_advance_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_unallocated_credits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  original_amount numeric(14,2) not null check (original_amount > 0),
  available_amount numeric(14,2) not null,
  allocated_amount numeric(14,2) not null default 0,
  reason text,
  expected_allocation_date date,
  responsible_employee_id uuid references app_users(id),
  status text not null default 'available' check (status in ('available', 'partially_allocated', 'fully_allocated', 'on_hold', 'reversed', 'expired')),
  created_at timestamptz not null default now()
);
create index idx_customer_unallocated_credits_customer on customer_unallocated_credits(customer_id, status);

alter table customer_unallocated_credits enable row level security;
create policy customer_unallocated_credits_isolation on customer_unallocated_credits for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_unallocated_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  unallocated_id uuid not null references customer_unallocated_credits(id) on delete restrict,
  invoice_id uuid not null references sales_invoices(id) on delete restrict,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  unallocated_balance_before numeric(14,2) not null,
  unallocated_balance_after numeric(14,2) not null,
  invoice_outstanding_before numeric(14,2) not null,
  invoice_outstanding_after numeric(14,2) not null,
  allocated_by uuid references app_users(id),
  allocation_date timestamptz not null default now(),
  reversed boolean not null default false
);
create index idx_customer_unallocated_allocations_unallocated on customer_unallocated_allocations(unallocated_id);

alter table customer_unallocated_allocations enable row level security;
create policy customer_unallocated_allocations_isolation on customer_unallocated_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function allocate_customer_advance(p_advance_id uuid, p_invoice_id uuid, p_amount numeric, p_reference text default null)
returns uuid language plpgsql security definer as $$
declare
  v_advance customer_advance_balances%rowtype;
  v_outstanding_before numeric;
  v_company_id uuid;
  v_allocation_id uuid;
begin
  if not has_permission('receipt_vouchers:allocate_advance') then raise exception 'Not permitted'; end if;
  select * into v_advance from customer_advance_balances where id = p_advance_id for update;
  if not found then raise exception 'Advance not found'; end if;
  if v_advance.status not in ('available', 'partially_allocated') then raise exception 'Advance is % and cannot be allocated', v_advance.status; end if;
  if p_amount > v_advance.available_amount + 0.001 then raise exception 'Amount exceeds available advance of %', v_advance.available_amount; end if;

  v_outstanding_before := revalidate_invoice_allocation(p_invoice_id, v_advance.customer_id, p_amount);
  v_company_id := v_advance.company_id;

  insert into customer_advance_allocations (
    company_id, advance_id, invoice_id, allocated_amount, advance_balance_before, advance_balance_after,
    invoice_outstanding_before, invoice_outstanding_after, allocated_by, reference
  ) values (
    v_company_id, p_advance_id, p_invoice_id, p_amount, v_advance.available_amount, v_advance.available_amount - p_amount,
    v_outstanding_before, v_outstanding_before - p_amount, auth.uid(), p_reference
  ) returning id into v_allocation_id;

  update customer_advance_balances set
    available_amount = available_amount - p_amount, allocated_amount = allocated_amount + p_amount,
    status = case when available_amount - p_amount <= 0.001 then 'fully_allocated' else 'partially_allocated' end
  where id = p_advance_id;

  update sales_invoices set
    paid_amount = paid_amount + p_amount,
    payment_status = case when v_outstanding_before - p_amount <= 0.001 then 'paid' else 'partially_paid' end,
    settlement_date = case when v_outstanding_before - p_amount <= 0.001 then now() else settlement_date end
  where id = p_invoice_id;

  update customers set outstanding_balance = greatest(outstanding_balance - p_amount, 0) where id = v_advance.customer_id;

  return v_allocation_id;
end;
$$;
grant execute on function allocate_customer_advance(uuid, uuid, numeric, text) to authenticated;

create or replace function allocate_unallocated_credit(p_unallocated_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid language plpgsql security definer as $$
declare
  v_unallocated customer_unallocated_credits%rowtype;
  v_outstanding_before numeric;
  v_company_id uuid;
  v_allocation_id uuid;
begin
  if not has_permission('receipt_vouchers:allocate_unallocated_credit') then raise exception 'Not permitted'; end if;
  select * into v_unallocated from customer_unallocated_credits where id = p_unallocated_id for update;
  if not found then raise exception 'Unallocated credit not found'; end if;
  if v_unallocated.status not in ('available', 'partially_allocated') then raise exception 'Unallocated credit is % and cannot be allocated', v_unallocated.status; end if;
  if p_amount > v_unallocated.available_amount + 0.001 then raise exception 'Amount exceeds available unallocated credit of %', v_unallocated.available_amount; end if;

  v_outstanding_before := revalidate_invoice_allocation(p_invoice_id, v_unallocated.customer_id, p_amount);
  v_company_id := v_unallocated.company_id;

  insert into customer_unallocated_allocations (
    company_id, unallocated_id, invoice_id, allocated_amount, unallocated_balance_before, unallocated_balance_after,
    invoice_outstanding_before, invoice_outstanding_after, allocated_by
  ) values (
    v_company_id, p_unallocated_id, p_invoice_id, p_amount, v_unallocated.available_amount, v_unallocated.available_amount - p_amount,
    v_outstanding_before, v_outstanding_before - p_amount, auth.uid()
  ) returning id into v_allocation_id;

  update customer_unallocated_credits set
    available_amount = available_amount - p_amount, allocated_amount = allocated_amount + p_amount,
    status = case when available_amount - p_amount <= 0.001 then 'fully_allocated' else 'partially_allocated' end
  where id = p_unallocated_id;

  update sales_invoices set
    paid_amount = paid_amount + p_amount,
    payment_status = case when v_outstanding_before - p_amount <= 0.001 then 'paid' else 'partially_paid' end,
    settlement_date = case when v_outstanding_before - p_amount <= 0.001 then now() else settlement_date end
  where id = p_invoice_id;

  update customers set outstanding_balance = greatest(outstanding_balance - p_amount, 0) where id = v_unallocated.customer_id;

  return v_allocation_id;
end;
$$;
grant execute on function allocate_unallocated_credit(uuid, uuid, numeric) to authenticated;
