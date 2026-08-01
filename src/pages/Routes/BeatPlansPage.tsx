import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPinned } from 'lucide-react';
import { useBeatPlans, BeatPlanInput, BeatPlanStatus } from '@/hooks/useBeatPlans';
import { useBeatPlanLookups } from '@/hooks/useBeatPlanLookups';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { BeatPlan } from '@/hooks/useBeatPlans';

const STATUS_STYLES: Record<BeatPlanStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  inactive: 'bg-slate-100 text-slate-500 dark:bg-slate-800',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  archived: 'bg-slate-100 text-slate-400 dark:bg-slate-800',
};

function StatusBadge({ status }: { status: BeatPlanStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>{status}</span>;
}

function CreateBeatPlanModal({ open, onClose, onCreate }: {
  open: boolean; onClose: () => void; onCreate: (input: BeatPlanInput) => Promise<void>;
}) {
  const { branches, territories, routes, vans } = useBeatPlanLookups();
  const [form, setForm] = useState<BeatPlanInput>({
    beat_code: '', beat_name: '', effective_from: new Date().toISOString().slice(0, 10), priority: 'medium',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.beat_code || !form.beat_name) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Beat Plan" size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Beat Code *</label>
          <input className="input" value={form.beat_code} onChange={(e) => setForm({ ...form, beat_code: e.target.value })} />
        </div>
        <div>
          <label className="label">Beat Name *</label>
          <input className="input" value={form.beat_name} onChange={(e) => setForm({ ...form, beat_name: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <input className="input" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Branch</label>
          <select className="input" value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Territory</label>
          <select className="input" value={form.territory_id ?? ''} onChange={(e) => setForm({ ...form, territory_id: e.target.value || null })}>
            <option value="">—</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Area</label>
          <input className="input" value={form.area ?? ''} onChange={(e) => setForm({ ...form, area: e.target.value })} />
        </div>
        <div>
          <label className="label">Route</label>
          <select className="input" value={form.route_id ?? ''} onChange={(e) => setForm({ ...form, route_id: e.target.value || null })}>
            <option value="">—</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Default Van</label>
          <select className="input" value={form.default_van_id ?? ''} onChange={(e) => setForm({ ...form, default_van_id: e.target.value || null })}>
            <option value="">—</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Effective From *</label>
          <input type="date" className="input" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
        </div>
        <div>
          <label className="label">Effective To</label>
          <input type="date" className="input" value={form.effective_to ?? ''} onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })} />
        </div>
        <div>
          <label className="label">Expected Start Time</label>
          <input type="time" className="input" value={form.expected_start_time ?? ''} onChange={(e) => setForm({ ...form, expected_start_time: e.target.value || null })} />
        </div>
        <div>
          <label className="label">Expected End Time</label>
          <input type="time" className="input" value={form.expected_end_time ?? ''} onChange={(e) => setForm({ ...form, expected_end_time: e.target.value || null })} />
        </div>
        <div>
          <label className="label">Expected Travel Time (min)</label>
          <input type="number" className="input" value={form.expected_travel_time_minutes ?? ''} onChange={(e) => setForm({ ...form, expected_travel_time_minutes: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label className="label">Expected Visit Duration (min)</label>
          <input type="number" className="input" value={form.expected_customer_visit_minutes ?? ''} onChange={(e) => setForm({ ...form, expected_customer_visit_minutes: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={saving || !form.beat_code || !form.beat_name}>
          {saving ? 'Creating…' : 'Create Beat Plan'}
        </button>
      </div>
    </Modal>
  );
}

export function BeatPlansPage() {
  const { beatPlans, loading, createBeatPlan } = useBeatPlans();
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const { push } = useToast();

  const handleCreate = async (input: BeatPlanInput) => {
    const { data, error } = await createBeatPlan(input);
    if (error) { push('error', error); return; }
    push('success', 'Beat plan created as Draft.');
    setCreateOpen(false);
    if (data) navigate(`/routes/beat-plans/${(data as any).id}`);
  };

  const columns: Column<BeatPlan>[] = [
    {
      key: 'beat_code', header: 'Code', sortValue: (r) => r.beat_code,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/routes/beat-plans/${r.id}`)}>
          {r.beat_code}
        </button>
      ),
    },
    { key: 'beat_name', header: 'Name', sortValue: (r) => r.beat_name },
    { key: 'area', header: 'Area', render: (r) => r.area ?? '—' },
    { key: 'customer_count', header: 'Customers', render: (r) => r.customer_count ?? 0, className: 'text-center' },
    { key: 'priority', header: 'Priority', render: (r) => <span className="capitalize">{r.priority}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'effective_from', header: 'Effective From' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <MapPinned size={20} /> Beat Plans
          </h1>
          <p className="text-sm text-slate-500">Recurring customer visit patterns that generate Daily Visit Plans.</p>
        </div>
        <PermissionGate permission="beat_plans:create">
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New Beat Plan
          </button>
        </PermissionGate>
      </div>

      <DataTable
        columns={columns}
        rows={beatPlans}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search beat plans…"
        searchFn={(r, q) => r.beat_code.toLowerCase().includes(q.toLowerCase()) || r.beat_name.toLowerCase().includes(q.toLowerCase())}
        exportFilename="beat_plans"
      />

      <CreateBeatPlanModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </div>
  );
}
