import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, UserPlus, FileText, ImageIcon, Trash2, X } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useVanAssignments, useAssignableStaff, VanRoleType, AssignmentType } from '@/hooks/useVanAssignments';
import { useVehicleDocuments, DocumentType } from '@/hooks/useVehicleDocuments';
import { useVehicleImages } from '@/hooks/useVehicleImages';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const ROLE_LABELS: Record<VanRoleType, string> = { driver: 'Driver', salesman: 'Salesman', helper: 'Helper', collector: 'Collector' };
const DOC_LABELS: Record<DocumentType, string> = {
  insurance: 'Insurance', registration: 'Registration', permit: 'Permit', fitness: 'Fitness',
  warranty: 'Warranty', service_book: 'Service Book', other: 'Other',
};

function AssignmentsTab({ vanId }: { vanId: string }) {
  const { assignments, assignUser, endAssignment } = useVanAssignments(vanId);
  const staff = useAssignableStaff();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleType, setRoleType] = useState<VanRoleType>('driver');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('permanent');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeByRole = (role: VanRoleType) => assignments.find((a) => a.role_type === role && a.is_active);

  const submit = async () => {
    if (!userId) { push('error', 'Select a staff member.'); return; }
    setSubmitting(true);
    const { error } = await assignUser({ userId, roleType, assignmentType, startDate, endDate: endDate || undefined });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', `${ROLE_LABELS[roleType]} assigned.`);
    setOpen(false); setUserId(''); setEndDate('');
  };

  const handleEnd = async (id: string) => {
    const { error } = await endAssignment(id);
    push(error ? 'error' : 'success', error ?? 'Assignment ended.');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['driver', 'salesman', 'helper', 'collector'] as VanRoleType[]).map((role) => {
          const active = activeByRole(role);
          return (
            <div key={role} className="card p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{ROLE_LABELS[role]}</p>
              <p className="font-medium">{active?.user?.full_name ?? '— Unassigned —'}</p>
              {active && <span className="badge-slate mt-1">{active.assignment_type}</span>}
            </div>
          );
        })}
      </div>

      <PermissionGate permission="van_loading:edit">
        <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus size={16} /> Assign staff</button>
      </PermissionGate>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Assignment history</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Role</th><th>Staff</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No assignments yet.</td></tr>
              ) : assignments.map((a) => (
                <tr key={a.id}>
                  <td className="capitalize">{a.role_type}</td>
                  <td>{a.user?.full_name}</td>
                  <td className="capitalize">{a.assignment_type}</td>
                  <td>{a.start_date}</td>
                  <td>{a.end_date ?? '—'}</td>
                  <td><span className={a.is_active ? 'badge-green' : 'badge-slate'}>{a.is_active ? 'Active' : 'Ended'}</span></td>
                  <td>
                    {a.is_active && (
                      <PermissionGate permission="van_loading:edit">
                        <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => handleEnd(a.id)}><X size={14} /></button>
                      </PermissionGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign staff to this van" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Staff member *</label>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.role_code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Role on this van *</label>
            <select className="input" value={roleType} onChange={(e) => setRoleType(e.target.value as VanRoleType)}>
              {(['driver', 'salesman', 'helper', 'collector'] as VanRoleType[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assignment type</label>
            <select className="input" value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}>
              <option value="permanent">Permanent</option>
              <option value="temporary">Temporary</option>
              <option value="replacement">Replacement</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">End date (if temporary)</label>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Assigning a new {ROLE_LABELS[roleType].toLowerCase()} automatically ends the current one, keeping full history.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
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
  const [tab, setTab] = useState<'assignments' | 'documents' | 'images'>('assignments');

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
        {(['assignments', 'documents', 'images'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'assignments' && <AssignmentsTab vanId={vanId} />}
      {tab === 'documents' && <DocumentsTab vanId={vanId} />}
      {tab === 'images' && <ImagesTab vanId={vanId} />}
    </div>
  );
}
