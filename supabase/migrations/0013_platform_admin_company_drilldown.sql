-- ============================================================================
-- 0013_platform_admin_company_drilldown.sql
-- Platform admins get READ-ONLY visibility into any company's warehouses
-- (branches) and staff, for the oversight drill-down — never write access.
-- Postgres OR's multiple permissive policies together, so this simply adds
-- an extra "can also see everything" rule alongside each table's existing
-- tenant-isolation policy; it doesn't loosen normal tenant access at all.
-- ============================================================================

create policy warehouses_platform_admin_read on warehouses for select
  using (is_platform_admin());

create policy app_users_platform_admin_read on app_users for select
  using (is_platform_admin());

-- ---------------------------------------------------------------------------
-- Plan changes are also platform-admin-only and centralized through an RPC,
-- same reasoning as approve_company/suspend_company: no direct client UPDATE
-- path to bypass the check.
-- ---------------------------------------------------------------------------
create or replace function update_company_plan(p_company_id uuid, p_plan text)
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then
    raise exception 'Only a platform admin can change a company''s plan';
  end if;
  if p_plan not in ('trial', 'basic', 'professional', 'enterprise') then
    raise exception 'Invalid plan: %', p_plan;
  end if;
  update companies set subscription_plan = p_plan where id = p_company_id;
end;
$$;

grant execute on function update_company_plan(uuid, text) to authenticated;
