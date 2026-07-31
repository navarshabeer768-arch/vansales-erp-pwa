import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCustomerMaster } from '@/hooks/useCustomerMaster';
import { useCustomerTypes, useCustomerCategories, useCustomerChannels, useCustomerGroups, useTerritories } from '@/hooks/useCustomerLookups';

interface NewCustomerModalProps { open: boolean; onClose: () => void; onCreated: (id: string) => void; }

export function NewCustomerModal({ open, onClose, onCreated }: NewCustomerModalProps) {
  const { push } = useToast();
  const { createCustomer, checkDuplicates, generateCode } = useCustomerMaster();
  const { items: types } = useCustomerTypes();
  const { items: categories } = useCustomerCategories();
  const { items: channels } = useCustomerChannels();
  const { groups } = useCustomerGroups();
  const { territories } = useTerritories();

  const [code, setCode] = useState('');
  const [manualCode, setManualCode] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [duplicates, setDuplicates] = useState<{ id: string; business_name: string; matched_on: string }[]>([]);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open && !manualCode) generateCode().then(setCode); }, [open, manualCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setCode(''); setManualCode(false); setBusinessName(''); setTypeId(''); setCategoryId(''); setChannelId('');
    setGroupId(''); setTerritoryId(''); setPrimaryPhone(''); setWhatsapp(''); setEmail(''); setDuplicates([]); setOverrideDuplicate(false);
  };

  const submit = async () => {
    if (!businessName.trim()) { push('error', 'Business name is required.'); return; }
    if (!code.trim()) { push('error', 'Customer code is required.'); return; }

    if (!overrideDuplicate) {
      const matches = await checkDuplicates(primaryPhone || null, whatsapp || null, email || null);
      if (matches.length > 0) { setDuplicates(matches); return; }
    }

    setSubmitting(true);
    const { error, id } = await createCustomer({
      customer_code: code, business_name: businessName,
      customer_type_id: typeId || null, category_id: categoryId || null, channel_id: channelId || null,
      group_id: groupId || null, territory_id: territoryId || null,
      primary_phone: primaryPhone || null, whatsapp: whatsapp || null, email: email || null,
      status: 'active', manual_code_used: manualCode,
    } as any);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Customer created.');
    reset();
    onCreated(id!);
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New customer" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Customer code *</label>
            <div className="flex gap-2">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} disabled={!manualCode} />
              <PermissionGate permission="settings:edit">
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={manualCode} onChange={(e) => setManualCode(e.target.checked)} /> Manual
                </label>
              </PermissionGate>
            </div>
          </div>
          <div>
            <label className="label">Business name *</label>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <label className="label">Customer type</label>
            <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">— None —</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Channel</label>
            <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">— None —</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Group</label>
            <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— None —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Territory</label>
            <select className="input" value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
              <option value="">— None —</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Primary phone</label>
            <input className="input" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        {duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
            <p className="font-medium text-amber-800 dark:text-amber-300">Possible duplicate customer(s):</p>
            <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-400">
              {duplicates.map((d) => <li key={d.id}>{d.business_name} — matching {d.matched_on}</li>)}
            </ul>
            <PermissionGate permission="customers:create">
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={overrideDuplicate} onChange={(e) => setOverrideDuplicate(e.target.checked)} />
                Save anyway
              </label>
            </PermissionGate>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || (duplicates.length > 0 && !overrideDuplicate)}>
            {submitting ? 'Creating…' : 'Create customer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
