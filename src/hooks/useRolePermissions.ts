import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PermissionRow { id: string; module: string; action: string; code: string; }

export function usePermissionCatalog() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('permissions').select('id, module, action, code').order('module');
      setPermissions((data ?? []) as PermissionRow[]);
    })();
  }, []);

  return permissions;
}

export function useRolePermissions(roleId: string | null) {
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!roleId) { setGrantedIds(new Set()); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId);
    setGrantedIds(new Set((data ?? []).map((r) => r.permission_id)));
    setLoading(false);
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (permissionId: string, grant: boolean) => {
    if (!roleId) return { error: 'No role selected' };
    if (grant) {
      const { error } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId });
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId);
      if (error) return { error: error.message };
    }
    await load();
    return { error: null };
  }, [roleId, load]);

  return { grantedIds, loading, toggle };
}
