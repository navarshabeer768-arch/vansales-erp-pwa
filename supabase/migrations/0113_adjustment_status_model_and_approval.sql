-- ============================================================================
-- 0113_adjustment_status_model_and_approval.sql
-- Phase 5B.4 Part 2: Approvals, Posting, Customer Ledger Adjustments,
-- Credit Allocation, Reversals, Printing.
--
-- Extends Part 1's draft-only status model (0107-0109) to the full
-- Part 2 set, adds approval_status/posting_status columns (genuinely
-- missing from Part 1), then builds a polymorphic approval workflow
-- mirroring sales_return_approvals (5B.3 Part 2) but generalized
-- across credit_notes/debit_notes/customer_adjustments.
-- ============================================================================

do $$
declare v_table text;
begin
  foreach v_table in array array['credit_notes', 'debit_notes', 'customer_adjustments'] loop
    execute format('alter table %I add column if not exists approval_status text not null default ''not_required''', v_table);
    execute format('alter table %I add column if not exists posting_status text not null default ''not_posted'' check (posting_status in (''not_posted'', ''posting'', ''posted'', ''posting_failed'', ''reversal_pending'', ''reversed''))', v_table);
    execute format('alter table %I add column if not exists final_number_generated_at timestamptz', v_table);
    execute format('alter table %I add column if not exists final_number_generated_by uuid references app_users(id)', v_table);
    execute format('alter table %I add column if not exists posted_by uuid references app_users(id)', v_table);
    execute format('alter table %I add column if not exists posted_date timestamptz', v_table);
    execute format('alter table %I add column if not exists is_on_hold boolean not null default false', v_table);

    execute format('alter table %I drop constraint if exists %I_status_check', v_table, v_table);
    execute format(
      'alter table %I add constraint %I_status_check check (status in (
        ''draft'', ''pending_validation'', ''pending_approval'', ''approved'', ''returned_for_correction'', ''on_hold'',
        ''ready_to_post'', ''posting'', ''posted'', ''posting_failed'', ''cancelled'', ''reversal_requested'', ''reversed'',
        ''sync_pending'', ''sync_failed'', ''conflict'', ''pending_submission'', ''submitted'', ''returned'', ''expired''
      ))', v_table, v_table
    );
  end loop;
end;
$$;

