import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ScanLogRow {
  id: string;
  scan_type: 'barcode' | 'qr';
  scanned_value: string;
  lookup_type: string | null;
  lookup_success: boolean;
  context: string | null;
  created_at: string;
  employee?: { full_name: string } | null;
}

export function useScanHistory() {
  const { company } = useAuth();
  const [logs, setLogs] = useState<ScanLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('scan_logs')
        .select('id, scan_type, scanned_value, lookup_type, lookup_success, context, created_at, employee:app_users(full_name)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(300);
      setLogs((data ?? []) as unknown as ScanLogRow[]);
      setLoading(false);
    })();
  }, [company]);

  return { logs, loading };
}
