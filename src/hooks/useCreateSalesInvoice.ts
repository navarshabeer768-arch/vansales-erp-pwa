import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface InvoiceCartItem {
  product_id: string;
  variant_id?: string | null;
  unit_id?: string | null;
  batch_id?: string | null;
  quantity: number;
  requested_price?: number | null;
  manual_discount_pct?: number | null;
  manual_discount_amount?: number | null;
  item_notes?: string | null;
  order_item_id?: string | null;
  order_approved_price?: number | null;
  order_discount_pct?: number | null;
  name: string;
  sku: string;
  standard_price: number;
  unit_symbol: string;
}

export interface CreateInvoiceParams {
  invoiceTypeCode: string;
  items: InvoiceCartItem[];
  customerId?: string | null;
  walkInName?: string | null;
  walkInPhone?: string | null;
  walkInAddress?: string | null;
  branchId?: string | null;
  routeId?: string | null;
  beatPlanId?: string | null;
  dailyVisitPlanId?: string | null;
  customerVisitId?: string | null;
  salesmanId?: string | null;
  vanId?: string | null;
  warehouseId?: string | null;
  billingAddressId?: string | null;
  deliveryAddressId?: string | null;
  contactPerson?: string | null;
  deliveryDate?: string | null;
  paymentType?: string;
  paymentTermId?: string | null;
  customerReference?: string | null;
  customerPo?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  isDirectInvoice?: boolean;
  directInvoiceSource?: string | null;
  manualInvoiceNumber?: string | null;
  invoiceSource?: string;
  deviceUid?: string | null;
  taxInclusive?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  isOffline?: boolean;
}

function genClientUuid() {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCreateSalesInvoice() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: CreateInvoiceParams) => {
    setSubmitting(true);
    const clientUuid = genClientUuid();
    const { data, error } = await supabase.rpc('create_sales_invoice_notified', {
      p_invoice_type_code: params.invoiceTypeCode,
      p_items: params.items.map((i) => ({
        product_id: i.product_id, variant_id: i.variant_id ?? null, unit_id: i.unit_id ?? null, batch_id: i.batch_id ?? null,
        quantity: i.quantity, requested_price: i.requested_price ?? null,
        manual_discount_pct: i.manual_discount_pct ?? null, manual_discount_amount: i.manual_discount_amount ?? null,
        item_notes: i.item_notes ?? null, order_item_id: i.order_item_id ?? null,
        order_approved_price: i.order_approved_price ?? null, order_discount_pct: i.order_discount_pct ?? null,
      })),
      p_client_uuid: clientUuid,
      p_customer_id: params.customerId ?? null,
      p_walk_in_name: params.walkInName ?? null,
      p_walk_in_phone: params.walkInPhone ?? null,
      p_walk_in_address: params.walkInAddress ?? null,
      p_branch_id: params.branchId ?? null,
      p_route_id: params.routeId ?? null,
      p_beat_plan_id: params.beatPlanId ?? null,
      p_daily_visit_plan_id: params.dailyVisitPlanId ?? null,
      p_customer_visit_id: params.customerVisitId ?? null,
      p_salesman_id: params.salesmanId ?? null,
      p_van_id: params.vanId ?? null,
      p_warehouse_id: params.warehouseId ?? null,
      p_billing_address_id: params.billingAddressId ?? null,
      p_delivery_address_id: params.deliveryAddressId ?? null,
      p_contact_person: params.contactPerson ?? null,
      p_delivery_date: params.deliveryDate ?? null,
      p_payment_type: params.paymentType ?? 'cash',
      p_payment_term_id: params.paymentTermId ?? null,
      p_customer_reference: params.customerReference ?? null,
      p_customer_po: params.customerPo ?? null,
      p_notes: params.notes ?? null,
      p_internal_notes: params.internalNotes ?? null,
      p_is_direct_invoice: params.isDirectInvoice ?? true,
      p_direct_invoice_source: params.directInvoiceSource ?? null,
      p_manual_invoice_number: params.manualInvoiceNumber ?? null,
      p_invoice_source: params.invoiceSource ?? 'web',
      p_device_uid: params.deviceUid ?? null,
      p_tax_inclusive: params.taxInclusive ?? false,
      p_latitude: params.latitude ?? null,
      p_longitude: params.longitude ?? null,
      p_is_offline: params.isOffline ?? false,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { submit, submitting };
}
