-- ============================================================================
-- 0007_seed_roles_grants.sql
-- ============================================================================

-- System role templates (company_id = null). When a company is created, these
-- are cloned into company-scoped roles via clone_system_roles_for_company().
insert into roles (company_id, name, code, is_system) values
  (null, 'Super Admin', 'super_admin', true),
  (null, 'Company Admin', 'company_admin', true),
  (null, 'Warehouse Manager', 'warehouse_manager', true),
  (null, 'Van Sales Manager', 'van_sales_manager', true),
  (null, 'Salesman', 'salesman', true),
  (null, 'Driver', 'driver', true),
  (null, 'Cash Collector', 'cash_collector', true),
  (null, 'Accounts', 'accounts', true),
  (null, 'Auditor', 'auditor', true),
  (null, 'Stock Controller', 'stock_controller', true)
on conflict do nothing;

-- Full-access grant for company_admin / super_admin: every module:action
create or replace function clone_system_roles_for_company(p_company_id uuid)
returns void language plpgsql security definer as $$
declare
  v_role roles%rowtype;
  v_new_role_id uuid;
begin
  for v_role in select * from roles where company_id is null loop
    insert into roles (company_id, name, code, is_system)
    values (p_company_id, v_role.name, v_role.code, true)
    returning id into v_new_role_id;

    -- Admin roles get everything
    if v_role.code in ('super_admin','company_admin') then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions;
    -- Warehouse manager: full warehouse/inventory/purchases, view-only elsewhere
    elsif v_role.code = 'warehouse_manager' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where module in ('warehouse','inventory','purchases') 
         or (module in ('dashboard','reports') and action = 'view');
    elsif v_role.code = 'van_sales_manager' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where module in ('van_loading','van_unloading','route_planning','gps_tracking')
         or (module in ('dashboard','reports','sales','customer_visit') and action in ('view','export'));
    elsif v_role.code = 'salesman' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where (module in ('sales','customer_visit','collections','returns') and action in ('view','create','edit'))
         or (module in ('dashboard','route_planning') and action = 'view');
    elsif v_role.code = 'driver' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where (module in ('van_loading','van_unloading','gps_tracking') and action in ('view','create'));
    elsif v_role.code = 'cash_collector' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where module = 'collections' and action in ('view','create');
    elsif v_role.code = 'accounts' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where module in ('accounting','payments','purchases','reports');
    elsif v_role.code = 'auditor' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions where action in ('view','export');
    elsif v_role.code = 'stock_controller' then
      insert into role_permissions (role_id, permission_id)
      select v_new_role_id, id from permissions
      where module in ('inventory','warehouse') and action in ('view','create','edit','approve');
    end if;
  end loop;
end;
$$;

-- Bootstrap: create a new company + its first company_admin user record.
-- Call this right after supabase.auth.signUp() creates the auth.users row.
create or replace function bootstrap_company(
  p_company_name text, p_slug text, p_admin_user_id uuid,
  p_admin_full_name text, p_admin_email text
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_admin_role_id uuid;
begin
  insert into companies (name, slug) values (p_company_name, p_slug) returning id into v_company_id;
  perform clone_system_roles_for_company(v_company_id);
  select id into v_admin_role_id from roles where company_id = v_company_id and code = 'company_admin';

  insert into app_users (id, company_id, role_id, full_name, email)
  values (p_admin_user_id, v_company_id, v_admin_role_id, p_admin_full_name, p_admin_email);

  return v_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- GRANTS: authenticated role can call these RPCs (RLS + internal checks still apply)
-- ---------------------------------------------------------------------------
grant execute on function bootstrap_company(text, text, uuid, text, text) to anon, authenticated;
grant execute on function approve_van_loading(uuid, uuid) to authenticated;
grant execute on function approve_van_unloading(uuid, uuid) to authenticated;
grant execute on function process_sale(uuid) to authenticated;
grant execute on function record_collection(uuid) to authenticated;
grant execute on function approve_stock_adjustment(uuid, uuid) to authenticated;
grant execute on function approve_warehouse_transfer(uuid, uuid) to authenticated;
