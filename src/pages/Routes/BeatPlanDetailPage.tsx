import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CalendarClock, Users, ShieldCheck, History, Trash2, MapPinned } from 'lucide-react';
import { useBeatPlan, useBeatPlans, useBeatPlanStatusHistory, BeatPlanStatus, CapacityCheck } from '@/hooks/useBeatPlans';
import { useBeatPlanSchedules, useBeatPlanScheduleDates, FrequencyType } from '@/hooks/useBeatPlanSchedules';
import { useBeatPlanCustomers } from '@/hooks/useBeatPlanCustomers';
import { useCustomers } from '@/hooks/useCustomers';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'schedule' | 'customers' | 'capacity' | 'history';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'alternate_days', label: 'Alternate Days' },
  { value: 'weekly', label: 'Weekly (choose day)' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'every_n_days', label: 'Every N Days' },
  { value: 'monthly', label: 'Monthly (same date)' },
  { value: 'specific_weekdays', label: 'Specific Weekdays' },
  { value: 'specific_dates', label: 'Specific Dates' },
  { value: 'first_week', label: 'First Week of Month' },
  { value: 'second_week', label: 'Second Week of Month' },
  { value: 'third_week', label: 'Third Week of Month' },
  { value: 'last_week', label: 'Last Week of Month' },
  { value: 'custom_calendar', label: 'Custom Calendar' },
];

function StatusActions({ beatPlanId, status, onChanged }: { beatPlanId: string; status: BeatPlanStatus; onChanged: () => void }) {
  const { changeStatus } = useBeatPlans();
  const { push } = useToast();

  const transition = async (newStatus: BeatPlanStatus) => {
    const reason = prompt(`Reason for changing status to ${newStatus}:`) ?? '';
    const { error } = await changeStatus(beatPlanId, newStatus, reason);
    if (error) { push('error', error); return; }
    push('success', `Status changed to ${newStatus}.`);
    onChanged();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' && (
        <PermissionGate permission="beat_plans:activate">
          <button className="btn-primary" onClick={() => transition('active')}>Activate</button>
        </PermissionGate>
      )}
      {status === 'active' && (
        <PermissionGate permission="beat_plans:deactivate">
          <button className="btn-secondary" onClick={() => transition('suspended')}>Suspend</button>
        </PermissionGate>
      )}
      {status === 'active' && (
        <PermissionGate permission="beat_plans:deactivate">
          <button className="btn-secondary" onClick={() => transition('inactive')}>Deactivate</button>
        </PermissionGate>
      )}
      {(status === 'suspended' || status === 'inactive') && (
        <PermissionGate permission="beat_plans:activate">
          <button className="btn-primary" onClick={() => transition('active')}>Reactivate</button>
        </PermissionGate>
      )}
      {status !== 'archived' && (
        <PermissionGate permission="beat_plans:deactivate">
          <button className="btn-secondary" onClick={() => transition('archived')}>Archive</button>
        </PermissionGate>
      )}
    </div>
  );
}

