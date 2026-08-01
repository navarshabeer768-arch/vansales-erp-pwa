import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useOrderControlReports } from '@/hooks/useOrderControlReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type {
  StockValidationReportRow, ReservationReportRow, CreditValidationReportRow, ApprovalReportRow, BackorderReportRow, CancellationReportRow,
} from '@/hooks/useOrderControlReports';

type ReportKey = 'stock_validation' | 'reservation' | 'credit_validation' | 'approval' | 'backorder' | 'cancellation';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'stock_validation', label: 'Order Stock Validation Report' },
  { key: 'reservation', label: 'Stock Reservation Report' },
  { key: 'credit_validation', label: 'Order Credit Validation Report' },
  { key: 'approval', label: 'Order Approval Report' },
  { key: 'backorder', label: 'Backorder Report' },
  { key: 'cancellation', label: 'Order Cancellation Report' },
];

export function OrderControlReportsPage() {
  const [report, setReport] = useState<ReportKey>('stock_validation');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const { stockValidation, reservations, creditValidation, approvals, backorders, cancellations, loading } = useOrderControlReports(dateFrom, dateTo);

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

      <p className="text-xs text-slate-400">
        Not yet built: Reservation Expiry, Batch Reservation, Serial Reservation, Partially Reserved Order,
        Unreserved Approved Order, Backorder Aging, Stock Transfer Request, Credit Reservation, Credit Override,
        Approval Turnaround, Partial Approval, Price Override, Discount Override, Free Quantity Approval, Order
        Hold, Order Amendment, Partial Cancellation, Order Expiry, Offline Order Validation, Order Conflict, and
        Order Conversion Status reports.
      </p>
    </div>
  );
}
