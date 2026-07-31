import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface DeviceLoginRow {
  id: string;
  login_at: string;
  logout_at: string | null;
  device?: { device_name: string } | null;
  employee?: { full_name: string } | null;
}

export function useDeviceLoginReport() {
  const { company } = useAuth();
  const [rows, setRows] = useState<DeviceLoginRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('device_sessions')
        .select('id, login_at, logout_at, device:devices(device_name), employee:app_users(full_name)')
        .eq('company_id', company.id)
        .order('login_at', { ascending: false })
        .limit(500);
      setRows((data ?? []) as unknown as DeviceLoginRow[]);
      setLoading(false);
    })();
  }, [company]);

  return { rows, loading };
}

export interface SyncHistoryRow {
  id: string;
  entity_type: string;
  records_synced: number;
  records_failed: number;
  status: 'success' | 'partial' | 'failed';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  device?: { device_name: string } | null;
  employee?: { full_name: string } | null;
}

export function useSyncHistoryReport() {
  const { company } = useAuth();
  const [rows, setRows] = useState<SyncHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sync_history')
        .select('id, entity_type, records_synced, records_failed, status, error_message, started_at, completed_at, device:devices(device_name), employee:app_users(full_name)')
        .eq('company_id', company.id)
        .order('started_at', { ascending: false })
        .limit(500);
      setRows((data ?? []) as unknown as SyncHistoryRow[]);
      setLoading(false);
    })();
  }, [company]);

  return { rows, loading };
}

export interface PrintLogRow {
  id: string;
  document_type: string;
  printer_type: string;
  copies: number;
  created_at: string;
  employee?: { full_name: string } | null;
}

export function usePrintLogReport() {
  const { company } = useAuth();
  const [rows, setRows] = useState<PrintLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('print_logs')
        .select('id, document_type, printer_type, copies, created_at, employee:app_users(full_name)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(500);
      setRows((data ?? []) as unknown as PrintLogRow[]);
      setLoading(false);
    })();
  }, [company]);

  return { rows, loading };
}

export interface OfflineTransactionRow {
  id: string;
  entity_type: string;
  action: string;
  status: 'pending' | 'synced' | 'failed' | 'conflict';
  conflict_notes: string | null;
  offline_created_at: string;
  synced_at: string | null;
  device?: { device_name: string } | null;
  employee?: { full_name: string } | null;
}

export function useOfflineActivityReport() {
  const { company } = useAuth();
  const [rows, setRows] = useState<OfflineTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('offline_transactions')
        .select('id, entity_type, action, status, conflict_notes, offline_created_at, synced_at, device:devices(device_name), employee:app_users(full_name)')
        .eq('company_id', company.id)
        .order('offline_created_at', { ascending: false })
        .limit(500);
      setRows((data ?? []) as unknown as OfflineTransactionRow[]);
      setLoading(false);
    })();
  }, [company]);

  return { rows, loading };
}
