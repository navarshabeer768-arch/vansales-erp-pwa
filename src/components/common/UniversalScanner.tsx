import { useCallback, useRef, useState } from 'react';
import { ScanLine, Camera, Repeat, CheckCircle2, XCircle } from 'lucide-react';
import { useHidScanListener } from '@/hooks/useHidScanListener';
import { useScanLookup, ScanLookupResult } from '@/hooks/useScanLookup';
import { BarcodeScannerModal, isBarcodeScanningSupported } from '@/components/pos/BarcodeScannerModal';

interface UniversalScannerProps {
  context: string; // which screen this is used on, e.g. 'pos', 'loading', 'search' — recorded in scan_logs
  onResult: (result: ScanLookupResult) => void;
  className?: string;
}

const DUPLICATE_WINDOW_MS = 2000;

/**
 * Drop this on any screen that needs scanning. It listens for HID
 * keyboard-wedge input (external Bluetooth/USB scanners, and every listed
 * PDT's built-in engine when configured in keyboard-wedge mode — the
 * standard setup for this kind of web deployment) at all times while
 * mounted, and offers a camera fallback for devices with no hardware
 * scanner. Every scan is looked up and logged; duplicate scans of the
 * same value within 2 seconds are suppressed so a slightly-held trigger
 * doesn't double-count.
 */
export function UniversalScanner({ context, onResult, className }: UniversalScannerProps) {
  const { lookup } = useScanLookup();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [lastResult, setLastResult] = useState<ScanLookupResult | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const handleRawScan = useCallback(async (raw: string, scanType: 'barcode' | 'qr') => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.value === trimmed && now - lastScanRef.current.at < DUPLICATE_WINDOW_MS) {
      return; // duplicate — same code scanned again within the window, ignore
    }
    lastScanRef.current = { value: trimmed, at: now };

    const result = await lookup(scanType, trimmed, context);
    setLastResult(result);
    onResult(result);
  }, [lookup, context, onResult]);

  useHidScanListener((value) => handleRawScan(value, 'barcode'), true);

  const handleCameraDetected = (code: string) => {
    handleRawScan(code, 'qr');
    if (!continuous) setCameraOpen(false);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <ScanLine size={14} /> Ready — scan with any connected scanner
        </div>
        {isBarcodeScanningSupported() && (
          <button type="button" className="btn-secondary !py-1.5" onClick={() => setCameraOpen(true)}>
            <Camera size={14} /> Camera scan
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
          <Repeat size={12} /> Continuous mode
        </label>
      </div>

      {lastResult && (
        <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${lastResult.type === 'unknown' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
          {lastResult.type === 'unknown' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
          {lastResult.type === 'unknown' ? `No match for "${lastResult.raw}"` : `${lastResult.type[0].toUpperCase() + lastResult.type.slice(1)}: ${lastResult.label}`}
        </div>
      )}

      <BarcodeScannerModal open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={handleCameraDetected} />
    </div>
  );
}
