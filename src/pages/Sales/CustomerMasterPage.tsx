import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, LayoutGrid, Table as TableIcon, CheckSquare, Square, Wallet, Tag } from 'lucide-react';
import { useCustomerMaster, CustomerMaster, CustomerStatus, CustomerFilters } from '@/hooks/useCustomerMaster';
import { useCustomerTypes, useCustomerGroups, useCustomerCategories, useCustomerChannels, useTerritories } from '@/hooks/useCustomerLookups';
import { useRoutes } from '@/hooks/useRoutes';
import { useVans } from '@/hooks/useVans';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import { NewCustomerModal } from '@/components/customers/NewCustomerModal';

const STATUS_BADGE: Record<CustomerStatus, string> = {
  draft: 'badge-slate', pending_approval: 'badge-amber', active: 'badge-green', inactive: 'badge-slate',
  blocked: 'badge-red', suspended: 'badge-red', archived: 'badge-slate', deleted: 'badge-red',
};

export function CustomerMasterPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CustomerFilters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  const { customers, loading, bulkUpdate } = useCustomerMaster(filters);
  const { items: types } = useCustomerTypes();
  const { groups } = useCustomerGroups();
  const { items: categories } = useCustomerCategories();
  const { items: channels } = useCustomerChannels();
  const { territories } = useTerritories();
  const { routes } = useRoutes();
  const { vans } = useVans();
  const { push } = useToast();

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.business_name.toLowerCase().includes(q) || c.customer_code.toLowerCase().includes(q)
      || (c.primary_phone ?? '').includes(q) || (c.whatsapp ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q)
      || (c.route?.name ?? '').toLowerCase().includes(q) || (c.area ?? '').toLowerCase().includes(q)
      || (c.assigned_employee?.full_name ?? '').toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id))));
  };

  const runBulk = async (patch: Partial<CustomerMaster>, label: string) => {
    if (selected.size === 0) { push('error', 'Select at least one customer.'); return; }
    const { error } = await bulkUpdate(Array.from(selected), patch);
    push(error ? 'error' : 'success', error ?? `${label} applied to ${selected.size} customer(s).`);
    if (!error) setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Master</h1>
          <p className="text-sm text-slate-500">The single customer record used by Sales, Collections, Returns, Visits, Route Planning, and Reports.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate('/customers/credit-dashboard')}><Wallet size={16} /> Credit Dashboard</button>
          <button className="btn-secondary" onClick={() => navigate('/customers/pricing-dashboard')}><Tag size={16} /> Pricing Dashboard</button>
          <PermissionGate permission="customers:create">
            <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New customer</button>
          </PermissionGate>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-8" placeholder="Code, name, phone, WhatsApp, email, route, area, employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            <button onClick={() => setView('table')} className={`rounded p-1.5 ${view === 'table' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30' : 'text-slate-400'}`}><TableIcon size={16} /></button>
            <button onClick={() => setView('card')} className={`rounded p-1.5 ${view === 'card' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30' : 'text-slate-400'}`}><LayoutGrid size={16} /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto" value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as CustomerStatus })}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select className="input !w-auto" value={filters.typeId ?? ''} onChange={(e) => setFilters({ ...filters, typeId: e.target.value || undefined })}>
            <option value="">All types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="input !w-auto" value={filters.groupId ?? ''} onChange={(e) => setFilters({ ...filters, groupId: e.target.value || undefined })}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select className="input !w-auto" value={filters.categoryId ?? ''} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value || undefined })}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input !w-auto" value={filters.channelId ?? ''} onChange={(e) => setFilters({ ...filters, channelId: e.target.value || undefined })}>
            <option value="">All channels</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input !w-auto" value={filters.territoryId ?? ''} onChange={(e) => setFilters({ ...filters, territoryId: e.target.value || undefined })}>
            <option value="">All territories</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input !w-auto" value={filters.routeId ?? ''} onChange={(e) => setFilters({ ...filters, routeId: e.target.value || undefined })}>
            <option value="">All routes</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input !w-auto" value={filters.vanId ?? ''} onChange={(e) => setFilters({ ...filters, vanId: e.target.value || undefined })}>
            <option value="">All vans</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {Object.keys(filters).length > 0 && (
            <button className="btn-ghost text-xs" onClick={() => setFilters({})}>Clear filters</button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-900/20">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <PermissionGate permission="customers:edit">
            <button className="btn-secondary !py-1" onClick={() => runBulk({ status: 'active' }, 'Activate')}>Activate</button>
            <button className="btn-secondary !py-1" onClick={() => runBulk({ status: 'inactive' }, 'Deactivate')}>Deactivate</button>
          </PermissionGate>
          <PermissionGate permission="customers:export">
            <button className="btn-secondary !py-1" onClick={() => push('info', 'Use each list\'s own export — bulk export coming from the same data.')}>Export</button>
          </PermissionGate>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm text-slate-500">No customers match — adjust your search or filters.</p>
        </div>
      ) : view === 'table' ? (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10"><button onClick={toggleSelectAll}>{selected.size === filtered.length ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>
                <th>Code</th><th>Name</th><th>Type</th><th>Group</th><th>Route</th><th>Van</th><th>Employee</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td onClick={(e) => e.stopPropagation()}><button onClick={() => toggleSelect(c.id)}>{selected.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                  <td onClick={() => navigate(`/customers/${c.id}`)} className="font-medium">{c.customer_code}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.business_name}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.customer_type?.label ?? '—'}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.group?.name ?? '—'}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.route?.name ?? '—'}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.van?.name ?? '—'}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}>{c.assigned_employee?.full_name ?? '—'}</td>
                  <td onClick={() => navigate(`/customers/${c.id}`)}><span className={STATUS_BADGE[c.status]}>{c.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="card cursor-pointer space-y-2 p-4 hover:border-brand-300">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{c.business_name}</p>
                  <p className="text-xs text-slate-500">{c.customer_code}</p>
                </div>
                <span className={STATUS_BADGE[c.status]}>{c.status.replace('_', ' ')}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-500">
                <p>Type: {c.customer_type?.label ?? '—'}</p>
                <p>Group: {c.group?.name ?? '—'}</p>
                <p>Route: {c.route?.name ?? '—'}</p>
                <p>Van: {c.van?.name ?? '—'}</p>
              </div>
              {c.primary_phone && <p className="text-xs text-slate-500">📞 {c.primary_phone}</p>}
            </div>
          ))}
        </div>
      )}

      <NewCustomerModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => navigate(`/customers/${id}`)} />
    </div>
  );
}
