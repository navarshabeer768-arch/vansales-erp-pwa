import { useEffect, useRef } from 'react';

/**
 * Listens globally for HID keyboard-wedge scanner input. Barcode/QR
 * scanners configured in keyboard-wedge mode (the standard, correct setup
 * for external Bluetooth/USB scanners and for PDT built-in engines on
 * Zebra/Chainway/Urovo/Honeywell/Sunmi/Newland devices used with a web
 * app) "type" the scanned value as very fast keystrokes terminated by
 * Enter. Human typing is reliably slower and less consistent between
 * keystrokes, so timing the gaps tells the two apart without needing to
 * know anything about the specific device.
 */
export function useHidScanListener(onScan: (value: string) => void, enabled: boolean) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const fastStreakRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const FAST_GAP_MS = 40; // scanner keystrokes land far faster than a human can type
    const MIN_FAST_STREAK = 3; // require a few consecutive fast keystrokes before trusting it's a scan

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3 && fastStreakRef.current >= MIN_FAST_STREAK) {
          onScan(bufferRef.current);
          e.preventDefault();
        }
        bufferRef.current = '';
        fastStreakRef.current = 0;
        return;
      }

      if (e.key.length !== 1) return; // ignore modifier/navigation keys

      if (gap < FAST_GAP_MS) {
        fastStreakRef.current += 1;
      } else {
        bufferRef.current = '';
        fastStreakRef.current = 0;
      }
      bufferRef.current += e.key;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onScan, enabled]);
}
