import { useState } from 'react';
import { ShieldCheck, LogOut, Smartphone } from 'lucide-react';
import { useSecurity } from '@/hooks/useSecurity';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getDeviceLabel } from '@/lib/deviceId';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
    </div>
  );
}
