import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PrintSettings {
  copies: number;
  show_logo: boolean;
  logo_url: string | null;
  header_text: string | null;
  footer_text: string | null;
  show_qr: boolean;
  show_barcode: boolean;
  terms_text: string | null;
  show_signature: boolean;
  paper_size: '58mm' | '80mm' | 'a4';
  margin_mm: number;
}

const DEFAULTS: PrintSettings = {
  copies: 1, show_logo: false, logo_url: null, header_text: null, footer_text: null,
  show_qr: false, show_barcode: true, terms_text: null, show_signature: true, paper_size: '80mm', margin_mm: 5,
};

export function usePrintSettings() {
  const { company } = useAuth();
  const [settings, setSettings] = useState<PrintSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('print_settings').select('*').eq('company_id', company.id).maybeSingle();
    setSettings(data ? (data as PrintSettings) : DEFAULTS);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch: Partial<PrintSettings>) => {
    if (!company) return { error: 'No company context' };
    const next = { ...settings, ...patch };
    const { error } = await supabase.from('print_settings').upsert({ company_id: company.id, ...next });
    if (error) return { error: error.message };
    setSettings(next);
    return { error: null };
  }, [company, settings]);

  return { settings, loading, save };
}

export async function logPrint(companyId: string, employeeId: string | null, documentType: string, referenceId: string | null, printerType: string, copies: number) {
  await supabase.from('print_logs').insert({
    company_id: companyId, employee_id: employeeId, document_type: documentType,
    reference_id: referenceId, printer_type: printerType, copies,
  });
}
