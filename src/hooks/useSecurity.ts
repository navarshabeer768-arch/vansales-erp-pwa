import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useSecurity() {
  const [saving, setSaving] = useState(false);

  const changePassword = useCallback(async (newPassword: string) => {
    if (newPassword.length < 8) return { error: 'Password must be at least 8 characters.' };
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    return { error: error?.message ?? null };
  }, []);

  const signOutAllDevices = useCallback(async () => {
    setSaving(true);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    setSaving(false);
    return { error: error?.message ?? null };
  }, []);

  return { saving, changePassword, signOutAllDevices };
}
