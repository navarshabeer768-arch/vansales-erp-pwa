import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Star, MapPin } from 'lucide-react';
import { useCustomerMaster, CustomerStatus } from '@/hooks/useCustomerMaster';
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses';
import { useCustomerContacts } from '@/hooks/useCustomerContacts';
import { useCustomerAssignments, useCustomerHistory, useCustomerAuditHistory, CustomerRoleCode } from '@/hooks/useCustomerAssignments';
import { useAssignableStaff } from '@/hooks/useVanAssignments';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_BADGE: Record<CustomerStatus, string> = {
  draft: 'badge-slate', pending_approval: 'badge-amber', active: 'badge-green', inactive: 'badge-slate',
  blocked: 'badge-red', suspended: 'badge-red', archived: 'badge-slate', deleted: 'badge-red',
};
const STATUS_OPTIONS: CustomerStatus[] = ['draft', 'pending_approval', 'active', 'inactive', 'blocked', 'suspended', 'archived'];
const ROLE_OPTIONS: CustomerRoleCode[] = ['salesman', 'collector', 'supervisor', 'driver', 'helper', 'manager', 'stock_keeper'];

function OverviewTab({ customer }: { customer: any }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="card p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1"><span className={STATUS_BADGE[customer.status as CustomerStatus]}>{customer.status.replace('_', ' ')}</span></p></div>
      <div className="card p-3"><p className="text-xs text-slate-500">Outstanding balance</p><p className="mt-1 text-lg font-bold">{customer.outstanding_balance.toFixed(2)}</p></div>
      <div className="card p-3"><p className="text-xs text-slate-500">Credit limit</p><p className="mt-1 text-lg font-bold">{customer.credit_limit.toFixed(2)}</p></div>
      <div className="card p-3"><p className="text-xs text-slate-500">Route / Van</p><p className="mt-1 font-medium">{customer.route?.name ?? '—'} / {customer.van?.name ?? '—'}</p></div>
    </div>
  );
}

function GeneralTab({ customer, onSave }: { customer: any; onSave: (patch: any) => void }) {
  const [form, setForm] = useState({
    business_name: customer.business_name, arabic_name: customer.arabic_name ?? '', display_name: customer.display_name ?? '',
    email: customer.email ?? '', website: customer.website ?? '', primary_phone: customer.primary_phone ?? '',
    secondary_phone: customer.secondary_phone ?? '', whatsapp: customer.whatsapp ?? '', tax_number: customer.tax_number ?? '',
    commercial_registration: customer.commercial_registration ?? '', business_license: customer.business_license ?? '',
  });
  return (
    <div className="card space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Business name</label><input className="input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
        <div><label className="label">Arabic name</label><input className="input" value={form.arabic_name} onChange={(e) => setForm({ ...form, arabic_name: e.target.value })} /></div>
        <div><label className="label">Display name</label><input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">Website</label><input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
        <div><label className="label">Primary phone</label><input className="input" value={form.primary_phone} onChange={(e) => setForm({ ...form, primary_phone: e.target.value })} /></div>
        <div><label className="label">Secondary phone</label><input className="input" value={form.secondary_phone} onChange={(e) => setForm({ ...form, secondary_phone: e.target.value })} /></div>
        <div><label className="label">WhatsApp</label><input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
        <div><label className="label">Tax number</label><input className="input" value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} /></div>
        <div><label className="label">Commercial registration</label><input className="input" value={form.commercial_registration} onChange={(e) => setForm({ ...form, commercial_registration: e.target.value })} /></div>
        <div><label className="label">Business license</label><input className="input" value={form.business_license} onChange={(e) => setForm({ ...form, business_license: e.target.value })} /></div>
      </div>
      <div className="flex justify-end">
        <PermissionGate permission="customers:edit">
          <button className="btn-primary" onClick={() => onSave(form)}>Save changes</button>
        </PermissionGate>
      </div>
    </div>
  );
}

