import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { generateSyntheticEmail } from '@/lib/syntheticEmail';
import type { AppUser, Company, RoleCode } from '@/types/database';

interface AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  user: AppUser | null;
  company: Company | null;
  roleCode: RoleCode | null;
  permissions: Set<string>; // "module:action"
  isPlatformAdmin: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (storeId: string, username: string, password: string) => Promise<{ error: string | null }>;
  signUpCompany: (params: {
    companyName: string; slug: string; fullName: string; username: string; password: string;
    companyPhone?: string; companyAddress?: string; currency?: string; taxNumber?: string; adminPhone?: string;
    storeId?: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  can: (permissionCode: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  loading: true,
  isAuthenticated: false,
  user: null,
  company: null,
  roleCode: null,
  permissions: new Set(),
  isPlatformAdmin: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const loadProfile = useCallback(async (userId: string) => {
    const { data: appUser, error: userErr } = await supabase
      .from('app_users')
      .select('*, role:roles(id, code, name)')
      .eq('id', userId)
      .single();

    if (userErr || !appUser) {
      setState({ ...initialState, loading: false });
      return;
    }

    const [{ data: company }, { data: rolePerms }, { data: platformAdminResult }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', appUser.company_id).single(),
      supabase
        .from('role_permissions')
        .select('permission:permissions(code)')
        .eq('role_id', appUser.role_id),
      supabase.rpc('is_platform_admin'),
    ]);

    const permissions = new Set<string>(
      (rolePerms ?? [])
        .map((rp: any) => rp.permission?.code as string | undefined)
        .filter((c: string | undefined): c is string => Boolean(c))
    );

    setState({
      loading: false,
      isAuthenticated: true,
      user: appUser as unknown as AppUser,
      company: (company ?? null) as Company | null,
      roleCode: (appUser as any).role?.code ?? null,
      permissions,
      isPlatformAdmin: platformAdminResult === true,
    });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    } else {
      setState({ ...initialState, loading: false });
    }
  }, [loadProfile]);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setState({ ...initialState, loading: false });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, loadProfile]);

  const signIn = useCallback(async (storeId: string, username: string, password: string) => {
    const { data: email, error: resolveError } = await supabase.rpc('resolve_username_email', {
      p_store_id: storeId, p_username: username,
    });
    if (resolveError || !email) {
      return { error: 'Invalid Store ID, username, or password.' };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Never reveal whether the store/username existed — same generic message either way.
      return { error: 'Invalid Store ID, username, or password.' };
    }
    return { error: null };
  }, []);

  const signUpCompany = useCallback(
    async (params: {
      companyName: string; slug: string; fullName: string; username: string; password: string;
      companyPhone?: string; companyAddress?: string; currency?: string; taxNumber?: string; adminPhone?: string;
      storeId?: string;
    }) => {
      const { companyName, slug, fullName, username, password, companyPhone, companyAddress, currency, taxNumber, adminPhone, storeId } = params;
      const syntheticEmail = generateSyntheticEmail(username);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: syntheticEmail, password });
      if (signUpError) {
        return { error: signUpError.message };
      }
      if (!signUpData.user) {
        return { error: 'Sign up failed' };
      }

      const { error: bootstrapError } = await supabase.rpc('bootstrap_company', {
        p_company_name: companyName,
        p_slug: slug,
        p_admin_user_id: signUpData.user.id,
        p_admin_full_name: fullName,
        p_admin_email: syntheticEmail,
        p_admin_username: username,
        p_company_phone: companyPhone ?? null,
        p_company_address: companyAddress ?? null,
        p_currency: currency ?? 'QAR',
        p_tax_number: taxNumber ?? null,
        p_admin_phone: adminPhone ?? null,
        p_store_id: storeId ?? null,
      });

      if (bootstrapError) {
        if (bootstrapError.code === '23505') {
          return { error: `Username "${username}" is already taken. Choose a different one.` };
        }
        return { error: bootstrapError.message };
      }
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ ...initialState, loading: false });
  }, []);

  const can = useCallback(
    (permissionCode: string) => state.roleCode === 'super_admin' || state.permissions.has(permissionCode),
    [state.roleCode, state.permissions]
  );

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUpCompany, signOut, can, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
