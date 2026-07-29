import { useState, useEffect } from 'react';
import { UserCog, FileText, CalendarCheck, Trash2 } from 'lucide-react';
import { useDrivers, useDriverProfile, useDriverDocuments, useDriverAttendance, DriverDocumentType } from '@/hooks/useDriverProfiles';
import { useAllActiveVanStaff } from '@/hooks/useVanAssignments';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const DOC_LABELS: Record<DriverDocumentType, string> = {
  license: 'License', medical: 'Medical Certificate', id_card: 'ID Card', contract: 'Contract', other: 'Other',
};

function expiryBadge(date: string | null) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="badge-red">Expired {date}</span>;
  if (days <= 30) return <span className="badge-amber">{date} ({days}d)</span>;
  return <span className="badge-slate">{date}</span>;
}

function ProfileTab({ userId }: { userId: string }) {
  const { profile, saveProfile } = useDriverProfile(userId);
  const { push } = useToast();
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number ?? '');
  const [licenseExpiry, setLicenseExpiry] = useState(profile?.license_expiry ?? '');
  const [medicalExpiry, setMedicalExpiry] = useState(profile?.medical_expiry ?? '');
  const [contactName, setContactName] = useState(profile?.emergency_contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(profile?.emergency_contact_phone ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Resync local fields whenever the loaded profile changes (e.g. switching drivers).
  useEffect(() => {
    setLicenseNumber(profile?.license_number ?? '');
    setLicenseExpiry(profile?.license_expiry ?? '');
    setMedicalExpiry(profile?.medical_expiry ?? '');
    setContactName(profile?.emergency_contact_name ?? '');
    setContactPhone(profile?.emergency_contact_phone ?? '');
    setNotes(profile?.notes ?? '');
  }, [profile]);

  const submit = async () => {
    setSaving(true);
    const { error } = await saveProfile({
      license_number: licenseNumber || null, license_expiry: licenseExpiry || null,
      medical_expiry: medicalExpiry || null, emergency_contact_name: contactName || null,
      emergency_contact_phone: contactPhone || null, notes: notes || null,
    });
    setSaving(false);
    push(error ? 'error' : 'success', error ?? 'Profile saved.');
  };

  return (
    <div className="card space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">License number</label>
          <input className="input" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">License expiry</label>
          <input type="date" className="input" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
        </div>
        <div>
          <label className="label">Medical expiry</label>
          <input type="date" className="input" value={medicalExpiry} onChange={(e) => setMedicalExpiry(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Emergency contact name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="label">Emergency contact phone</label>
          <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <PermissionGate permission="hr:edit">
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </PermissionGate>
      </div>
    </div>
  );
}

function DocumentsTab({ userId }: { userId: string }) {
  const { documents, createDocument, deleteDocument } = useDriverDocuments(userId);
  const { push } = useToast();
  const [documentType, setDocumentType] = useState<DriverDocumentType>('license');
  const [documentNo, setDocumentNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await createDocument({ documentType, documentNo, expiryDate, fileUrl });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Document added.');
    setDocumentNo(''); setExpiryDate(''); setFileUrl('');
  };

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <select className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value as DriverDocumentType)}>
          {(Object.keys(DOC_LABELS) as DriverDocumentType[]).map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
        </select>
        <input className="input" placeholder="Document #" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
        <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        <div className="flex gap-2">
          <input className="input" placeholder="File URL" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
          <button className="btn-primary shrink-0" onClick={submit} disabled={submitting}>Add</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Type</th><th>Document #</th><th>Expiry</th><th>File</th><th></th></tr></thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No documents added yet.</td></tr>
            ) : documents.map((d) => (
              <tr key={d.id}>
                <td>{DOC_LABELS[d.document_type]}</td>
                <td>{d.document_no ?? '—'}</td>
                <td>{expiryBadge(d.expiry_date)}</td>
                <td>{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline dark:text-brand-400">View</a> : '—'}</td>
                <td><button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => deleteDocument(d.id)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceTab({ userId }: { userId: string }) {
  const { entries, markAttendance } = useDriverAttendance(userId);
  const { push } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'present' | 'absent' | 'leave' | 'half_day'>('present');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await markAttendance({ date, status });
    setSubmitting(false);
    push(error ? 'error' : 'success', error ?? 'Attendance recorded.');
  };

  const statusBadge = (s: string) => s === 'present' ? 'badge-green' : s === 'absent' ? 'badge-red' : s === 'leave' ? 'badge-amber' : 'badge-slate';

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
            <option value="half_day">Half day</option>
          </select>
        </div>
        <button className="btn-primary" onClick={submit} disabled={submitting}>
          <CalendarCheck size={16} /> {submitting ? 'Saving…' : 'Mark attendance'}
        </button>
      </div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={2} className="py-8 text-center text-slate-400">No attendance recorded yet.</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id}><td>{e.attendance_date}</td><td><span className={statusBadge(e.status)}>{e.status.replace('_', ' ')}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DriverManagementPage() {
  const { drivers, loading } = useDrivers();
  const { rows: vanStaff } = useAllActiveVanStaff();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'documents' | 'attendance'>('profile');

  const selected = drivers.find((d) => d.id === selectedId);
  const assignedVans = (userId: string) => vanStaff.filter((r) => r.employee_id === userId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Driver Management</h1>
        <p className="text-sm text-slate-500">License/medical expiry, emergency contacts, attendance, and documents.</p>
      </div>

      {loading ? (
        <p className="text-center text-slate-400">Loading…</p>
      ) : drivers.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <UserCog className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No staff with the "driver" role yet — create one under Staff Accounts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card divide-y divide-slate-100 dark:divide-slate-800 lg:col-span-1">
            {drivers.map((d) => (
              <button
                key={d.id}
                onClick={() => { setSelectedId(d.id); setTab('profile'); }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedId === d.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
              >
                <div>
                  <p className="font-medium">{d.full_name}</p>
                  <p className="text-xs text-slate-500">@{d.username}{assignedVans(d.id).length > 0 ? ` · ${assignedVans(d.id).map((v) => v.van_name).join(', ')}` : ''}</p>
                </div>
                <span className={d.is_active ? 'badge-green' : 'badge-slate'}>{d.is_active ? 'Active' : 'Inactive'}</span>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <div className="card flex h-full items-center justify-center p-10 text-center text-sm text-slate-400">
                Select a driver to view their profile, documents, and attendance.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                  {(['profile', 'documents', 'attendance'] as const).map((t) => (
                    <button
                      key={t} onClick={() => setTab(t)}
                      className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      {t === 'documents' && <FileText size={14} className="mr-1 inline" />}
                      {t}
                    </button>
                  ))}
                </div>
                {tab === 'profile' && <ProfileTab userId={selected.id} />}
                {tab === 'documents' && <DocumentsTab userId={selected.id} />}
                {tab === 'attendance' && <AttendanceTab userId={selected.id} />}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