function AddressesTab({ customerId }: { customerId: string }) {
  const { addresses, createAddress } = useCustomerAddresses(customerId);
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ address_type: 'delivery', address_name: '', building: '', street: '', area: '', city: '', country: '', phone_number: '' });

  const submit = async () => {
    const { error } = await createAddress(form as any);
    push(error ? 'error' : 'success', error ?? 'Address added.');
    if (!error) setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <PermissionGate permission="customers:edit">
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add address</button>
        </PermissionGate>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {addresses.length === 0 ? <p className="text-sm text-slate-400">No addresses yet.</p> : addresses.map((a) => (
          <div key={a.id} className="card space-y-1 p-4">
            <div className="flex items-center justify-between">
              <span className="badge-slate capitalize">{a.address_type}</span>
              {a.is_default_delivery && <span className="badge-green">Default delivery</span>}
            </div>
            <p className="font-medium">{a.address_name ?? '—'}</p>
            <p className="text-sm text-slate-500">{[a.building, a.street, a.area, a.city].filter(Boolean).join(', ') || '—'}</p>
            {a.phone_number && <p className="text-xs text-slate-500">{a.phone_number}</p>}
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add address" size="sm">
        <div className="space-y-3">
          <select className="input" value={form.address_type} onChange={(e) => setForm({ ...form, address_type: e.target.value })}>
            {['billing', 'delivery', 'office', 'warehouse', 'shop', 'branch', 'custom'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input" placeholder="Address name" value={form.address_name} onChange={(e) => setForm({ ...form, address_name: e.target.value })} />
          <input className="input" placeholder="Building" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
          <input className="input" placeholder="Street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          <input className="input" placeholder="Area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          <button className="btn-primary w-full" onClick={submit}>Save address</button>
        </div>
      </Modal>
    </div>
  );
}

function ContactsTab({ customerId }: { customerId: string }) {
  const { contacts, createContact, removeContact } = useCustomerContacts(customerId);
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');

  const submit = async () => {
    if (!name.trim()) { push('error', 'Contact name is required.'); return; }
    const { error } = await createContact({ contact_name: name, designation, phone });
    push(error ? 'error' : 'success', error ?? 'Contact added.');
    if (!error) { setOpen(false); setName(''); setDesignation(''); setPhone(''); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <PermissionGate permission="customers:edit">
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add contact</button>
        </PermissionGate>
      </div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Name</th><th>Designation</th><th>Phone</th><th>Authorized</th><th></th></tr></thead>
          <tbody>
            {contacts.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">No contacts yet.</td></tr> : contacts.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.contact_name} {c.is_primary && <Star size={12} className="ml-1 inline fill-amber-400 text-amber-400" />}</td>
                <td>{c.designation ?? '—'}</td>
                <td>{c.phone ?? '—'}</td>
                <td className="text-xs">
                  {[c.is_authorized_buyer && 'Buyer', c.is_authorized_receiver && 'Receiver', c.is_authorized_payment_contact && 'Payment'].filter(Boolean).join(', ') || '—'}
                </td>
                <td><button onClick={() => removeContact(c.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add contact" size="sm">
        <div className="space-y-3">
          <input className="input" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn-primary w-full" onClick={submit}>Save contact</button>
        </div>
      </Modal>
    </div>
  );
}

function AssignmentsTab({ customerId }: { customerId: string }) {
  const { activeByEmployee, assignEmployee, removeAssignment } = useCustomerAssignments(customerId);
  const staff = useAssignableStaff();
  const { push } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [roleCode, setRoleCode] = useState<CustomerRoleCode>('salesman');

  const submit = async () => {
    if (!employeeId) { push('error', 'Select an employee.'); return; }
    const { error } = await assignEmployee(employeeId, roleCode);
    push(error ? 'error' : 'success', error ?? 'Employee assigned.');
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <div>
          <label className="label">Employee</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={roleCode} onChange={(e) => setRoleCode(e.target.value as CustomerRoleCode)}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={submit}>Assign</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from(activeByEmployee.entries()).length === 0 ? (
          <p className="text-sm text-slate-400">No employees assigned yet — an employee can hold several roles at once.</p>
        ) : Array.from(activeByEmployee.entries()).map(([empId, list]) => (
          <div key={empId} className="card space-y-2 p-3">
            <p className="font-medium">{list[0].employee?.full_name}</p>
            <div className="flex flex-wrap gap-1">
              {list.map((a) => (
                <span key={a.id} className="badge-slate flex items-center gap-1 capitalize">
                  {a.role_code}
                  <button onClick={() => removeAssignment(a.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={10} /></button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityAndAuditTab({ customerId }: { customerId: string }) {
  const { reassignments, statusHistory } = useCustomerHistory(customerId);
  const { entries } = useCustomerAuditHistory(customerId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Status history</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>From</th><th>To</th><th>Reason</th><th>When</th></tr></thead>
            <tbody>
              {statusHistory.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-slate-400">No status changes yet.</td></tr> : statusHistory.map((s) => (
                <tr key={s.id}><td>{s.old_status ?? '—'}</td><td>{s.new_status}</td><td>{s.reason ?? '—'}</td><td>{new Date(s.changed_at).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Reassignment history</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Field</th><th>When</th></tr></thead>
            <tbody>
              {reassignments.length === 0 ? <tr><td colSpan={2} className="py-6 text-center text-slate-400">No reassignments yet.</td></tr> : reassignments.map((r) => (
                <tr key={r.id}><td className="capitalize">{r.field_name.replace('_id', '')}</td><td>{new Date(r.changed_at).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Audit log</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={3} className="py-6 text-center text-slate-400">No audit entries yet.</td></tr> : entries.map((e) => (
                <tr key={e.id}><td className="capitalize">{e.action}</td><td>{e.user?.full_name ?? '—'}</td><td>{new Date(e.created_at).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CustomerProfilePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { customers, updateCustomer, changeStatus } = useCustomerMaster();
  const { push } = useToast();
  const [tab, setTab] = useState('overview');

  const customer = customers.find((c) => c.id === customerId);

  if (!customer) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSaveGeneral = async (patch: any) => {
    const { error } = await updateCustomer(customer.id, patch);
    push(error ? 'error' : 'success', error ?? 'Saved.');
  };

  const handleStatusChange = async (newStatus: CustomerStatus) => {
    const { error } = await changeStatus(customer.id, newStatus);
    push(error ? 'error' : 'success', error ?? 'Status updated.');
  };

  const tabs = [
    { key: 'overview', label: 'Overview' }, { key: 'general', label: 'General Information' },
    { key: 'addresses', label: 'Addresses' }, { key: 'contacts', label: 'Contacts' },
    { key: 'assignments', label: 'Assignments' }, { key: 'notes', label: 'Notes' },
    { key: 'documents', label: 'Documents' }, { key: 'bank', label: 'Bank Details' },
    { key: 'financial', label: 'Financial' }, { key: 'activity', label: 'Activity & Audit History' },
  ];

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/customers')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft size={14} /> Back to Customer Master</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{customer.business_name}</h1>
          <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin size={12} /> {customer.customer_code} · {customer.area ?? 'No area set'}</p>
        </div>
        <PermissionGate permission="customers:edit">
          <select className="input !w-auto" value={customer.status} onChange={(e) => handleStatusChange(e.target.value as CustomerStatus)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-xs font-medium sm:text-sm ${tab === t.key ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab customer={customer} />}
      {tab === 'general' && <GeneralTab customer={customer} onSave={handleSaveGeneral} />}
      {tab === 'addresses' && <AddressesTab customerId={customer.id} />}
      {tab === 'contacts' && <ContactsTab customerId={customer.id} />}
      {tab === 'assignments' && <AssignmentsTab customerId={customer.id} />}
      {tab === 'notes' && (
        <div className="card space-y-3 p-4">
          <label className="label">Notes</label>
          <textarea className="input" rows={3} defaultValue={customer.notes ?? ''} onBlur={(e) => handleSaveGeneral({ notes: e.target.value })} />
          <label className="label">Internal remarks</label>
          <textarea className="input" rows={3} defaultValue={customer.internal_remarks ?? ''} onBlur={(e) => handleSaveGeneral({ internal_remarks: e.target.value })} />
        </div>
      )}
      {tab === 'documents' && <div className="card p-10 text-center text-sm text-slate-400">Documents — coming in Part 2.</div>}
      {tab === 'bank' && <div className="card p-10 text-center text-sm text-slate-400">Bank Details — coming in Part 2.</div>}
      {tab === 'financial' && <div className="card p-10 text-center text-sm text-slate-400">Financial — coming in Part 2.</div>}
      {tab === 'activity' && <ActivityAndAuditTab customerId={customer.id} />}
    </div>
  );
}
