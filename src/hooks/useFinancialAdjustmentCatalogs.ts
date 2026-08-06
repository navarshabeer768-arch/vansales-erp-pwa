import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type DocumentCategory = 'credit_note' | 'debit_note' | 'customer_adjustment';

export interface FinancialDocumentType {
  id: string; code: string; document_category: DocumentCategory; label: string;
  invoice_required: boolean; return_required: boolean; requires_reason: boolean;
  default_adjustment_type: string | null; is_active: boolean;
}

export interface FinancialAdjustmentReason {
  id: string; code: string; applies_to: string; label: string; requires_notes: boolean; is_active: boolean;
}

export function useFinancialAdjustmentCatalogs() {
  const { company } = useAuth();
  const [documentTypes, setDocumentTypes] = useState<FinancialDocumentType[]>([]);
  const [reasons, setReasons] = useState<FinancialAdjustmentReason[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const [{ data: types }, { data: reasonRows }] = await Promise.all([
        supabase.from('financial_document_types').select('*').or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true).order('is_system', { ascending: false }),
        supabase.from('financial_adjustment_reasons').select('*').or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true),
      ]);
      setDocumentTypes((types ?? []) as FinancialDocumentType[]);
      setReasons((reasonRows ?? []) as FinancialAdjustmentReason[]);
      setLoading(false);
    })();
  }, [company]);

  const documentTypesFor = (category: DocumentCategory) => documentTypes.filter((t) => t.document_category === category);
  const reasonsFor = (category: DocumentCategory) => reasons.filter((r) => r.applies_to === category || r.applies_to === 'all');

  return { documentTypes, reasons, documentTypesFor, reasonsFor, loading };
}
