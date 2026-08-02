-- ============================================================================
-- 0083_receipt_approval_workflow_and_hold.sql
-- Continues 0081-0082.
-- ============================================================================

create table receipt_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  triggered_by text[] not null default '{}',
  overall_status text not null default 'pending' check (overall_status in (
    'pending', 'approved', 'partially_approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id)
);

alter table receipt_approvals enable row level security;
create policy receipt_approvals_isolation on receipt_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_receipt_approvals_updated_at before update on receipt_approvals
  for each row execute function set_updated_at();

create table receipt_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references receipt_approvals(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'high_value_cash', 'cheque_collection', 'post_dated_cheque', 'bank_transfer_unverified', 'card_no_authorization',
    'advance_payment', 'unallocated_receipt', 'backdated_receipt', 'future_dated_receipt', 'manual_allocation_override',
    'overpayment', 'blocked_customer', 'unassigned_route', 'offline_posted', 'duplicate_override'
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
create index idx_receipt_approval_steps_approval on receipt_approval_steps(approval_id, sequence);
create index idx_receipt_approval_steps_approver on receipt_approval_steps(assigned_approver, status);

alter table receipt_approval_steps enable row level security;
create policy receipt_approval_steps_isolation on receipt_approval_steps for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references receipt_approvals(id) on delete cascade,
  step_id uuid references receipt_approval_steps(id) on delete set null,
  action text not null check (action in (
    'submit', 'approve', 'partially_approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign'
  )),
  performed_by uuid references app_users(id),
  reason text,
  notes text,
  performed_at timestamptz not null default now()
);
create index idx_receipt_approval_history_approval on receipt_approval_history(approval_id);

alter table receipt_approval_history enable row level security;
create policy receipt_approval_history_isolation on receipt_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function evaluate_receipt_approval_triggers(p_receipt_id uuid)
returns text[] language plpgsql stable as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_customer customers%rowtype;
  v_collection_type collection_types%rowtype;
  v_triggers text[] := '{}';
  v_has_cheque boolean;
  v_has_postdated_cheque boolean;
  v_has_unverified_bank boolean;
  v_has_unauth_card boolean;
begin
  select * into v_receipt from receipt_vouchers where id = p_receipt_id;
  select * into v_customer from customers where id = v_receipt.customer_id;
  select * into v_collection_type from collection_types where id = v_receipt.collection_type_id;

  if v_collection_type.requires_approval then v_triggers := array_append(v_triggers, 'cheque_collection'); end if;
  if v_receipt.receipt_amount >= 5000 then v_triggers := array_append(v_triggers, 'high_value_cash'); end if;

  select exists(select 1 from receipt_payment_components rpc join cheque_receipt_details cd on cd.payment_component_id = rpc.id where rpc.receipt_id = p_receipt_id) into v_has_cheque;
  if v_has_cheque and not v_collection_type.requires_approval then v_triggers := array_append(v_triggers, 'cheque_collection'); end if;

  select exists(select 1 from receipt_payment_components rpc join cheque_receipt_details cd on cd.payment_component_id = rpc.id where rpc.receipt_id = p_receipt_id and cd.is_post_dated) into v_has_postdated_cheque;
  if v_has_postdated_cheque then v_triggers := array_append(v_triggers, 'post_dated_cheque'); end if;

  select exists(select 1 from receipt_payment_components rpc join bank_transfer_receipt_details btd on btd.payment_component_id = rpc.id where rpc.receipt_id = p_receipt_id and btd.verification_status = 'pending') into v_has_unverified_bank;
  if v_has_unverified_bank then v_triggers := array_append(v_triggers, 'bank_transfer_unverified'); end if;

  select exists(select 1 from receipt_payment_components rpc join card_receipt_details crd on crd.payment_component_id = rpc.id where rpc.receipt_id = p_receipt_id and (crd.authorization_code is null or crd.authorization_code = '')) into v_has_unauth_card;
  if v_has_unauth_card then v_triggers := array_append(v_triggers, 'card_no_authorization'); end if;

  if v_receipt.allocation_status = 'advance' then v_triggers := array_append(v_triggers, 'advance_payment'); end if;
  if v_receipt.allocation_status = 'unallocated' then v_triggers := array_append(v_triggers, 'unallocated_receipt'); end if;
  if v_receipt.receipt_date < current_date - 3 then v_triggers := array_append(v_triggers, 'backdated_receipt'); end if;
  if v_receipt.receipt_date > current_date then v_triggers := array_append(v_triggers, 'future_dated_receipt'); end if;
  if v_customer.status = 'blocked' then v_triggers := array_append(v_triggers, 'blocked_customer'); end if;
  if v_receipt.route_id is null and v_receipt.collection_source in ('route', 'van') then v_triggers := array_append(v_triggers, 'unassigned_route'); end if;
  if v_receipt.collection_source = 'offline' then v_triggers := array_append(v_triggers, 'offline_posted'); end if;

  return v_triggers;
end;
$$;
grant execute on function evaluate_receipt_approval_triggers(uuid) to authenticated;

create or replace function submit_receipt_for_approval(p_receipt_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_triggers text[];
  v_approval_id uuid;
  v_trigger text;
  v_seq integer := 1;
begin
  if not has_permission('receipt_vouchers:submit_for_approval') then raise exception 'Not permitted'; end if;
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;

  v_triggers := evaluate_receipt_approval_triggers(p_receipt_id);

  insert into receipt_approvals (company_id, receipt_id, triggered_by, overall_status)
  values (v_receipt.company_id, p_receipt_id, v_triggers, case when array_length(v_triggers, 1) is null then 'approved' else 'pending' end)
  on conflict (receipt_id) do update set triggered_by = excluded.triggered_by, overall_status = excluded.overall_status, updated_at = now()
  returning id into v_approval_id;

  if array_length(v_triggers, 1) is null then
    update receipt_vouchers set approval_status = 'skipped_by_rule', status = 'approved' where id = p_receipt_id;
  else
    foreach v_trigger in array v_triggers loop
      insert into receipt_approval_steps (company_id, approval_id, approval_type, sequence, required_role, requested_by, status)
      values (
        v_receipt.company_id, v_approval_id, v_trigger, v_seq,
        case v_trigger
          when 'cheque_collection' then 'cashier'
          when 'post_dated_cheque' then 'credit_controller'
          when 'high_value_cash' then 'branch_manager'
          when 'advance_payment' then 'branch_manager'
          when 'blocked_customer' then 'credit_controller'
          else 'sales_supervisor'
        end,
        auth.uid(), 'pending'
      );
      v_seq := v_seq + 1;
    end loop;
    update receipt_vouchers set approval_status = 'pending', status = 'pending_approval' where id = p_receipt_id;
  end if;

  insert into receipt_approval_history (company_id, approval_id, action, performed_by)
  values (v_receipt.company_id, v_approval_id, 'submit', auth.uid());

  return v_approval_id;
end;
$$;
grant execute on function submit_receipt_for_approval(uuid) to authenticated;

create or replace function refresh_receipt_approval_status(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare
  v_approval receipt_approvals%rowtype;
  v_total integer; v_approved integer; v_rejected integer; v_partial integer; v_pending integer;
  v_overall text;
begin
  select * into v_approval from receipt_approvals where id = p_approval_id;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'partially_approved'), count(*) filter (where status = 'pending')
  into v_total, v_approved, v_rejected, v_partial, v_pending
  from receipt_approval_steps where approval_id = p_approval_id;

  v_overall := case
    when v_rejected > 0 then 'rejected'
    when v_pending > 0 then 'pending'
    when v_partial > 0 then 'partially_approved'
    when v_approved = v_total then 'approved'
    else 'pending'
  end;

  update receipt_approvals set overall_status = v_overall where id = p_approval_id;
  update receipt_vouchers set
    approval_status = v_overall,
    status = case v_overall
      when 'approved' then 'approved'
      when 'rejected' then 'returned_for_correction'
      when 'partially_approved' then 'approved'
      else status
    end
  where id = v_approval.receipt_id;
end;
$$;
grant execute on function refresh_receipt_approval_status(uuid) to authenticated;

create or replace function process_receipt_approval_action(
  p_step_id uuid, p_action text, p_reason text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_step receipt_approval_steps%rowtype;
  v_approval receipt_approvals%rowtype;
  v_new_status text;
begin
  select * into v_step from receipt_approval_steps where id = p_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_approval from receipt_approvals where id = v_step.approval_id;

  if p_action not in ('approve', 'reject', 'return_for_correction', 'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign') then
    raise exception 'Unknown approval action: %', p_action;
  end if;
  if p_action = 'approve' and not has_permission('receipt_vouchers:approve_receipt') then raise exception 'Not permitted'; end if;

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

  update receipt_approval_steps set
    status = v_new_status, action_time = now(), action_user = auth.uid(), reason = p_reason, notes = p_notes
  where id = p_step_id;

  insert into receipt_approval_history (company_id, approval_id, step_id, action, performed_by, reason, notes)
  values (v_approval.company_id, v_approval.id, p_step_id, p_action, auth.uid(), p_reason, p_notes);

  perform refresh_receipt_approval_status(v_approval.id);
end;
$$;
grant execute on function process_receipt_approval_action(uuid, text, text, text) to authenticated;

create table receipt_hold_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  hold_reason text not null check (hold_reason in (
    'duplicate_payment_review', 'cheque_verification', 'bank_transfer_verification', 'card_verification',
    'customer_dispute', 'allocation_issue', 'currency_issue', 'management_review', 'sync_conflict', 'other'
  )),
  hold_notes text,
  held_by uuid references app_users(id),
  held_at timestamptz not null default now(),
  release_requested_by uuid references app_users(id),
  released_by uuid references app_users(id),
  released_at timestamptz,
  release_notes text
);
create index idx_receipt_hold_history_receipt on receipt_hold_history(receipt_id);

alter table receipt_hold_history enable row level security;
create policy receipt_hold_history_isolation on receipt_hold_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function place_receipt_on_hold(p_receipt_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_hold_id uuid;
begin
  if not has_permission('receipt_vouchers:place_on_hold') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  if v_company_id is null then raise exception 'Receipt not found'; end if;

  insert into receipt_hold_history (company_id, receipt_id, hold_reason, hold_notes, held_by)
  values (v_company_id, p_receipt_id, p_reason, p_notes, auth.uid()) returning id into v_hold_id;

  update receipt_vouchers set is_on_hold = true, status = 'on_hold' where id = p_receipt_id;
  return v_hold_id;
end;
$$;
grant execute on function place_receipt_on_hold(uuid, text, text) to authenticated;

create or replace function release_receipt_hold(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare
  v_hold receipt_hold_history%rowtype;
  v_return_status text;
begin
  if not has_permission('receipt_vouchers:release_hold') then raise exception 'Not permitted'; end if;
  select * into v_hold from receipt_hold_history where id = p_hold_id;
  if not found then raise exception 'Hold record not found'; end if;

  update receipt_hold_history set released_by = auth.uid(), released_at = now(), release_notes = p_notes where id = p_hold_id;

  select case when approval_status = 'approved' then 'approved' when approval_status = 'pending' then 'pending_approval' else 'pending_validation' end
  into v_return_status from receipt_vouchers where id = v_hold.receipt_id;

  update receipt_vouchers set is_on_hold = false, status = v_return_status where id = v_hold.receipt_id;
end;
$$;
grant execute on function release_receipt_hold(uuid, text) to authenticated;
