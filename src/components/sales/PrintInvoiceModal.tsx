import { useState } from 'react';
import { Printer, Bluetooth, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { printReceiptViaBrowser, printReceiptViaBluetooth, isBluetoothPrintingSupported } from '@/lib/bluetoothPrint';
import { printDocument } from '@/lib/documentPrint';
import { useToast } from '@/contexts/ToastContext';
import type { SalesInvoiceDetail, SalesInvoiceItemDetail } from '@/hooks/useSalesInvoiceDetail';

export function PrintInvoiceModal({ open, onClose, invoice, items }: {
  open: boolean;
  onClose: () => void;
  invoice: SalesInvoiceDetail;
  items: SalesInvoiceItemDetail[];
}) {
  const { settings } = usePrintSettings();
  const { push } = useToast();
  const [printing, setPrinting] = useState<string | null>(null);

  const displayNumber = (invoice as any).final_invoice_number ?? invoice.invoice_number;

  const logPrint = async (paperSize: '58mm' | '80mm' | 'a4', printerType: string) => {
    const { error } = await supabase.rpc('record_invoice_print', {
      p_invoice_id: invoice.id, p_paper_size: paperSize, p_printer_type: printerType,
    });
    if (error) push('error', `Printed, but couldn't log the print: ${error.message}`);
  };

  const logError = async (message: string, printerType: string) => {
    await supabase.rpc('record_invoice_print_error_notified', {
      p_invoice_id: invoice.id, p_error_message: message, p_printer_type: printerType,
    });
  };

  const handleThermalBrowser = async () => {
    setPrinting('browser');
    try {
      printReceiptViaBrowser({
        companyName: settings.header_text ?? 'Company', storeId: invoice.van?.code ?? invoice.warehouse?.code ?? '—',
        invoiceNo: displayNumber, createdAt: invoice.invoice_time, customerName: invoice.customer?.business_name ?? invoice.walk_in_name ?? 'Walk-in',
        items: items.filter((i) => i.item_notes !== 'removed').map((i) => ({ name: i.product?.name ?? i.description ?? '', quantity: i.invoice_quantity, unitPrice: i.applied_price, lineTotal: i.net_amount })),
        subtotal: invoice.gross_amount, discount: invoice.item_discount_amount, tax: invoice.tax_amount, total: invoice.net_amount,
        paid: invoice.payment_type === 'cash' ? invoice.net_amount : 0, balance: invoice.payment_type === 'cash' ? 0 : invoice.net_amount,
        width: settings.paper_size === '58mm' ? 32 : 48,
      });
      await logPrint(settings.paper_size === '58mm' ? '58mm' : '80mm', 'browser');
      push('success', 'Print sent.');
    } catch (e: any) {
      await logError(e?.message ?? 'Browser print failed', 'browser');
      push('error', e?.message ?? 'Print failed.');
    } finally {
      setPrinting(null);
    }
  };

  const handleThermalBluetooth = async () => {
    setPrinting('bluetooth');
    try {
      await printReceiptViaBluetooth({
        companyName: settings.header_text ?? 'Company', storeId: invoice.van?.code ?? invoice.warehouse?.code ?? '—',
        invoiceNo: displayNumber, createdAt: invoice.invoice_time, customerName: invoice.customer?.business_name ?? invoice.walk_in_name ?? 'Walk-in',
        items: items.filter((i) => i.item_notes !== 'removed').map((i) => ({ name: i.product?.name ?? i.description ?? '', quantity: i.invoice_quantity, unitPrice: i.applied_price, lineTotal: i.net_amount })),
        subtotal: invoice.gross_amount, discount: invoice.item_discount_amount, tax: invoice.tax_amount, total: invoice.net_amount,
        paid: invoice.payment_type === 'cash' ? invoice.net_amount : 0, balance: invoice.payment_type === 'cash' ? 0 : invoice.net_amount,
        width: settings.paper_size === '58mm' ? 32 : 48,
      });
      await logPrint(settings.paper_size === '58mm' ? '58mm' : '80mm', 'bluetooth');
      push('success', 'Sent to Bluetooth printer.');
    } catch (e: any) {
      await logError(e?.message ?? 'Bluetooth print failed', 'bluetooth');
      push('error', e?.message ?? 'Bluetooth print failed.');
    } finally {
      setPrinting(null);
    }
  };

  const handleA4 = async () => {
    setPrinting('a4');
    try {
      printDocument({
        title: `Tax Invoice ${displayNumber}`,
        subtitle: invoice.customer?.business_name ?? invoice.walk_in_name ?? 'Walk-in customer',
        meta: [
          { label: 'Invoice Date', value: invoice.invoice_date },
          { label: 'Payment Type', value: invoice.payment_type },
          { label: 'Sales Order', value: invoice.sales_order_id ? 'Converted' : 'Direct' },
        ],
        columns: [{ header: 'Product' }, { header: 'Qty', align: 'right' }, { header: 'Price', align: 'right' }, { header: 'Discount', align: 'right' }, { header: 'Tax', align: 'right' }, { header: 'Net', align: 'right' }],
        rows: items.map((i) => [i.product?.name ?? i.description ?? '', i.invoice_quantity, i.applied_price.toFixed(2), i.discount_amount.toFixed(2), i.tax_amount.toFixed(2), i.net_amount.toFixed(2)]),
        footerNote: `Net Amount: ${invoice.net_amount.toFixed(2)} ${invoice.currency}`,
        signatureLabel: 'Authorized Signature',
        settings: { paper_size: 'a4', header_text: settings.header_text, footer_text: settings.footer_text, terms_text: settings.terms_text, show_signature: settings.show_signature, copies: settings.copies },
      });
      await logPrint('a4', 'browser');
      push('success', 'A4 print sent.');
    } catch (e: any) {
      await logError(e?.message ?? 'A4 print failed', 'browser');
      push('error', e?.message ?? 'Print failed.');
    } finally {
      setPrinting(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Print Invoice ${displayNumber}`} size="sm">
      <div className="space-y-3">
        <button className="btn-secondary w-full justify-center" onClick={handleThermalBrowser} disabled={!!printing}>
          <Printer size={16} /> {settings.paper_size === '58mm' ? '58mm' : '80mm'} Thermal (Browser)
        </button>
        {isBluetoothPrintingSupported() && (
          <button className="btn-secondary w-full justify-center" onClick={handleThermalBluetooth} disabled={!!printing}>
            <Bluetooth size={16} /> {settings.paper_size === '58mm' ? '58mm' : '80mm'} Thermal (Bluetooth)
          </button>
        )}
        <button className="btn-primary w-full justify-center" onClick={handleA4} disabled={!!printing}>
          <FileText size={16} /> A4 Tax Invoice
        </button>
        <p className="text-center text-xs text-slate-400">Every print is logged — this counts as a reprint after the first.</p>
      </div>
    </Modal>
  );
}
