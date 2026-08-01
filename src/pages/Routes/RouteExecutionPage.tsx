import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Square, Navigation2, PhoneCall, UserPlus, SkipForward,
  CalendarClock, MapPin, Wifi, WifiOff, ChevronRight,
} from 'lucide-react';
import { useDailyVisitPlan, useDailyVisitPlanEmployees } from '@/hooks/useDailyVisitPlans';
import { useDailyVisitPlanItems, useRouteProgress } from '@/hooks/useDailyVisitPlanItems';
import { useRouteExecutionSession } from '@/hooks/useRouteExecution';
import { useCustomers } from '@/hooks/useCustomers';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const PAUSE_REASONS = ['break', 'fuel', 'vehicle_issue', 'personal_emergency', 'warehouse_return', 'manager_instruction', 'other'] as const;

function getGeolocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

export function RouteExecutionPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { plan, loading: planLoading } = useDailyVisitPlan(planId);
  const { employees } = useDailyVisitPlanEmployees(planId);
  const { items, reload: reloadItems, skipCustomer, rescheduleCustomer, addUnplannedCustomer } = useDailyVisitPlanItems(planId);
  const { progress, reload: reloadProgress } = useRouteProgress(planId);
  const { session, loading: sessionLoading, startRoute, pauseRoute, resumeRoute, endRoute } = useRouteExecutionSession(planId);
  const { customers } = useCustomers();
  const { push } = useToast();

  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [pauseReason, setPauseReason] = useState<typeof PAUSE_REASONS[number]>('break');
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [showEndForm, setShowEndForm] = useState(false);
  const [earlyReason, setEarlyReason] = useState('');
  const [unplannedCustomerId, setUnplannedCustomerId] = useState('');
  const [showUnplannedForm, setShowUnplannedForm] = useState(false);
  const [isOffline] = useState(!navigator.onLine);

  if (planLoading || sessionLoading || !plan) return <p className="text-center text-slate-400">Loading…</p>;

  const activeItems = items.filter((i) => ['pending', 'ready', 'in_progress'].includes(i.visit_status));
  const currentCustomer = activeItems[0];
  const nextCustomer = activeItems[1];

  const refreshAll = () => { reloadItems(); reloadProgress(); };

  const handleStart = async () => {
    if (!startOdo) { push('error', 'Enter the opening odometer reading.'); return; }
    const loc = await getGeolocation();
    const { error } = await startRoute({
      openingOdometer: Number(startOdo), latitude: loc?.lat, longitude: loc?.lng, isOffline,
    });
    if (error) { push('error', error); return; }
    push('success', 'Route started.');
  };

  const handlePause = async () => {
    const { error } = await pauseRoute(pauseReason);
    if (error) { push('error', error); return; }
    push('success', 'Route paused.');
    setShowPauseForm(false);
  };

  const handleResume = async () => {
    const { error } = await resumeRoute();
    if (error) { push('error', error); return; }
    push('success', 'Route resumed.');
  };

  const handleEnd = async () => {
    if (!endOdo) { push('error', 'Enter the closing odometer reading.'); return; }
    if ((progress?.pending ?? 0) > 0 && !earlyReason) { push('error', 'Reason required — customers are still pending.'); return; }
    const loc = await getGeolocation();
    const { error } = await endRoute({
      closingOdometer: Number(endOdo), latitude: loc?.lat, longitude: loc?.lng, earlyClosureReason: earlyReason || undefined,
    });
    if (error) { push('error', error); return; }
    push('success', 'Route ended.');
    setShowEndForm(false);
  };

  const handleSkip = async (itemId: string) => {
    const reason = prompt('Reason for skipping this customer:');
    if (!reason) return;
    const loc = await getGeolocation();
    const { error } = await skipCustomer(itemId, { reason, latitude: loc?.lat, longitude: loc?.lng });
    if (error) push('error', error); else { push('success', 'Customer skipped.'); refreshAll(); }
  };

  const handleReschedule = async (itemId: string) => {
    const newDate = prompt('Reschedule to which date (YYYY-MM-DD)?');
    if (!newDate) return;
    const reason = prompt('Reason for rescheduling:') ?? '';
    const { error } = await rescheduleCustomer(itemId, { newDate, reason });
    if (error) push('error', error); else { push('success', 'Customer rescheduled.'); refreshAll(); }
  };

  const handleAddUnplanned = async () => {
    if (!unplannedCustomerId || !planId) return;
    const reason = prompt('Reason for adding this unplanned stop:');
    if (!reason) return;
    const loc = await getGeolocation();
    const { error } = await addUnplannedCustomer(planId, unplannedCustomerId, reason, loc?.lat, loc?.lng);
    if (error) { push('error', error); return; }
    push('success', 'Unplanned customer added.');
    setShowUnplannedForm(false);
    setUnplannedCustomerId('');
    refreshAll();
  };

  const openNavigation = (lat: number | null | undefined, lng: number | null | undefined) => {
    if (lat == null || lng == null) { push('error', 'No GPS coordinates saved for this customer.'); return; }
    // No single maps app is hardcoded — geo: URI lets the device pick its own default handler.
    window.open(`geo:${lat},${lng}?q=${lat},${lng}`, '_blank') || window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  // Not started yet: show the Start Route form.
  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <button className="flex items-center gap-1 text-sm text-slate-500" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>
        <div className="card p-4">
          <h1 className="mb-1 text-lg font-bold">{plan.beat_plan?.beat_name ?? 'Route'} — {plan.plan_date}</h1>
          <p className="mb-4 text-sm text-slate-500">{plan.van?.name} · {employees.map((e) => e.employee?.full_name).join(', ')}</p>
          <label className="label">Opening Odometer</label>
          <input type="number" className="input" value={startOdo} onChange={(e) => setStartOdo(e.target.value)} />
          <PermissionGate permission="route_execution:start_route">
            <button className="btn-primary mt-4 w-full" onClick={handleStart}>
              <Play size={16} /> Start Route
            </button>
          </PermissionGate>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <button className="flex items-center gap-1 text-sm text-slate-500" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{plan.beat_plan?.beat_name ?? 'Route'}</h1>
            <p className="text-xs text-slate-500">Started {session.start_time ? new Date(session.start_time).toLocaleTimeString() : '—'}</p>
          </div>
          <span className="flex items-center gap-1 text-xs">
            {isOffline ? <><WifiOff size={14} className="text-red-500" /> Offline</> : <><Wifi size={14} className="text-green-500" /> Online</>}
          </span>
        </div>

        {progress && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full bg-blue-600" style={{ width: `${progress.completion_pct}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div><p className="font-bold text-green-600">{progress.completed}</p><p className="text-slate-500">Done</p></div>
              <div><p className="font-bold text-blue-600">{progress.pending}</p><p className="text-slate-500">Pending</p></div>
              <div><p className="font-bold text-red-600">{progress.missed}</p><p className="text-slate-500">Missed</p></div>
              <div><p className="font-bold text-amber-600">{progress.skipped}</p><p className="text-slate-500">Skipped</p></div>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <PermissionGate permission="route_execution:pause_route">
            <button className="btn-secondary flex-1" onClick={() => setShowPauseForm((s) => !s)}><Pause size={14} /> Pause</button>
          </PermissionGate>
          <PermissionGate permission="route_execution:resume_route">
            <button className="btn-secondary flex-1" onClick={handleResume}><Play size={14} /> Resume</button>
          </PermissionGate>
          <PermissionGate permission="route_execution:end_route">
            <button className="btn-primary flex-1" onClick={() => setShowEndForm((s) => !s)}><Square size={14} /> End</button>
          </PermissionGate>
        </div>

        {showPauseForm && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className="label">Pause Reason</label>
            <select className="input" value={pauseReason} onChange={(e) => setPauseReason(e.target.value as any)}>
              {PAUSE_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            <button className="btn-primary w-full" onClick={handlePause}>Confirm Pause</button>
          </div>
        )}

        {showEndForm && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className="label">Closing Odometer</label>
            <input type="number" className="input" value={endOdo} onChange={(e) => setEndOdo(e.target.value)} />
            {(progress?.pending ?? 0) > 0 && (
              <>
                <label className="label">Reason (required — {progress?.pending} customer(s) still pending)</label>
                <input className="input" value={earlyReason} onChange={(e) => setEarlyReason(e.target.value)} />
              </>
            )}
            <button className="btn-primary w-full" onClick={handleEnd}>Confirm End Route</button>
          </div>
        )}

        <Link to={`/gps?van=${plan.van_id ?? ''}`} className="mt-3 flex items-center justify-center gap-1 text-xs text-blue-600 hover:underline">
          <MapPin size={12} /> View live map <ChevronRight size={12} />
        </Link>
      </div>

      {currentCustomer && (
        <div className="card border-2 border-blue-500 p-4">
          <p className="text-xs font-medium uppercase text-blue-600">Current Customer</p>
          <CustomerCard item={currentCustomer} onSkip={handleSkip} onReschedule={handleReschedule} onNavigate={openNavigation} />
        </div>
      )}
      {nextCustomer && (
        <div className="card p-4 opacity-80">
          <p className="text-xs font-medium uppercase text-slate-500">Next Customer</p>
          <CustomerCard item={nextCustomer} onSkip={handleSkip} onReschedule={handleReschedule} onNavigate={openNavigation} />
        </div>
      )}

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Full Customer List</h3>
          <PermissionGate permission="route_execution:add_unplanned">
            <button className="text-xs text-blue-600 hover:underline" onClick={() => setShowUnplannedForm((s) => !s)}>
              <UserPlus size={12} className="inline" /> Add Unplanned
            </button>
          </PermissionGate>
        </div>
        {showUnplannedForm && (
          <div className="mb-3 flex gap-2">
            <select className="input flex-1" value={unplannedCustomerId} onChange={(e) => setUnplannedCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.filter((c) => !items.some((i) => i.customer_id === c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleAddUnplanned}>Add</button>
          </div>
        )}
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
              <div>
                <p className="font-medium">{i.sequence}. {i.customer?.business_name}</p>
                <p className="text-xs capitalize text-slate-500">{i.visit_status.replace(/_/g, ' ')}{i.is_unplanned ? ' · unplanned' : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomerCard({ item, onSkip, onReschedule, onNavigate }: {
  item: ReturnType<typeof useDailyVisitPlanItems>['items'][number];
  onSkip: (id: string) => void;
  onReschedule: (id: string) => void;
  onNavigate: (lat: number | null | undefined, lng: number | null | undefined) => void;
}) {
  return (
    <div>
      <p className="mt-1 text-lg font-bold">{item.customer?.business_name}</p>
      <p className="text-sm text-slate-500">{item.customer?.customer_code} · {item.customer?.area ?? 'No area set'}</p>
      {item.special_instructions && <p className="mt-1 text-xs italic text-amber-600">{item.special_instructions}</p>}
      {item.customer && (item.customer.outstanding_balance ?? 0) > 0 && (
        <p className="mt-1 text-xs font-medium text-red-600">Outstanding: {item.customer.outstanding_balance}</p>
      )}
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <button className="btn-secondary !py-1.5" onClick={() => onNavigate(item.customer?.latitude, item.customer?.longitude)}>
          <Navigation2 size={14} /> Go
        </button>
        <a className="btn-secondary !py-1.5 text-center" href={item.customer?.primary_phone ? `tel:${item.customer.primary_phone}` : undefined}>
          <PhoneCall size={14} /> Call
        </a>
        <button className="btn-secondary !py-1.5" onClick={() => onSkip(item.id)}>
          <SkipForward size={14} /> Skip
        </button>
        <button className="btn-secondary !py-1.5" onClick={() => onReschedule(item.id)}>
          <CalendarClock size={14} /> Reschedule
        </button>
      </div>
    </div>
  );
}
