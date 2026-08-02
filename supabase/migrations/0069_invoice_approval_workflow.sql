-- ============================================================================
-- 0069_invoice_approval_workflow.sql
-- Continues 0066-0068. Mirrors sales_order approval workflow (5A.2 Part 2).
-- ============================================================================

create table sales_invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  triggered_by text[] not null default '{}',
  overall_status text not null default 'pending' check (overall_status in (
    'pending', 'approved', 'partially_approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id)
);

alter table sales_invoice_approvals enable row level security;
create policy sales_invoice_approvals_isolation on sales_invoice_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_invoice_approvals_updated_at before update on sales_invoice_approvals
  for each row execute function set_updated_at();

create table sales_invoice_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_invoice_approvals(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'credit_invoice', 'credit_limit_exceeded', 'overdue_customer', 'price_below_minimum', 'price_override',
    'discount_above_limit', 'manual_free_quantity', 'high_value_invoice', 'stock_short', 'batch_conflict',
    'serial_conflict', 'walk_in_high_value', 'manual_invoice_number', 'invoice_amendment'
  )),
  sequence integer not null default 1,
  required_role text,
  assigned_approver uuid references app_users(id),
  requested_by uuid references app_users(id),
  request_time timestamptz not null default now(),
  status text not null default 'pending' check (status in (
    'not_required', 'pending', 'approved', 'partially_approved', 'rejected',
    'returned_for_correction', 'on_hold', 'cancelled', 'expired', 'skipped_by_rule'
  )),
  action_time timestamptz,
  action_user uuid references app_users(id),
  reason text,
  notes text,
  approved_values jsonb
);
create index idx_sales_invoice_approval_steps_approval on sales_invoice_approval_steps(approval_id, sequence);
create index idx_sales_invoice_approval_steps_approver on sales_invoice_approval_steps(assigned_approver, status);

alter table sales_invoice_approval_steps enable row level security;
create policy sales_invoice_approval_steps_isolation on sales_invoice_approval_steps for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_invoice_approvals(id) on delete cascade,
  step_id uuid references sales_invoice_approval_steps(id) on delete set null,
  action text not null check (action in (
    'submit', 'approve', 'partially_approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign'
  )),
  performed_by uuid references app_users(id),
  reason text,
  notes text,
  performed_at timestamptz not null default now()
);
create index idx_sales_invoice_approval_history_approval on sales_invoice_approval_history(approval_id);

alter table sales_invoice_approval_history enable row level security;
create policy sales_invoice_approval_history_isolation on sales_invoice_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function evaluate_invoice_approval_triggers(p_invoice_id uuid)
returns text[] language plpgsql stable as $$
declare
  v_invoice sales_invoices%rowtype;
  v_invoice_type sales_invoice_types%rowtype;
  v_triggers text[] := '{}';
  v_has_price_override boolean;
  v_has_manual_discount boolean;
  v_has_manual_free boolean;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  select * into v_invoice_type from sales_invoice_types where id = v_invoice.invoice_type_id;

  if v_invoice_type.requires_approval then v_triggers := array_append(v_triggers, 'credit_invoice'); end if;
  if v_invoice.credit_validation_status in ('over_limit', 'blocked') then v_triggers := array_append(v_triggers, 'credit_limit_exceeded'); end if;

  select exists(select 1 from sales_invoice_items where invoice_id = p_invoice_id and price_source = 'override') into v_has_price_override;
  if v_has_price_override then v_triggers := array_append(v_triggers, 'price_override'); end if;

  select exists(select 1 from sales_invoice_items where invoice_id = p_invoice_id and discount_source = 'manual_discount') into v_has_manual_discount;
  if v_has_manual_discount then v_triggers := array_append(v_triggers, 'discount_above_limit'); end if;

  select exists(select 1 from sales_invoice_items where invoice_id = p_invoice_id and is_free_item and free_quantity_rule_id is null) into v_has_manual_free;
  if v_has_manual_free then v_triggers := array_append(v_triggers, 'manual_free_quantity'); end if;

  if v_invoice.net_amount >= 5000 then
    v_triggers := array_append(v_triggers, case when v_invoice.customer_id is null then 'walk_in_high_value' else 'high_value_invoice' end);
  end if;

  if v_invoice.stock_validation_status in ('unavailable', 'partially_available', 'reservation_invalid') then
    v_triggers := array_append(v_triggers, 'stock_short');
  end if;

  if v_invoice.is_manual_number then v_triggers := array_append(v_triggers, 'manual_invoice_number'); end if;

  return v_triggers;
end;
$$;
grant execute on function evaluate_invoice_approval_triggers(uuid) to authenticated;

