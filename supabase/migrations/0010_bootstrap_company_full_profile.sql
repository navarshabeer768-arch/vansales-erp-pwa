-- ============================================================================
-- 0010_bootstrap_company_full_profile.sql
-- Replaces bootstrap_company with a version that captures the full company
-- profile (phone, address, currency, tax number) and admin phone at signup,
-- instead of just name + slug. Old 5-arg overload is dropped so there's no
-- ambiguity for PostgREST when resolving the RPC call.
-- ============================================================================

drop function if exists bootstrap_company(text, text, uuid, text, text);

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
  insert into companies (name, slug, phone, address, currency, tax_number)
  values (p_company_name, p_slug, p_company_phone, p_company_address, coalesce(p_currency, 'QAR'), p_tax_number)
  returning id into v_company_id;

  perform clone_system_roles_for_company(v_company_id);
  select id into v_admin_role_id from roles where company_id = v_company_id and code = 'company_admin';

  insert into app_users (id, company_id, role_id, full_name, email, phone)
  values (p_admin_user_id, v_company_id, v_admin_role_id, p_admin_full_name, p_admin_email, p_admin_phone);

  return v_company_id;
end;
$$;

grant execute on function bootstrap_company(text, text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
