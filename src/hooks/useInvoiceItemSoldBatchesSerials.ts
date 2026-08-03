import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface SoldBatch { batch_id: string; batch_no: string; expiry_date: string | null; allocated_quantity: number }
export interface SoldSerial { serial_id: string; serial_no: string; status: string }

export function useInvoiceItemSoldBatchesSerials(invoiceItemId: string | undefined) {
  const [batches, setBatches] = useState<SoldBatch[]>([]);
  const [serials, setSerials] = useState<SoldSerial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceItemId) { setBatches([]); setSerials([]); return; }
    setLoading(true);
    const { data: allocations } = await supabase
      .from('sales_invoice_stock_allocations')
      .select('id')
      .eq('invoice_item_id', invoiceItemId);
    const allocationIds = (allocations ?? []).map((a: any) => a.id);

    if (allocationIds.length === 0) { setBatches([]); setSerials([]); setLoading(false); return; }

    const [{ data: batchRows }, { data: serialRows }] = await Promise.all([
      supabase.from('sales_invoice_item_batches').select('batch_id, allocated_quantity, batch:batches(batch_no, expiry_date)').in('allocation_id', allocationIds),
      supabase.from('sales_invoice_item_serials').select('serial_id, serial:product_serials(serial_no, status)').in('allocation_id', allocationIds),
    ]);

    setBatches(((batchRows ?? []) as any[]).map((b) => ({
      batch_id: b.batch_id, batch_no: b.batch?.batch_no ?? '—', expiry_date: b.batch?.expiry_date ?? null, allocated_quantity: b.allocated_quantity,
    })));
    setSerials(((serialRows ?? []) as any[]).map((s) => ({
      serial_id: s.serial_id, serial_no: s.serial?.serial_no ?? '—', status: s.serial?.status ?? 'unknown',
    })));
    setLoading(false);
  }, [invoiceItemId]);

  useEffect(() => { load(); }, [load]);

  return { batches, serials, loading, reload: load };
}
