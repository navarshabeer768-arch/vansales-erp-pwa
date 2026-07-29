import { useEffect, useRef, useState } from 'react';
import { X, ScanLine, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

// BarcodeDetector isn't in the standard TS DOM lib yet (Chrome/Edge/Android
// WebView ship it; Safari/iOS and Firefox don't). Minimal ambient type so
// this compiles everywhere; the actual feature-check happens at runtime.
interface DetectedBarcode { rawValue: string; format: string; }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: { new (options?: { formats: string[] }): BarcodeDetectorLike };
  }
}

export function isBarcodeScanningSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (!isBarcodeScanningSupported()) {
      setError('Barcode scanning needs Chrome/Edge on Android or desktop — this browser doesn\'t support it. Type the barcode instead.');
      return;
    }

    let cancelled = false;
    const detector = new window.BarcodeDetector!({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
    });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetected(codes[0].rawValue);
              return; // stop scanning after first hit
            }
          } catch {
            // transient decode errors are normal mid-frame; just keep scanning
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };
        rafRef.current = requestAnimationFrame(scanFrame);
      })
      .catch(() => {
        if (!cancelled) setError('Camera access was denied or is unavailable. Type the barcode instead.');
      });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onDetected]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <ScanLine size={20} />
          <span className="font-medium">Scan barcode</span>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close scanner">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white">
            <AlertCircle size={36} className="text-amber-400" />
            <p className="max-w-sm text-sm text-white/80">{error}</p>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-1/3 w-4/5 max-w-sm rounded-2xl border-4 border-white/70" />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
