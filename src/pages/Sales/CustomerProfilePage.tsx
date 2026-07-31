import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Star, MapPin } from 'lucide-react';
import { useCustomerMaster, CustomerStatus } from '@/hooks/useCustomerMaster';
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses';
import { useCustomerContacts } from '@/hooks/useCustomerContacts';
import { useCustomerAssignments, useCustomerHistory, useCustomerAuditHistory, CustomerRoleCode } from '@/hooks/useCustomerAssignments';
import { useAssignableStaff } from '@/hooks/useVanAssignments';
import { useCustomerCredit, useCreditHistory, CreditType, CreditStatus } from '@/hooks/useCustomerCredit';
import { useCreditApprovals } from '@/hooks/useCreditApprovals';
import { usePaymentTerms, useRiskLevels } from '@/hooks/useCreditLookups';
import { usePriceLists, useCustomerPriceLists } from '@/hooks/usePriceLists';
import { useCustomerProductPrices, useCustomerDiscounts, DiscountType } from '@/hooks/useCustomerPricingRules';
import { useCustomerOpeningBalance, useCustomerLedger } from '@/hooks/useCustomerFinancials';
import { useProducts } from '@/hooks/useProducts';
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

const CREDIT_STATUS_BADGE: Record<CreditStatus, string> = {
  normal: 'badge-green', warning: 'badge-amber', near_limit: 'badge-amber', over_limit: 'badge-red',
  blocked: 'badge-red', suspended: 'badge-red', inactive: 'badge-slate',
};

