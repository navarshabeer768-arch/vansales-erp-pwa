-- ============================================================================
-- 0020_custom_store_id.sql
-- bootstrap_company now accepts an optional custom store_id. If given, it's
-- validated (format + uniqueness) and used as-is; if omitted, one is still
-- generated automatically as before. Lets a platform admin (or a
-- self-registering owner) set something memorable like "MAIN-BRANCH"
-- instead of a random code.
-- ============================================================================

create or replace function is_valid_store_id(p_store_id text)
returns boolean language sql immutable as $$
  select p_store_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$';
$$;

create or replace function bootstrap_company(
  p_company_name text,
  p_slug text,
  p_admin_user_id uuid,
  p_admin_full_name text,
  p_admin_email text,
  p_admin_username text,
  p_company_phone text default null,
  p_company_address text default null,
  p_currency text default 'QAR',
  p_tax_number text default null,
  p_admin_phone text default null,
  p_store_id text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_admin_role_id uuid;
  v_store_id text;
begin
  if p_store_id is not null and length(trim(p_store_id)) > 0 then
    if not is_valid_store_id(trim(p_store_id)) then
      raise exception 'Store ID must be 3-20 characters: letters, numbers, hyphens, or underscores, starting with a letter or number';
    end if;
    if exists (select 1 from companies where lower(store_id) = lower(trim(p_store_id))) then
      raise exception 'Store ID "%" is already taken', trim(p_store_id);
    end if;
    v_store_id := upper(trim(p_store_id));
  else
    v_store_id := generate_store_id();
  end if;

  insert into companies (name, slug, phone, address, currency, tax_number, is_active, subscription_status, store_id)
  values (p_company_name, p_slug, p_company_phone, p_company_address, coalesce(p_currency, 'QAR'), p_tax_number, false, 'trial', v_store_id)
  returning id into v_company_id;

  perform clone_system_roles_for_company(v_company_id);
  select id into v_admin_role_id from roles where company_id = v_company_id and code = 'company_admin';

  insert into app_users (id, company_id, role_id, full_name, email, phone, username)
  values (p_admin_user_id, v_company_id, v_admin_role_id, p_admin_full_name, p_admin_email, p_admin_phone, p_admin_username);

  return v_company_id;
end;
$$;

grant execute on function bootstrap_company(text, text, uuid, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function is_valid_store_id(text) to anon, authenticated;

-- Drop the previous 11-arg overload (no p_store_id) so PostgREST has only
-- one bootstrap_company to resolve calls against.
drop function if exists bootstrap_company(text, text, uuid, text, text, text, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- Public availability check so the UI can validate before submitting,
-- instead of only finding out via a failed insert.
-- ---------------------------------------------------------------------------
create or replace function is_store_id_available(p_store_id text)
returns boolean language sql stable security definer as $$
  select is_valid_store_id(p_store_id)
    and not exists (select 1 from companies where lower(store_id) = lower(p_store_id));
$$;

grant execute on function is_store_id_available(text) to anon, authenticated;
