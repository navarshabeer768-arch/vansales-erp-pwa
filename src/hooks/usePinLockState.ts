import { useCallback, useEffect, useRef, useState } from 'react';
import { hasPinSet } from '@/lib/pinLock';

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

export function usePinLockState() {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!hasPinSet()) return;
    timerRef.current = setTimeout(() => setLocked(true), INACTIVITY_MS);
  }, []);

  useEffect(() => {
    if (!hasPinSet()) return;
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => events.forEach((e) => window.removeEventListener(e, resetTimer));
  }, [resetTimer]);

  const lockNow = useCallback(() => { if (hasPinSet()) setLocked(true); }, []);
  const unlock = useCallback(() => { setLocked(false); resetTimer(); }, [resetTimer]);

  return { locked, lockNow, unlock };
}