function FinancialTab({ customerId }: { customerId: string }) {
  const { profile, availableCredit, updateProfile, setStatus, changeType } = useCustomerCredit(customerId);
  const { submit: submitApproval } = useCreditApprovals(customerId);
  const { terms } = usePaymentTerms();
  const { levels } = useRiskLevels();
  const { history, statusHistory } = useCreditHistory(customerId);
  const { push } = useToast();

  const [tempAmount, setTempAmount] = useState('');
  const [tempExpiry, setTempExpiry] = useState('');
  const [tempReason, setTempReason] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [blockReason, setBlockReason] = useState('');

  if (!profile) return <p className="text-sm text-slate-400">Loading credit profile…</p>;

  const requestCreditIncrease = async () => {
    if (!newLimit) { push('error', 'Enter a new limit.'); return; }
    const { error } = profile.require_approval
      ? await submitApproval({ customerId, requestType: 'credit_increase', newValue: newLimit })
      : await updateProfile({ credit_limit: Number(newLimit) });
    push(error ? 'error' : 'success', error ?? (profile.require_approval ? 'Submitted for approval.' : 'Credit limit updated.'));
    if (!error) setNewLimit('');
  };

  const requestTemporaryCredit = async () => {
    if (!tempAmount || !tempExpiry) { push('error', 'Enter an amount and expiry date.'); return; }
    const { error } = await submitApproval({ customerId, requestType: 'temporary_credit', newValue: tempAmount, reason: tempReason, expiryDate: tempExpiry });
    push(error ? 'error' : 'success', error ?? 'Temporary credit requested — pending approval.');
    if (!error) { setTempAmount(''); setTempExpiry(''); setTempReason(''); }
  };

  const handleTypeChange = async (newType: CreditType) => {
    const { error } = await changeType(newType);
    push(error ? 'error' : 'success', error ?? 'Customer type updated.');
  };

  const handleBlock = async () => {
    const { error } = await setStatus('blocked', blockReason);
    push(error ? 'error' : 'success', error ?? 'Customer blocked.');
    setBlockReason('');
  };

  const handleUnblock = async () => {
    const { error } = await setStatus('normal', 'Manually unblocked');
    push(error ? 'error' : 'success', error ?? 'Customer unblocked.');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-3"><p className="text-xs text-slate-500">Credit status</p><p className="mt-1"><span className={CREDIT_STATUS_BADGE[profile.credit_status]}>{profile.credit_status.replace('_', ' ')}</span></p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Credit limit</p><p className="mt-1 text-lg font-bold">{profile.credit_limit.toFixed(2)}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Available credit</p><p className="mt-1 text-lg font-bold">{availableCredit?.toFixed(2) ?? '—'}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Temporary limit</p><p className="mt-1 text-lg font-bold">{profile.temporary_credit_limit?.toFixed(2) ?? '—'}</p>{profile.temporary_credit_expiry && <p className="text-xs text-slate-500">Until {profile.temporary_credit_expiry}</p>}</div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Customer type</label>
            <PermissionGate permission="customers:edit">
              <select className="input" value={profile.credit_type} onChange={(e) => handleTypeChange(e.target.value as CreditType)}>
                <option value="cash">Cash</option><option value="credit">Credit</option><option value="hybrid">Hybrid</option>
              </select>
            </PermissionGate>
          </div>
          <div>
            <label className="label">Default payment term</label>
            <select className="input" value={profile.default_payment_term_id ?? ''} onChange={(e) => updateProfile({ default_payment_term_id: e.target.value || null })}>
              <option value="">— None —</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Risk level</label>
            <select className="input" value={profile.risk_level_id ?? ''} onChange={(e) => updateProfile({ risk_level_id: e.target.value || null })}>
              <option value="">— Unrated —</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.allow_partial_payments} onChange={(e) => updateProfile({ allow_partial_payments: e.target.checked })} /> Allow partial payments</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.require_approval} onChange={(e) => updateProfile({ require_approval: e.target.checked })} /> Require approval for credit increase</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.block_on_overdue} onChange={(e) => updateProfile({ block_on_overdue: e.target.checked })} /> Block on overdue invoices</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.block_on_credit_limit} onChange={(e) => updateProfile({ block_on_credit_limit: e.target.checked })} /> Block on credit limit exceeded</label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card space-y-2 p-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Request credit increase</h3>
          <input type="number" className="input" placeholder="New credit limit" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} />
          <PermissionGate permission="customer_credit:edit">
            <button className="btn-primary w-full" onClick={requestCreditIncrease}>{profile.require_approval ? 'Submit for approval' : 'Update limit'}</button>
          </PermissionGate>
        </div>
        <div className="card space-y-2 p-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Request temporary credit</h3>
          <input type="number" className="input" placeholder="Temporary limit" value={tempAmount} onChange={(e) => setTempAmount(e.target.value)} />
          <input type="date" className="input" value={tempExpiry} onChange={(e) => setTempExpiry(e.target.value)} />
          <input className="input" placeholder="Reason" value={tempReason} onChange={(e) => setTempReason(e.target.value)} />
          <PermissionGate permission="customer_credit:temporary_credit">
            <button className="btn-primary w-full" onClick={requestTemporaryCredit}>Submit for approval</button>
          </PermissionGate>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Block / unblock</h3>
        {profile.credit_status === 'blocked' || profile.credit_status === 'suspended' ? (
          <PermissionGate permission="customer_credit:unblock">
            <button className="btn-primary" onClick={handleUnblock}>Unblock customer</button>
          </PermissionGate>
        ) : (
          <PermissionGate permission="customer_credit:block">
            <div className="flex gap-2">
              <input className="input" placeholder="Reason for blocking" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className="btn-danger shrink-0" onClick={handleBlock}>Block customer</button>
            </div>
          </PermissionGate>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Credit history</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Field</th><th>From</th><th>To</th><th>Reason</th><th>When</th></tr></thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-400">No credit changes yet.</td></tr> : history.map((h) => (
                <tr key={h.id}><td className="capitalize">{h.field_name.replace(/_/g, ' ')}</td><td>{h.old_value ?? '—'}</td><td>{h.new_value ?? '—'}</td><td>{h.reason ?? '—'}</td><td>{new Date(h.changed_at).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Credit status history</h3>
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
    </div>
  );
}

function PricingTab({ customerId }: { customerId: string }) {
  const { priceLists } = usePriceLists();
  const { assignments, assign, remove } = useCustomerPriceLists(customerId);
  const { prices, create: createPrice, remove: removePrice } = useCustomerProductPrices(customerId);
  const { discounts, create: createDiscount, cancel: cancelDiscount } = useCustomerDiscounts(customerId);
  const { products } = useProducts();
  const { balance, create: createOpeningBalance, approve: approveOB, reject: rejectOB } = useCustomerOpeningBalance(customerId);
  const { summary, transactions, aging } = useCustomerLedger(customerId);
  const { push } = useToast();

  const [selectedListId, setSelectedListId] = useState('');
  const [assignmentType, setAssignmentType] = useState<'default' | 'secondary' | 'temporary'>('default');

  const [priceProductId, setPriceProductId] = useState('');
  const [priceValue, setPriceValue] = useState(0);

  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountRequiresApproval, setDiscountRequiresApproval] = useState(false);

  const [obType, setObType] = useState<'debit' | 'credit'>('debit');
  const [obAmount, setObAmount] = useState(0);
  const [obRemarks, setObRemarks] = useState('');

  const handleAssignList = async () => {
    if (!selectedListId) { push('error', 'Select a price list.'); return; }
    const { error } = await assign(selectedListId, assignmentType);
    push(error ? 'error' : 'success', error ?? 'Price list assigned.');
  };

  const handleAddPrice = async () => {
    if (!priceProductId || priceValue <= 0) { push('error', 'Select a product and enter a price.'); return; }
    const { error } = await createPrice({ productId: priceProductId, price: priceValue });
    push(error ? 'error' : 'success', error ?? 'Customer price set.');
  };

  const handleAddDiscount = async () => {
    if (discountValue <= 0) { push('error', 'Enter a discount value.'); return; }
    const { error } = await createDiscount({ discountType, discountValue, requiresApproval: discountRequiresApproval });
    push(error ? 'error' : 'success', error ?? (discountRequiresApproval ? 'Discount submitted for approval.' : 'Discount added.'));
  };

  const handleCreateOpeningBalance = async () => {
    if (obAmount <= 0) { push('error', 'Enter an amount.'); return; }
    const { error } = await createOpeningBalance({ balanceType: obType, amount: obAmount, remarks: obRemarks });
    push(error ? 'error' : 'success', error ?? 'Opening balance recorded — pending approval.');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Assigned price lists</h3>
          <div className="flex gap-2">
            <select className="input" value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
              <option value="">Select a price list…</option>
              {priceLists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
            <select className="input !w-32" value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as any)}>
              <option value="default">Default</option><option value="secondary">Secondary</option><option value="temporary">Temporary</option>
            </select>
            <button className="btn-primary shrink-0" onClick={handleAssignList}>Assign</button>
          </div>
          <div className="space-y-1">
            {assignments.length === 0 ? <p className="text-sm text-slate-400">No price lists assigned — standard pricing applies.</p> : assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span>{a.price_list?.name} <span className="badge-slate ml-1 capitalize">{a.assignment_type}</span></span>
                <button onClick={() => remove(a.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-3 p-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Customer-specific product prices</h3>
          <div className="flex gap-2">
            <select className="input" value={priceProductId} onChange={(e) => setPriceProductId(e.target.value)}>
              <option value="">Select a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" className="input !w-28" placeholder="Price" value={priceValue} onChange={(e) => setPriceValue(Number(e.target.value))} />
            <button className="btn-primary shrink-0" onClick={handleAddPrice}>Set</button>
          </div>
          <div className="space-y-1">
            {prices.length === 0 ? <p className="text-sm text-slate-400">No customer-specific prices set.</p> : prices.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span>{p.product?.name}: {p.price.toFixed(2)}</span>
                <button onClick={() => removePrice(p.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Discounts</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select className="input !w-40" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
            <option value="percentage">Percentage</option><option value="fixed">Fixed</option><option value="product">Product</option>
            <option value="category">Category</option><option value="invoice">Invoice</option>
          </select>
          <input type="number" className="input !w-28" placeholder="Value" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} />
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={discountRequiresApproval} onChange={(e) => setDiscountRequiresApproval(e.target.checked)} /> Requires approval</label>
          <button className="btn-primary" onClick={handleAddDiscount}>Add discount</button>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="table-base">
            <thead><tr><th>Type</th><th>Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {discounts.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-slate-400">No discounts yet.</td></tr> : discounts.map((d) => (
                <tr key={d.id}>
                  <td className="capitalize">{d.discount_type}</td>
                  <td>{d.discount_value}{d.discount_type === 'percentage' ? '%' : ''}</td>
                  <td><span className={d.status === 'active' ? 'badge-green' : d.status === 'pending_approval' ? 'badge-amber' : 'badge-slate'}>{d.status.replace('_', ' ')}</span></td>
                  <td>{d.status === 'active' && <button onClick={() => cancelDiscount(d.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Opening balance</h3>
        {balance ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <span>{balance.balance_type === 'debit' ? 'Debit' : 'Credit'}: {balance.amount.toFixed(2)} — <span className={balance.status === 'approved' ? 'badge-green' : balance.status === 'rejected' ? 'badge-red' : 'badge-amber'}>{balance.status}</span></span>
            {balance.status === 'pending' && (
              <PermissionGate permission="customer_pricing:manage_opening_balances">
                <div className="flex gap-2">
                  <button className="btn-secondary !py-1" onClick={async () => { const { error } = await approveOB(); push(error ? 'error' : 'success', error ?? 'Approved and posted.'); }}>Approve</button>
                  <button className="btn-danger !py-1" onClick={async () => { const { error } = await rejectOB('Rejected by user'); push(error ? 'error' : 'success', error ?? 'Rejected.'); }}>Reject</button>
                </div>
              </PermissionGate>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <select className="input !w-28" value={obType} onChange={(e) => setObType(e.target.value as 'debit' | 'credit')}>
              <option value="debit">Debit</option><option value="credit">Credit</option>
            </select>
            <input type="number" className="input !w-32" placeholder="Amount" value={obAmount} onChange={(e) => setObAmount(Number(e.target.value))} />
            <input className="input" placeholder="Remarks" value={obRemarks} onChange={(e) => setObRemarks(e.target.value)} />
            <PermissionGate permission="customer_pricing:manage_opening_balances">
              <button className="btn-primary" onClick={handleCreateOpeningBalance}>Record opening balance</button>
            </PermissionGate>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Account summary</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <p className="text-slate-500">Opening balance</p><p className="text-right font-medium">{summary?.opening_balance.toFixed(2) ?? '0.00'}</p>
            <p className="text-slate-500">Current balance</p><p className="text-right font-medium">{summary?.current_balance.toFixed(2) ?? '0.00'}</p>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Aging</h3>
          <div className="space-y-1 text-sm">
            {aging.map((a) => (
              <div key={a.bucket_label} className="flex justify-between"><span className="text-slate-500">{a.bucket_label}</span><span className="font-medium">{a.amount.toFixed(2)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Ledger</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Description</th></tr></thead>
            <tbody>
              {transactions.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-400">No ledger transactions yet.</td></tr> : transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td><td className="capitalize">{t.transaction_type.replace('_', ' ')}</td>
                  <td>{t.debit > 0 ? t.debit.toFixed(2) : '—'}</td><td>{t.credit > 0 ? t.credit.toFixed(2) : '—'}</td>
                  <td>{t.running_balance?.toFixed(2) ?? '—'}</td><td>{t.description ?? '—'}</td>
                </tr>
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
    { key: 'financial', label: 'Financial' }, { key: 'pricing', label: 'Pricing & Ledger' }, { key: 'activity', label: 'Activity & Audit History' },
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
      {tab === 'financial' && <FinancialTab customerId={customer.id} />}
      {tab === 'pricing' && <PricingTab customerId={customer.id} />}
      {tab === 'activity' && <ActivityAndAuditTab customerId={customer.id} />}
    </div>
  );
}
