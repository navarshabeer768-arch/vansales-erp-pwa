import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useCustomerTypes, useCustomerCategories, useCustomerChannels, useTerritories, useCustomerTags, useCustomerGroups,
} from '@/hooks/useCustomerLookups';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'types' | 'categories' | 'channels' | 'groups' | 'tags' | 'territories';

function SimpleLookupPanel({
  items, loading, onAdd, onRemove, placeholder, allowRemoveSystem = false,
}: {
  items: { id: string; code?: string | null; label?: string; name?: string; is_system?: boolean }[];
  loading: boolean;
  onAdd: (label: string) => Promise<{ error: string | null }>;
  onRemove: (id: string) => Promise<{ error: string | null }>;
  placeholder: string;
  allowRemoveSystem?: boolean;
}) {
  const { push } = useToast();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSubmitting(true);
    const { error } = await onAdd(value.trim());
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Added.');
    setValue('');
  };

  const handleRemove = async (id: string) => {
    const { error } = await onRemove(id);
    push(error ? 'error' : 'success', error ?? 'Removed.');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-primary shrink-0" onClick={submit} disabled={submitting}><Plus size={16} /> Add</button>
      </div>
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">Nothing added yet.</p>
          ) : items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2">
              <span>{item.label ?? item.name}{item.is_system && <span className="badge-slate ml-2">System</span>}</span>
              {(!item.is_system || allowRemoveSystem) && (
                <button onClick={() => handleRemove(item.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerMasterSettingsPage() {
  const [tab, setTab] = useState<Tab>('types');
  const types = useCustomerTypes();
  const categories = useCustomerCategories();
  const channels = useCustomerChannels();
  const territories = useTerritories();
  const tags = useCustomerTags();
  const groups = useCustomerGroups();

  const codeFrom = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'types', label: 'Customer Types' },
    { key: 'categories', label: 'Categories' },
    { key: 'channels', label: 'Channels' },
    { key: 'groups', label: 'Groups' },
    { key: 'tags', label: 'Tags' },
    { key: 'territories', label: 'Territories' },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Master Settings</h1>
        <p className="text-sm text-slate-500">Configure customer types, categories, channels, groups, tags, and territories — no code changes needed.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <PermissionGate permission="settings:edit">
        <div className="card p-4">
          {tab === 'types' && (
            <SimpleLookupPanel items={types.items} loading={types.loading} placeholder="e.g. Franchise"
              onAdd={(label) => types.addCustom(codeFrom(label), label)} onRemove={types.deactivate} />
          )}
          {tab === 'categories' && (
            <SimpleLookupPanel items={categories.items} loading={categories.loading} placeholder="e.g. Textiles"
              onAdd={(label) => categories.addCustom(codeFrom(label), label)} onRemove={categories.deactivate} />
          )}
          {tab === 'channels' && (
            <SimpleLookupPanel items={channels.items} loading={channels.loading} placeholder="e.g. Marketplace"
              onAdd={(label) => channels.addCustom(codeFrom(label), label)} onRemove={channels.deactivate} />
          )}
          {tab === 'groups' && (
            <SimpleLookupPanel items={groups.groups} loading={groups.loading} placeholder="e.g. Gold"
              onAdd={(label) => groups.create(label, 0)} onRemove={groups.deactivate} allowRemoveSystem />
          )}
          {tab === 'tags' && (
            <SimpleLookupPanel items={tags.tags} loading={tags.loading} placeholder="e.g. Priority"
              onAdd={(label) => tags.create(label)} onRemove={tags.remove} allowRemoveSystem />
          )}
          {tab === 'territories' && (
            <SimpleLookupPanel items={territories.territories} loading={territories.loading} placeholder="e.g. North Doha"
              onAdd={(label) => territories.create(label)} onRemove={territories.deactivate} allowRemoveSystem />
          )}
        </div>
      </PermissionGate>
    </div>
  );
}
