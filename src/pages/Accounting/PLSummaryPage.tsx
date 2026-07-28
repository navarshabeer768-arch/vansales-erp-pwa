import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { usePLSummary } from '@/hooks/usePLSummary';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function Row({ label, value, emphasis = false, negative = false }: { label: string; value: number; emphasis?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasis ? 'border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700' : 'text-sm'}`}>
      <span className={emphasis ? '' : 'text-slate-500'}>{label}</span>
      <span className={negative ? 'text-red-600' : ''}>{negative ? '-' : ''}{Math.abs(value).toFixed(2)}</span>
    </div>
  );
}

export function PLSummaryPage() {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const { summary, loading } = usePLSummary(startDate, endDate);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Profit &amp; Loss Summary</h1>
        <p className="text-sm text-slate-500">
          A quick read on margin for a date range — revenue, estimated cost of goods sold, and operating expenses.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {loading || !summary ? (
        <p className="py-10 text-center text-slate-400">Calculating…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card space-y-2 p-5">
            <Row label="Revenue (subtotal)" value={summary.revenue} />
            <Row label="Discounts given" value={summary.discounts} negative />
            <Row label="Estimated cost of goods sold" value={summary.cogs} negative />
            <Row label="Gross profit" value={summary.grossProfit} emphasis />
          </div>
          <div className="card space-y-2 p-5">
            <Row label="Gross profit" value={summary.grossProfit} />
            <Row label="Operating expenses" value={summary.expenses} negative />
            <Row label="Net profit" value={summary.netProfit} emphasis />
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">
              {summary.netProfit >= 0 ? <TrendingUp size={14} className="text-emerald-600" /> : <TrendingDown size={14} className="text-red-600" />}
              Tax collected in this period (not part of profit): {summary.taxCollected.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        This is a quick computed estimate — cost of goods sold uses each product's current cost price rather than
        its historical cost at time of sale. For period-accurate accounting, post entries against the chart of
        accounts (coming in a later pass).
      </p>
    </div>
  );
}
