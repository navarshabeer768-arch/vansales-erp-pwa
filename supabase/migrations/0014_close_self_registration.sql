-- ============================================================================
-- 0014_close_self_registration.sql
-- Self-service registration (/register) is only meant to exist long enough
-- for the platform owner to create their own first account and become a
-- platform admin. Once at least one platform admin exists, registration
-- closes for everyone else — new companies from then on are created by a
-- platform admin directly (auto-approved), not by public signup.
-- ============================================================================

create or replace function platform_has_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_admins);
$$;

grant execute on function platform_has_admin() to anon, authenticated;
