import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useAdjustmentDraftReports } from '@/hooks/useAdjustmentDraftReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { AdjustmentDraftRow, EmployeeAdjustmentRow, VanAdjustmentRow } from '@/hooks/useAdjustmentDraftReports';

type ReportKey =
  | 'credit_note_register' | 'debit_note_register' | 'customer_adjustment_register'
  | 'price' | 'quantity' | 'discount' | 'promotion' | 'tax' | 'employee' | 'van';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'credit_note_register', label: 'Credit Note Draft Register' },
  { key: 'debit_note_register', label: 'Debit Note Draft Register' },
  { key: 'customer_adjustment_register', label: 'Customer Adjustment Register' },
  { key: 'price', label: 'Price Adjustment Report' },
  { key: 'quantity', label: 'Quantity Adjustment Report' },
  { key: 'discount', label: 'Discount Adjustment Report' },
  { key: 'promotion', label: 'Promotion Adjustment Report' },
  { key: 'tax', label: 'Tax Adjustment Report' },
  { key: 'employee', label: 'Employee Adjustment Report' },
  { key: 'van', label: 'Van Adjustment Report' },
];

export function AdjustmentReportsPage() {
  const [report, setReport] = useState<ReportKey>('credit_note_register');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const {
    creditNoteRegister, debitNoteRegister, customerAdjustmentRegister,
    priceAdjustments, quantityAdjustments, discountAdjustments, promotionAdjustments, taxAdjustments,
    byEmployee, byVan, loading,
  } = useAdjustmentDraftReports(dateFrom, dateTo);

  const registerColumns: Column<AdjustmentDraftRow>[] = [
    { key: 'document_number', header: 'Number', sortValue: (r) => r.document_number },
    { key: 'document_date', header: 'Date', sortValue: (r) => r.document_date },
    { key: 'customer_name', header: 'Customer' },
    { key: 'document_type', header: 'Type' },
    { key: 'status', header: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'net_amount', header: 'Net Amount (Draft)', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
  ];

  const employeeColumns: Column<EmployeeAdjustmentRow>[] = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'document_count', header: 'Draft Documents', sortValue: (r) => r.document_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  const vanColumns: Column<VanAdjustmentRow>[] = [
    { key: 'van_name', header: 'Van' },
    { key: 'document_count', header: 'Draft Documents', sortValue: (r) => r.document_count },
    { key: 'total_amount', header: 'Total (Draft)', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Financial Adjustment Reports
        </h1>
        <p className="text-sm font-medium text-amber-600">
          Every figure below is a draft document — none of this has posted or adjusted a customer balance yet.
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

      {report === 'credit_note_register' && (
        <DataTable columns={registerColumns} rows={creditNoteRegister} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="credit_note_draft_register" />
      )}
      {report === 'debit_note_register' && (
        <DataTable columns={registerColumns} rows={debitNoteRegister} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="debit_note_draft_register" />
      )}
      {report === 'customer_adjustment_register' && (
        <DataTable columns={registerColumns} rows={customerAdjustmentRegister} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="customer_adjustment_register" />
      )}
      {report === 'price' && (
        <DataTable columns={registerColumns} rows={priceAdjustments} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="price_adjustment_report" />
      )}
      {report === 'quantity' && (
        <DataTable columns={registerColumns} rows={quantityAdjustments} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="quantity_adjustment_report" />
      )}
      {report === 'discount' && (
        <DataTable columns={registerColumns} rows={discountAdjustments} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="discount_adjustment_report" />
      )}
      {report === 'promotion' && (
        <DataTable columns={registerColumns} rows={promotionAdjustments} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="promotion_adjustment_report" />
      )}
      {report === 'tax' && (
        <DataTable columns={registerColumns} rows={taxAdjustments} rowKey={(r) => r.document_number} loading={loading}
          searchPlaceholder="Search…" exportFilename="tax_adjustment_report" />
      )}
      {report === 'employee' && (
        <DataTable columns={employeeColumns} rows={byEmployee} rowKey={(r) => r.employee_name} loading={loading}
          searchPlaceholder="Search employees…" exportFilename="employee_adjustment_report" />
      )}
      {report === 'van' && (
        <DataTable columns={vanColumns} rows={byVan} rowKey={(r) => r.van_name} loading={loading}
          searchPlaceholder="Search vans…" exportFilename="van_adjustment_report" />
      )}
    </div>
  );
}
