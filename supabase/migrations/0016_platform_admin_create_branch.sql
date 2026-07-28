-- ============================================================================
-- 0016_platform_admin_create_branch.sql
-- Lets a platform admin add a branch (warehouse) to any company directly
-- from the Platform Admin console — mirrors "Add Branch" from the salon
-- SaaS master console, adapted to this app's warehouses table.
-- ============================================================================

create or replace function create_branch_for_company(
  p_company_id uuid, p_code text, p_name text, p_address text default null
) returns uuid language plpgsql security definer as $$
declare
  v_warehouse_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only a platform admin can create a branch this way';
  end if;

  insert into warehouses (company_id, code, name, address, is_active)
  values (p_company_id, p_code, p_name, p_address, true)
  returning id into v_warehouse_id;

  return v_warehouse_id;
end;
$$;

grant execute on function create_branch_for_company(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform-wide counts for the admin dashboard — one round trip instead of
-- several separate cross-tenant counts (each of which already has a
-- platform-admin read policy from earlier migrations).
-- ---------------------------------------------------------------------------
create or replace function platform_dashboard_stats()
returns jsonb language plpgsql security definer as $$
declare
  v_result jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Only a platform admin can view platform-wide stats';
  end if;

  select jsonb_build_object(
    'total_companies', (select count(*) from companies),
    'active_companies', (select count(*) from companies where is_active = true),
    'pending_companies', (select count(*) from companies where is_active = false),
    'total_branches', (select count(*) from warehouses),
    'total_staff', (select count(*) from app_users),
    'total_products', (select count(*) from products)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function platform_dashboard_stats() to authenticated;
