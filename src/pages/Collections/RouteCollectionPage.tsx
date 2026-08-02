import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, ChevronRight } from 'lucide-react';
import { useTodayRouteCollection } from '@/hooks/useTodayRouteCollection';

const VISIT_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  ready: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  missed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  skipped: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
};

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function RouteCollectionPage() {
  const navigate = useNavigate();
  const { planId, routeName, customers, loading } = useTodayRouteCollection();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <MapPin size={20} /> Today's Route Collection
        </h1>
        <p className="text-sm text-slate-500">
          {routeName ? `Route: ${routeName}` : 'Planned customers for your route today, with outstanding and last-payment indicators.'}
        </p>
      </div>

      {loading && <p className="text-center text-slate-400">Loading…</p>}
      {!loading && !planId && (
        <div className="card p-6 text-center text-slate-500">
          No approved daily visit plan found for you today. Route collection becomes available once your route is planned and approved.
        </div>
      )}

      {!loading && planId && (
        <div className="space-y-2">
          {customers.map((c) => {
            const since = daysSince(c.last_receipt_date);
            const overdue = (c.outstanding_balance ?? 0) > 0 && (since === null || since > 30);
            return (
              <div key={c.plan_item_id} className="card flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium dark:bg-slate-800">{c.sequence}</span>
                  <div>
                    <p className="font-medium">{c.customer_code} — {c.business_name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 capitalize ${VISIT_STATUS_STYLES[c.visit_status] ?? 'bg-slate-100 text-slate-600'}`}>{c.visit_status.replace(/_/g, ' ')}</span>
                      {c.outstanding_balance != null && c.outstanding_balance > 0 && (
                        <span className={overdue ? 'font-medium text-red-600' : ''}>Outstanding {c.outstanding_balance.toFixed(2)}</span>
                      )}
                      <span>{since === null ? 'No prior payment' : `Last payment ${since}d ago`}</span>
                      {c.primary_phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.primary_phone}</span>}
                    </div>
                  </div>
                </div>
                <button
                  className="btn-primary !py-1.5 text-sm"
                  onClick={() => navigate(`/collections/receipts/new?customer_id=${c.customer_id}&plan_id=${planId}`)}
                >
                  Collect <ChevronRight size={14} />
                </button>
              </div>
            );
          })}
          {customers.length === 0 && <p className="text-center text-slate-400">No customers on today's plan.</p>}
        </div>
      )}
    </div>
  );
}
