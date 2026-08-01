import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface OrderCartItem {
  product_id: string;
  variant_id?: string | null;
  unit_id?: string | null;
  batch_id?: string | null;
  quantity: number;
  requested_price?: number | null;
  price_override_reason?: string | null;
  manual_discount_pct?: number | null;
  manual_discount_amount?: number | null;
  item_notes?: string | null;
  // Display-only fields the UI needs, not sent to the server as-is:
  name: string;
  sku: string;
  standard_price: number;
  unit_symbol: string;
}

export interface CreateOrderParams {
  customerId: string;
  orderTypeCode: string;
  items: OrderCartItem[];
  branchId?: string | null;
  routeId?: string | null;
  beatPlanId?: string | null;
  dailyVisitPlanId?: string | null;
  customerVisitId?: string | null;
  salesmanId?: string | null;
  vanId?: string | null;
  warehouseId?: string | null;
  deliveryAddressId?: string | null;
  contactPerson?: string | null;
  expectedDeliveryDate?: string | null;
  paymentType?: string | null;
  paymentTermId?: string | null;
  customerReference?: string | null;
  customerPo?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  isDirectOrder?: boolean;
  directOrderType?: string | null;
  manualOrderNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isOffline?: boolean;
}

function genClientUuid() {
  return `so-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCreateSalesOrder() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: CreateOrderParams) => {
    setSubmitting(true);
    const clientUuid = genClientUuid();
    const { data, error } = await supabase.rpc('create_sales_order', {
      p_customer_id: params.customerId,
      p_order_type_code: params.orderTypeCode,
      p_items: params.items.map((i) => ({
        product_id: i.product_id, variant_id: i.variant_id ?? null, unit_id: i.unit_id ?? null, batch_id: i.batch_id ?? null,
        quantity: i.quantity, requested_price: i.requested_price ?? null, price_override_reason: i.price_override_reason ?? null,
        manual_discount_pct: i.manual_discount_pct ?? null, manual_discount_amount: i.manual_discount_amount ?? null,
        item_notes: i.item_notes ?? null,
      })),
      p_client_uuid: clientUuid,
      p_branch_id: params.branchId ?? null,
      p_route_id: params.routeId ?? null,
      p_beat_plan_id: params.beatPlanId ?? null,
      p_daily_visit_plan_id: params.dailyVisitPlanId ?? null,
      p_customer_visit_id: params.customerVisitId ?? null,
      p_salesman_id: params.salesmanId ?? null,
      p_van_id: params.vanId ?? null,
      p_warehouse_id: params.warehouseId ?? null,
      p_delivery_address_id: params.deliveryAddressId ?? null,
      p_contact_person: params.contactPerson ?? null,
      p_expected_delivery_date: params.expectedDeliveryDate ?? null,
      p_payment_type: params.paymentType ?? null,
      p_payment_term_id: params.paymentTermId ?? null,
      p_customer_reference: params.customerReference ?? null,
      p_customer_po: params.customerPo ?? null,
      p_notes: params.notes ?? null,
      p_internal_notes: params.internalNotes ?? null,
      p_is_direct_order: params.isDirectOrder ?? true,
      p_direct_order_type: params.directOrderType ?? null,
      p_manual_order_number: params.manualOrderNumber ?? null,
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
