-- ============================================================================
-- 0099_return_approval_workflow_and_hold.sql
-- Continues 0096-0098.
-- ============================================================================

create table sales_return_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  triggered_by text[] not null default '{}',
  overall_status text not null default 'pending' check (overall_status in (
    'pending', 'approved', 'partially_approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (return_id)
);

alter table sales_return_approvals enable row level security;
create policy sales_return_approvals_isolation on sales_return_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_return_approvals_updated_at before update on sales_return_approvals
  for each row execute function set_updated_at();

create table sales_return_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_return_approvals(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'return_without_invoice', 'outside_return_period', 'high_value_return', 'damaged_return', 'expired_return',
    'near_expiry_return', 'free_item_return', 'manual_value_override', 'batch_mismatch', 'serial_mismatch',
    'customer_dispute', 'replacement_request', 'cash_refund_request', 'blocked_customer', 'unplanned_route_return',
    'offline_return', 'manual_stock_destination'
  )),
  sequence integer not null default 1,
  required_role text,
  assigned_approver uuid references app_users(id),
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  status text not null default 'pending' check (status in (
    'not_required', 'pending', 'approved', 'partially_approved', 'rejected',
    'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  action_time timestamptz,
  action_user uuid references app_users(id),
  reason text,
  notes text,
  requested_values jsonb,
  approved_values jsonb
);
create index idx_sales_return_approval_steps_approval on sales_return_approval_steps(approval_id, sequence);
create index idx_sales_return_approval_steps_approver on sales_return_approval_steps(assigned_approver, status);

alter table sales_return_approval_steps enable row level security;
create policy sales_return_approval_steps_isolation on sales_return_approval_steps for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_return_approvals(id) on delete cascade,
  step_id uuid references sales_return_approval_steps(id) on delete set null,
  action text not null check (action in (
    'submit', 'approve', 'partially_approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign'
  )),
  performed_by uuid references app_users(id),
  reason text,
  notes text,
  performed_at timestamptz not null default now()
);
create index idx_sales_return_approval_history_approval on sales_return_approval_history(approval_id);

alter table sales_return_approval_history enable row level security;
create policy sales_return_approval_history_isolation on sales_return_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Returns ONLY values that match the approval_type check constraint —
-- return_type/reason codes are normalized to a fixed trigger, never
-- passed through raw (a real bug caught before it shipped: passing
-- e.g. 'quality_complaint_return' or 'pricing_dispute' straight through
-- would have violated the check constraint the first time either fired).
create or replace function evaluate_return_approval_triggers(p_return_id uuid)
returns text[] language plpgsql stable as $$
declare
  v_return sales_returns%rowtype;
  v_customer customers%rowtype;
  v_return_type sales_return_types%rowtype;
  v_reason sales_return_reasons%rowtype;
  v_triggers text[] := '{}';
  v_has_free_item boolean;
begin
  select * into v_return from sales_returns where id = p_return_id;
  select * into v_customer from customers where id = v_return.customer_id;
  select * into v_return_type from sales_return_types where id = v_return.return_type_id;
  if v_return.return_reason_id is not null then select * into v_reason from sales_return_reasons where id = v_return.return_reason_id; end if;

  if v_return.original_invoice_id is null then v_triggers := array_append(v_triggers, 'return_without_invoice'); end if;
  if v_return_type.code = 'damaged_product_return' then v_triggers := array_append(v_triggers, 'damaged_return'); end if;
  if v_return_type.code = 'expired_product_return' then v_triggers := array_append(v_triggers, 'expired_return'); end if;
  if v_return_type.requires_approval and v_return_type.code not in ('damaged_product_return', 'expired_product_return') then
    v_triggers := array_append(v_triggers, 'customer_dispute');
  end if;
  if v_reason.requires_approval then v_triggers := array_append(v_triggers, 'customer_dispute'); end if;
  if v_return.net_return_amount >= 3000 then v_triggers := array_append(v_triggers, 'high_value_return'); end if;

  select exists(select 1 from sales_return_items where return_id = p_return_id and is_free_item) into v_has_free_item;
  if v_has_free_item then v_triggers := array_append(v_triggers, 'free_item_return'); end if;

  if v_return.replacement_requested then v_triggers := array_append(v_triggers, 'replacement_request'); end if;
  if v_return.cash_refund_requested then v_triggers := array_append(v_triggers, 'cash_refund_request'); end if;
  if v_customer.status = 'blocked' then v_triggers := array_append(v_triggers, 'blocked_customer'); end if;
  if v_return.return_source = 'offline' then v_triggers := array_append(v_triggers, 'offline_return'); end if;
  if v_return.validation_status = 'outside_return_period' then v_triggers := array_append(v_triggers, 'outside_return_period'); end if;
  if v_return.validation_status = 'batch_mismatch' then v_triggers := array_append(v_triggers, 'batch_mismatch'); end if;
  if v_return.validation_status = 'serial_mismatch' then v_triggers := array_append(v_triggers, 'serial_mismatch'); end if;

  select array_agg(distinct t) into v_triggers from unnest(v_triggers) t;
  return coalesce(v_triggers, '{}');
