import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface StockValidationReportRow {
  order_number: string; customer_name: string; location_type: string;
  requested_base_quantity: number; available_quantity: number; short_quantity: number; status: string; validated_at: string;
}
export interface ReservationReportRow {
  order_number: string; customer_name: string; product_name: string; location_type: string;
  reserved_base_quantity: number; remaining_quantity: number; status: string; expiry_date: string | null;
}
export interface CreditValidationReportRow {
  order_number: string; customer_name: string; status: string; current_order_credit_amount: number | null;
  available_credit_before: number | null; available_credit_after: number | null; validation_time: string;
}
export interface ApprovalReportRow {
  order_number: string; customer_name: string; approval_type: string; required_role: string | null;
  status: string; request_time: string; action_time: string | null;
}
export interface BackorderReportRow {
  order_number: string; customer_name: string; product_name: string; backorder_quantity: number;
  priority: string; status: string; required_date: string | null; created_at: string;
}
export interface CancellationReportRow {
  order_number: string; customer_name: string; reason: string; cancelled_at: string;
}
export interface CreditReservationReportRow {
  order_number: string; customer_name: string; reserved_amount: number; remaining_amount: number; status: string; created_at: string;
}
export interface CreditOverrideReportRow {
  order_number: string; customer_name: string; excess_amount: number | null; approval_level: string; status: string; requested_date: string;
}
export interface PriceOverrideReportRow {
  order_number: string; customer_name: string; product_name: string; original_price: number; requested_price: number; status: string; requested_at: string;
}
export interface DiscountOverrideReportRow {
  order_number: string; customer_name: string; product_name: string; requested_discount_pct: number | null; status: string; requested_at: string;
}
export interface HoldReportRow {
  order_number: string; customer_name: string; hold_reason: string; held_time: string; released_by: string | null; release_time: string | null;
}

