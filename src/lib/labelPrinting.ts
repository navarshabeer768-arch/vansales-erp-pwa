import QRCode from 'qrcode';
import { renderCode39Svg } from './code39';

export interface LabelItem {
  title: string;      // product name
  code: string;        // barcode/SKU value to encode
  price?: string;      // e.g. "12.50 QAR"
  batchNo?: string;
  expiryDate?: string;
  storeId?: string;
}

export type LabelSize = '58mm' | '80mm' | 'a4-sheet';
export type LabelSymbology = 'barcode' | 'qr';

async function renderSymbol(item: LabelItem, symbology: LabelSymbology, size: number): Promise<string> {
  if (symbology === 'qr') {
    return QRCode.toString(item.code, { type: 'svg', width: size, margin: 0 });
  }
  return renderCode39Svg(item.code, { width: size, height: Math.round(size * 0.4), showText: true });
}

function labelInnerHtml(item: LabelItem, symbolSvg: string): string {
  return `
    <div class="label">
      <div class="label-content">
        <div class="label-title">${escapeHtml(item.title)}</div>
        ${item.batchNo ? `<div class="label-meta">Batch: ${escapeHtml(item.batchNo)}</div>` : ''}
        ${item.expiryDate ? `<div class="label-meta">Exp: ${escapeHtml(item.expiryDate)}</div>` : ''}
        <div class="label-symbol">${symbolSvg}</div>
        ${item.price ? `<div class="label-price">${escapeHtml(item.price)}</div>` : ''}
        ${item.storeId ? `<div class="label-store">${escapeHtml(item.storeId)}</div>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

const SIZE_CONFIG: Record<LabelSize, { page: string; labelWidth: string; labelHeight: string; symbolSize: number; perRow: number }> = {
  '58mm': { page: 'size: 58mm auto;', labelWidth: '54mm', labelHeight: '32mm', symbolSize: 150, perRow: 1 },
  '80mm': { page: 'size: 80mm auto;', labelWidth: '76mm', labelHeight: '36mm', symbolSize: 200, perRow: 1 },
  'a4-sheet': { page: 'size: A4;', labelWidth: '63.5mm', labelHeight: '33.9mm', symbolSize: 110, perRow: 3 },
};

/** Repeats each item by its requested quantity, generates labels, and opens the browser print dialog. */
export async function printLabels(
  items: (LabelItem & { quantity?: number })[],
  symbology: LabelSymbology,
  size: LabelSize
): Promise<void> {
  const config = SIZE_CONFIG[size];
  const expanded: LabelItem[] = [];
  for (const item of items) {
    for (let i = 0; i < (item.quantity ?? 1); i++) expanded.push(item);
  }

  const labelsHtml = await Promise.all(
    expanded.map(async (item) => labelInnerHtml(item, await renderSymbol(item, symbology, config.symbolSize)))
  );

  const win = window.open('', '_blank', 'width=500,height=700');
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>Print Labels</title>
        <style>
          @page { ${config.page} margin: 3mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 0; }
          .label-sheet {
            display: flex; flex-wrap: wrap; gap: 2mm;
          }
          .label {
            width: ${config.labelWidth}; height: ${config.labelHeight};
            border: ${size === 'a4-sheet' ? '1px dashed #999' : 'none'};
            padding: 2mm; overflow: hidden;
            page-break-inside: avoid;
          }
          .label-content { text-align: center; }
          .label-title { font-size: 10px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .label-meta { font-size: 8px; color: #333; }
          .label-symbol svg { max-width: 100%; height: auto; }
          .label-price { font-size: 11px; font-weight: bold; margin-top: 1mm; }
          .label-store { font-size: 7px; color: #666; }
        </style>
      </head>
      <body>
        <div class="label-sheet">${labelsHtml.join('')}</div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}
