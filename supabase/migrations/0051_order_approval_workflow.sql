-- ============================================================================
-- 0051_order_approval_workflow.sql
-- Continues 0047-0050.
-- ============================================================================

alter table sales_orders add column if not exists approval_status text not null default 'not_required' check (approval_status in (
  'not_required', 'pending', 'approved', 'partially_approved', 'rejected',
  'returned_for_correction', 'on_hold', 'cancelled', 'expired', 'skipped_by_rule'
));

create table sales_order_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  triggered_by text[] not null default '{}', -- e.g. {'credit_order','price_override','high_value'}
  overall_status text not null default 'pending' check (overall_status in (
    'pending', 'approved', 'partially_approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled', 'expired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

alter table sales_order_approvals enable row level security;
create policy sales_order_approvals_isolation on sales_order_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_order_approvals_updated_at before update on sales_order_approvals
  for each row execute function set_updated_at();

create table sales_order_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_order_approvals(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'credit_order', 'credit_limit_exceeded', 'overdue_customer', 'price_below_minimum', 'price_override',
    'discount_above_limit', 'manual_free_quantity', 'high_value_order', 'backorder', 'out_of_route_customer',
    'unplanned_customer', 'near_expiry_allocation', 'manual_batch_selection', 'order_amendment'
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
  original_values jsonb,
  requested_values jsonb,
  approved_values jsonb
);
create index idx_sales_order_approval_steps_approval on sales_order_approval_steps(approval_id, sequence);
create index idx_sales_order_approval_steps_approver on sales_order_approval_steps(assigned_approver, status);

alter table sales_order_approval_steps enable row level security;
create policy sales_order_approval_steps_isolation on sales_order_approval_steps for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  approval_id uuid not null references sales_order_approvals(id) on delete cascade,
  step_id uuid references sales_order_approval_steps(id) on delete set null,
  action text not null check (action in (
    'submit', 'approve', 'partially_approve', 'reject', 'return_for_correction',
    'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign'
  )),
  performed_by uuid references app_users(id),
  reason text,
  notes text,
  performed_at timestamptz not null default now()
);
create index idx_sales_order_approval_history_approval on sales_order_approval_history(approval_id);

alter table sales_order_approval_history enable row level security;
create policy sales_order_approval_history_isolation on sales_order_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Determines which approval triggers apply to an order, from real order/
-- item/validation data — never a hardcoded "always requires approval".
-- ---------------------------------------------------------------------------
create or replace function evaluate_order_approval_triggers(p_order_id uuid)
returns text[] language plpgsql stable as $$
declare
  v_order sales_orders%rowtype;
  v_order_type sales_order_types%rowtype;
  v_triggers text[] := '{}';
  v_has_price_override boolean;
  v_has_manual_discount boolean;
  v_has_manual_free boolean;
  v_has_backorder boolean;
  v_customer_route_id uuid;
begin
  select * into v_order from sales_orders where id = p_order_id;
  select * into v_order_type from sales_order_types where id = v_order.order_type_id;

  if v_order_type.requires_approval then v_triggers := array_append(v_triggers, 'credit_order'); end if;
  if v_order.credit_validation_status in ('over_limit', 'blocked', 'temporary_credit_expired', 'overdue_block') then
    v_triggers := array_append(v_triggers, 'credit_limit_exceeded');
  end if;
  if v_order.credit_validation_status = 'overdue_block' then v_triggers := array_append(v_triggers, 'overdue_customer'); end if;

  select exists(select 1 from sales_order_items where order_id = p_order_id and price_source = 'override') into v_has_price_override;
  if v_has_price_override then v_triggers := array_append(v_triggers, 'price_override'); end if;

  select exists(select 1 from sales_order_items where order_id = p_order_id and discount_source = 'manual_discount') into v_has_manual_discount;
  if v_has_manual_discount then v_triggers := array_append(v_triggers, 'discount_above_limit'); end if;

  select exists(select 1 from sales_order_items where order_id = p_order_id and is_free_item and free_quantity_rule_id is null) into v_has_manual_free;
  if v_has_manual_free then v_triggers := array_append(v_triggers, 'manual_free_quantity'); end if;

  select exists(select 1 from sales_order_backorders where order_id = p_order_id and status not in ('cancelled', 'closed')) into v_has_backorder;
  if v_has_backorder then v_triggers := array_append(v_triggers, 'backorder'); end if;

  if v_order.net_amount >= 5000 then v_triggers := array_append(v_triggers, 'high_value_order'); end if;

  select route_id into v_customer_route_id from customers where id = v_order.customer_id;
  if v_order.route_id is not null and v_customer_route_id is not null and v_order.route_id != v_customer_route_id then
    v_triggers := array_append(v_triggers, 'out_of_route_customer');
  end if;

  if v_order.daily_visit_plan_id is not null then
    if exists (
      select 1 from daily_visit_plan_items where plan_id = v_order.daily_visit_plan_id and customer_id = v_order.customer_id and is_unplanned
    ) then
      v_triggers := array_append(v_triggers, 'unplanned_customer');
    end if;
  end if;

  return v_triggers;
end;
$$;
grant execute on function evaluate_order_approval_triggers(uuid) to authenticated;

-- Submits an order for approval. If no triggers apply and the order type
-- doesn't require approval, the order is approved immediately (skipped by
-- rule) rather than sitting in a pointless pending queue.
create or replace function submit_order_for_approval(p_order_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_triggers text[];
  v_approval_id uuid;
  v_trigger text;
  v_seq integer := 1;
begin
  if not has_permission('sales_orders:submit') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;

  perform validate_order_stock(p_order_id, 'submission');
  perform validate_order_credit(p_order_id);

  v_triggers := evaluate_order_approval_triggers(p_order_id);

  insert into sales_order_approvals (company_id, order_id, triggered_by, overall_status)
  values (v_order.company_id, p_order_id, v_triggers, case when array_length(v_triggers, 1) is null then 'approved' else 'pending' end)
  on conflict (order_id) do update set triggered_by = excluded.triggered_by, overall_status = excluded.overall_status, updated_at = now()
  returning id into v_approval_id;

  if array_length(v_triggers, 1) is null then
    update sales_orders set approval_status = 'skipped_by_rule', status = 'approved' where id = p_order_id;
  else
    foreach v_trigger in array v_triggers loop
      insert into sales_order_approval_steps (
        company_id, approval_id, approval_type, sequence, required_role, requested_by, status
      ) values (
        v_order.company_id, v_approval_id, v_trigger, v_seq,
        case v_trigger
          when 'credit_limit_exceeded' then 'credit_controller'
          when 'overdue_customer' then 'credit_controller'
          when 'price_override' then 'branch_manager'
          when 'discount_above_limit' then 'sales_supervisor'
          when 'high_value_order' then 'branch_manager'
          else 'sales_supervisor'
        end,
        auth.uid(), 'pending'
      );
      v_seq := v_seq + 1;
    end loop;
    update sales_orders set approval_status = 'pending', status = 'pending_approval' where id = p_order_id;
  end if;

  insert into sales_order_approval_history (company_id, approval_id, action, performed_by)
  values (v_order.company_id, v_approval_id, 'submit', auth.uid());

  return v_approval_id;
end;
$$;
grant execute on function submit_order_for_approval(uuid) to authenticated;

-- Rolls up the order's overall approval_status from its steps: approved
-- only once every step is approved; rejected if any step is rejected;
-- partially_approved if a mix of approved/partial exists with none rejected.
create or replace function refresh_order_approval_status(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare
  v_approval sales_order_approvals%rowtype;
  v_total integer; v_approved integer; v_rejected integer; v_partial integer; v_pending integer;
  v_overall text;
begin
  select * into v_approval from sales_order_approvals where id = p_approval_id;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'partially_approved'), count(*) filter (where status = 'pending')
  into v_total, v_approved, v_rejected, v_partial, v_pending
  from sales_order_approval_steps where approval_id = p_approval_id;

  v_overall := case
    when v_rejected > 0 then 'rejected'
    when v_pending > 0 then 'pending'
    when v_partial > 0 then 'partially_approved'
    when v_approved = v_total then 'approved'
    else 'pending'
  end;

  update sales_order_approvals set overall_status = v_overall where id = p_approval_id;
  update sales_orders set
    approval_status = v_overall,
    status = case v_overall
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'partially_approved' then 'partially_approved'
      else status
    end
  where id = v_approval.order_id;
end;
$$;
grant execute on function refresh_order_approval_status(uuid) to authenticated;

-- Processes a single approval step action. Partial approval accepts a
-- JSON array of {order_item_id, approved_quantity, approved_discount_pct}
-- and applies the reductions directly (never increases beyond what was
-- requested), then recalculates order totals from the resulting items.
create or replace function process_approval_action(
  p_step_id uuid, p_action text, p_reason text default null, p_notes text default null, p_partial_adjustments jsonb default null
) returns void language plpgsql security definer as $$
declare
  v_step sales_order_approval_steps%rowtype;
  v_approval sales_order_approvals%rowtype;
  v_adjustment jsonb;
  v_item sales_order_items%rowtype;
  v_new_qty numeric;
  v_new_discount_pct numeric;
  v_gross numeric; v_discount_amt numeric; v_tax_amt numeric; v_net numeric;
  v_new_status text;
  v_valid_action boolean;
begin
  select * into v_step from sales_order_approval_steps where id = p_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_approval from sales_order_approvals where id = v_step.approval_id;

  v_valid_action := p_action in (
    'approve', 'partially_approve', 'reject', 'return_for_correction',
    'hold', 'release_hold', 'cancel_request', 'escalate', 'reassign'
  );
  if not v_valid_action then raise exception 'Unknown approval action: %', p_action; end if;

  if p_action = 'approve' and not has_permission('sales_orders:approve_order') then raise exception 'Not permitted'; end if;
  if p_action = 'partially_approve' and not has_permission('sales_orders:partially_approve_order') then raise exception 'Not permitted'; end if;
  if p_action = 'reject' and not has_permission('sales_orders:reject_order') then raise exception 'Not permitted'; end if;
  if p_action = 'return_for_correction' and not has_permission('sales_orders:return_for_correction') then raise exception 'Not permitted'; end if;

  if p_action = 'partially_approve' and p_partial_adjustments is not null then
    for v_adjustment in select * from jsonb_array_elements(p_partial_adjustments) loop
      select * into v_item from sales_order_items where id = (v_adjustment->>'order_item_id')::uuid;
      if not found then continue; end if;

      v_new_qty := coalesce((v_adjustment->>'approved_quantity')::numeric, v_item.ordered_quantity);
      v_new_qty := least(v_new_qty, v_item.ordered_quantity); -- can only reduce, never increase
      v_new_discount_pct := coalesce((v_adjustment->>'approved_discount_pct')::numeric, v_item.discount_pct);

      v_gross := round(v_item.applied_price * v_new_qty, 2);
      v_discount_amt := round(v_gross * v_new_discount_pct / 100, 2);
      v_tax_amt := round((v_gross - v_discount_amt) * v_item.tax_rate / 100, 2);
      v_net := v_gross - v_discount_amt + v_tax_amt;

      update sales_order_items set
        ordered_quantity = v_new_qty, base_quantity = v_new_qty * conversion_factor,
        discount_pct = v_new_discount_pct, discount_amount = v_discount_amt,
        tax_amount = v_tax_amt, gross_amount = v_gross, net_amount = v_net
      where id = v_item.id;
    end loop;

    -- Recompute order-level totals directly from the (now adjusted) items
    -- rather than rerunning pricing — nothing was re-priced, only trimmed.
    update sales_orders set
      gross_amount = agg.gross, discount_amount = agg.discount, tax_amount = agg.tax,
      net_amount = agg.gross - agg.discount + agg.tax, total_quantity = agg.qty, updated_at = now()
    from (
      select sum(gross_amount) as gross, sum(discount_amount) as discount, sum(tax_amount) as tax, sum(ordered_quantity) as qty
      from sales_order_items where order_id = v_approval.order_id
    ) agg
    where sales_orders.id = v_approval.order_id;
  end if;

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

  update sales_order_approval_steps set
    status = v_new_status, action_time = now(), action_user = auth.uid(), reason = p_reason, notes = p_notes,
    approved_values = case when p_action = 'partially_approve' then p_partial_adjustments else approved_values end
  where id = p_step_id;

  insert into sales_order_approval_history (company_id, approval_id, step_id, action, performed_by, reason, notes)
  values (v_approval.company_id, v_approval.id, p_step_id, p_action, auth.uid(), p_reason, p_notes);

  perform refresh_order_approval_status(v_approval.id);
end;
$$;
grant execute on function process_approval_action(uuid, text, text, text, jsonb) to authenticated;
