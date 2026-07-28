-- ============================================================================
-- 0017_company_store_id.sql
-- Every company gets a short, human-friendly Store ID (e.g. "VS-3F9A2B"),
-- generated automatically and shown in Settings, the Platform Admin
-- console, and the "company created" handoff screen. Staff still sign in
-- with their own individual email/password — this is a reference ID for
-- support and branding, not a second login mechanism.
-- ============================================================================

alter table companies add column if not exists store_id text unique;

create or replace function generate_store_id()
returns text language sql as $$
  select 'VS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

-- Backfill any existing companies created before this column existed.
update companies set store_id = generate_store_id() where store_id is null;

alter table companies alter column store_id set not null;

-- ---------------------------------------------------------------------------
-- bootstrap_company now generates and stores a store_id automatically.
-- ---------------------------------------------------------------------------
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
  v_store_id text;
begin
  v_store_id := generate_store_id();

  insert into companies (name, slug, phone, address, currency, tax_number, is_active, subscription_status, store_id)
  values (p_company_name, p_slug, p_company_phone, p_company_address, coalesce(p_currency, 'QAR'), p_tax_number, false, 'trial', v_store_id)
  returning id into v_company_id;

  perform clone_system_roles_for_company(v_company_id);
  select id into v_admin_role_id from roles where company_id = v_company_id and code = 'company_admin';

  insert into app_users (id, company_id, role_id, full_name, email, phone)
  values (p_admin_user_id, v_company_id, v_admin_role_id, p_admin_full_name, p_admin_email, p_admin_phone);

  return v_company_id;
end;
$$;

grant execute on function bootstrap_company(text, text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
