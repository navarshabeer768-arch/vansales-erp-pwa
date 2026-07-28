import { useState } from 'react';
import { Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { usePlatformBranches, PlatformBranch } from '@/hooks/usePlatformOverview';
import { useAllCompanies } from '@/hooks/useAllCompanies';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastContext';

function AddBranchModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { companies } = useAllCompanies();
  const { createBranch } = usePlatformBranches();
  const { push } = useToast();
  const [companyId, setCompanyId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setCompanyId(''); setCode(''); setName(''); setAddress(''); };

  const submit = async () => {
    if (!companyId || !code.trim() || !name.trim()) {
      push('error', 'Select a company and fill in code and name.');
      return;
    }
    setSubmitting(true);
    const { error } = await createBranch({ companyId, code: code.trim(), name: name.trim(), address: address.trim() || undefined });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Branch created.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add branch" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Company *</label>
          <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Select a company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code *</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="WH-01" />
          </div>
          <div>
            <label className="label">Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Warehouse" />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Add branch'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PlatformBranchesPage() {
  const { branches, loading, reload } = usePlatformBranches();
  const [addOpen, setAddOpen] = useState(false);

  const columns: Column<PlatformBranch>[] = [
    { key: 'name', header: 'Branch', sortValue: (r) => r.name, render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.code}</p></div>
    ) },
    { key: 'company', header: 'Company', sortValue: (r) => r.company?.name ?? '', render: (r) => r.company?.name ?? '—' },
    { key: 'address', header: 'Address', render: (r) => r.address ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Branches</h1>
          <p className="text-sm text-slate-500">Every warehouse across every company on the platform.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add branch</button>
      </div>

      {branches.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-10 text-center shadow-sm">
          <WarehouseIcon className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600">No branches yet</p>
        </div>
      ) : (
        <DataTable
          columns={columns} rows={branches} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search branches or companies…"
          searchFn={(r, q) => r.name.toLowerCase().includes(q) || (r.company?.name ?? '').toLowerCase().includes(q)}
        />
      )}

      <AddBranchModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={reload} />
    </div>
  );
}