end;
$$;
grant execute on function evaluate_return_approval_triggers(uuid) to authenticated;

create or replace function submit_return_for_approval(p_return_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_triggers text[];
  v_approval_id uuid;
  v_trigger text;
  v_seq integer := 1;
begin
  if not has_permission('sales_returns:submit_for_approval') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;

  v_triggers := evaluate_return_approval_triggers(p_return_id);

  insert into sales_return_approvals (company_id, return_id, triggered_by, overall_status)
  values (v_return.company_id, p_return_id, v_triggers, case when array_length(v_triggers, 1) is null then 'approved' else 'pending' end)
  on conflict (return_id) do update set triggered_by = excluded.triggered_by, overall_status = excluded.overall_status, updated_at = now()
  returning id into v_approval_id;

  if array_length(v_triggers, 1) is null then
    update sales_returns set approval_status = 'skipped_by_rule', status = 'approved' where id = p_return_id;
  else
    foreach v_trigger in array v_triggers loop
      insert into sales_return_approval_steps (company_id, approval_id, approval_type, sequence, required_role, requested_by, status)
      values (
        v_return.company_id, v_approval_id, v_trigger, v_seq,
        case v_trigger
          when 'damaged_return' then 'quality_controller'
          when 'expired_return' then 'quality_controller'
          when 'high_value_return' then 'branch_manager'
          when 'replacement_request' then 'warehouse_manager'
          when 'cash_refund_request' then 'finance_manager'
          when 'blocked_customer' then 'credit_controller'
          else 'sales_supervisor'
        end,
        auth.uid(), 'pending'
      );
      v_seq := v_seq + 1;
    end loop;
    update sales_returns set approval_status = 'pending', status = 'pending_approval' where id = p_return_id;
  end if;

  insert into sales_return_approval_history (company_id, approval_id, action, performed_by)
  values (v_return.company_id, v_approval_id, 'submit', auth.uid());

  return v_approval_id;
end;
$$;
grant execute on function submit_return_for_approval(uuid) to authenticated;

create or replace function refresh_return_approval_status(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare
  v_approval sales_return_approvals%rowtype;
  v_total integer; v_approved integer; v_rejected integer; v_partial integer; v_pending integer;
  v_overall text;
begin
  select * into v_approval from sales_return_approvals where id = p_approval_id;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'partially_approved'), count(*) filter (where status = 'pending')
  into v_total, v_approved, v_rejected, v_partial, v_pending
  from sales_return_approval_steps where approval_id = p_approval_id;

  v_overall := case
    when v_rejected > 0 then 'rejected'
    when v_pending > 0 then 'pending'
    when v_partial > 0 then 'partially_approved'
    when v_approved = v_total then 'approved'
    else 'pending'
  end;

  update sales_return_approvals set overall_status = v_overall where id = p_approval_id;
  update sales_returns set
    approval_status = v_overall,
    status = case v_overall
      when 'approved' then 'approved'
      when 'partially_approved' then 'partially_approved'
      when 'rejected' then 'returned_for_correction'
      else status
    end
  where id = v_approval.return_id;
end;
$$;
grant execute on function refresh_return_approval_status(uuid) to authenticated;

create or replace function process_return_approval_action(
  p_step_id uuid, p_action text, p_reason text default null, p_notes text default null, p_approved_values jsonb default null
) returns void language plpgsql security definer as $$
declare
  v_step sales_return_approval_steps%rowtype;
  v_approval sales_return_approvals%rowtype;
  v_new_status text;
begin
  select * into v_step from sales_return_approval_steps where id = p_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_approval from sales_return_approvals where id = v_step.approval_id;

  if p_action not in ('approve', 'partially_approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign') then
    raise exception 'Unknown approval action: %', p_action;
  end if;
  if p_action in ('approve', 'partially_approve') and not has_permission('sales_returns:approve_return') then raise exception 'Not permitted'; end if;

  v_new_status := case p_action
    when 'approve' then 'approved'
    when 'partially_approve' then 'partially_approved'
    when 'reject' then 'rejected'
    when 'return_for_correction' then 'returned_for_correction'
    when 'hold' then 'on_hold'
    when 'release_hold' then 'pending'
    when 'cancel_request' then 'cancelled'
    when 'escalate' then 'pending'
    when 'reassign' then 'pending'
  end;

  update sales_return_approval_steps set
    status = v_new_status, action_time = now(), action_user = auth.uid(), reason = p_reason, notes = p_notes, approved_values = p_approved_values
  where id = p_step_id;

  insert into sales_return_approval_history (company_id, approval_id, step_id, action, performed_by, reason, notes)
  values (v_approval.company_id, v_approval.id, p_step_id, p_action, auth.uid(), p_reason, p_notes);

  perform refresh_return_approval_status(v_approval.id);
end;
$$;
grant execute on function process_return_approval_action(uuid, text, text, text, jsonb) to authenticated;

create table sales_return_hold_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  hold_reason text not null check (hold_reason in (
    'inspection_pending', 'invoice_verification', 'batch_verification', 'serial_verification', 'credit_review',
    'replacement_review', 'customer_dispute', 'management_review', 'offline_conflict', 'other'
  )),
  hold_notes text,
  held_by uuid references app_users(id),
  held_at timestamptz not null default now(),
  release_requested_by uuid references app_users(id),
  released_by uuid references app_users(id),
  released_at timestamptz,
  release_notes text
);
create index idx_sales_return_hold_history_return on sales_return_hold_history(return_id);

