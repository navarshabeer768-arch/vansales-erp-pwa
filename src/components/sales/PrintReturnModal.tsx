import { useState } from 'react';
import { Printer, Bluetooth, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { printReceiptViaBrowser, printReceiptViaBluetooth, isBluetoothPrintingSupported } from '@/lib/bluetoothPrint';
import { printDocument } from '@/lib/documentPrint';
import { useToast } from '@/contexts/ToastContext';
import type { SalesReturnDetail, SalesReturnItemDetail } from '@/hooks/useSalesReturnDetail';

export function PrintReturnModal({ open, onClose, salesReturn, items }: {
  open: boolean;
  onClose: () => void;
  salesReturn: SalesReturnDetail;
  items: SalesReturnItemDetail[];
}) {
  const { settings } = usePrintSettings();
  const { push } = useToast();
  const [printing, setPrinting] = useState<string | null>(null);

  const logPrint = async (paperSize: '58mm' | '80mm' | 'a4', printerType: string) => {
    const { error } = await supabase.rpc('record_return_print', { p_return_id: salesReturn.id, p_paper_size: paperSize, p_printer_type: printerType });
    if (error) push('error', `Printed, but couldn't log the print: ${error.message}`);
  };

  const logError = async (message: string, printerType: string) => {
    await supabase.rpc('record_return_print_error', { p_return_id: salesReturn.id, p_error_message: message, p_printer_type: printerType });
  };

  const returnLines = () => items.map((i) => ({
    name: i.product?.name ?? i.description ?? '', quantity: i.return_quantity, unitPrice: i.unit_price, lineTotal: i.net_return_amount,
  }));

  const handleThermalBrowser = async () => {
    setPrinting('browser');
    try {
      printReceiptViaBrowser({
        companyName: settings.header_text ?? 'Company', storeId: salesReturn.van?.code ?? '—',
        invoiceNo: salesReturn.return_number, createdAt: salesReturn.return_time, customerName: salesReturn.customer?.business_name ?? 'Walk-in',
        items: returnLines(),
        subtotal: salesReturn.gross_return_amount, discount: salesReturn.discount_reversal_amount, tax: salesReturn.tax_reversal_amount,
        total: salesReturn.net_return_amount, paid: 0, balance: salesReturn.net_return_amount,
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
        companyName: settings.header_text ?? 'Company', storeId: salesReturn.van?.code ?? '—',
        invoiceNo: salesReturn.return_number, createdAt: salesReturn.return_time, customerName: salesReturn.customer?.business_name ?? 'Walk-in',
        items: returnLines(),
        subtotal: salesReturn.gross_return_amount, discount: salesReturn.discount_reversal_amount, tax: salesReturn.tax_reversal_amount,
        total: salesReturn.net_return_amount, paid: 0, balance: salesReturn.net_return_amount,
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
        title: `Return Voucher ${salesReturn.return_number}`,
        subtitle: salesReturn.customer?.business_name ?? 'Walk-in customer',
        meta: [
          { label: 'Return Date', value: salesReturn.return_date },
          { label: 'Return Type', value: salesReturn.return_type?.label ?? '—' },
          { label: 'Original Invoice', value: salesReturn.original_invoice?.final_invoice_number ?? salesReturn.original_invoice?.invoice_number ?? 'None' },
        ],
        columns: [{ header: 'Product' }, { header: 'Qty', align: 'right' }, { header: 'Unit Price', align: 'right' }, { header: 'Discount Reversal', align: 'right' }, { header: 'Tax Reversal', align: 'right' }, { header: 'Net', align: 'right' }],
        rows: items.map((i) => [i.product?.name ?? i.description ?? '', i.return_quantity, i.unit_price.toFixed(2), i.discount_reversal.toFixed(2), i.tax_reversal.toFixed(2), i.net_return_amount.toFixed(2)]),
        footerNote: `Net Return Amount: ${salesReturn.net_return_amount.toFixed(2)} ${salesReturn.currency}`,
        signatureLabel: 'Received By',
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
    <Modal open={open} onClose={onClose} title={`Print Return ${salesReturn.return_number}`} size="sm">
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
          <FileText size={16} /> A4 Return Voucher
        </button>
        <p className="text-center text-xs text-slate-400">Every print is logged — this counts as a reprint after the first.</p>
      </div>
    </Modal>
  );
}
