import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useInvoiceDraftReports } from '@/hooks/useInvoiceDraftReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type {
  InvoiceDraftRegisterRow, EmployeeDraftInvoiceRow, VanDraftInvoiceRow, PostedInvoiceRow, UnpostedInvoiceRow,
  ApprovalReportRow, PostingFailureRow, HoldReportRow, VoidReportRow, StockMovementRow,
} from '@/hooks/useInvoiceDraftReports';

type ReportKey =
  | 'register' | 'order_conversion' | 'direct' | 'employee' | 'van'
  | 'posted' | 'unposted' | 'approval' | 'posting_failure' | 'hold' | 'void' | 'stock_movement';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'posted', label: 'Posted Sales Invoice Register' },
  { key: 'unposted', label: 'Unposted Invoice Report' },
  { key: 'register', label: 'Invoice Draft Register' },
  { key: 'order_conversion', label: 'Order Conversion Draft Report' },
  { key: 'direct', label: 'Direct Invoice Draft Report' },
  { key: 'approval', label: 'Invoice Approval Report' },
  { key: 'posting_failure', label: 'Posting Failure Report' },
  { key: 'hold', label: 'Invoice Hold Report' },
  { key: 'void', label: 'Void Request Report' },
  { key: 'stock_movement', label: 'Invoice Stock Movement Report' },
  { key: 'employee', label: 'Employee Draft Invoice Report' },
  { key: 'van', label: 'Van Draft Invoice Report' },
];

