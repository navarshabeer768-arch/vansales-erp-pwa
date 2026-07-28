-- ============================================================================
-- 0019_store_id_username_login.sql
-- Usernames only need to be unique WITHIN a store, not across the whole
-- platform — two different companies can both have a "manager" login.
-- Login now resolves via (Store ID, Username) -> email, so the login screen
-- asks for Store ID + Username + Password. No email is shown anywhere in
-- the registration or login UI; Supabase Auth still requires an email-
-- shaped string internally, so the client generates an invisible synthetic
-- one at signup time.
-- ============================================================================

alter table app_users drop constraint if exists app_users_username_key;
alter table app_users add constraint app_users_username_company_key unique (company_id, username);

drop function if exists resolve_username_email(text);

create or replace function resolve_username_email(p_store_id text, p_username text)
returns text language sql stable security definer as $$
  select u.email
  from app_users u
  join companies c on c.id = u.company_id
  where lower(c.store_id) = lower(p_store_id)
    and lower(u.username) = lower(p_username)
    and u.is_active = true
  limit 1;
$$;

grant execute on function resolve_username_email(text, text) to anon, authenticated;
