import { useState } from 'react';
import { MapPin, LogIn, LogOut, Ban, Navigation } from 'lucide-react';
import { useRoutes } from '@/hooks/useRoutes';
import { useTodayVisits, Visit } from '@/hooks/useCustomerVisits';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_BADGE: Record<Visit['status'], string> = {
  planned: 'badge-slate',
  checked_in: 'badge-amber',
  completed: 'badge-green',
  missed: 'badge-red',
};

function CheckOutModal({ visit, onClose, onConfirm }: {
  visit: Visit | null; onClose: () => void; onConfirm: (notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await onConfirm(notes);
    setSubmitting(false);
    setNotes('');
  };

  return (
    <Modal open={!!visit} onClose={onClose} title={visit ? `Check out — ${visit.customer?.business_name}` : ''} size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Visit notes (optional)</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened at this visit?" />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Complete visit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function VisitsPage() {
  const { routes } = useRoutes();
  const [routeId, setRouteId] = useState('');
  const { visits, loading, startTodaysVisits, checkIn, checkOut, markMissed } = useTodayVisits(routeId || null);
  const { push } = useToast();
  const [checkingOut, setCheckingOut] = useState<Visit | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleStart = async () => {
    const { error } = await startTodaysVisits();
    push(error ? 'error' : 'success', error ?? "Today's visits are ready.");
  };

  const handleCheckIn = async (visit: Visit) => {
    setBusyId(visit.id);
    const { error, hadGps } = await checkIn(visit.id);
    setBusyId(null);
    if (error) { push('error', error); return; }
    push('success', hadGps ? 'Checked in with location.' : 'Checked in (location unavailable — allow GPS access for verification).');
  };

  const handleCheckOutConfirm = async (notes: string) => {
    if (!checkingOut) return;
    setBusyId(checkingOut.id);
    const { error } = await checkOut(checkingOut.id, notes);
    setBusyId(null);
    setCheckingOut(null);
    push(error ? 'error' : 'success', error ?? 'Visit completed.');
  };

  const handleMissed = async (visit: Visit) => {
    setBusyId(visit.id);
    const { error } = await markMissed(visit.id);
    setBusyId(null);
    push(error ? 'error' : 'success', error ?? 'Visit marked as missed.');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Visits</h1>
        <p className="text-sm text-slate-500">Today's stops for the selected route, with GPS-verified check-in/out.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label">Route</label>
          <select className="input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Select a route…</option>
            {routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <PermissionGate permission="customer_visit:create">
          <button className="btn-primary" onClick={handleStart} disabled={!routeId}>
            <Navigation size={16} /> Start today's visits
          </button>
        </PermissionGate>
      </div>

      {!routeId ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <MapPin className="text-slate-300" size={36} />
          <p className="text-slate-500">Select a route to see today's visits.</p>
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-slate-400">Loading…</p>
      ) : visits.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <p className="font-medium text-slate-600 dark:text-slate-300">No visits started yet for today</p>
          <p className="text-sm text-slate-500">Click "Start today's visits" to plan the round from this route's assigned customers.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visits.map((v) => (
            <div key={v.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{v.customer?.business_name}</p>
                <p className="text-xs text-slate-500">{v.customer?.address ?? 'No address on file'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={STATUS_BADGE[v.status]}>{v.status.replace('_', ' ')}</span>
                {v.check_in_at && <span className="text-xs text-slate-400">In: {new Date(v.check_in_at).toLocaleTimeString()}</span>}
                {v.check_out_at && <span className="text-xs text-slate-400">Out: {new Date(v.check_out_at).toLocaleTimeString()}</span>}
                <PermissionGate permission="customer_visit:edit">
                  <div className="flex gap-1">
                    {v.status === 'planned' && (
                      <>
                        <button className="btn-secondary !py-1" disabled={busyId === v.id} onClick={() => handleCheckIn(v)}>
                          <LogIn size={14} /> Check in
                        </button>
                        <button className="btn-ghost !py-1 text-red-600" disabled={busyId === v.id} onClick={() => handleMissed(v)}>
                          <Ban size={14} /> Missed
                        </button>
                      </>
                    )}
                    {v.status === 'checked_in' && (
                      <button className="btn-primary !py-1" disabled={busyId === v.id} onClick={() => setCheckingOut(v)}>
                        <LogOut size={14} /> Check out
                      </button>
                    )}
                  </div>
                </PermissionGate>
              </div>
            </div>
          ))}
        </div>
      )}

      <CheckOutModal visit={checkingOut} onClose={() => setCheckingOut(null)} onConfirm={handleCheckOutConfirm} />
    </div>
  );
}
