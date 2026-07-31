/**
 * QR encoding for entity types that are NEW to QR lookup in this phase:
 * customer, invoice, van, warehouse. Product and batch QR/barcode labels
 * deliberately keep their existing bare-code format (just the SKU/barcode
 * or batch number, no prefix) — changing that would invalidate every
 * label already printed and stuck on real stock. The lookup side handles
 * both formats: it tries this prefix scheme first, then falls back to
 * matching the raw value against products/batches, so nothing already in
 * the field breaks.
 */
const PREFIX = 'VSPQR';

export type QrEntityType = 'customer' | 'invoice' | 'van' | 'warehouse';

export function encodeEntityQr(type: QrEntityType, id: string): string {
  return `${PREFIX}:${type}:${id}`;
}

export function decodeEntityQr(value: string): { type: QrEntityType; id: string } | null {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const type = parts[1] as QrEntityType;
  if (!['customer', 'invoice', 'van', 'warehouse'].includes(type)) return null;
  return { type, id: parts[2] };
}
