-- ============================================================================
-- 0042_dashboard_stats_route_execution.sql
-- Extends the existing dashboard_stats() aggregation (0023) with the Beat
-- Plan / Route Execution widgets this phase requires — reusing the same
-- one-query-per-dashboard-load pattern rather than adding new round trips.
-- ============================================================================

create or replace function dashboard_stats()
returns jsonb language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_result jsonb;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_year_start date := date_trunc('year', current_date)::date;
begin
  if v_company_id is null then raise exception 'No company context'; end if;

  select jsonb_build_object(
    'today_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at::date = v_today), 0),
    'month_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at >= v_month_start), 0),
    'year_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at >= v_year_start), 0),

    'today_cash_collected', coalesce((select sum(sp.amount) from sale_payments sp join sales s on s.id = sp.sale_id where s.company_id = v_company_id and sp.created_at::date = v_today), 0),
    'today_credit_collected', coalesce((select sum(amount) from collections where company_id = v_company_id and created_at::date = v_today), 0),

    'outstanding_receivables', coalesce((select sum(outstanding_balance) from customers where company_id = v_company_id), 0),
    'outstanding_payables', coalesce((select sum(outstanding_payable) from suppliers where company_id = v_company_id), 0),

    'warehouse_stock_value', coalesce((select sum(ws.quantity * p.cost_price) from warehouse_stock ws join products p on p.id = ws.product_id where ws.company_id = v_company_id), 0),
    'van_stock_value', coalesce((select sum(vs.quantity * p.cost_price) from van_stock vs join products p on p.id = vs.product_id where vs.company_id = v_company_id), 0),

    'low_stock_count', (select count(*) from warehouse_stock ws join products p on p.id = ws.product_id where ws.company_id = v_company_id and ws.quantity <= p.min_stock),
    'expiring_soon_count', (select count(distinct b.id) from batches b join products p on p.id = b.product_id where b.company_id = v_company_id and b.expiry_date is not null and b.expiry_date <= current_date + 30 and b.expiry_date >= current_date),

    'pending_van_loadings', (select count(*) from van_loadings where company_id = v_company_id and status = 'pending_approval'),
    'pending_van_unloadings', (select count(*) from van_unloadings where company_id = v_company_id and status = 'pending_approval'),
    'pending_stock_adjustments', (select count(*) from stock_adjustments where company_id = v_company_id and status = 'pending'),
    'pending_returns', (select count(*) from returns where company_id = v_company_id and status = 'pending'),

    'today_loadings_approved', (select count(*) from van_loadings where company_id = v_company_id and created_at::date = v_today and status = 'approved'),
    'today_loadings_pending', (select count(*) from van_loadings where company_id = v_company_id and created_at::date = v_today and status = 'pending_approval'),
    'today_unloadings_approved', (select count(*) from van_unloadings where company_id = v_company_id and created_at::date = v_today and status = 'approved'),
    'today_unloadings_pending', (select count(*) from van_unloadings where company_id = v_company_id and created_at::date = v_today and status = 'pending_approval'),

    'returns_this_month', (select count(*) from returns where company_id = v_company_id and created_at >= v_month_start),
    'damages_this_month', (
      select count(*) from van_unloading_items vui
      join van_unloadings vu on vu.id = vui.unloading_id
      where vu.company_id = v_company_id and vui.item_type = 'damaged' and vu.created_at >= v_month_start
    ),

    'visits_today_planned', (select count(*) from customer_visits where company_id = v_company_id and visit_date = v_today),
    'visits_today_completed', (select count(*) from customer_visits where company_id = v_company_id and visit_date = v_today and status = 'completed'),
    'visits_today_missed', (select count(*) from customer_visits where company_id = v_company_id and visit_date = v_today and status = 'missed'),

    'vans_live_now', (select count(*) from vans where company_id = v_company_id and last_location_at >= now() - interval '2 minutes'),
    'total_vans', (select count(*) from vans where company_id = v_company_id),

    'unread_notifications', (select count(*) from notifications where company_id = v_company_id and user_id = auth.uid() and is_read = false),

    -- Beat Plans
    'beat_plans_active', (select count(*) from beat_plans where company_id = v_company_id and status = 'active'),
    'beat_plans_inactive', (select count(*) from beat_plans where company_id = v_company_id and status in ('inactive', 'suspended', 'expired', 'archived')),

    -- Daily Visit Plans / Route status today
    'daily_plans_generated_today', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today),
    'plans_pending_approval', (select count(*) from daily_visit_plans where company_id = v_company_id and status = 'pending_approval'),
    'routes_ready', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status in ('approved', 'ready')),
    'routes_not_started', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status in ('draft', 'generated')),
    'routes_in_progress', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status = 'started'),
    'routes_paused', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status = 'paused'),
    'routes_completed', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status = 'completed'),
    'routes_partially_completed', (select count(*) from daily_visit_plans where company_id = v_company_id and plan_date = v_today and status = 'partially_completed'),

    -- Today's customer visit-item counts across all of today's plans
    'planned_customers_today', (
      select count(*) from daily_visit_plan_items i join daily_visit_plans p on p.id = i.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and i.visit_status != 'not_applicable'
    ),
    'pending_customers_today', (
      select count(*) from daily_visit_plan_items i join daily_visit_plans p on p.id = i.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and i.visit_status in ('pending', 'ready', 'in_progress')
    ),
    'missed_customers_today', (
      select count(*) from daily_visit_plan_items i join daily_visit_plans p on p.id = i.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and i.visit_status = 'missed'
    ),
    'skipped_customers_today', (
      select count(*) from daily_visit_plan_items i join daily_visit_plans p on p.id = i.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and i.visit_status = 'skipped'
    ),
    'unplanned_customers_added_today', (
      select count(*) from daily_visit_plan_items i join daily_visit_plans p on p.id = i.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and i.is_unplanned
    ),

    -- Average completion % across today's plans that have a session
    'average_route_completion_today', coalesce((
      select round(avg(res.completion_pct), 1) from route_execution_sessions res
      join daily_visit_plans p on p.id = res.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today
    ), 0),

    -- Late starts: plan had a planned_start_time but actual start was after it
    'late_route_starts_today', (
      select count(*) from route_execution_sessions res
      join daily_visit_plans p on p.id = res.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today
        and p.planned_start_time is not null and res.start_time is not null
        and res.start_time::time > p.planned_start_time
    ),

    -- Early closures: any plan ended with a recorded early_closure_reason
    'early_route_closures_today', (
      select count(*) from route_execution_sessions res
      join daily_visit_plans p on p.id = res.plan_id
      where p.company_id = v_company_id and p.plan_date = v_today and res.early_closure_reason is not null
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function dashboard_stats() to authenticated;
