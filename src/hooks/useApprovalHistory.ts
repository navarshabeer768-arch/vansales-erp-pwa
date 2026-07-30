import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ApprovalEntityType = 'van_loading' | 'van_unloading' | 'warehouse_transfer' | 'van_transfer';

export interface ApprovalHistoryEntry {
  id: string;
  action: 'submit' | 'approve' | 'reject' | 'reopen' | 'cancel' | 'pick';
  notes: string | null;
  signature_url: string | null;
  performed_at: string;
  performer?: { full_name: string } | null;
}

export function useApprovalHistory(entityType: ApprovalEntityType, entityId: string | null) {
  const [entries, setEntries] = useState<ApprovalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('approval_history')
      .select('id, action, notes, signature_url, performed_at, performer:app_users(full_name)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('performed_at', { ascending: true })
      .then(({ data }) => {
        setEntries((data ?? []) as unknown as ApprovalHistoryEntry[]);
        setLoading(false);
      });
  }, [entityType, entityId]);

  return { entries, loading };
}
