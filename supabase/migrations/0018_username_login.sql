-- ============================================================================
-- 0018_username_login.sql
-- Staff still authenticate through Supabase Auth under the hood (that's what
-- makes per-user, per-company data isolation actually enforceable — RLS
-- checks a verified session, not anything the client claims) but the LOGIN
-- SCREEN now asks for a Username, not an email. resolve_username_email()
-- looks up the matching email so the client can sign in transparently.
-- ============================================================================

alter table app_users add column if not exists username text;

-- Backfill existing accounts with a username derived from their email,
-- de-duplicated with a short suffix if needed.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  for r in select id, email from app_users where username is null loop
    v_base := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-z0-9_]', '', 'g'));
    if v_base = '' then v_base := 'user'; end if;
    v_candidate := v_base;
    v_suffix := 1;
    while exists (select 1 from app_users where username = v_candidate) loop
      v_suffix := v_suffix + 1;
      v_candidate := v_base || v_suffix::text;
    end loop;
    update app_users set username = v_candidate where id = r.id;
  end loop;
end $$;

alter table app_users alter column username set not null;
alter table app_users add constraint app_users_username_key unique (username);

-- ---------------------------------------------------------------------------
-- Public lookup: username -> email, so the login screen can resolve it
-- before a session exists (this is the only thing exposed — no password
-- hashes, no other profile data. Supabase Auth itself still verifies the
-- password).
-- ---------------------------------------------------------------------------
create or replace function resolve_username_email(p_username text)
returns text language sql stable security definer as $$
  select email from app_users where lower(username) = lower(p_username) and is_active = true limit 1;
$$;

grant execute on function resolve_username_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bootstrap_company now also sets a username for the initial admin account.
-- ---------------------------------------------------------------------------
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
  p_admin_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_admin_role_id uuid;
  v_store_id text;
begin
  v_store_id := generate_store_id();

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

grant execute on function bootstrap_company(text, text, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Drop the old 10-arg overload (no p_admin_username) now that every caller
-- passes a username — avoids PostgREST ambiguity between two overloads.
drop function if exists bootstrap_company(text, text, uuid, text, text, text, text, text, text, text);
