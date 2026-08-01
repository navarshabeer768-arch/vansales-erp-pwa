import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useOrderControlReports } from '@/hooks/useOrderControlReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type {
  StockValidationReportRow, ReservationReportRow, CreditValidationReportRow, ApprovalReportRow, BackorderReportRow, CancellationReportRow,
  CreditReservationReportRow, CreditOverrideReportRow, PriceOverrideReportRow, DiscountOverrideReportRow, HoldReportRow,
} from '@/hooks/useOrderControlReports';

type ReportKey =
  | 'stock_validation' | 'reservation' | 'credit_validation' | 'approval' | 'backorder' | 'cancellation'
  | 'credit_reservation' | 'credit_override' | 'price_override' | 'discount_override' | 'hold';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'stock_validation', label: 'Order Stock Validation Report' },
  { key: 'reservation', label: 'Stock Reservation Report' },
  { key: 'credit_validation', label: 'Order Credit Validation Report' },
  { key: 'credit_reservation', label: 'Credit Reservation Report' },
  { key: 'credit_override', label: 'Credit Override Report' },
  { key: 'approval', label: 'Order Approval Report' },
  { key: 'price_override', label: 'Price Override Report' },
  { key: 'discount_override', label: 'Discount Override Report' },
  { key: 'hold', label: 'Order Hold Report' },
  { key: 'backorder', label: 'Backorder Report' },
  { key: 'cancellation', label: 'Order Cancellation Report' },
];

