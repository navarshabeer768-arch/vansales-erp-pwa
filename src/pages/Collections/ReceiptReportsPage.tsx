import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useReceiptDraftReports } from '@/hooks/useReceiptDraftReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type {
  ReceiptDraftRegisterRow, EmployeeCollectionRow, VanCollectionRow, AllocationDraftRow, PromiseReportRow,
} from '@/hooks/useReceiptDraftReports';

type ReportKey =
  | 'register' | 'allocation' | 'cash' | 'card' | 'bank' | 'cheque' | 'advance' | 'unallocated' | 'mixed'
  | 'route' | 'offline' | 'promise' | 'employee' | 'van';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'register', label: 'Receipt Draft Register' },
  { key: 'allocation', label: 'Invoice Allocation Draft Report' },
  { key: 'cash', label: 'Cash Collection Draft Report' },
  { key: 'card', label: 'Card Collection Draft Report' },
  { key: 'bank', label: 'Bank Transfer Draft Report' },
  { key: 'cheque', label: 'Cheque Collection Draft Report' },
  { key: 'advance', label: 'Advance Payment Draft Report' },
  { key: 'unallocated', label: 'Unallocated Receipt Draft Report' },
  { key: 'mixed', label: 'Mixed Payment Draft Report' },
  { key: 'route', label: 'Route Collection Draft Report' },
  { key: 'offline', label: 'Offline Receipt Draft Report' },
  { key: 'promise', label: 'Payment Promise Report' },
  { key: 'employee', label: 'Employee Collection Draft Report' },
  { key: 'van', label: 'Van Collection Draft Report' },
];

export function ReceiptReportsPage() {
  const [report, setReport] = useState<ReportKey>('register');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const {
    register, cashDrafts, chequeDrafts, cardDrafts, bankDrafts, advanceDrafts, unallocatedDrafts,
    mixedDrafts, routeDrafts, offlineDrafts, allocations, promises, byEmployee, byVan, loading,
  } = useReceiptDraftReports(dateFrom, dateTo);

  const registerColumns: Column<ReceiptDraftRegisterRow>[] = [
    { key: 'receipt_number', header: 'Receipt #', sortValue: (r) => r.receipt_number },
    { key: 'receipt_date', header: 'Date', sortValue: (r) => r.receipt_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'collection_type', header: 'Type' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'allocation_status', header: 'Allocation', render: (r) => r.allocation_status.replace(/_/g, ' ') },
    { key: 'receipt_amount', header: 'Amount (Draft)', sortValue: (r) => r.receipt_amount, render: (r) => r.receipt_amount.toFixed(2) },
  ];

  const employeeColumns: Column<EmployeeCollectionRow>[] = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'receipt_count', header: 'Draft Receipts', sortValue: (r) => r.receipt_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  const vanColumns: Column<VanCollectionRow>[] = [
    { key: 'van_name', header: 'Van' },
    { key: 'receipt_count', header: 'Draft Receipts', sortValue: (r) => r.receipt_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  const allocationColumns: Column<AllocationDraftRow>[] = [
    { key: 'receipt_number', header: 'Receipt #', sortValue: (r) => r.receipt_number },
    { key: 'customer_name', header: 'Customer' },
    { key: 'invoice_number', header: 'Invoice #', render: (r) => r.final_invoice_number ?? r.invoice_number ?? '—' },
    { key: 'invoice_outstanding_snapshot', header: 'Outstanding at Allocation', sortValue: (r) => r.invoice_outstanding_snapshot, render: (r) => r.invoice_outstanding_snapshot.toFixed(2) },
    { key: 'allocated_amount', header: 'Allocated (Draft)', sortValue: (r) => r.allocated_amount, render: (r) => r.allocated_amount.toFixed(2) },
    { key: 'allocation_method', header: 'Method', render: (r) => r.allocation_method.replace(/_/g, ' ') },
  ];

  const promiseColumns: Column<PromiseReportRow>[] = [
    { key: 'customer_name', header: 'Customer' },
    { key: 'promised_amount', header: 'Promised Amount', sortValue: (r) => r.promised_amount, render: (r) => r.promised_amount.toFixed(2) },
    { key: 'promise_date', header: 'Promise Date', sortValue: (r) => r.promise_date },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'employee_notes', header: 'Notes', render: (r) => r.employee_notes ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Receipt Draft Reports
        </h1>
        <p className="text-sm font-medium text-amber-600">
          Every figure below is a draft receipt — none of this has posted or reduced a customer balance yet.
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
        <DataTable columns={registerColumns} rows={register} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search receipts…" exportFilename="receipt_draft_register" />
      )}
      {report === 'cash' && (
        <DataTable columns={registerColumns} rows={cashDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="cash_collection_draft_report" />
      )}
      {report === 'cheque' && (
        <DataTable columns={registerColumns} rows={chequeDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="cheque_collection_draft_report" />
      )}
      {report === 'card' && (
        <DataTable columns={registerColumns} rows={cardDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="card_collection_draft_report" />
      )}
      {report === 'bank' && (
        <DataTable columns={registerColumns} rows={bankDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="bank_transfer_draft_report" />
      )}
      {report === 'advance' && (
        <DataTable columns={registerColumns} rows={advanceDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="advance_payment_draft_report" />
      )}
      {report === 'unallocated' && (
        <DataTable columns={registerColumns} rows={unallocatedDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="unallocated_receipt_draft_report" />
      )}
      {report === 'mixed' && (
        <DataTable columns={registerColumns} rows={mixedDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="mixed_payment_draft_report" />
      )}
      {report === 'route' && (
        <DataTable columns={registerColumns} rows={routeDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="route_collection_draft_report" />
      )}
      {report === 'offline' && (
        <DataTable columns={registerColumns} rows={offlineDrafts} rowKey={(r) => r.receipt_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="offline_receipt_draft_report" />
      )}
      {report === 'allocation' && (
        <DataTable columns={allocationColumns} rows={allocations} rowKey={(r) => `${r.receipt_number}-${r.invoice_number}`} loading={loading}
          searchPlaceholder="Search allocations…" exportFilename="invoice_allocation_draft_report" />
      )}
      {report === 'promise' && (
        <DataTable columns={promiseColumns} rows={promises} rowKey={(r) => `${r.customer_name}-${r.promise_date}`} loading={loading}
          searchPlaceholder="Search promises…" exportFilename="payment_promise_report" />
      )}
      {report === 'employee' && (
        <DataTable columns={employeeColumns} rows={byEmployee} rowKey={(r) => r.employee_name} loading={loading}
          searchPlaceholder="Search employees…" exportFilename="employee_collection_draft_report" />
      )}
      {report === 'van' && (
        <DataTable columns={vanColumns} rows={byVan} rowKey={(r) => r.van_name} loading={loading}
          searchPlaceholder="Search vans…" exportFilename="van_collection_draft_report" />
      )}

      <p className="text-xs text-slate-400">
        Not yet built: Customer Collection Draft Report and Duplicate Payment Warning Report — the check runs
        live in the entry page but isn't aggregated into a standalone report yet.
      </p>
    </div>
  );
}
