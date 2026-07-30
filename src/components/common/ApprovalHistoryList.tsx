import { useApprovalHistory, ApprovalEntityType } from '@/hooks/useApprovalHistory';

const ACTION_LABELS: Record<string, string> = {
  submit: 'Submitted', approve: 'Approved', reject: 'Rejected', reopen: 'Reopened', cancel: 'Cancelled', pick: 'Picked',
};
const ACTION_BADGE: Record<string, string> = {
  submit: 'badge-slate', approve: 'badge-green', reject: 'badge-red', reopen: 'badge-amber', cancel: 'badge-red', pick: 'badge-slate',
};

export function ApprovalHistoryList({ entityType, entityId }: { entityType: ApprovalEntityType; entityId: string | null }) {
  const { entries, loading } = useApprovalHistory(entityType, entityId);

  if (loading) return <p className="text-sm text-slate-400">Loading history…</p>;
  if (entries.length === 0) return <p className="text-sm text-slate-400">No history yet.</p>;

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div key={e.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
          <span className={ACTION_BADGE[e.action]}>{ACTION_LABELS[e.action] ?? e.action}</span>
          <div className="flex-1">
            <p>{e.performer?.full_name ?? '—'} · {new Date(e.performed_at).toLocaleString()}</p>
            {e.notes && <p className="text-xs text-slate-500">{e.notes}</p>}
          </div>
          {e.signature_url && <img src={e.signature_url} alt="signature" className="h-8 w-20 rounded border border-slate-200 bg-white object-contain" />}
        </div>
      ))}
    </div>
  );
}