export function OrderControlReportsPage() {
  const [report, setReport] = useState<ReportKey>('stock_validation');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const {
    stockValidation, reservations, creditValidation, approvals, backorders, cancellations,
    creditReservations, creditOverrides, priceOverrides, discountOverrides, holds, loading,
  } = useOrderControlReports(dateFrom, dateTo);

  const stockValidationColumns: Column<StockValidationReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'location_type', header: 'Location' },
    { key: 'requested_base_quantity', header: 'Requested' },
    { key: 'available_quantity', header: 'Available' },
    { key: 'short_quantity', header: 'Short' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'validated_at', header: 'Validated', render: (r) => new Date(r.validated_at).toLocaleString() },
  ];

  const reservationColumns: Column<ReservationReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'product_name', header: 'Product' },
    { key: 'location_type', header: 'Location' },
    { key: 'reserved_base_quantity', header: 'Reserved' },
    { key: 'remaining_quantity', header: 'Remaining' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'expiry_date', header: 'Expiry', render: (r) => r.expiry_date ? new Date(r.expiry_date).toLocaleString() : '—' },
  ];

  const creditValidationColumns: Column<CreditValidationReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'current_order_credit_amount', header: 'Order Amount', render: (r) => r.current_order_credit_amount?.toFixed(2) ?? '—' },
    { key: 'available_credit_before', header: 'Available Before', render: (r) => r.available_credit_before?.toFixed(2) ?? '—' },
    { key: 'available_credit_after', header: 'Available After', render: (r) => r.available_credit_after?.toFixed(2) ?? '—' },
    { key: 'validation_time', header: 'Validated', render: (r) => new Date(r.validation_time).toLocaleString() },
  ];

  const approvalColumns: Column<ApprovalReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'approval_type', header: 'Trigger', render: (r) => r.approval_type.replace(/_/g, ' ') },
    { key: 'required_role', header: 'Role', render: (r) => r.required_role?.replace(/_/g, ' ') ?? '—' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'request_time', header: 'Requested', render: (r) => new Date(r.request_time).toLocaleString() },
    { key: 'action_time', header: 'Actioned', render: (r) => r.action_time ? new Date(r.action_time).toLocaleString() : '—' },
  ];

  const backorderColumns: Column<BackorderReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'product_name', header: 'Product' },
    { key: 'backorder_quantity', header: 'Backorder Qty' },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'required_date', header: 'Required Date', render: (r) => r.required_date ?? '—' },
  ];

  const cancellationColumns: Column<CancellationReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'reason', header: 'Reason' },
    { key: 'cancelled_at', header: 'Cancelled At', render: (r) => new Date(r.cancelled_at).toLocaleString() },
  ];

  const creditReservationColumns: Column<CreditReservationReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'reserved_amount', header: 'Reserved', render: (r) => r.reserved_amount.toFixed(2) },
    { key: 'remaining_amount', header: 'Remaining', render: (r) => r.remaining_amount.toFixed(2) },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  const creditOverrideColumns: Column<CreditOverrideReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'excess_amount', header: 'Excess Amount', render: (r) => r.excess_amount?.toFixed(2) ?? '—' },
    { key: 'approval_level', header: 'Approval Level', render: (r) => r.approval_level.replace(/_/g, ' ') },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'requested_date', header: 'Requested', render: (r) => new Date(r.requested_date).toLocaleString() },
  ];

  const priceOverrideColumns: Column<PriceOverrideReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'product_name', header: 'Product' },
    { key: 'original_price', header: 'Original Price', render: (r) => r.original_price.toFixed(2) },
    { key: 'requested_price', header: 'Requested Price', render: (r) => r.requested_price.toFixed(2) },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'requested_at', header: 'Requested', render: (r) => new Date(r.requested_at).toLocaleString() },
  ];

  const discountOverrideColumns: Column<DiscountOverrideReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'product_name', header: 'Product' },
    { key: 'requested_discount_pct', header: 'Requested %', render: (r) => r.requested_discount_pct ?? '—' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'requested_at', header: 'Requested', render: (r) => new Date(r.requested_at).toLocaleString() },
  ];

  const holdColumns: Column<HoldReportRow>[] = [
    { key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'hold_reason', header: 'Reason', render: (r) => r.hold_reason.replace(/_/g, ' ') },
    { key: 'held_time', header: 'Held At', render: (r) => new Date(r.held_time).toLocaleString() },
    { key: 'release_time', header: 'Released At', render: (r) => r.release_time ? new Date(r.release_time).toLocaleString() : 'Still on hold' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Order Control Reports
        </h1>
        <p className="text-sm text-slate-500">
          Functional subset of the Phase 5A.2 Part 2 reporting suite, built on real stock/credit/approval data.
          Search, sort, and CSV/Excel export are available on every table below.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Report</label>
          <select className="input min-w-[240px]" value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>
            {REPORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {report === 'stock_validation' && (
        <DataTable columns={stockValidationColumns} rows={stockValidation} rowKey={(r) => `${r.order_number}-${r.location_type}-${r.validated_at}`}
          loading={loading} searchPlaceholder="Search orders…" exportFilename="order_stock_validation_report" />
      )}
      {report === 'reservation' && (
        <DataTable columns={reservationColumns} rows={reservations} rowKey={(r) => `${r.order_number}-${r.product_name}-${r.status}`}
          loading={loading} searchPlaceholder="Search reservations…" exportFilename="stock_reservation_report" />
      )}
      {report === 'credit_validation' && (
        <DataTable columns={creditValidationColumns} rows={creditValidation} rowKey={(r) => `${r.order_number}-${r.validation_time}`}
          loading={loading} searchPlaceholder="Search orders…" exportFilename="order_credit_validation_report" />
      )}
      {report === 'approval' && (
        <DataTable columns={approvalColumns} rows={approvals} rowKey={(r) => `${r.order_number}-${r.approval_type}-${r.request_time}`}
          loading={loading} searchPlaceholder="Search approvals…" exportFilename="order_approval_report" />
      )}
      {report === 'backorder' && (
        <DataTable columns={backorderColumns} rows={backorders} rowKey={(r) => `${r.order_number}-${r.product_name}-${r.created_at}`}
          loading={loading} searchPlaceholder="Search backorders…" exportFilename="backorder_report" />
      )}
      {report === 'cancellation' && (
        <DataTable columns={cancellationColumns} rows={cancellations} rowKey={(r) => `${r.order_number}-${r.cancelled_at}`}
          loading={loading} searchPlaceholder="Search cancellations…" exportFilename="order_cancellation_report" />
      )}
      {report === 'credit_reservation' && (
        <DataTable columns={creditReservationColumns} rows={creditReservations} rowKey={(r) => `${r.order_number}-${r.created_at}`}
          loading={loading} searchPlaceholder="Search reservations…" exportFilename="credit_reservation_report" />
      )}
      {report === 'credit_override' && (
        <DataTable columns={creditOverrideColumns} rows={creditOverrides} rowKey={(r) => `${r.order_number}-${r.requested_date}`}
          loading={loading} searchPlaceholder="Search overrides…" exportFilename="credit_override_report" />
      )}
      {report === 'price_override' && (
        <DataTable columns={priceOverrideColumns} rows={priceOverrides} rowKey={(r) => `${r.order_number}-${r.product_name}-${r.requested_at}`}
          loading={loading} searchPlaceholder="Search overrides…" exportFilename="price_override_report" />
      )}
      {report === 'discount_override' && (
        <DataTable columns={discountOverrideColumns} rows={discountOverrides} rowKey={(r) => `${r.order_number}-${r.product_name}-${r.requested_at}`}
          loading={loading} searchPlaceholder="Search overrides…" exportFilename="discount_override_report" />
      )}
      {report === 'hold' && (
        <DataTable columns={holdColumns} rows={holds} rowKey={(r) => `${r.order_number}-${r.held_time}`}
          loading={loading} searchPlaceholder="Search holds…" exportFilename="order_hold_report" />
      )}

      <p className="text-xs text-slate-400">
        Not yet built: Reservation Expiry, Batch Reservation, Serial Reservation, Partially Reserved Order,
        Unreserved Approved Order, Backorder Aging, Stock Transfer Request, Approval Turnaround, Partial
        Approval, Free Quantity Approval, Order Amendment, Partial Cancellation, Order Expiry, Offline Order
        Validation, Order Conflict, and Order Conversion Status reports.
      </p>
    </div>
  );
}
