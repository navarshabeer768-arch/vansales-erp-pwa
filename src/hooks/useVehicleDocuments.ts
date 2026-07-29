import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type DocumentType = 'insurance' | 'registration' | 'permit' | 'fitness' | 'warranty' | 'service_book' | 'other';

export interface VehicleDocument {
  id: string;
  van_id: string;
  document_type: DocumentType;
  document_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
  van?: { id: string; name: string; code: string } | null;
}

export function useVehicleDocuments(vanId: string | null) {
  const { company } = useAuth();
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('vehicle_documents').select('*, van:vans(id,name,code)').eq('company_id', company.id);
    if (vanId) query = query.eq('van_id', vanId);
    const { data } = await query.order('expiry_date', { ascending: true, nullsFirst: false });
    setDocuments((data ?? []) as unknown as VehicleDocument[]);
    setLoading(false);
  }, [company, vanId]);

  useEffect(() => { load(); }, [load]);

  const createDocument = useCallback(async (params: {
    vanId: string; documentType: DocumentType; documentNo?: string;
    issueDate?: string; expiryDate?: string; fileUrl?: string; notes?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('vehicle_documents').insert({
      company_id: company.id, van_id: params.vanId, document_type: params.documentType,
      document_no: params.documentNo || null, issue_date: params.issueDate || null,
      expiry_date: params.expiryDate || null, file_url: params.fileUrl || null, notes: params.notes || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const deleteDocument = useCallback(async (id: string) => {
    const { error } = await supabase.from('vehicle_documents').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { documents, loading, reload: load, createDocument, deleteDocument };
}
