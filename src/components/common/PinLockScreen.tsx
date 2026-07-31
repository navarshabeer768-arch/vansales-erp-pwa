import { useState } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { verifyPin } from '@/lib/pinLock';
import { hasBiometricRegistered, verifyBiometric } from '@/lib/biometricAuth';
import { useAuth } from '@/contexts/AuthContext';

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { user, signOut } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (value: string) => {
    setChecking(true);
    const ok = await verifyPin(value);
    setChecking(false);
    if (ok) { onUnlock(); return; }
    setError('Incorrect PIN.');
    setPin('');
  };

  const handleDigit = (d: string) => {
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length >= 4) submit(next);
  };

  const handleBiometric = async () => {
    const ok = await verifyBiometric();
    if (ok) onUnlock();
    else setError('Biometric verification failed — use your PIN instead.');
  };

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-900/95 px-6 text-white">
      <Lock size={36} className="mb-4 text-slate-300" />
      <h1 className="mb-1 text-lg font-semibold">Session locked</h1>
      <p className="mb-6 text-sm text-slate-400">{user?.full_name ?? 'Signed in'} — enter your PIN to continue</p>

      <div className="mb-4 flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-white' : 'bg-slate-600'}`} />
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
          <button
            key={i}
            disabled={checking || d === ''}
            onClick={() => d === '⌫' ? setPin((p) => p.slice(0, -1)) : d && handleDigit(d)}
            className={`h-14 w-14 rounded-full text-lg font-medium ${d === '' ? 'invisible' : 'bg-slate-800 hover:bg-slate-700'}`}
          >
            {d}
          </button>
        ))}
      </div>

      {hasBiometricRegistered() && (
        <button onClick={handleBiometric} className="mt-6 flex items-center gap-2 text-sm text-slate-300 hover:text-white">
          <Fingerprint size={18} /> Use biometric unlock
        </button>
      )}

      <button onClick={() => signOut()} className="mt-8 text-xs text-slate-500 hover:text-slate-300">
        Not you? Sign out
      </button>
    </div>
  );
}
