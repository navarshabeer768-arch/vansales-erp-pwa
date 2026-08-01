import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useInvoiceDraftReports } from '@/hooks/useInvoiceDraftReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { InvoiceDraftRegisterRow, EmployeeDraftInvoiceRow, VanDraftInvoiceRow } from '@/hooks/useInvoiceDraftReports';

type ReportKey = 'register' | 'order_conversion' | 'direct' | 'employee' | 'van';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'register', label: 'Invoice Draft Register' },
  { key: 'order_conversion', label: 'Order Conversion Draft Report' },
  { key: 'direct', label: 'Direct Invoice Draft Report' },
  { key: 'employee', label: 'Employee Draft Invoice Report' },
  { key: 'van', label: 'Van Draft Invoice Report' },
];

export function InvoiceReportsPage() {
  const [report, setReport] = useState<ReportKey>('register');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const { register, orderConversions, directInvoices, byEmployee, byVan, loading } = useInvoiceDraftReports(dateFrom, dateTo);

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

      <p className="text-xs text-slate-400">
        Not yet built: Cash Invoice Draft, Credit Invoice Draft, Hybrid Invoice Draft, Invoice Item Draft, Route
        Draft Invoice, Offline Draft Invoice, Price Request, Discount Request, Promotion Application, and Tax
        Calculation Preview reports.
      </p>
    </div>
  );
}
