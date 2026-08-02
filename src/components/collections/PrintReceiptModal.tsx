import { useState } from 'react';
import { Printer, Bluetooth, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { printReceiptViaBrowser, printReceiptViaBluetooth, isBluetoothPrintingSupported } from '@/lib/bluetoothPrint';
import { printDocument } from '@/lib/documentPrint';
import { useToast } from '@/contexts/ToastContext';
import type { ReceiptVoucherDetail, ReceiptPaymentComponent, ReceiptInvoiceAllocation } from '@/hooks/useReceiptVoucherDetail';

export function PrintReceiptModal({ open, onClose, receipt, components, allocations }: {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptVoucherDetail;
  components: ReceiptPaymentComponent[];
  allocations: ReceiptInvoiceAllocation[];
}) {
  const { settings } = usePrintSettings();
  const { push } = useToast();
  const [printing, setPrinting] = useState<string | null>(null);

  const displayNumber = (receipt as any).final_receipt_number ?? receipt.receipt_number;

  const logPrint = async (paperSize: '58mm' | '80mm' | 'a4', printerType: string) => {
    const { error } = await supabase.rpc('record_receipt_print', { p_receipt_id: receipt.id, p_paper_size: paperSize, p_printer_type: printerType });
    if (error) push('error', `Printed, but couldn't log the print: ${error.message}`);
  };

  const logError = async (message: string, printerType: string) => {
    await supabase.rpc('record_receipt_print_error', { p_receipt_id: receipt.id, p_error_message: message, p_printer_type: printerType });
  };

  const receiptLines = () => components.map((c) => ({
    name: c.payment_method_code.replace(/_/g, ' '), quantity: 1, unitPrice: c.amount, lineTotal: c.amount,
  }));

  const handleThermalBrowser = async () => {
    setPrinting('browser');
    try {
      printReceiptViaBrowser({
        companyName: settings.header_text ?? 'Company', storeId: receipt.van?.code ?? '—',
        invoiceNo: displayNumber, createdAt: receipt.receipt_time, customerName: receipt.customer?.business_name ?? 'Walk-in',
        items: receiptLines(),
        subtotal: receipt.receipt_amount, discount: 0, tax: 0, total: receipt.receipt_amount,
        paid: receipt.receipt_amount, balance: 0,
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
        companyName: settings.header_text ?? 'Company', storeId: receipt.van?.code ?? '—',
        invoiceNo: displayNumber, createdAt: receipt.receipt_time, customerName: receipt.customer?.business_name ?? 'Walk-in',
        items: receiptLines(),
        subtotal: receipt.receipt_amount, discount: 0, tax: 0, total: receipt.receipt_amount,
        paid: receipt.receipt_amount, balance: 0,
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
        title: `Receipt Voucher ${displayNumber}`,
        subtitle: receipt.customer?.business_name ?? 'Walk-in customer',
        meta: [
          { label: 'Receipt Date', value: receipt.receipt_date },
          { label: 'Collection Type', value: receipt.collection_type?.label ?? '—' },
          { label: 'Route', value: receipt.route?.name ?? '—' },
        ],
        columns: [{ header: 'Invoice' }, { header: 'Outstanding Before', align: 'right' }, { header: 'Allocated', align: 'right' }],
        rows: allocations.map((a) => [
          a.invoice?.final_invoice_number ?? a.invoice?.invoice_number ?? '—',
          a.invoice_outstanding_snapshot.toFixed(2), a.allocated_amount.toFixed(2),
        ]),
        footerNote: `Receipt Amount: ${receipt.receipt_amount.toFixed(2)} ${receipt.currency}`,
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
    <Modal open={open} onClose={onClose} title={`Print Receipt ${displayNumber}`} size="sm">
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
          <FileText size={16} /> A4 Receipt Voucher
        </button>
        <p className="text-center text-xs text-slate-400">Every print is logged — this counts as a reprint after the first.</p>
      </div>
    </Modal>
  );
}