export function InvoiceReportsPage() {
  const [report, setReport] = useState<ReportKey>('register');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const {
    register, orderConversions, directInvoices, byEmployee, byVan,
    posted, unposted, approvals, postingFailures, holds, voids, stockMovements, loading,
  } = useInvoiceDraftReports(dateFrom, dateTo);

  const registerColumns: Column<InvoiceDraftRegisterRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'invoice_date', header: 'Date', sortValue: (r) => r.invoice_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'invoice_type', header: 'Type' },
    { key: 'payment_type', header: 'Payment', render: (r) => <span className="capitalize">{r.payment_type}</span> },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'net_amount', header: 'Net Amount (Draft)', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
  ];

  const employeeColumns: Column<EmployeeDraftInvoiceRow>[] = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'invoice_count', header: 'Draft Invoices', sortValue: (r) => r.invoice_count },
    { key: 'total_net_amount', header: 'Total Net (Draft)', sortValue: (r) => r.total_net_amount, render: (r) => r.total_net_amount.toFixed(2) },
  ];

  const vanColumns: Column<VanDraftInvoiceRow>[] = [
    { key: 'van_name', header: 'Van' },
    { key: 'invoice_count', header: 'Draft Invoices', sortValue: (r) => r.invoice_count },
    { key: 'total_net_amount', header: 'Total Net (Draft)', sortValue: (r) => r.total_net_amount, render: (r) => r.total_net_amount.toFixed(2) },
  ];

  const postedColumns: Column<PostedInvoiceRow>[] = [
    { key: 'final_invoice_number', header: 'Final #', render: (r) => r.final_invoice_number ?? r.invoice_number },
    { key: 'invoice_date', header: 'Date', sortValue: (r) => r.invoice_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'payment_type', header: 'Payment', render: (r) => <span className="capitalize">{r.payment_type}</span> },
    { key: 'net_amount', header: 'Net Amount', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
    { key: 'posted_date', header: 'Posted At', render: (r) => r.posted_date ? new Date(r.posted_date).toLocaleString() : '—' },
  ];

  const unpostedColumns: Column<UnpostedInvoiceRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'invoice_date', header: 'Date', sortValue: (r) => r.invoice_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'net_amount', header: 'Net Amount', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
  ];

  const approvalColumns: Column<ApprovalReportRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'approval_type', header: 'Trigger', render: (r) => r.approval_type.replace(/_/g, ' ') },
    { key: 'required_role', header: 'Role', render: (r) => r.required_role?.replace(/_/g, ' ') ?? '—' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'request_time', header: 'Requested', render: (r) => new Date(r.request_time).toLocaleString() },
  ];

  const postingFailureColumns: Column<PostingFailureRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'attempt_number', header: 'Attempt #' },
    { key: 'error_message', header: 'Error' },
    { key: 'attempted_at', header: 'Attempted', render: (r) => new Date(r.attempted_at).toLocaleString() },
  ];

  const holdColumns: Column<HoldReportRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'hold_reason', header: 'Reason', render: (r) => r.hold_reason.replace(/_/g, ' ') },
    { key: 'held_at', header: 'Held At', render: (r) => new Date(r.held_at).toLocaleString() },
    { key: 'released_at', header: 'Released At', render: (r) => r.released_at ? new Date(r.released_at).toLocaleString() : 'Still on hold' },
  ];

  const voidColumns: Column<VoidReportRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'reason', header: 'Reason' },
    { key: 'approval_status', header: 'Status', render: (r) => r.approval_status.replace(/_/g, ' ') },
    { key: 'request_date', header: 'Requested', render: (r) => new Date(r.request_date).toLocaleString() },
  ];

  const stockMovementColumns: Column<StockMovementRow>[] = [
    { key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number },
    { key: 'product_name', header: 'Product' },
    { key: 'movement_type', header: 'Type', render: (r) => r.movement_type.replace(/_/g, ' ') },
    { key: 'quantity', header: 'Quantity' },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Invoice Draft Reports
        </h1>
        <p className="text-sm font-medium text-amber-600">
          Every figure below is a draft / unposted invoice record — none of this is finalized sales revenue.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Report</label>
          <select className="input min-w-[220px]" value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>
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

      {report === 'register' && (
        <DataTable columns={registerColumns} rows={register} rowKey={(r) => r.invoice_number} loading={loading}
          searchPlaceholder="Search invoices…" exportFilename="invoice_draft_register" />
      )}
      {report === 'order_conversion' && (
        <DataTable columns={registerColumns} rows={orderConversions} rowKey={(r) => r.invoice_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="order_conversion_draft_report" />
      )}
      {report === 'direct' && (
        <DataTable columns={registerColumns} rows={directInvoices} rowKey={(r) => r.invoice_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="direct_invoice_draft_report" />
      )}
      {report === 'employee' && (
        <DataTable columns={employeeColumns} rows={byEmployee} rowKey={(r) => r.employee_name} loading={loading}
          searchPlaceholder="Search employees…" exportFilename="employee_draft_invoice_report" />
      )}
      {report === 'van' && (
        <DataTable columns={vanColumns} rows={byVan} rowKey={(r) => r.van_name} loading={loading}
          searchPlaceholder="Search vans…" exportFilename="van_draft_invoice_report" />
      )}
      {report === 'posted' && (
        <DataTable columns={postedColumns} rows={posted} rowKey={(r) => r.invoice_number} loading={loading}
          searchPlaceholder="Search posted invoices…" exportFilename="posted_sales_invoice_register" />
      )}
      {report === 'unposted' && (
        <DataTable columns={unpostedColumns} rows={unposted} rowKey={(r) => r.invoice_number} loading={loading}
          searchPlaceholder="Search unposted invoices…" exportFilename="unposted_invoice_report" />
      )}
      {report === 'approval' && (
        <DataTable columns={approvalColumns} rows={approvals} rowKey={(r) => `${r.invoice_number}-${r.approval_type}-${r.request_time}`} loading={loading}
          searchPlaceholder="Search approvals…" exportFilename="invoice_approval_report" />
      )}
      {report === 'posting_failure' && (
        <DataTable columns={postingFailureColumns} rows={postingFailures} rowKey={(r) => `${r.invoice_number}-${r.attempt_number}`} loading={loading}
          searchPlaceholder="Search failures…" exportFilename="posting_failure_report" />
      )}
      {report === 'hold' && (
        <DataTable columns={holdColumns} rows={holds} rowKey={(r) => `${r.invoice_number}-${r.held_at}`} loading={loading}
          searchPlaceholder="Search holds…" exportFilename="invoice_hold_report" />
      )}
      {report === 'void' && (
        <DataTable columns={voidColumns} rows={voids} rowKey={(r) => `${r.invoice_number}-${r.request_date}`} loading={loading}
          searchPlaceholder="Search void requests…" exportFilename="void_request_report" />
      )}
      {report === 'stock_movement' && (
        <DataTable columns={stockMovementColumns} rows={stockMovements} rowKey={(r) => `${r.invoice_number}-${r.product_name}-${r.created_at}`} loading={loading}
          searchPlaceholder="Search movements…" exportFilename="invoice_stock_movement_report" />
      )}

      <p className="text-xs text-slate-400">
        Not yet built: Cash/Credit/Hybrid Invoice Report, Invoice Item Draft Report, Route Draft Invoice Report,
        Offline Draft/Conflict Report, Invoice Stock Validation, Reservation Consumption, Batch Consumption, Serial
        Sales, Credit Validation, Credit Reservation Conversion, Credit Override, Print History, Reprint,
        Warehouse Sales Invoice, Customer Invoice, Product/Category/Brand Sales, Tax, Discount, and Promotion reports.
      </p>
    </div>
  );
}