export function useOrderControlReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [stockValidation, setStockValidation] = useState<StockValidationReportRow[]>([]);
  const [reservations, setReservations] = useState<ReservationReportRow[]>([]);
  const [creditValidation, setCreditValidation] = useState<CreditValidationReportRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalReportRow[]>([]);
  const [backorders, setBackorders] = useState<BackorderReportRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationReportRow[]>([]);
  const [creditReservations, setCreditReservations] = useState<CreditReservationReportRow[]>([]);
  const [creditOverrides, setCreditOverrides] = useState<CreditOverrideReportRow[]>([]);
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrideReportRow[]>([]);
  const [discountOverrides, setDiscountOverrides] = useState<DiscountOverrideReportRow[]>([]);
  const [holds, setHolds] = useState<HoldReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const toEnd = `${dateTo}T23:59:59`;

    const { data: sv } = await supabase
      .from('sales_order_stock_validations')
      .select('location_type, requested_base_quantity, available_quantity, short_quantity, status, validated_at, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('validated_at', dateFrom).lte('validated_at', toEnd);
    setStockValidation(((sv ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name,
      location_type: r.location_type, requested_base_quantity: r.requested_base_quantity,
      available_quantity: r.available_quantity, short_quantity: r.short_quantity, status: r.status, validated_at: r.validated_at,
    })));

    const { data: res } = await supabase
      .from('sales_order_stock_reservations')
      .select('location_type, reserved_base_quantity, remaining_quantity, status, expiry_date, product:products(name), order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('created_at', dateFrom).lte('created_at', toEnd);
    setReservations(((res ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, product_name: r.product?.name,
      location_type: r.location_type, reserved_base_quantity: r.reserved_base_quantity, remaining_quantity: r.remaining_quantity,
      status: r.status, expiry_date: r.expiry_date,
    })));

    const { data: cv } = await supabase
      .from('sales_order_credit_validations')
      .select('status, current_order_credit_amount, available_credit_before, available_credit_after, validation_time, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('validation_time', dateFrom).lte('validation_time', toEnd);
    setCreditValidation(((cv ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, status: r.status,
      current_order_credit_amount: r.current_order_credit_amount, available_credit_before: r.available_credit_before,
      available_credit_after: r.available_credit_after, validation_time: r.validation_time,
    })));

    const { data: ap } = await supabase
      .from('sales_order_approval_steps')
      .select('approval_type, required_role, status, request_time, action_time, approval:sales_order_approvals!inner(order_id, order:sales_orders!inner(order_number, company_id, customer:customers(business_name)))')
      .eq('approval.order.company_id', company.id).gte('request_time', dateFrom).lte('request_time', toEnd);
    setApprovals(((ap ?? []) as any[]).map((r) => ({
      order_number: r.approval?.order?.order_number, customer_name: r.approval?.order?.customer?.business_name,
      approval_type: r.approval_type, required_role: r.required_role, status: r.status, request_time: r.request_time, action_time: r.action_time,
    })));

    const { data: bo } = await supabase
      .from('sales_order_backorders')
      .select('backorder_quantity, priority, status, required_date, created_at, product:products(name), order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('created_at', dateFrom).lte('created_at', toEnd);
    setBackorders(((bo ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, product_name: r.product?.name,
      backorder_quantity: r.backorder_quantity, priority: r.priority, status: r.status, required_date: r.required_date, created_at: r.created_at,
    })));

    const { data: cx } = await supabase
      .from('sales_order_cancellations')
      .select('reason, cancelled_at, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('cancelled_at', dateFrom).lte('cancelled_at', toEnd);
    setCancellations(((cx ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, reason: r.reason, cancelled_at: r.cancelled_at,
    })));

    const { data: cr } = await supabase
      .from('sales_order_credit_reservations')
      .select('reserved_amount, remaining_amount, status, created_at, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('created_at', dateFrom).lte('created_at', toEnd);
    setCreditReservations(((cr ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name,
      reserved_amount: r.reserved_amount, remaining_amount: r.remaining_amount, status: r.status, created_at: r.created_at,
    })));

    const { data: co } = await supabase
      .from('sales_order_credit_override_requests')
      .select('excess_amount, approval_level, status, requested_date, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('requested_date', dateFrom).lte('requested_date', toEnd);
    setCreditOverrides(((co ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name,
      excess_amount: r.excess_amount, approval_level: r.approval_level, status: r.status, requested_date: r.requested_date,
    })));

    const { data: po } = await supabase
      .from('sales_order_price_override_requests')
      .select('original_price, requested_price, status, requested_at, order:sales_orders!inner(order_number, company_id, customer:customers(business_name)), item:sales_order_items(product:products(name))')
      .eq('order.company_id', company.id).gte('requested_at', dateFrom).lte('requested_at', toEnd);
    setPriceOverrides(((po ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, product_name: r.item?.product?.name,
      original_price: r.original_price, requested_price: r.requested_price, status: r.status, requested_at: r.requested_at,
    })));

    const { data: dc } = await supabase
      .from('sales_order_discount_override_requests')
      .select('requested_discount_pct, status, requested_at, order:sales_orders!inner(order_number, company_id, customer:customers(business_name)), item:sales_order_items(product:products(name))')
      .eq('order.company_id', company.id).gte('requested_at', dateFrom).lte('requested_at', toEnd);
    setDiscountOverrides(((dc ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name, product_name: r.item?.product?.name,
      requested_discount_pct: r.requested_discount_pct, status: r.status, requested_at: r.requested_at,
    })));

    const { data: hd } = await supabase
      .from('sales_order_hold_history')
      .select('hold_reason, held_time, released_by, release_time, order:sales_orders!inner(order_number, company_id, customer:customers(business_name))')
      .eq('order.company_id', company.id).gte('held_time', dateFrom).lte('held_time', toEnd);
    setHolds(((hd ?? []) as any[]).map((r) => ({
      order_number: r.order?.order_number, customer_name: r.order?.customer?.business_name,
      hold_reason: r.hold_reason, held_time: r.held_time, released_by: r.released_by, release_time: r.release_time,
    })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    stockValidation, reservations, creditValidation, approvals, backorders, cancellations,
    creditReservations, creditOverrides, priceOverrides, discountOverrides, holds,
    loading, reload: load,
  };
}
