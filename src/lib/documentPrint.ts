interface DocumentColumn { header: string; align?: 'left' | 'right' | 'center'; }

interface PrintDocumentOptions {
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  columns: DocumentColumn[];
  rows: (string | number)[][];
  footerNote?: string;
  signatureLabel?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

/** Opens a print-ready A4 window for any tabular operational document (Loading Sheet, Picking List, Transfer Note, Summary). */
export function printDocument(opts: PrintDocumentOptions) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;

  const metaHtml = opts.meta.map((m) => `<div><span class="meta-label">${escapeHtml(m.label)}:</span> ${escapeHtml(m.value)}</div>`).join('');
  const headHtml = opts.columns.map((c) => `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.header)}</th>`).join('');
  const rowsHtml = opts.rows.map((row) => `<tr>${row.map((cell, i) => `<td style="text-align:${opts.columns[i]?.align ?? 'left'}">${escapeHtml(String(cell))}</td>`).join('')}</tr>`).join('');

  win.document.write(`
    <html>
      <head>
        <title>${escapeHtml(opts.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
          h1 { font-size: 18px; margin: 0 0 2px; }
          .subtitle { color: #555; margin: 0 0 16px; }
          .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 16px; margin-bottom: 16px; font-size: 11px; }
          .meta-label { color: #777; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #ddd; }
          th { border-bottom: 2px solid #333; }
          .footer { margin-top: 24px; font-size: 11px; color: #555; }
          .signature-line { margin-top: 48px; display: flex; justify-content: space-between; }
          .signature-box { width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: 11px; color: #555; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(opts.title)}</h1>
        ${opts.subtitle ? `<p class="subtitle">${escapeHtml(opts.subtitle)}</p>` : ''}
        <div class="meta">${metaHtml}</div>
        <table>
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${opts.footerNote ? `<p class="footer">${escapeHtml(opts.footerNote)}</p>` : ''}
        <div class="signature-line">
          <div class="signature-box">${escapeHtml(opts.signatureLabel ?? 'Prepared By')}</div>
          <div class="signature-box">Received By</div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}
