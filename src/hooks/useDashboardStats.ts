import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardStats {
  today_sales: number;
  month_sales: number;
  year_sales: number;
  today_cash_collected: number;
  today_credit_collected: number;
  outstanding_receivables: number;
  outstanding_payables: number;
  warehouse_stock_value: number;
  van_stock_value: number;
  low_stock_count: number;
  expiring_soon_count: number;
  pending_van_loadings: number;
  pending_van_unloadings: number;
  pending_stock_adjustments: number;
  pending_returns: number;
  today_loadings_approved: number;
  today_loadings_pending: number;
  today_unloadings_approved: number;
  today_unloadings_pending: number;
  returns_this_month: number;
  damages_this_month: number;
  visits_today_planned: number;
  visits_today_completed: number;
  visits_today_missed: number;
  vans_live_now: number;
  total_vans: number;
  unread_notifications: number;
  beat_plans_active: number;
  beat_plans_inactive: number;
  daily_plans_generated_today: number;
  plans_pending_approval: number;
  routes_ready: number;
  routes_not_started: number;
  routes_in_progress: number;
  routes_paused: number;
  routes_completed: number;
  routes_partially_completed: number;
  planned_customers_today: number;
  pending_customers_today: number;
  missed_customers_today: number;
  skipped_customers_today: number;
  unplanned_customers_added_today: number;
  average_route_completion_today: number;
  late_route_starts_today: number;
  early_route_closures_today: number;
}

export function useDashboardStats() {
  const { company } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.rpc('dashboard_stats');
    setStats((data ?? null) as DashboardStats | null);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  // Refresh periodically so pending-approval counts and live-van status stay current.
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  return { stats, loading, reload: load };
}