alter table sales_return_hold_history enable row level security;
create policy sales_return_hold_history_isolation on sales_return_hold_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function place_return_on_hold(p_return_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_hold_id uuid;
begin
  if not has_permission('sales_returns:place_on_hold') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_returns where id = p_return_id;
  if v_company_id is null then raise exception 'Return not found'; end if;

  insert into sales_return_hold_history (company_id, return_id, hold_reason, hold_notes, held_by)
  values (v_company_id, p_return_id, p_reason, p_notes, auth.uid()) returning id into v_hold_id;

  update sales_returns set is_on_hold = true, status = 'on_hold' where id = p_return_id;
  return v_hold_id;
end;
$$;
grant execute on function place_return_on_hold(uuid, text, text) to authenticated;

create or replace function release_return_hold(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare
  v_hold sales_return_hold_history%rowtype;
  v_return_status text;
begin
  if not has_permission('sales_returns:release_hold') then raise exception 'Not permitted'; end if;
  select * into v_hold from sales_return_hold_history where id = p_hold_id;
  if not found then raise exception 'Hold record not found'; end if;

  update sales_return_hold_history set released_by = auth.uid(), released_at = now(), release_notes = p_notes where id = p_hold_id;

  select case
    when approval_status = 'approved' then 'approved'
    when approval_status = 'pending' then 'pending_approval'
    else 'pending_validation'
  end into v_return_status from sales_returns where id = v_hold.return_id;

  update sales_returns set is_on_hold = false, status = v_return_status where id = v_hold.return_id;
end;
$$;
grant execute on function release_return_hold(uuid, text) to authenticated;
