import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ReturnItemBatchInput { batch_id: string; quantity: number; expiry_date?: string }

export interface ReturnItemInput {
  invoice_item_id?: string | null;
  product_id: string;
  variant_id?: string | null;
  description?: string | null;
  uom_id?: string | null;
  conversion_factor?: number;
  return_quantity: number;
  base_return_quantity: number;
  is_free_item?: boolean;
  unit_price?: number;
  condition_code?: string;
  reason_code?: string;
  expected_stock_destination?: string;
  replacement_requested?: boolean;
  item_notes?: string;
  batches?: ReturnItemBatchInput[];
  serials?: string[];
}

export interface CreateReturnParams {
  returnTypeCode: string;
  customerId: string;
  items: ReturnItemInput[];
  originalInvoiceId?: string | null;
  returnReasonCode?: string | null;
  routeId?: string | null;
  beatPlanId?: string | null;
  customerVisitId?: string | null;
  dailyVisitPlanId?: string | null;
  vanId?: string | null;
  warehouseId?: string | null;
  responsibleEmployeeId?: string | null;
  returnSource?: string;
  customerReference?: string | null;
  customerComplaintReference?: string | null;
  replacementRequested?: boolean;
  notes?: string | null;
  internalNotes?: string | null;
  deviceUid?: string | null;
  isOffline?: boolean;
}

function genClientUuid() {
  return `ret-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCreateSalesReturn() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: CreateReturnParams) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_sales_return_draft_notified', {
      p_return_type_code: params.returnTypeCode,
      p_customer_id: params.customerId,
      p_items: params.items,
      p_client_uuid: genClientUuid(),
      p_original_invoice_id: params.originalInvoiceId ?? null,
      p_return_reason_code: params.returnReasonCode ?? null,
      p_route_id: params.routeId ?? null,
      p_beat_plan_id: params.beatPlanId ?? null,
      p_customer_visit_id: params.customerVisitId ?? null,
      p_daily_visit_plan_id: params.dailyVisitPlanId ?? null,
      p_van_id: params.vanId ?? null,
      p_warehouse_id: params.warehouseId ?? null,
      p_responsible_employee_id: params.responsibleEmployeeId ?? null,
      p_return_source: params.returnSource ?? 'web',
      p_customer_reference: params.customerReference ?? null,
      p_customer_complaint_reference: params.customerComplaintReference ?? null,
      p_replacement_requested: params.replacementRequested ?? false,
      p_notes: params.notes ?? null,
      p_internal_notes: params.internalNotes ?? null,
      p_device_uid: params.deviceUid ?? null,
      p_is_offline: params.isOffline ?? false,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { submit, submitting };
}
