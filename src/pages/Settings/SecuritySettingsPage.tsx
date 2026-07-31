import { useState } from 'react';
import { ShieldCheck, LogOut, Smartphone, Lock, Fingerprint } from 'lucide-react';
import { useSecurity } from '@/hooks/useSecurity';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getDeviceLabel } from '@/lib/deviceId';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { hasPinSet, setPin, clearPin } from '@/lib/pinLock';
import { isBiometricSupported, hasBiometricRegistered, registerBiometric, clearBiometric } from '@/lib/biometricAuth';

function PinAndBiometricSection() {
  const { user } = useAuth();
  const { push } = useToast();
  const [pinSet, setPinSet] = useState(hasPinSet());
  const [bioRegistered, setBioRegistered] = useState(hasBiometricRegistered());
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handleSetPin = async () => {
    if (newPin.length < 4) { push('error', 'PIN must be at least 4 digits.'); return; }
    if (newPin !== confirmPin) { push('error', 'PINs do not match.'); return; }
    await setPin(newPin);
    setPinSet(true);
    setNewPin(''); setConfirmPin('');
    push('success', 'PIN set — this device will lock after 5 minutes of inactivity.');
  };

  const handleClearPin = () => {
    clearPin();
    clearBiometric();
    setPinSet(false);
    setBioRegistered(false);
    push('success', 'PIN lock removed from this device.');
  };

  const handleRegisterBiometric = async () => {
    if (!user) return;
    const { error } = await registerBiometric(user.id, user.full_name);
    if (error) { push('error', error); return; }
    setBioRegistered(true);
    push('success', 'Biometric unlock registered on this device.');
  };

  return (
    <div className="card space-y-4 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Lock size={16} /> PIN &amp; biometric lock (this device)</h2>
      <p className="text-sm text-slate-500">
        Locks this device's session after 5 minutes idle — a quick-unlock for an already-signed-in session, not a
        replacement for your account password.
      </p>

      {!pinSet ? (
        <div className="grid grid-cols-2 gap-3">
          <input type="password" inputMode="numeric" className="input" placeholder="New PIN (4+ digits)" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
          <input type="password" inputMode="numeric" className="input" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
          <button className="btn-primary col-span-2" onClick={handleSetPin}>Set PIN</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge-green">PIN lock active</span>
          <button className="btn-secondary" onClick={handleClearPin}>Remove PIN lock</button>
          {isBiometricSupported() && !bioRegistered && (
            <button className="btn-secondary" onClick={handleRegisterBiometric}><Fingerprint size={14} /> Register biometric unlock</button>
          )}
          {bioRegistered && <span className="badge-green flex items-center gap-1"><Fingerprint size={12} /> Biometric registered</span>}
        </div>
      )}
    </div>
  );
}

export function SecuritySettingsPage() {
  const { changePassword, signOutAllDevices, saving } = useSecurity();
  const { user, signOut } = useAuth();
  const { push } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { push('error', 'Passwords do not match.'); return; }
    const { error } = await changePassword(newPassword);
    if (error) { push('error', error); return; }
    push('success', 'Password updated.');
    setNewPassword(''); setConfirmPassword('');
  };

  const handleSignOutAll = async () => {
    setConfirmSignOutAll(false);
    const { error } = await signOutAllDevices();
    if (error) { push('error', error); return; }
    push('info', 'Signed out everywhere — you\'ll need to log in again.');
    await signOut();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Security</h1>
          <p className="text-sm text-slate-500">Password, sessions, and this device.</p>
        </div>
      </div>

      <form onSubmit={handleChangePassword} className="card space-y-4 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Change password</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" className="input" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" className="input" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving || !newPassword}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>

      <div className="card space-y-4 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">This device</h2>
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Smartphone size={18} className="text-slate-400" />
          <div>
            <p className="font-medium">{getDeviceLabel()}</p>
            <p className="text-xs text-slate-500">Signed in as {user?.full_name}</p>
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Sessions</h2>
        <p className="text-sm text-slate-500">
          If you think your account was accessed from somewhere you don't recognize, sign out everywhere —
          this ends every active session (this device included) and requires signing back in.
        </p>
        <button className="btn-danger" onClick={() => setConfirmSignOutAll(true)}>
          <LogOut size={16} /> Sign out of all devices
        </button>
      </div>

      <ConfirmDialog
        open={confirmSignOutAll}
        title="Sign out everywhere"
        message="This immediately ends every session for your account, including this one. You'll need to log in again."
        confirmLabel="Sign out everywhere"
        onConfirm={handleSignOutAll}
        onCancel={() => setConfirmSignOutAll(false)}
      />

      <PinAndBiometricSection />
    </div>
  );
}