create or replace function change_credit_note_status(p_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from credit_notes where id = p_id;
  if v_old is null then raise exception 'Credit note not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled', 'sync_pending')
    when 'pending_validation' then p_new_status in ('pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled', 'draft')
    when 'pending_approval' then p_new_status in ('approved', 'returned_for_correction', 'on_hold', 'cancelled')
    when 'approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'ready_to_post', 'cancelled')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled')
    when 'posted' then p_new_status in ('reversal_requested')
    when 'reversal_requested' then p_new_status in ('reversed', 'posted')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'returned' then p_new_status in ('draft', 'submitted', 'cancelled')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled' then false
    when 'reversed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move credit note from % to %', v_old, p_new_status; end if;

  update credit_notes set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_id;
  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, reason, changed_by)
  values (v_company_id, 'credit_notes', p_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_credit_note_status(uuid, text, text) to authenticated;

create or replace function change_debit_note_status(p_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from debit_notes where id = p_id;
  if v_old is null then raise exception 'Debit note not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled', 'sync_pending')
    when 'pending_validation' then p_new_status in ('pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled', 'draft')
    when 'pending_approval' then p_new_status in ('approved', 'returned_for_correction', 'on_hold', 'cancelled')
    when 'approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'ready_to_post', 'cancelled')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled')
    when 'posted' then p_new_status in ('reversal_requested')
    when 'reversal_requested' then p_new_status in ('reversed', 'posted')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'returned' then p_new_status in ('draft', 'submitted', 'cancelled')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled' then false
    when 'reversed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move debit note from % to %', v_old, p_new_status; end if;

  update debit_notes set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_id;
  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, reason, changed_by)
  values (v_company_id, 'debit_notes', p_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_debit_note_status(uuid, text, text) to authenticated;

create or replace function change_customer_adjustment_status(p_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from customer_adjustments where id = p_id;
  if v_old is null then raise exception 'Customer adjustment not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled', 'sync_pending')
    when 'pending_validation' then p_new_status in ('pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled', 'draft')
    when 'pending_approval' then p_new_status in ('approved', 'returned_for_correction', 'on_hold', 'cancelled')
    when 'approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'ready_to_post', 'cancelled')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled')
    when 'posted' then p_new_status in ('reversal_requested')
    when 'reversal_requested' then p_new_status in ('reversed', 'posted')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'returned', 'cancelled')
    when 'returned' then p_new_status in ('draft', 'submitted', 'cancelled')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled' then false
    when 'reversed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move adjustment from % to %', v_old, p_new_status; end if;

  update customer_adjustments set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_id;
  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, reason, changed_by)
  values (v_company_id, 'customer_adjustments', p_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_customer_adjustment_status(uuid, text, text) to authenticated;

create table financial_adjustment_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  triggered_by text[] not null default '{}',
  overall_status text not null default 'pending' check (overall_status in (
    'pending', 'approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_table, document_id)
);

alter table financial_adjustment_approvals enable row level security;
create policy financial_adjustment_approvals_isolation on financial_adjustment_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_financial_adjustment_approvals_updated_at before update on financial_adjustment_approvals
  for each row execute function set_updated_at();

create table financial_adjustment_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references financial_adjustment_approvals(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'manual_credit_note', 'manual_debit_note', 'high_value_adjustment', 'tax_adjustment', 'price_correction',
    'discount_correction', 'promotion_correction', 'customer_goodwill_credit', 'penalty_debit',
    'backdated_document', 'offline_document', 'outside_approval_limit'
  )),
  sequence integer not null default 1,
  required_role text,
  assigned_approver uuid references app_users(id),
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  status text not null default 'pending' check (status in (
    'not_required', 'pending', 'approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  action_time timestamptz,
  action_user uuid references app_users(id),
  reason text,
  notes text
);
create index idx_financial_adjustment_approval_steps_approval on financial_adjustment_approval_steps(approval_id, sequence);
create index idx_financial_adjustment_approval_steps_approver on financial_adjustment_approval_steps(assigned_approver, status);

alter table financial_adjustment_approval_steps enable row level security;
create policy financial_adjustment_approval_steps_isolation on financial_adjustment_approval_steps for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_adjustment_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references financial_adjustment_approvals(id) on delete cascade,
  step_id uuid references financial_adjustment_approval_steps(id) on delete set null,
  action text not null check (action in (
    'submit', 'approve', 'reject', 'return_for_correction', 'hold', 'release', 'escalate', 'reassign', 'cancel_request'
  )),
  performed_by uuid references app_users(id),
  reason text,
  notes text,
  performed_at timestamptz not null default now()
);
create index idx_customer_adjustment_approval_history_approval on customer_adjustment_approval_history(approval_id);

alter table customer_adjustment_approval_history enable row level security;
create policy customer_adjustment_approval_history_isolation on customer_adjustment_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table financial_adjustment_approval_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  document_category text not null check (document_category in ('credit_note', 'debit_note', 'customer_adjustment')),
  auto_approve_below numeric(14,2) not null default 0,
  high_value_threshold numeric(14,2) not null default 3000,
  unique (company_id, document_category)
);

