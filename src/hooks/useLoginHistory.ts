import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LoginHistoryEntry {
  id: string;
  username_attempted: string;
  success: boolean;
  device_info: string | null;
  created_at: string;
  user?: { full_name: string } | null;
}

export function useLoginHistory() {
  const { company } = useAuth();
  const [entries, setEntries] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('login_history')
      .select('id, username_attempted, success, device_info, created_at, user:app_users(full_name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setEntries((data ?? []) as unknown as LoginHistoryEntry[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { entries, loading, reload: load };
}
