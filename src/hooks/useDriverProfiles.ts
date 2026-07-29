import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface DriverProfile {
  user_id: string;
  license_number: string | null;
  license_expiry: string | null;
  medical_expiry: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
}

export function useDriverProfile(userId: string | null) {
  const { company } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !company) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('driver_profiles').select('*').eq('user_id', userId).maybeSingle();
    setProfile((data ?? null) as DriverProfile | null);
    setLoading(false);
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = useCallback(async (params: Omit<DriverProfile, 'user_id'>) => {
    if (!userId || !company) return { error: 'No driver selected' };
    const { error } = await supabase.from('driver_profiles').upsert({
      user_id: userId, company_id: company.id, ...params,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [userId, company, load]);

  return { profile, loading, reload: load, saveProfile };
}

export type DriverDocumentType = 'license' | 'medical' | 'id_card' | 'contract' | 'other';

export interface DriverDocument {
  id: string;
  user_id: string;
  document_type: DriverDocumentType;
  document_no: string | null;
  expiry_date: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

export function useDriverDocuments(userId: string | null) {
  const { company } = useAuth();
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !company) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('driver_documents').select('*').eq('user_id', userId).order('expiry_date', { ascending: true, nullsFirst: false });
    setDocuments((data ?? []) as DriverDocument[]);
    setLoading(false);
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  const createDocument = useCallback(async (params: {
    documentType: DriverDocumentType; documentNo?: string; expiryDate?: string; fileUrl?: string; notes?: string;
  }) => {
    if (!userId || !company) return { error: 'No driver selected' };
    const { error } = await supabase.from('driver_documents').insert({
      company_id: company.id, user_id: userId, document_type: params.documentType,
      document_no: params.documentNo || null, expiry_date: params.expiryDate || null,
      file_url: params.fileUrl || null, notes: params.notes || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [userId, company, load]);

  const deleteDocument = useCallback(async (id: string) => {
    const { error } = await supabase.from('driver_documents').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { documents, loading, reload: load, createDocument, deleteDocument };
}

export interface AttendanceEntry {
  id: string;
  user_id: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'leave' | 'half_day';
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
}

export function useDriverAttendance(userId: string | null) {
  const { company } = useAuth();
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !company) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('driver_attendance').select('*').eq('user_id', userId).order('attendance_date', { ascending: false }).limit(60);
    setEntries((data ?? []) as AttendanceEntry[]);
    setLoading(false);
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  const markAttendance = useCallback(async (params: {
    date: string; status: AttendanceEntry['status']; checkInTime?: string; checkOutTime?: string; notes?: string;
  }) => {
    if (!userId || !company) return { error: 'No driver selected' };
    const { error } = await supabase.from('driver_attendance').upsert({
      company_id: company.id, user_id: userId, attendance_date: params.date, status: params.status,
      check_in_time: params.checkInTime || null, check_out_time: params.checkOutTime || null, notes: params.notes || null,
    }, { onConflict: 'user_id,attendance_date' });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [userId, company, load]);

  return { entries, loading, reload: load, markAttendance };
}

export function useDrivers() {
  const { company } = useAuth();
  const [drivers, setDrivers] = useState<{ id: string; full_name: string; username: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('app_users')
        .select('id, full_name, username, is_active, role:roles!inner(code)')
        .eq('company_id', company.id)
        .eq('role.code', 'driver');
      setDrivers((data ?? []) as any);
      setLoading(false);
    })();
  }, [company]);

  return { drivers, loading };
}
