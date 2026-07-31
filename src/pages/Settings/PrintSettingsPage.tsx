import { useState, useEffect } from 'react';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function PrintSettingsPage() {
  const { settings, loading, save } = usePrintSettings();
  const { push } = useToast();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  const submit = async () => {
    setSaving(true);
    const { error } = await save(form);
    setSaving(false);
    push(error ? 'error' : 'success', error ?? 'Print settings saved — used on every invoice, receipt, and report from now on.');
  };

  if (loading) return <p className="text-center text-slate-400">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Print Settings</h1>
        <p className="text-sm text-slate-500">Applies to every printed document — invoices, receipts, slips, and reports.</p>
      </div>

      <div className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Paper size</label>
            <select className="input" value={form.paper_size} onChange={(e) => setForm({ ...form, paper_size: e.target.value as any })}>
              <option value="58mm">58mm thermal</option>
              <option value="80mm">80mm thermal</option>
              <option value="a4">A4</option>
            </select>
          </div>
          <div>
            <label className="label">Default copies</label>
            <input type="number" min={1} className="input" value={form.copies} onChange={(e) => setForm({ ...form, copies: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Margin (mm)</label>
            <input type="number" min={0} className="input" value={form.margin_mm} onChange={(e) => setForm({ ...form, margin_mm: Number(e.target.value) })} />
          </div>
        </div>

        <div>
          <label className="label">Header text</label>
          <input className="input" value={form.header_text ?? ''} onChange={(e) => setForm({ ...form, header_text: e.target.value })} placeholder="e.g. Thank you for your business" />
        </div>
        <div>
          <label className="label">Footer text</label>
          <input className="input" value={form.footer_text ?? ''} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
        </div>
        <div>
          <label className="label">Terms &amp; conditions</label>
          <textarea className="input" rows={2} value={form.terms_text ?? ''} onChange={(e) => setForm({ ...form, terms_text: e.target.value })} />
        </div>
        <div>
          <label className="label">Logo URL</label>
          <input className="input" value={form.logo_url ?? ''} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_logo} onChange={(e) => setForm({ ...form, show_logo: e.target.checked })} /> Show logo</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_qr} onChange={(e) => setForm({ ...form, show_qr: e.target.checked })} /> Show QR code</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_barcode} onChange={(e) => setForm({ ...form, show_barcode: e.target.checked })} /> Show barcode</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_signature} onChange={(e) => setForm({ ...form, show_signature: e.target.checked })} /> Show signature line</label>
        </div>

        <div className="flex justify-end">
          <PermissionGate permission="settings:edit">
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save print settings'}</button>
          </PermissionGate>
        </div>
      </div>
    </div>
  );
}
