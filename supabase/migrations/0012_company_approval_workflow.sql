-- ============================================================================
-- 0012_company_approval_workflow.sql
-- New self-service company registrations now start pending — is_active is
-- false and subscription_status is 'trial' until a *platform admin* (you,
-- the SaaS owner — separate from any tenant's company_admin) approves them.
-- Platform admins are a small, manually-managed list, not a per-tenant role.
-- ============================================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
comment on table platform_admins is
  'Manually managed. To make yourself the first platform admin after you sign up:
   insert into platform_admins (user_id, note)
   values (''<your auth.users id from Supabase Auth dashboard>'', ''platform owner'');';

create or replace function is_platform_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Let platform admins see every company (needed for the approval queue),
-- on top of the existing "see your own company" rule.
-- ---------------------------------------------------------------------------
drop policy if exists companies_select on companies;
create policy companies_select on companies for select
  using (id = current_company_id() or is_super_admin() or is_platform_admin());

-- ---------------------------------------------------------------------------
-- New companies start pending. Existing companies are untouched (only the
-- column default changes, not a backfill), so nothing already live gets
-- locked out retroactively.
-- ---------------------------------------------------------------------------
alter table companies alter column is_active set default false;
alter table companies alter column subscription_status set default 'trial';

create or replace function bootstrap_company(
  p_company_name text,
  p_slug text,
  p_admin_user_id uuid,
  p_admin_full_name text,
  p_admin_email text,
  p_company_phone text default null,
  p_company_address text default null,
  p_currency text default 'QAR',
  p_tax_number text default null,
  p_admin_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_admin_role_id uuid;
begin
  insert into companies (name, slug, phone, address, currency, tax_number, is_active, subscription_status)
  values (p_company_name, p_slug, p_company_phone, p_company_address, coalesce(p_currency, 'QAR'), p_tax_number, false, 'trial')
  returning id into v_company_id;

  perform clone_system_roles_for_company(v_company_id);
  select id into v_admin_role_id from roles where company_id = v_company_id and code = 'company_admin';

  insert into app_users (id, company_id, role_id, full_name, email, phone)
  values (p_admin_user_id, v_company_id, v_admin_role_id, p_admin_full_name, p_admin_email, p_admin_phone);

  return v_company_id;
end;
$$;

grant execute on function bootstrap_company(text, text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Approve / suspend — the only way company.is_active changes after signup.
-- Deliberately not exposed as a plain client-side UPDATE so approval can't
-- be bypassed by editing a row directly.
-- ---------------------------------------------------------------------------
create or replace function approve_company(p_company_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then
    raise exception 'Only a platform admin can approve a company';
  end if;
  update companies set is_active = true, subscription_status = 'active' where id = p_company_id;
end;
$$;

create or replace function suspend_company(p_company_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then
    raise exception 'Only a platform admin can suspend a company';
  end if;
  update companies set is_active = false, subscription_status = 'suspended' where id = p_company_id;
end;
$$;

grant execute on function approve_company(uuid) to authenticated;
grant execute on function suspend_company(uuid, text) to authenticated;