create or replace function submit_invoice_for_approval(p_invoice_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_triggers text[];
  v_approval_id uuid;
  v_trigger text;
  v_seq integer := 1;
begin
  if not has_permission('sales_invoices:create') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;

  perform validate_invoice_stock(p_invoice_id);
  perform validate_invoice_credit(p_invoice_id);

  v_triggers := evaluate_invoice_approval_triggers(p_invoice_id);

  insert into sales_invoice_approvals (company_id, invoice_id, triggered_by, overall_status)
  values (v_invoice.company_id, p_invoice_id, v_triggers, case when array_length(v_triggers, 1) is null then 'approved' else 'pending' end)
  on conflict (invoice_id) do update set triggered_by = excluded.triggered_by, overall_status = excluded.overall_status, updated_at = now()
  returning id into v_approval_id;

  if array_length(v_triggers, 1) is null then
    update sales_invoices set approval_status = 'skipped_by_rule', status = 'approved' where id = p_invoice_id;
  else
    foreach v_trigger in array v_triggers loop
      insert into sales_invoice_approval_steps (company_id, approval_id, approval_type, sequence, required_role, requested_by, status)
      values (
        v_invoice.company_id, v_approval_id, v_trigger, v_seq,
        case v_trigger
          when 'credit_limit_exceeded' then 'credit_controller'
          when 'price_override' then 'branch_manager'
          when 'high_value_invoice' then 'branch_manager'
          when 'walk_in_high_value' then 'branch_manager'
          else 'sales_supervisor'
        end,
        auth.uid(), 'pending'
      );
      v_seq := v_seq + 1;
    end loop;
    update sales_invoices set approval_status = 'pending', status = 'pending_approval' where id = p_invoice_id;
  end if;

  insert into sales_invoice_approval_history (company_id, approval_id, action, performed_by)
  values (v_invoice.company_id, v_approval_id, 'submit', auth.uid());

  return v_approval_id;
end;
$$;
grant execute on function submit_invoice_for_approval(uuid) to authenticated;

create or replace function refresh_invoice_approval_status(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare
  v_approval sales_invoice_approvals%rowtype;
  v_total integer; v_approved integer; v_rejected integer; v_partial integer; v_pending integer;
  v_overall text;
begin
  select * into v_approval from sales_invoice_approvals where id = p_approval_id;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'partially_approved'), count(*) filter (where status = 'pending')
  into v_total, v_approved, v_rejected, v_partial, v_pending
  from sales_invoice_approval_steps where approval_id = p_approval_id;

  v_overall := case
    when v_rejected > 0 then 'rejected'
    when v_pending > 0 then 'pending'
    when v_partial > 0 then 'partially_approved'
    when v_approved = v_total then 'approved'
    else 'pending'
  end;

  update sales_invoice_approvals set overall_status = v_overall where id = p_approval_id;
  update sales_invoices set
    approval_status = v_overall,
    status = case v_overall
      when 'approved' then 'approved'
      when 'rejected' then 'returned_for_correction'
      when 'partially_approved' then 'partially_approved'
      else status
    end
  where id = v_approval.invoice_id;
end;
$$;
grant execute on function refresh_invoice_approval_status(uuid) to authenticated;

create or replace function process_invoice_approval_action(
  p_step_id uuid, p_action text, p_reason text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_step sales_invoice_approval_steps%rowtype;
  v_approval sales_invoice_approvals%rowtype;
  v_valid_action boolean;
  v_new_status text;
begin
  select * into v_step from sales_invoice_approval_steps where id = p_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_approval from sales_invoice_approvals where id = v_step.approval_id;

  v_valid_action := p_action in ('approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign');
  if not v_valid_action then raise exception 'Unknown approval action: %', p_action; end if;

  if p_action = 'approve' and not has_permission('sales_invoices:create') then raise exception 'Not permitted'; end if;

  v_new_status := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'return_for_correction' then 'returned_for_correction'
    when 'hold' then 'on_hold'
    when 'release_hold' then 'pending'
    when 'cancel_request' then 'cancelled'
    when 'escalate' then 'pending'
    when 'reassign' then 'pending'
  end;

  update sales_invoice_approval_steps set
    status = v_new_status, action_time = now(), action_user = auth.uid(), reason = p_reason, notes = p_notes
  where id = p_step_id;

  insert into sales_invoice_approval_history (company_id, approval_id, step_id, action, performed_by, reason, notes)
  values (v_approval.company_id, v_approval.id, p_step_id, p_action, auth.uid(), p_reason, p_notes);

  perform refresh_invoice_approval_status(v_approval.id);
end;
$$;
grant execute on function process_invoice_approval_action(uuid, text, text, text) to authenticated;