function ScheduleTab({ beatPlanId }: { beatPlanId: string }) {
  const { schedules, createSchedule, deactivateSchedule, generateDates } = useBeatPlanSchedules(beatPlanId);
  const [form, setForm] = useState({
    frequency_type: 'weekly' as FrequencyType,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '' as string,
    weekdays: [] as number[],
    repeat_interval_days: '' as string,
    specific_dates: '' as string, // comma separated
    skip_holiday: false,
  });
  const { push } = useToast();
  const [genRange, setGenRange] = useState({ from: new Date().toISOString().slice(0, 10), to: '' });

  const toggleWeekday = (d: number) => {
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] }));
  };

  const submit = async () => {
    const { error } = await createSchedule({
      frequency_type: form.frequency_type,
      start_date: form.start_date,
      end_date: form.end_date || null,
      weekdays: form.weekdays,
      repeat_interval_days: form.repeat_interval_days ? Number(form.repeat_interval_days) : null,
      specific_dates: form.specific_dates ? form.specific_dates.split(',').map((s) => s.trim()).filter(Boolean) : [],
      skip_holiday: form.skip_holiday,
    });
    if (error) { push('error', error); return; }
    push('success', 'Schedule rule added.');
  };

  const handleGenerate = async (scheduleId: string) => {
    if (!genRange.to) { push('error', 'Pick an end date for the generation range.'); return; }
    const { data, error } = await generateDates(scheduleId, genRange.from, genRange.to);
    if (error) { push('error', error); return; }
    push('success', `${data} new visit date(s) generated (duplicates skipped automatically).`);
  };

  const needsWeekdays = ['weekly', 'biweekly', 'specific_weekdays', 'first_week', 'second_week', 'third_week', 'last_week'].includes(form.frequency_type);
  const needsInterval = form.frequency_type === 'every_n_days';
  const needsDates = form.frequency_type === 'specific_dates' || form.frequency_type === 'custom_calendar';

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 font-semibold">Add Recurrence Rule</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Frequency Type</label>
            <select className="input" value={form.frequency_type} onChange={(e) => setForm({ ...form, frequency_type: e.target.value as FrequencyType })}>
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date (optional)</label>
            <input type="date" className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          {needsWeekdays && (
            <div className="sm:col-span-3">
              <label className="label">Weekdays</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button key={idx} type="button" onClick={() => toggleWeekday(idx)}
                    className={`rounded-md px-3 py-1 text-sm ${form.weekdays.includes(idx) ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsInterval && (
            <div>
              <label className="label">Repeat Every N Days</label>
              <input type="number" className="input" value={form.repeat_interval_days} onChange={(e) => setForm({ ...form, repeat_interval_days: e.target.value })} />
            </div>
          )}
          {needsDates && (
            <div className="sm:col-span-3">
              <label className="label">Specific Dates (comma-separated, YYYY-MM-DD)</label>
              <input className="input" value={form.specific_dates} onChange={(e) => setForm({ ...form, specific_dates: e.target.value })} placeholder="2026-08-05, 2026-08-19" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="skip_holiday" checked={form.skip_holiday} onChange={(e) => setForm({ ...form, skip_holiday: e.target.checked })} />
            <label htmlFor="skip_holiday" className="text-sm">Skip on holidays</label>
          </div>
        </div>
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Note: no holiday calendar exists yet in this build, so this flag is stored but has no holiday data to check against.
        </p>
        <div className="mt-4">
          <button className="btn-primary" onClick={submit}>Add Rule</button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-semibold">Active Rules</h3>
        {schedules.length === 0 && <p className="text-sm text-slate-500">No recurrence rules yet.</p>}
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">{s.frequency_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500">
                    From {s.start_date}{s.end_date ? ` to ${s.end_date}` : ' (no end date)'}
                    {s.weekdays.length > 0 && ` — ${s.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}`}
                    {s.repeat_interval_days ? ` — every ${s.repeat_interval_days} days` : ''}
                  </p>
                </div>
                {s.is_active && (
                  <button className="btn-secondary !py-1 text-xs" onClick={() => deactivateSchedule(s.id)}>Deactivate</button>
                )}
              </div>
              {s.is_active && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <label className="label">Generate dates from</label>
                    <input type="date" className="input !py-1" value={genRange.from} onChange={(e) => setGenRange({ ...genRange, from: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">to</label>
                    <input type="date" className="input !py-1" value={genRange.to} onChange={(e) => setGenRange({ ...genRange, to: e.target.value })} />
                  </div>
                  <button className="btn-secondary !py-1.5 text-xs" onClick={() => handleGenerate(s.id)}>
                    <CalendarClock size={14} /> Generate Visit Dates
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ScheduleDatesPreview beatPlanId={beatPlanId} />
    </div>
  );
}

function ScheduleDatesPreview({ beatPlanId }: { beatPlanId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const { dates, loading } = useBeatPlanScheduleDates(beatPlanId, today, in60);

  return (
    <div className="card p-4">
      <h3 className="mb-3 font-semibold">Upcoming Materialized Visit Dates (next 60 days)</h3>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : dates.length === 0 ? (
        <p className="text-sm text-slate-500">No dates generated yet — add a rule above and generate dates.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <span key={d.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{d.visit_date}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomersTab({ beatPlanId }: { beatPlanId: string }) {
  const { assignments, assignCustomer, removeCustomer } = useBeatPlanCustomers(beatPlanId);
  const { customers } = useCustomers();
  const { push } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [sequence, setSequence] = useState(1);

  const unassignedCustomers = customers.filter((c) => !assignments.some((a) => a.customer_id === c.id));

  const handleAssign = async () => {
    if (!selectedCustomerId) return;
    const { error } = await assignCustomer({ customerId: selectedCustomerId, beatPlanId, visitSequence: sequence });
    if (error) { push('error', error); return; }
    push('success', 'Customer assigned to beat plan.');
    setPickerOpen(false);
    setSelectedCustomerId('');
  };

  const handleRemove = async (id: string) => {
    const reason = prompt('Reason for removing this customer from the beat plan:') ?? '';
    const { error } = await removeCustomer(id, reason);
    if (error) push('error', error); else push('success', 'Customer removed from beat plan.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Assigned Customers ({assignments.length})</h3>
        <PermissionGate permission="beat_plans:assign_customers">
          <button className="btn-primary" onClick={() => { setSequence(assignments.length + 1); setPickerOpen(true); }}>
            <Plus size={16} /> Assign Customer
          </button>
        </PermissionGate>
      </div>

      {pickerOpen && (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Customer</label>
            <select className="input" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {unassignedCustomers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sequence</label>
            <input type="number" className="input w-24" value={sequence} onChange={(e) => setSequence(Number(e.target.value))} />
          </div>
          <button className="btn-primary" onClick={handleAssign}>Confirm</button>
          <button className="btn-secondary" onClick={() => setPickerOpen(false)}>Cancel</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Seq</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Preferred Time</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">{a.visit_sequence}</td>
                <td className="p-3">{a.customer?.customer_code} — {a.customer?.business_name}</td>
                <td className="p-3 capitalize">{a.priority}</td>
                <td className="p-3">{a.preferred_visit_start_time ?? '—'}</td>
                <td className="p-3 text-right">
                  <PermissionGate permission="beat_plans:assign_customers">
                    <button className="text-red-600 hover:underline" onClick={() => handleRemove(a.id)}>
                      <Trash2 size={14} className="inline" /> Remove
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-slate-400">No customers assigned yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapacityTab({ beatPlanId }: { beatPlanId: string }) {
  const { validateCapacity } = useBeatPlans();
  const [checks, setChecks] = useState<CapacityCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const run = async () => {
    setLoading(true);
    const { data, error } = await validateCapacity(beatPlanId);
    if (error) { push('error', error); setLoading(false); return; }
    setChecks(data ?? []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={run} disabled={loading}>
        <ShieldCheck size={16} /> {loading ? 'Checking…' : 'Run Capacity Validation'}
      </button>
      {checks && (
        <div className="space-y-2">
          {checks.map((c) => (
            <div key={c.check_name} className={`rounded-lg border p-3 ${c.passed ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20'}`}>
              <p className="font-medium capitalize">{c.check_name.replace(/_/g, ' ')} — {c.passed ? 'OK' : 'Warning'}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{c.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ beatPlanId }: { beatPlanId: string }) {
  const { history, loading } = useBeatPlanStatusHistory(beatPlanId);
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div key={h.id} className="card p-3 text-sm">
          <p><span className="capitalize">{h.old_status ?? 'created'}</span> → <span className="font-medium capitalize">{h.new_status}</span></p>
          {h.reason && <p className="text-slate-500">Reason: {h.reason}</p>}
          <p className="text-xs text-slate-400">{new Date(h.changed_at).toLocaleString()}</p>
        </div>
      ))}
      {history.length === 0 && <p className="text-sm text-slate-500">No status changes yet.</p>}
    </div>
  );
}

