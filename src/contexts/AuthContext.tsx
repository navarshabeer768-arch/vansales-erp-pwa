import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppUser, Company, RoleCode } from '@/types/database';

interface AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  user: AppUser | null;
  company: Company | null;
  roleCode: RoleCode | null;
  permissions: Set<string>; // "module:action"
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpCompany: (params: {
    companyName: string; slug: string; fullName: string; email: string; password: string;
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

    const [{ data: company }, { data: rolePerms }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', appUser.company_id).single(),
      supabase
        .from('role_permissions')
        .select('permission:permissions(code)')
        .eq('role_id', appUser.role_id),
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpCompany = useCallback(
    async ({ companyName, slug, fullName, email, password }: {
      companyName: string; slug: string; fullName: string; email: string; password: string;
    }) => {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError || !signUpData.user) {
        return { error: signUpError?.message ?? 'Sign up failed' };
      }

      const { error: bootstrapError } = await supabase.rpc('bootstrap_company', {
        p_company_name: companyName,
        p_slug: slug,
        p_admin_user_id: signUpData.user.id,
        p_admin_full_name: fullName,
        p_admin_email: email,
      });

      if (bootstrapError) {
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
