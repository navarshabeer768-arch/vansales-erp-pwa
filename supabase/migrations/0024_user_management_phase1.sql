-- ============================================================================
-- 0024_user_management_phase1.sql
-- Login history + device registration (both need to work before/around a
-- verified session, so they're security-definer RPCs rather than direct
-- table access) and role/permission editing (previously read-only).
-- ============================================================================

create table login_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  username_attempted text not null,
  store_id_attempted text,
  success boolean not null,
  device_info text,
  created_at timestamptz not null default now()
);
create index idx_login_history_company on login_history(company_id, created_at desc);
create index idx_login_history_user on login_history(user_id, created_at desc);

alter table login_history enable row level security;

-- Select: only people with hr:edit can see their company's login history
-- (this is company-scoped audit data, not something every staff member
-- should be able to browse).
create policy login_history_select on login_history for select
  using (company_id = current_company_id() and has_permission('hr:edit'));

-- ---------------------------------------------------------------------------
-- log_login_attempt(): called by the client both on success and failure.
-- Security definer + granted to anon because a failed login (wrong
-- password) happens before any session exists.
-- ---------------------------------------------------------------------------
create or replace function log_login_attempt(
  p_store_id text, p_username text, p_success boolean, p_device_info text default null
) returns void language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_user_id uuid;
begin
  select c.id, u.id into v_company_id, v_user_id
  from companies c
  join app_users u on u.company_id = c.id
  where lower(c.store_id) = lower(p_store_id) and lower(u.username) = lower(p_username)
  limit 1;

  insert into login_history (company_id, user_id, username_attempted, store_id_attempted, success, device_info)
  values (v_company_id, v_user_id, p_username, p_store_id, p_success, p_device_info);
end;
$$;

grant execute on function log_login_attempt(text, text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_device(): a user registering their OWN device on successful
-- login. Deliberately self-only (auth.uid()), so it doesn't need the
-- hr:edit permission that gates app_users_write.
-- ---------------------------------------------------------------------------
create or replace function register_device(p_device_id text)
returns void language plpgsql security definer as $$
begin
  update app_users
  set device_id = p_device_id, device_registered_at = now(), last_login_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function register_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Role & permission editing (previously read-only). Company admins (or
-- anyone with settings:edit) can now toggle which permissions a role in
-- their own company has. (roles.update/insert/delete are already covered
-- by the existing roles_write policy from 0001 — just adding the missing
-- write policies on role_permissions here.)
-- ---------------------------------------------------------------------------
create policy role_permissions_write on role_permissions for insert
  with check (
    exists (select 1 from roles r where r.id = role_id and r.company_id = current_company_id())
    and has_permission('settings:edit')
  );

create policy role_permissions_delete on role_permissions for delete
  using (
    exists (select 1 from roles r where r.id = role_id and r.company_id = current_company_id())
    and has_permission('settings:edit')
  );
