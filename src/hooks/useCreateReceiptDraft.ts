import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface PaymentComponentInput {
  payment_method_code: string;
  amount: number;
  reference?: string | null;
  bank_or_terminal?: string | null;
  notes?: string | null;
  cheque?: { cheque_number: string; cheque_date: string; bank_name: string; branch_name?: string; account_name?: string; drawer_name?: string; is_post_dated?: boolean; deposit_date?: string; notes?: string } | null;
  card?: { card_type?: string; terminal?: string; merchant_reference?: string; authorization_code?: string; last_four_digits?: string; transaction_date?: string; notes?: string } | null;
  bank?: { bank_account?: string; transfer_reference?: string; transaction_date?: string; value_date?: string; sender_bank?: string; sender_account_reference?: string; notes?: string } | null;
  wallet?: { provider: string; transaction_id?: string; reference?: string; transaction_date?: string; notes?: string } | null;
}

export interface InvoiceAllocationInput {
  invoice_id: string;
  amount: number;
}

export interface CreateReceiptParams {
  collectionTypeCode: string;
  customerId: string;
  paymentComponents: PaymentComponentInput[];
  invoiceAllocations?: InvoiceAllocationInput[];
  allocationMode?: string;
  advanceDetails?: { purpose?: string; expected_use?: string; expiry_date?: string; notes?: string } | null;
  unallocatedReason?: string | null;
  routeId?: string | null;
  beatPlanId?: string | null;
  customerVisitId?: string | null;
  dailyVisitPlanId?: string | null;
  vanId?: string | null;
  responsibleEmployeeId?: string | null;
  collectionSource?: string;
  referenceNumber?: string | null;
  customerReference?: string | null;
  remarks?: string | null;
  internalNotes?: string | null;
  manualReceiptNumber?: string | null;
  deviceUid?: string | null;
  isOffline?: boolean;
}

function genClientUuid() {
  return `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCreateReceiptDraft() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: CreateReceiptParams) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_receipt_draft_notified', {
      p_collection_type_code: params.collectionTypeCode,
      p_customer_id: params.customerId,
      p_payment_components: params.paymentComponents,
      p_client_uuid: genClientUuid(),
      p_invoice_allocations: params.invoiceAllocations ?? null,
      p_allocation_mode: params.allocationMode ?? 'manual',
      p_advance_details: params.advanceDetails ?? null,
      p_unallocated_reason: params.unallocatedReason ?? null,
      p_route_id: params.routeId ?? null,
      p_beat_plan_id: params.beatPlanId ?? null,
      p_customer_visit_id: params.customerVisitId ?? null,
      p_daily_visit_plan_id: params.dailyVisitPlanId ?? null,
      p_van_id: params.vanId ?? null,
      p_responsible_employee_id: params.responsibleEmployeeId ?? null,
      p_collection_source: params.collectionSource ?? 'web',
      p_reference_number: params.referenceNumber ?? null,
      p_customer_reference: params.customerReference ?? null,
      p_remarks: params.remarks ?? null,
      p_internal_notes: params.internalNotes ?? null,
      p_manual_receipt_number: params.manualReceiptNumber ?? null,
      p_device_uid: params.deviceUid ?? null,
      p_is_offline: params.isOffline ?? false,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { submit, submitting };
}
