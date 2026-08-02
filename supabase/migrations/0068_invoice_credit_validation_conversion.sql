-- ============================================================================
-- 0068_invoice_credit_validation_conversion.sql
-- Continues 0066-0067. Reuses validate_customer_credit()/
-- customer_available_credit() (4A.2 Part 1) — no second credit engine.
-- ============================================================================

create table sales_invoice_credit_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  validation_time timestamptz not null default now(),
  credit_limit numeric(14,2),
  outstanding_balance numeric(14,2),
  overdue_balance numeric(14,2),
  existing_reserved_credit numeric(14,2),
  invoice_credit_amount numeric(14,2),
  available_credit_before numeric(14,2),
  available_credit_after numeric(14,2),
  status text not null check (status in (
    'not_validated', 'valid', 'warning', 'near_limit', 'over_limit', 'blocked', 'override_pending', 'override_approved', 'conflict'
  )),
  block_reason text,
  override_required boolean not null default false,
  validated_by uuid references app_users(id)
);
create index idx_sales_invoice_credit_validations_invoice on sales_invoice_credit_validations(invoice_id);

alter table sales_invoice_credit_validations enable row level security;
create policy sales_invoice_credit_validations_isolation on sales_invoice_credit_validations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function validate_invoice_credit(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_profile customer_credit_profiles%rowtype;
  v_before numeric;
  v_after numeric;
  v_overdue numeric;
  v_checks record;
  v_status text := 'valid';
  v_block_reason text;
  v_override_required boolean := false;
begin
  if not has_permission('sales_invoices:view_credit_indicator') and not has_permission('sales_invoices:create') then
    raise exception 'Not permitted';
  end if;

  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;

  if v_invoice.payment_type != 'credit' or v_invoice.customer_id is null then
    update sales_invoices set credit_validation_status = 'not_validated' where id = p_invoice_id;
    return;
  end if;

  select * into v_profile from customer_credit_profiles where customer_id = v_invoice.customer_id;
  v_before := customer_available_credit(v_invoice.customer_id);

  select coalesce(sum(s.balance_amount), 0) into v_overdue
  from sales s
  where s.customer_id = v_invoice.customer_id and s.status = 'completed' and s.balance_amount > 0
    and s.created_at < now() - (coalesce(v_profile.credit_days, 0) + coalesce(v_profile.grace_days, 0)) * interval '1 day';

  for v_checks in select * from validate_customer_credit(v_invoice.customer_id, v_invoice.net_amount) loop
    if not v_checks.passed then
      v_status := case v_checks.check_name
        when 'customer_active' then 'blocked'
        when 'credit_status' then 'blocked'
        when 'available_credit' then 'over_limit'
        when 'maximum_outstanding' then 'over_limit'
        when 'temporary_credit_valid' then 'blocked'
        else 'blocked'
      end;
      v_block_reason := v_checks.message;
    end if;
  end loop;

  if v_overdue > 0 and v_profile.block_on_overdue then
    v_status := 'blocked';
    v_block_reason := format('Customer has %.2f overdue beyond credit + grace days', v_overdue);
  end if;

  if v_status != 'valid' then
    v_override_required := has_permission('sales_invoices:request_credit_override');
  end if;

  v_after := v_before - v_invoice.net_amount;

  insert into sales_invoice_credit_validations (
    company_id, invoice_id, customer_id, credit_limit, outstanding_balance, overdue_balance,
    existing_reserved_credit, invoice_credit_amount, available_credit_before, available_credit_after,
    status, block_reason, override_required, validated_by
  ) values (
    v_invoice.company_id, p_invoice_id, v_invoice.customer_id, v_profile.credit_limit,
    (select outstanding_balance from customers where id = v_invoice.customer_id), v_overdue,
    (select coalesce(sum(remaining_amount), 0) from sales_order_credit_reservations where customer_id = v_invoice.customer_id and status in ('pending', 'active', 'partially_released')),
    v_invoice.net_amount, v_before, v_after, v_status, v_block_reason, v_override_required, auth.uid()
  );

  update sales_invoices set credit_validation_status = v_status where id = p_invoice_id;
end;
$$;
grant execute on function validate_invoice_credit(uuid) to authenticated;

create table sales_invoice_credit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  credit_reservation_id uuid references sales_order_credit_reservations(id) on delete set null,
  consumed_amount numeric(14,2) not null,
  consumed_at timestamptz not null default now(),
  unique (invoice_id)
);

