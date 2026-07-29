-- ============================================================================
-- 0021_platform_admin_login_no_store_id.sql
-- Regular staff need Store ID + Username because usernames are only unique
-- per-store. Platform admins are a small, manually curated list
-- (platform_admins table) — resolve their email by username alone, scoped
-- to just that list, so the platform login only needs 2 fields.
-- ============================================================================

create or replace function resolve_platform_admin_email(p_username text)
returns text language sql stable security definer as $$
  select u.email
  from app_users u
  join platform_admins pa on pa.user_id = u.id
  where lower(u.username) = lower(p_username)
    and u.is_active = true
  limit 1;
$$;

grant execute on function resolve_platform_admin_email(text) to anon, authenticated;
