import type { ReceiptData } from './escpos';
import { buildReceipt } from './escpos';

// Web Bluetooth isn't in the standard TS DOM lib. Minimal ambient shape for
// just what this file uses.
interface BluetoothRemoteGATTCharacteristicLike {
  writeValue(value: Uint8Array): Promise<void>;
}
interface BluetoothRemoteGATTServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
}
interface BluetoothRemoteGATTServerLike {
  connect(): Promise<BluetoothRemoteGATTServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTServiceLike>;
}
interface BluetoothDeviceLike {
  gatt?: BluetoothRemoteGATTServerLike;
}
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: { filters: { services: string[] }[]; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
    };
  }
}

// Most cheap ESC/POS Bluetooth thermal printers expose this generic serial
// service (sometimes called "Serial Port Profile over BLE" clones) —
// e.g. many "58mm/80mm Bluetooth thermal printer" units sold for POS use.
// This is the widest-compatibility default, not a universal guarantee —
// some printers use vendor-specific UUIDs and would need a per-model tweak.
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export function isBluetoothPrintingSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Opens the browser's Bluetooth device picker and sends the receipt bytes. */
export async function printReceiptViaBluetooth(data: ReceiptData): Promise<void> {
  if (!isBluetoothPrintingSupported()) {
    throw new Error('Web Bluetooth isn\'t supported in this browser. Use Chrome/Edge on Android or desktop.');
  }

  const device = await navigator.bluetooth!.requestDevice({
    filters: [{ services: [PRINTER_SERVICE_UUID] }],
    optionalServices: [PRINTER_SERVICE_UUID],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to the printer.');

  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

  const bytes = buildReceipt(data);
  // BLE writes are typically capped around 20 bytes per packet on many
  // printers' characteristic — chunk to be safe across devices.
  const chunkSize = 20;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    await characteristic.writeValue(bytes.slice(i, i + chunkSize));
  }

  await server.disconnect();
}

/** Opens a print-ready A4 window using the browser's own print dialog — works everywhere, no pairing needed. */
export function printReceiptViaBrowser(data: ReceiptData): void {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;

  const rows = data.items.map((it) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:right">${it.unitPrice.toFixed(2)}</td>
      <td style="text-align:right">${it.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  win.document.write(`
    <html>
      <head>
        <title>Invoice ${escapeHtml(data.invoiceNo)}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; padding: 16px; color: #111; }
          h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
          .center { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { padding: 2px 4px; font-size: 11px; }
          th { text-align: left; border-bottom: 1px solid #000; }
          .totals td { border: none; }
          hr { border: none; border-top: 1px dashed #000; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.companyName)}</h1>
        <p class="center">Store: ${escapeHtml(data.storeId)}<br/>${escapeHtml(new Date(data.createdAt).toLocaleString())}</p>
        <hr/>
        <p>Invoice: ${escapeHtml(data.invoiceNo)}<br/>Customer: ${escapeHtml(data.customerName)}</p>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <hr/>
        <table class="totals">
          <tr><td>Subtotal</td><td style="text-align:right">${data.subtotal.toFixed(2)}</td></tr>
          ${data.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${data.discount.toFixed(2)}</td></tr>` : ''}
          ${data.tax > 0 ? `<tr><td>Tax</td><td style="text-align:right">${data.tax.toFixed(2)}</td></tr>` : ''}
          <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${data.total.toFixed(2)}</strong></td></tr>
          <tr><td>Paid</td><td style="text-align:right">${data.paid.toFixed(2)}</td></tr>
          ${data.balance > 0 ? `<tr><td>Balance due</td><td style="text-align:right">${data.balance.toFixed(2)}</td></tr>` : ''}
        </table>
        <p class="center">Thank you!</p>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
