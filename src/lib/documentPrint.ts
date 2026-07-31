interface DocumentColumn { header: string; align?: 'left' | 'right' | 'center'; }

export interface DocumentPrintSettings {
  paper_size: '58mm' | '80mm' | 'a4';
  header_text: string | null;
  footer_text: string | null;
  terms_text: string | null;
  show_signature: boolean;
  copies: number;
}

interface PrintDocumentOptions {
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  columns: DocumentColumn[];
  rows: (string | number)[][];
  footerNote?: string;
  signatureLabel?: string;
  settings?: DocumentPrintSettings;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

const PAGE_WIDTH: Record<string, string> = { '58mm': '58mm', '80mm': '80mm', a4: '210mm' };

/** Opens a print-ready window for any tabular operational document (Loading Sheet, Picking List, Invoice, Collection/Return Receipt, Customer Statement, Stock Count Report, Daily Summary). Honors the company's Print Settings (paper size, header/footer/terms, signature line, copies) when supplied. */
export function printDocument(opts: PrintDocumentOptions) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;

  const s = opts.settings;
  const paperSize = s?.paper_size ?? 'a4';
  const showSignature = s ? s.show_signature : true;
  const copies = s?.copies ?? 1;

  const metaHtml = opts.meta.map((m) => `<div><span class="meta-label">${escapeHtml(m.label)}:</span> ${escapeHtml(m.value)}</div>`).join('');
  const headHtml = opts.columns.map((c) => `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.header)}</th>`).join('');
  const rowsHtml = opts.rows.map((row) => `<tr>${row.map((cell, i) => `<td style="text-align:${opts.columns[i]?.align ?? 'left'}">${escapeHtml(String(cell))}</td>`).join('')}</tr>`).join('');

  const documentBody = `
        <h1>${escapeHtml(opts.title)}</h1>
        ${opts.subtitle ? `<p class="subtitle">${escapeHtml(opts.subtitle)}</p>` : ''}
        ${s?.header_text ? `<p class="header-note">${escapeHtml(s.header_text)}</p>` : ''}
        <div class="meta">${metaHtml}</div>
        <table>
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${opts.footerNote ? `<p class="footer">${escapeHtml(opts.footerNote)}</p>` : ''}
        ${s?.terms_text ? `<p class="terms">${escapeHtml(s.terms_text)}</p>` : ''}
        ${s?.footer_text ? `<p class="footer">${escapeHtml(s.footer_text)}</p>` : ''}
        ${showSignature ? `
        <div class="signature-line">
          <div class="signature-box">${escapeHtml(opts.signatureLabel ?? 'Prepared By')}</div>
          <div class="signature-box">Received By</div>
        </div>` : ''}
  `;

  win.document.write(`
    <html>
      <head>
        <title>${escapeHtml(opts.title)}</title>
        <style>
          @page { size: ${PAGE_WIDTH[paperSize]} auto; margin: ${paperSize === 'a4' ? '12mm' : '2mm'}; }
          body { font-family: Arial, sans-serif; font-size: ${paperSize === 'a4' ? '12px' : '10px'}; color: #111; padding: ${paperSize === 'a4' ? '24px' : '4px'}; }
          h1 { font-size: ${paperSize === 'a4' ? '18px' : '14px'}; margin: 0 0 2px; }
          .subtitle, .header-note { color: #555; margin: 0 0 8px; }
          .meta { display: grid; grid-template-columns: ${paperSize === 'a4' ? '1fr 1fr 1fr' : '1fr'}; gap: 2px 16px; margin-bottom: 12px; font-size: ${paperSize === 'a4' ? '11px' : '9px'}; }
          .meta-label { color: #777; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { padding: ${paperSize === 'a4' ? '5px 8px' : '2px 3px'}; font-size: ${paperSize === 'a4' ? '11px' : '9px'}; border-bottom: 1px solid #ddd; }
          th { border-bottom: 2px solid #333; }
          .footer, .terms { margin-top: 12px; font-size: ${paperSize === 'a4' ? '11px' : '9px'}; color: #555; }
          .signature-line { margin-top: ${paperSize === 'a4' ? '48px' : '24px'}; display: flex; justify-content: space-between; }
          .signature-box { width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: ${paperSize === 'a4' ? '11px' : '9px'}; color: #555; }
        </style>
      </head>
      <body>
        ${Array.from({ length: Math.max(1, copies) }).map(() => documentBody).join(paperSize === 'a4' ? '<div style="page-break-after: always;"></div>' : '<hr style="border-top: 1px dashed #999; margin: 12px 0;">')}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}
