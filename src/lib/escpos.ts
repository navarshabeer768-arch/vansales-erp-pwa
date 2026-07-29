/**
 * Minimal ESC/POS command builder for thermal receipt printers (58mm/80mm).
 * Returns a Uint8Array ready to send over Web Bluetooth or a USB/serial
 * connection. Covers the common subset every cheap thermal printer supports:
 * init, text with basic styles, alignment, line feeds, and paper cut.
 */

const ESC = 0x1b;
const GS = 0x1d;

function textToBytes(text: string): number[] {
  // Thermal printers commonly expect a single-byte codepage (not UTF-8).
  // This covers ASCII; extended characters will print as '?' on most
  // printers unless you switch codepages — acceptable for now, flagged
  // in code for whoever extends this to non-Latin receipts.
  return Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff);
}

export class ReceiptBuilder {
  private bytes: number[] = [];

  init(): this {
    this.bytes.push(ESC, 0x40); // ESC @ : initialize printer
    return this;
  }

  align(mode: 'left' | 'center' | 'right'): this {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    this.bytes.push(ESC, 0x61, n);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  doubleSize(on: boolean): this {
    this.bytes.push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  text(line: string): this {
    this.bytes.push(...textToBytes(line));
    return this;
  }

  line(line: string = ''): this {
    this.text(line);
    this.bytes.push(0x0a);
    return this;
  }

  /** Two-column line — label left-aligned, value right-aligned, padded to `width` chars. */
  row(label: string, value: string, width = 32): this {
    const space = Math.max(1, width - label.length - value.length);
    return this.line(label + ' '.repeat(space) + value);
  }

  divider(char = '-', width = 32): this {
    return this.line(char.repeat(width));
  }

  feed(lines = 3): this {
    for (let i = 0; i < lines; i++) this.bytes.push(0x0a);
    return this;
  }

  cut(): this {
    this.bytes.push(GS, 0x56, 0x00); // full cut
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

export interface ReceiptSaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  companyName: string;
  storeId: string;
  invoiceNo: string;
  createdAt: string;
  customerName: string;
  items: ReceiptSaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  width?: 32 | 48; // 32 chars ≈ 58mm, 48 chars ≈ 80mm
}

export function buildReceipt(data: ReceiptData): Uint8Array {
  const width = data.width ?? 32;
  const b = new ReceiptBuilder().init();

  b.align('center').doubleSize(true).line(data.companyName).doubleSize(false);
  b.line(`Store: ${data.storeId}`);
  b.line(new Date(data.createdAt).toLocaleString());
  b.divider('=', width);

  b.align('left');
  b.line(`Invoice: ${data.invoiceNo}`);
  b.line(`Customer: ${data.customerName}`);
  b.divider('-', width);

  for (const item of data.items) {
    b.line(item.name);
    b.row(`  ${item.quantity} x ${item.unitPrice.toFixed(2)}`, item.lineTotal.toFixed(2), width);
  }
  b.divider('-', width);

  b.row('Subtotal', data.subtotal.toFixed(2), width);
  if (data.discount > 0) b.row('Discount', `-${data.discount.toFixed(2)}`, width);
  if (data.tax > 0) b.row('Tax', data.tax.toFixed(2), width);
  b.bold(true).row('TOTAL', data.total.toFixed(2), width).bold(false);
  b.row('Paid', data.paid.toFixed(2), width);
  if (data.balance > 0) b.row('Balance due', data.balance.toFixed(2), width);

  b.divider('=', width);
  b.align('center').line('Thank you!');
  b.feed(4).cut();

  return b.build();
}
