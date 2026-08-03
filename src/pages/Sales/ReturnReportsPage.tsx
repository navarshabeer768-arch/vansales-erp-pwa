import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useReturnDraftReports } from '@/hooks/useReturnDraftReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { ReturnDraftRegisterRow, EmployeeReturnRow, VanReturnRow } from '@/hooks/useReturnDraftReports';

type ReportKey = 'register' | 'invoice_based' | 'without_invoice' | 'damaged' | 'expired' | 'employee' | 'van';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'register', label: 'Sales Return Draft Register' },
  { key: 'invoice_based', label: 'Invoice-Based Return Draft Report' },
  { key: 'without_invoice', label: 'Return Without Invoice Report' },
  { key: 'damaged', label: 'Damaged Return Draft Report' },
  { key: 'expired', label: 'Expired Return Draft Report' },
  { key: 'employee', label: 'Employee Return Draft Report' },
  { key: 'van', label: 'Van Return Draft Report' },
];

export function ReturnReportsPage() {
  const [report, setReport] = useState<ReportKey>('register');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const { register, invoiceBased, withoutInvoice, damaged, expired, byEmployee, byVan, loading } = useReturnDraftReports(dateFrom, dateTo);

  const registerColumns: Column<ReturnDraftRegisterRow>[] = [
    { key: 'return_number', header: 'Return #', sortValue: (r) => r.return_number },
    { key: 'return_date', header: 'Date', sortValue: (r) => r.return_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'return_type', header: 'Type' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'validation_status', header: 'Validation', render: (r) => r.validation_status.replace(/_/g, ' ') },
    { key: 'net_return_amount', header: 'Net Amount (Draft)', sortValue: (r) => r.net_return_amount, render: (r) => r.net_return_amount.toFixed(2) },
  ];

  const employeeColumns: Column<EmployeeReturnRow>[] = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'return_count', header: 'Draft Returns', sortValue: (r) => r.return_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  const vanColumns: Column<VanReturnRow>[] = [
    { key: 'van_name', header: 'Van' },
    { key: 'return_count', header: 'Draft Returns', sortValue: (r) => r.return_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Return Draft Reports
        </h1>
        <p className="text-sm font-medium text-amber-600">
          Every figure below is a draft return — none of this has posted, adjusted stock, or affected a customer balance yet.
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
        <DataTable columns={registerColumns} rows={register} rowKey={(r) => r.return_number} loading={loading}
          searchPlaceholder="Search returns…" exportFilename="sales_return_draft_register" />
      )}
      {report === 'invoice_based' && (
        <DataTable columns={registerColumns} rows={invoiceBased} rowKey={(r) => r.return_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="invoice_based_return_draft_report" />
      )}
      {report === 'without_invoice' && (
        <DataTable columns={registerColumns} rows={withoutInvoice} rowKey={(r) => r.return_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="return_without_invoice_report" />
      )}
      {report === 'damaged' && (
        <DataTable columns={registerColumns} rows={damaged} rowKey={(r) => r.return_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="damaged_return_draft_report" />
      )}
      {report === 'expired' && (
        <DataTable columns={registerColumns} rows={expired} rowKey={(r) => r.return_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="expired_return_draft_report" />
      )}
      {report === 'employee' && (
        <DataTable columns={employeeColumns} rows={byEmployee} rowKey={(r) => r.employee_name} loading={loading}
          searchPlaceholder="Search employees…" exportFilename="employee_return_draft_report" />
      )}
      {report === 'van' && (
        <DataTable columns={vanColumns} rows={byVan} rowKey={(r) => r.van_name} loading={loading}
          searchPlaceholder="Search vans…" exportFilename="van_return_draft_report" />
      )}

      <p className="text-xs text-slate-400">
        Not yet built: Partial Return Draft, Full Invoice Return Draft, Good Stock Return Draft, Wrong Item Return,
        Return Reason, Return Condition, Batch Return Draft, Serial Return Draft, Replacement Request, Return
        Period Exception, Duplicate Return Warning, Route Return Draft, and Offline Return Draft reports.
      </p>
    </div>
  );
}