alter table financial_adjustment_approval_limits enable row level security;
create policy financial_adjustment_approval_limits_isolation on financial_adjustment_approval_limits for all
  using (company_id is null or company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function evaluate_adjustment_approval_triggers(p_document_table text, p_document_id uuid)
returns text[] language plpgsql stable as $$
declare
  v_company_id uuid;
  v_net_amount numeric;
  v_document_date date;
  v_created_at timestamptz;
  v_document_source text;
  v_document_type_code text;
  v_reason_requires_approval boolean;
  v_threshold numeric;
  v_triggers text[] := '{}';
  v_category text;
begin
  v_category := case p_document_table when 'credit_notes' then 'credit_note' when 'debit_notes' then 'debit_note' else 'customer_adjustment' end;

  execute format(
    'select d.company_id, d.net_amount, d.document_date, d.created_at, d.document_source, dt.code, r.requires_approval
     from %I d join financial_document_types dt on dt.id = d.document_type_id
     left join financial_adjustment_reasons r on r.id = d.reason_id where d.id = $1', p_document_table
  ) into v_company_id, v_net_amount, v_document_date, v_created_at, v_document_source, v_document_type_code, v_reason_requires_approval using p_document_id;

  if v_company_id is null then raise exception 'Document not found'; end if;

  select coalesce(high_value_threshold, 3000) into v_threshold from financial_adjustment_approval_limits
  where document_category = v_category and (company_id is null or company_id = v_company_id) order by company_id nulls last limit 1;
  v_threshold := coalesce(v_threshold, 3000);

  if v_document_type_code = 'manual_credit_note' then v_triggers := array_append(v_triggers, 'manual_credit_note'); end if;
  if v_document_type_code = 'manual_debit_note' then v_triggers := array_append(v_triggers, 'manual_debit_note'); end if;
  if v_document_type_code = 'customer_goodwill_credit' then v_triggers := array_append(v_triggers, 'customer_goodwill_credit'); end if;
  if v_document_type_code = 'customer_penalty_debit' then v_triggers := array_append(v_triggers, 'penalty_debit'); end if;
  if v_document_type_code = 'tax_adjustment' then v_triggers := array_append(v_triggers, 'tax_adjustment'); end if;
  if v_document_type_code = 'price_correction' then v_triggers := array_append(v_triggers, 'price_correction'); end if;
  if v_document_type_code = 'discount_adjustment' then v_triggers := array_append(v_triggers, 'discount_correction'); end if;
  if v_document_type_code = 'promotion_adjustment' then v_triggers := array_append(v_triggers, 'promotion_correction'); end if;
  if coalesce(v_reason_requires_approval, false) then v_triggers := array_append(v_triggers, 'outside_approval_limit'); end if;
  if v_net_amount >= v_threshold then v_triggers := array_append(v_triggers, 'high_value_adjustment'); end if;
  if v_document_date < (v_created_at::date - 7) then v_triggers := array_append(v_triggers, 'backdated_document'); end if;
  if v_document_source = 'offline' then v_triggers := array_append(v_triggers, 'offline_document'); end if;

  select array_agg(distinct t) into v_triggers from unnest(v_triggers) t;
  return coalesce(v_triggers, '{}');
end;
$$;
grant execute on function evaluate_adjustment_approval_triggers(text, uuid) to authenticated;

create or replace function submit_adjustment_for_approval(p_document_table text, p_document_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_status_fn text;
  v_triggers text[];
  v_approval_id uuid;
  v_trigger text;
  v_seq integer := 1;
begin
  if p_document_table not in ('credit_notes', 'debit_notes', 'customer_adjustments') then raise exception 'Unknown document table'; end if;
  if not has_permission('financial_adjustments:create_credit_note') and not has_permission('financial_adjustments:create_debit_note') and not has_permission('financial_adjustments:create_adjustment') then
    raise exception 'Not permitted';
  end if;

  execute format('select company_id from %I where id = $1', p_document_table) into v_company_id using p_document_id;
  if v_company_id is null then raise exception 'Document not found'; end if;

  v_triggers := evaluate_adjustment_approval_triggers(p_document_table, p_document_id);
  v_status_fn := case p_document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;

  insert into financial_adjustment_approvals (company_id, document_table, document_id, triggered_by, overall_status)
  values (v_company_id, p_document_table, p_document_id, v_triggers, case when array_length(v_triggers, 1) is null then 'approved' else 'pending' end)
  on conflict (document_table, document_id) do update set triggered_by = excluded.triggered_by, overall_status = excluded.overall_status, updated_at = now()
  returning id into v_approval_id;

  if array_length(v_triggers, 1) is null then
    execute format('update %I set approval_status = $1 where id = $2', p_document_table) using 'approved', p_document_id;
    execute format('select %s($1, $2, $3)', v_status_fn) using p_document_id, 'ready_to_post', 'Approval skipped — no triggers matched';
  else
    foreach v_trigger in array v_triggers loop
      insert into financial_adjustment_approval_steps (company_id, approval_id, approval_type, sequence, required_role, requested_by, status)
      values (
        v_company_id, v_approval_id, v_trigger, v_seq,
        case v_trigger
          when 'tax_adjustment' then 'accounts_manager'
          when 'high_value_adjustment' then 'finance_manager'
          when 'customer_goodwill_credit' then 'accounts_manager'
          when 'penalty_debit' then 'accounts_manager'
          when 'offline_document' then 'accounts_executive'
          else 'sales_supervisor'
        end,
        auth.uid(), 'pending'
      );
      v_seq := v_seq + 1;
    end loop;
    execute format('update %I set approval_status = $1 where id = $2', p_document_table) using 'pending', p_document_id;
    execute format('select %s($1, $2, $3)', v_status_fn) using p_document_id, 'pending_approval', 'Submitted for approval';
  end if;

  insert into customer_adjustment_approval_history (company_id, approval_id, action, performed_by)
  values (v_company_id, v_approval_id, 'submit', auth.uid());

  return v_approval_id;
end;
$$;
grant execute on function submit_adjustment_for_approval(text, uuid) to authenticated;

create or replace function refresh_adjustment_approval_status(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare
  v_approval financial_adjustment_approvals%rowtype;
  v_total integer; v_approved integer; v_rejected integer; v_pending integer;
  v_overall text;
  v_status_fn text;
begin
  select * into v_approval from financial_adjustment_approvals where id = p_approval_id;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected'), count(*) filter (where status = 'pending')
  into v_total, v_approved, v_rejected, v_pending
  from financial_adjustment_approval_steps where approval_id = p_approval_id;

  v_overall := case
    when v_rejected > 0 then 'rejected'
    when v_pending > 0 then 'pending'
    when v_approved = v_total then 'approved'
    else 'pending'
  end;

  update financial_adjustment_approvals set overall_status = v_overall where id = p_approval_id;
  execute format('update %I set approval_status = $1 where id = $2', v_approval.document_table) using v_overall, v_approval.document_id;

  v_status_fn := case v_approval.document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;
  if v_overall = 'rejected' then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_approval.document_id, 'returned', 'Approval rejected';
  elsif v_overall = 'approved' then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_approval.document_id, 'ready_to_post', 'Approval complete';
  end if;
end;
$$;
grant execute on function refresh_adjustment_approval_status(uuid) to authenticated;

create or replace function process_adjustment_approval_action(
  p_step_id uuid, p_action text, p_reason text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_step financial_adjustment_approval_steps%rowtype;
  v_approval financial_adjustment_approvals%rowtype;
  v_new_status text;
begin
  select * into v_step from financial_adjustment_approval_steps where id = p_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_approval from financial_adjustment_approvals where id = v_step.approval_id;

  if p_action not in ('approve', 'reject', 'return_for_correction', 'hold', 'release', 'escalate', 'reassign', 'cancel_request') then
    raise exception 'Unknown approval action: %', p_action;
  end if;
  if p_action = 'approve' and not (
    has_permission('financial_adjustments:create_credit_note') or has_permission('financial_adjustments:create_debit_note') or has_permission('financial_adjustments:create_adjustment')
  ) then raise exception 'Not permitted'; end if;

  v_new_status := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'return_for_correction' then 'returned_for_correction'
    when 'hold' then 'on_hold'
    when 'release' then 'pending'
    when 'cancel_request' then 'cancelled'
    when 'escalate' then 'pending'
    when 'reassign' then 'pending'
  end;

  update financial_adjustment_approval_steps set status = v_new_status, action_time = now(), action_user = auth.uid(), reason = p_reason, notes = p_notes where id = p_step_id;

  insert into customer_adjustment_approval_history (company_id, approval_id, step_id, action, performed_by, reason, notes)
  values (v_approval.company_id, v_approval.id, p_step_id, p_action, auth.uid(), p_reason, p_notes);

  perform refresh_adjustment_approval_status(v_approval.id);
end;
$$;
grant execute on function process_adjustment_approval_action(uuid, text, text, text) to authenticated;