alter table sales_invoice_credit_conversions enable row level security;
create policy sales_invoice_credit_conversions_isolation on sales_invoice_credit_conversions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function consume_credit_reservation_for_invoice(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_reservation sales_order_credit_reservations%rowtype;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  if v_invoice.sales_order_id is null or v_invoice.payment_type != 'credit' then return; end if;

  select * into v_reservation from sales_order_credit_reservations
  where order_id = v_invoice.sales_order_id and status in ('active', 'partially_released')
  order by created_at desc limit 1;
  if v_reservation.id is null then return; end if;

  update sales_order_credit_reservations set
    converted_amount = converted_amount + v_invoice.net_amount,
    remaining_amount = greatest(remaining_amount - v_invoice.net_amount, 0),
    status = case when remaining_amount - v_invoice.net_amount <= 0 then 'consumed' else 'partially_released' end
  where id = v_reservation.id;

  insert into sales_invoice_credit_conversions (company_id, invoice_id, credit_reservation_id, consumed_amount)
  values (v_invoice.company_id, p_invoice_id, v_reservation.id, v_invoice.net_amount)
  on conflict (invoice_id) do update set consumed_amount = excluded.consumed_amount;
end;
$$;
grant execute on function consume_credit_reservation_for_invoice(uuid) to authenticated;

create table sales_invoice_credit_override_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  credit_limit numeric(14,2),
  available_credit numeric(14,2),
  invoice_credit_amount numeric(14,2),
  excess_amount numeric(14,2),
  outstanding_balance numeric(14,2),
  overdue_balance numeric(14,2),
  reason text,
  requested_by uuid references app_users(id),
  requested_date timestamptz not null default now(),
  approval_level text not null default 'supervisor' check (approval_level in ('supervisor', 'branch_manager', 'credit_controller', 'accounts', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_invoice_credit_override_requests_invoice on sales_invoice_credit_override_requests(invoice_id);
create index idx_sales_invoice_credit_override_requests_status on sales_invoice_credit_override_requests(company_id, status);

alter table sales_invoice_credit_override_requests enable row level security;
create policy sales_invoice_credit_override_requests_isolation on sales_invoice_credit_override_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function request_invoice_credit_override(p_invoice_id uuid, p_reason text, p_approval_level text default 'supervisor')
returns uuid language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_profile customer_credit_profiles%rowtype;
  v_available numeric;
  v_request_id uuid;
begin
  if not has_permission('sales_invoices:request_credit_override') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  select * into v_profile from customer_credit_profiles where customer_id = v_invoice.customer_id;
  v_available := customer_available_credit(v_invoice.customer_id);

  insert into sales_invoice_credit_override_requests (
    company_id, invoice_id, customer_id, credit_limit, available_credit, invoice_credit_amount, excess_amount,
    outstanding_balance, overdue_balance, reason, requested_by, approval_level
  ) values (
    v_invoice.company_id, p_invoice_id, v_invoice.customer_id, v_profile.credit_limit, v_available, v_invoice.net_amount,
    greatest(v_invoice.net_amount - v_available, 0), (select outstanding_balance from customers where id = v_invoice.customer_id),
    0, p_reason, auth.uid(), p_approval_level
  ) returning id into v_request_id;

  update sales_invoices set credit_validation_status = 'override_pending' where id = p_invoice_id;
  return v_request_id;
end;
$$;
grant execute on function request_invoice_credit_override(uuid, text, text) to authenticated;

create or replace function decide_invoice_credit_override(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_request sales_invoice_credit_override_requests%rowtype;
  v_requires_separation boolean;
begin
  if not has_permission('sales_invoices:approve_credit_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_invoice_credit_override_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  select require_manager_approval into v_requires_separation from customer_credit_profiles where customer_id = v_request.customer_id;
  if v_requires_separation and v_request.requested_by = auth.uid() then
    raise exception 'Separation of duties: you cannot approve your own credit override request';
  end if;

  update sales_invoice_credit_override_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;

  update sales_invoices set credit_validation_status = case when p_approve then 'override_approved' else 'blocked' end
  where id = v_request.invoice_id;
end;
$$;
grant execute on function decide_invoice_credit_override(uuid, boolean, text) to authenticated;
