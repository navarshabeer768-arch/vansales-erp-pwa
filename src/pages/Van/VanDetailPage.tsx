import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, UserPlus, FileText, ImageIcon, Trash2, X, Star } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useVanStaff, useVanStaffRoles, useAssignableStaff } from '@/hooks/useVanAssignments';
import { useVehicleDocuments, DocumentType } from '@/hooks/useVehicleDocuments';
import { useVehicleImages } from '@/hooks/useVehicleImages';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const DOC_LABELS: Record<DocumentType, string> = {
  insurance: 'Insurance', registration: 'Registration', permit: 'Permit', fitness: 'Fitness',
  warranty: 'Warranty', service_book: 'Service Book', other: 'Other',
};

function StaffTab({ vanId }: { vanId: string }) {
  const { assignments, activeByEmployee, assignStaff, removeRole, removeEmployee } = useVanStaff(vanId);
  const { roles } = useVanStaffRoles();
  const staff = useAssignableStaff();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [primaryRole, setPrimaryRole] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const roleLabel = (code: string) => roles.find((r) => r.code === code)?.label ?? code;

  const toggleRole = (code: string) => {
    setSelectedRoles((prev) => {
      const next = prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code];
      if (!next.includes(primaryRole)) setPrimaryRole(next[0] ?? '');
      return next;
    });
  };

  const resetForm = () => { setEmployeeId(''); setSelectedRoles([]); setPrimaryRole(''); setEffectiveDate(new Date().toISOString().slice(0, 10)); };

  const submit = async () => {
    if (!employeeId) { push('error', 'Select a staff member.'); return; }
    if (selectedRoles.length === 0) { push('error', 'Select at least one role.'); return; }
    setSubmitting(true);
    const { error } = await assignStaff({
      employeeId, roleCodes: selectedRoles, primaryRoleCode: primaryRole || selectedRoles[0], assignedDate: effectiveDate,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Staff assigned to this van.');
    setOpen(false);
    resetForm();
  };

  const handleRemoveRole = async (assignmentId: string) => {
    const { error } = await removeRole(assignmentId);
    push(error ? 'error' : 'success', error ?? 'Role removed.');
  };

  const handleRemoveEmployee = async (empId: string) => {
    const { error } = await removeEmployee(empId);
    push(error ? 'error' : 'success', error ?? 'Removed from this van.');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activeByEmployee.size === 0 ? (
          <div className="card col-span-full p-6 text-center text-sm text-slate-400">
            No staff currently assigned to this van.
          </div>
        ) : (
          Array.from(activeByEmployee.entries()).map(([empId, empAssignments]) => (
            <div key={empId} className="card space-y-2 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{empAssignments[0].employee?.full_name}</p>
                <PermissionGate permission="van_loading:edit">
                  <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => handleRemoveEmployee(empId)} title="Remove from van">
                    <X size={14} />
                  </button>
                </PermissionGate>
              </div>
              <div className="flex flex-wrap gap-1">
                {empAssignments.map((a) => (
                  <span key={a.id} className="badge-slate flex items-center gap-1">
                    {a.is_primary && <Star size={10} className="fill-amber-400 text-amber-400" />}
                    {roleLabel(a.role_code)}
                    <PermissionGate permission="van_loading:edit">
                      <button onClick={() => handleRemoveRole(a.id)} className="ml-0.5 text-slate-400 hover:text-red-600"><X size={10} /></button>
                    </PermissionGate>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <PermissionGate permission="van_loading:edit">
        <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus size={16} /> Assign staff</button>
      </PermissionGate>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Assignment history</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Employee</th><th>Role</th><th>Primary</th><th>Assigned</th><th>Removed</th><th>Status</th></tr></thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No assignment history yet.</td></tr>
              ) : assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.employee?.full_name}</td>
                  <td>{roleLabel(a.role_code)}</td>
                  <td>{a.is_primary ? <Star size={12} className="fill-amber-400 text-amber-400" /> : '—'}</td>
                  <td>{a.assigned_date}</td>
                  <td>{a.removed_date ?? '—'}</td>
                  <td><span className={a.status === 'active' ? 'badge-green' : 'badge-slate'}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => { setOpen(false); resetForm(); }} title="Assign staff to this van" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Staff member *</label>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.role_code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Roles on this van * (select one or more)</label>
            <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              {roles.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedRoles.includes(r.code)} onChange={() => toggleRole(r.code)} />
                  {r.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              An employee can hold several roles here at once (e.g. Driver + Salesman), and more than one
              employee can share a role (e.g. two Salesmen on one van).
            </p>
          </div>
          {selectedRoles.length > 1 && (
            <div>
              <label className="label">Primary role</label>
              <select className="input" value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value)}>
                {selectedRoles.map((code) => <option key={code} value={code}>{roleLabel(code)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Effective date</label>
            <input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => { setOpen(false); resetForm(); }} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Assigning…' : 'Assign'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DocumentsTab({ vanId }: { vanId: string }) {
  const { documents, createDocument, deleteDocument } = useVehicleDocuments(vanId);
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>('insurance');
  const [documentNo, setDocumentNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await createDocument({ vanId, documentType, documentNo, expiryDate, fileUrl, notes });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Document added.');
    setOpen(false); setDocumentNo(''); setExpiryDate(''); setFileUrl(''); setNotes('');
  };

  const expiryBadge = (date: string | null) => {
    if (!date) return '—';
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span className="badge-red">Expired</span>;
    if (days <= 30) return <span className="badge-amber">{date} ({days}d)</span>;
    return <span className="badge-slate">{date}</span>;
  };

  return (
    <div className="space-y-4">
      <PermissionGate permission="van_loading:edit">
        <button className="btn-primary" onClick={() => setOpen(true)}><FileText size={16} /> Add document</button>
      </PermissionGate>

      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Type</th><th>Document #</th><th>Expiry</th><th>File</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">No documents added yet.</td></tr>
            ) : documents.map((d) => (
              <tr key={d.id}>
                <td>{DOC_LABELS[d.document_type]}</td>
                <td>{d.document_no ?? '—'}</td>
                <td>{expiryBadge(d.expiry_date)}</td>
                <td>{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline dark:text-brand-400">View</a> : '—'}</td>
                <td className="max-w-xs truncate">{d.notes ?? '—'}</td>
                <td>
                  <PermissionGate permission="van_loading:edit">
                    <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => deleteDocument(d.id)}><Trash2 size={14} /></button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add vehicle document" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Document type</label>
            <select className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
              {(Object.keys(DOC_LABELS) as DocumentType[]).map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Document number</label>
            <input className="input" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
          </div>
          <div>
            <label className="label">Expiry date</label>
            <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <label className="label">File URL (scan/photo link)</label>
            <input className="input" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add document'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ImagesTab({ vanId }: { vanId: string }) {
  const { images, addImage, removeImage } = useVehicleImages(vanId);
  const { push } = useToast();
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!imageUrl.trim()) { push('error', 'Enter an image URL.'); return; }
    setSubmitting(true);
    const { error } = await addImage(imageUrl.trim(), images.length === 0);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Image added.');
    setImageUrl('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… image URL" />
        <button className="btn-primary shrink-0" onClick={submit} disabled={submitting}>Add</button>
      </div>

      {images.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ImageIcon className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No images added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <img src={img.image_url} alt="" className="h-32 w-full rounded-lg object-cover" />
              {img.is_primary && <span className="badge-green absolute left-2 top-2">Primary</span>}
              <button
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
                onClick={() => removeImage(img.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VanDetailPage() {
  const { vanId } = useParams<{ vanId: string }>();
  const { vans } = useVans();
  const van = vans.find((v) => v.id === vanId);
  const [tab, setTab] = useState<'staff' | 'documents' | 'images'>('staff');

  if (!vanId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/van-loading/vans" className="btn-ghost !px-2 !py-1"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{van?.name ?? 'Van'}</h1>
          <p className="text-sm text-slate-500">{van?.code}{van?.registration_no ? ` · ${van.registration_no}` : ''}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['staff', 'documents', 'images'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab vanId={vanId} />}
      {tab === 'documents' && <DocumentsTab vanId={vanId} />}
      {tab === 'images' && <ImagesTab vanId={vanId} />}
    </div>
  );
}