export function BeatPlanDetailPage() {
  const { beatPlanId } = useParams();
  const navigate = useNavigate();
  const { beatPlan, loading, reload } = useBeatPlan(beatPlanId);
  const [tab, setTab] = useState<Tab>('overview');

  if (loading || !beatPlan) return <p className="text-center text-slate-400">Loading…</p>;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: MapPinned },
    { key: 'schedule', label: 'Schedule', icon: CalendarClock },
    { key: 'customers', label: 'Customers', icon: Users },
    { key: 'capacity', label: 'Capacity', icon: ShieldCheck },
    { key: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/routes/beat-plans')}>
        <ArrowLeft size={14} /> Back to Beat Plans
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{beatPlan.beat_code} — {beatPlan.beat_name}</h1>
          <p className="text-sm text-slate-500 capitalize">{beatPlan.status} · {beatPlan.priority} priority</p>
        </div>
        <StatusActions beatPlanId={beatPlan.id} status={beatPlan.status} onChanged={reload} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div><p className="label">Description</p><p>{beatPlan.description ?? '—'}</p></div>
          <div><p className="label">Effective From</p><p>{beatPlan.effective_from}</p></div>
          <div><p className="label">Effective To</p><p>{beatPlan.effective_to ?? 'No end date'}</p></div>
          <div><p className="label">Expected Start</p><p>{beatPlan.expected_start_time ?? '—'}</p></div>
          <div><p className="label">Expected End</p><p>{beatPlan.expected_end_time ?? '—'}</p></div>
          <div><p className="label">Expected Route Duration</p><p>{beatPlan.expected_route_duration_minutes ? `${beatPlan.expected_route_duration_minutes} min` : '—'}</p></div>
          <div><p className="label">Expected Travel Time</p><p>{beatPlan.expected_travel_time_minutes ? `${beatPlan.expected_travel_time_minutes} min` : '—'}</p></div>
          <div><p className="label">Expected Visit Duration</p><p>{beatPlan.expected_customer_visit_minutes ? `${beatPlan.expected_customer_visit_minutes} min` : '—'}</p></div>
          <div><p className="label">Notes</p><p>{beatPlan.notes ?? '—'}</p></div>
        </div>
      )}
      {tab === 'schedule' && <ScheduleTab beatPlanId={beatPlan.id} />}
      {tab === 'customers' && <CustomersTab beatPlanId={beatPlan.id} />}
      {tab === 'capacity' && <CapacityTab beatPlanId={beatPlan.id} />}
      {tab === 'history' && <HistoryTab beatPlanId={beatPlan.id} />}
    </div>
  );
}
