-- ============================================================================
-- 0035_customer_master.sql
-- Enterprise Customer Master (Phase 4A.1 Part 1).
--
-- Builds on the existing customers/customer_groups/customer_contacts tables
-- rather than replacing them. Reuses the flexible multi-role assignment
-- pattern already proven for van_staff_assignments (Phase 3B.1) for the
-- employee side of customer assignments — the same "don't assume Driver/
-- Salesman/Collector are different people" philosophy applies here.
--
-- Also: audit_logs has existed since Phase 1 but was NEVER actually
-- populated by anything in this codebase. This migration adds the first
-- real, generic audit-log trigger function, used on customers here and
-- reusable for any future table without writing a new one each time.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CONFIGURABLE LOOKUPS — customer types/channels/categories, all manageable
-- from Settings (system defaults + per-company custom entries), mirroring
-- the van_staff_roles pattern from Phase 3B.1.
-- ---------------------------------------------------------------------------
create table customer_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade, -- null = system default, available to all companies
  label text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_customer_types_system_code on customer_types(code) where company_id is null;
create unique index idx_customer_types_company_code on customer_types(code, company_id) where company_id is not null;

insert into customer_types (code, company_id, label, is_system) values
  ('retail', null, 'Retail Customer', true),
  ('wholesale', null, 'Wholesale Customer', true),
  ('distributor', null, 'Distributor', true),
  ('dealer', null, 'Dealer', true),
  ('hypermarket', null, 'Hypermarket', true),
  ('supermarket', null, 'Supermarket', true),
  ('restaurant', null, 'Restaurant', true),
  ('hotel', null, 'Hotel', true),
  ('cafeteria', null, 'Cafeteria', true),
  ('pharmacy', null, 'Pharmacy', true),
  ('institution', null, 'Institution', true),
  ('government', null, 'Government', true),
  ('cash', null, 'Cash Customer', true),
  ('credit', null, 'Credit Customer', true),
  ('walk_in', null, 'Walk-in Customer', true),
  ('temporary', null, 'Temporary Customer', true);

alter table customer_types enable row level security;
create policy customer_types_select on customer_types for select
  using (company_id is null or company_id = current_company_id());
create policy customer_types_write on customer_types for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

create table customer_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_customer_channels_system_code on customer_channels(code) where company_id is null;
create unique index idx_customer_channels_company_code on customer_channels(code, company_id) where company_id is not null;

insert into customer_channels (code, company_id, label, is_system) values
  ('direct', null, 'Direct', true),
  ('modern_trade', null, 'Modern Trade', true),
  ('traditional_trade', null, 'Traditional Trade', true),
  ('online', null, 'Online', true),
  ('distributor_led', null, 'Distributor-Led', true);

alter table customer_channels enable row level security;
create policy customer_channels_select on customer_channels for select
  using (company_id is null or company_id = current_company_id());
create policy customer_channels_write on customer_channels for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

create table customer_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_customer_categories_system_code on customer_categories(code) where company_id is null;
create unique index idx_customer_categories_company_code on customer_categories(code, company_id) where company_id is not null;

insert into customer_categories (code, company_id, label, is_system) values
  ('food', null, 'Food', true),
  ('beverage', null, 'Beverage', true),
  ('retail', null, 'Retail', true),
  ('medical', null, 'Medical', true),
  ('industrial', null, 'Industrial', true),
  ('automotive', null, 'Automotive', true),
  ('electronics', null, 'Electronics', true),
  ('fashion', null, 'Fashion', true),
  ('hospitality', null, 'Hospitality', true),
  ('government', null, 'Government', true),
  ('other', null, 'Other', true);

alter table customer_categories enable row level security;
create policy customer_categories_select on customer_categories for select
  using (company_id is null or company_id = current_company_id());
create policy customer_categories_write on customer_categories for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

-- Unlimited tags, per company, freely created (no system seed — tags are inherently custom).
create table customer_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table customer_tags enable row level security;
create policy customer_tags_isolation on customer_tags for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_tag_assignments (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id uuid not null references customer_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

alter table customer_tag_assignments enable row level security;
create policy customer_tag_assignments_isolation on customer_tag_assignments for all
  using (exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()))
  with check (exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()));

-- Lightweight territories — this app has no prior "territory" concept.
-- "Area" deliberately stays free text on customers, matching the existing
-- convention on routes.area/region from an earlier phase, rather than
-- inventing a second, parallel geography master this app doesn't otherwise have.
create table territories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table territories enable row level security;
create policy territories_isolation on territories for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Extend the existing customer_groups (already existed, already per-company —
-- just needed richer fields and a management UI, not a rebuild).
-- ---------------------------------------------------------------------------
alter table customer_groups add column if not exists code text;
alter table customer_groups add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- CUSTOMER ADDRESSES — did not exist before (customers.address was a single
-- text field). Versioned: editing never overwrites — it supersedes.
-- ---------------------------------------------------------------------------
create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  address_type text not null default 'delivery' check (address_type in
    ('billing', 'delivery', 'office', 'warehouse', 'shop', 'branch', 'custom')),
  custom_type_label text, -- used when address_type = 'custom'
  address_name text,
  building text,
  street text,
  area text,
  city text,
  state text,
  country text,
  postal_code text,
  google_maps_url text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  delivery_instructions text,
  contact_person text,
  phone_number text,
  is_default_billing boolean not null default false,
  is_default_delivery boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_current boolean not null default true, -- false once superseded by an edit
  superseded_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_customer_addresses_customer on customer_addresses(customer_id, is_current);

alter table customer_addresses enable row level security;
create policy customer_addresses_isolation on customer_addresses for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Editing an address never overwrites the row — it supersedes it and inserts
-- a new current version, preserving full history as required.
create or replace function replace_customer_address(p_old_address_id uuid, p_new_fields jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_old customer_addresses%rowtype;
  v_new_id uuid;
begin
  select * into v_old from customer_addresses where id = p_old_address_id and company_id = current_company_id();
  if not found then raise exception 'Address not found'; end if;

  update customer_addresses set is_current = false, superseded_at = now() where id = p_old_address_id;

  insert into customer_addresses (
    company_id, customer_id, address_type, custom_type_label, address_name, building, street, area, city, state,
    country, postal_code, google_maps_url, latitude, longitude, delivery_instructions, contact_person, phone_number,
    is_default_billing, is_default_delivery, status, created_by
  ) values (
    v_old.company_id, v_old.customer_id,
    coalesce(p_new_fields->>'address_type', v_old.address_type), coalesce(p_new_fields->>'custom_type_label', v_old.custom_type_label),
    coalesce(p_new_fields->>'address_name', v_old.address_name), coalesce(p_new_fields->>'building', v_old.building),
    coalesce(p_new_fields->>'street', v_old.street), coalesce(p_new_fields->>'area', v_old.area),
    coalesce(p_new_fields->>'city', v_old.city), coalesce(p_new_fields->>'state', v_old.state),
    coalesce(p_new_fields->>'country', v_old.country), coalesce(p_new_fields->>'postal_code', v_old.postal_code),
    coalesce(p_new_fields->>'google_maps_url', v_old.google_maps_url),
    coalesce((p_new_fields->>'latitude')::numeric, v_old.latitude), coalesce((p_new_fields->>'longitude')::numeric, v_old.longitude),
    coalesce(p_new_fields->>'delivery_instructions', v_old.delivery_instructions),
    coalesce(p_new_fields->>'contact_person', v_old.contact_person), coalesce(p_new_fields->>'phone_number', v_old.phone_number),
    coalesce((p_new_fields->>'is_default_billing')::boolean, v_old.is_default_billing),
    coalesce((p_new_fields->>'is_default_delivery')::boolean, v_old.is_default_delivery),
    coalesce(p_new_fields->>'status', v_old.status), auth.uid()
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function replace_customer_address(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the existing customer_contacts (already existed — just thin).
-- ---------------------------------------------------------------------------
alter table customer_contacts add column if not exists department text;
alter table customer_contacts add column if not exists mobile text;
alter table customer_contacts add column if not exists whatsapp text;
alter table customer_contacts add column if not exists preferred_contact boolean not null default false;
alter table customer_contacts add column if not exists is_authorized_buyer boolean not null default false;
alter table customer_contacts add column if not exists is_authorized_receiver boolean not null default false;
alter table customer_contacts add column if not exists is_authorized_payment_contact boolean not null default false;
alter table customer_contacts add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));
alter table customer_contacts add column if not exists notes text;
alter table customer_contacts add column if not exists company_id uuid references companies(id) on delete cascade;
alter table customer_contacts add column if not exists created_at timestamptz not null default now();

update customer_contacts cc set company_id = c.company_id from customers c where cc.customer_id = c.id and cc.company_id is null;
alter table customer_contacts alter column company_id set not null;

alter table customer_contacts enable row level security;
drop policy if exists customer_contacts_isolation on customer_contacts;
create policy customer_contacts_isolation on customer_contacts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- CUSTOMER MASTER — extend the existing customers table. customer_type
-- (old hardcoded enum) is kept as-is for backward compatibility; the new
-- customer_type_id is the configurable, going-forward field.
-- ---------------------------------------------------------------------------
alter table customers add column if not exists arabic_name text;
alter table customers add column if not exists display_name text;
alter table customers add column if not exists customer_type_id uuid references customer_types(id) on delete set null;
alter table customers add column if not exists category_id uuid references customer_categories(id) on delete set null;
alter table customers add column if not exists channel_id uuid references customer_channels(id) on delete set null;
alter table customers add column if not exists territory_id uuid references territories(id) on delete set null;
alter table customers add column if not exists area text;
alter table customers add column if not exists route_id uuid references routes(id) on delete set null;
alter table customers add column if not exists van_id uuid references vans(id) on delete set null;
alter table customers add column if not exists branch_id uuid references warehouses(id) on delete set null;
alter table customers add column if not exists assigned_employee_id uuid references app_users(id) on delete set null;
alter table customers add column if not exists commercial_registration text;
alter table customers add column if not exists business_license text;
alter table customers add column if not exists email text;
alter table customers add column if not exists website text;
alter table customers add column if not exists primary_phone text;
alter table customers add column if not exists secondary_phone text;
alter table customers add column if not exists whatsapp text;
alter table customers add column if not exists preferred_language text;
alter table customers add column if not exists preferred_contact_method text check (preferred_contact_method in ('phone', 'whatsapp', 'email', 'sms') or preferred_contact_method is null);
alter table customers add column if not exists google_maps_url text;
alter table customers add column if not exists opening_date date;
alter table customers add column if not exists notes text;
alter table customers add column if not exists internal_remarks text;
alter table customers add column if not exists status text not null default 'active' check (status in
  ('draft', 'pending_approval', 'active', 'inactive', 'blocked', 'suspended', 'archived', 'deleted'));
alter table customers add column if not exists manual_code_used boolean not null default false;
alter table customers add column if not exists created_by uuid references app_users(id);
alter table customers add column if not exists updated_by uuid references app_users(id);

-- Backfill the new configurable type from the old hardcoded one.
update customers c set customer_type_id = ct.id
from customer_types ct
where c.customer_type_id is null and ct.company_id is null and ct.code = c.customer_type;

-- is_active stays a real, generated column (never a source of truth itself)
-- so every existing screen reading customers.is_active keeps working
-- unchanged while status becomes the actual source of truth going forward.
alter table customers drop column if exists is_active;
alter table customers add column is_active boolean generated always as (status in ('active')) stored;

create index if not exists idx_customers_status on customers(company_id, status);
create index if not exists idx_customers_route on customers(route_id);
create index if not exists idx_customers_van on customers(van_id);
create index if not exists idx_customers_territory on customers(territory_id);
create index if not exists idx_customers_assigned_employee on customers(assigned_employee_id);

-- ---------------------------------------------------------------------------
-- STATUS HISTORY — every status change is logged, not just overwritten.
-- ---------------------------------------------------------------------------
create table customer_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_customer_status_history_customer on customer_status_history(customer_id, changed_at desc);

alter table customer_status_history enable row level security;
create policy customer_status_history_isolation on customer_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_customer_status(p_customer_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old_status text;
  v_company_id uuid;
begin
  select status, company_id into v_old_status, v_company_id from customers where id = p_customer_id;
  if v_old_status is null then raise exception 'Customer not found'; end if;

  update customers set status = p_new_status, updated_by = auth.uid() where id = p_customer_id;

  insert into customer_status_history (company_id, customer_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_customer_id, v_old_status, p_new_status, p_reason, auth.uid());
end;
$$;

grant execute on function change_customer_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- CUSTOMER ASSIGNMENTS (employee side) — mirrors van_staff_assignments
-- exactly: any customer can have any number of employees, any employee can
-- hold any number of roles (salesman, collector, supervisor, ...), nothing
-- assumes they're different people. Route/Van/Territory/Branch changes are
-- tracked as reassignment history instead (see below), since a customer
-- normally has exactly one current route/van/territory/branch rather than
-- several simultaneously — a different shape from the employee-role side.
-- ---------------------------------------------------------------------------
create table customer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  employee_id uuid not null references app_users(id) on delete cascade,
  role_code text not null check (role_code in
    ('driver', 'salesman', 'collector', 'helper', 'supervisor', 'manager', 'stock_keeper', 'custom')),
  is_primary boolean not null default false,
  assigned_date date not null default current_date,
  removed_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_customer_assignments_customer on customer_assignments(customer_id, status);
create unique index idx_customer_assignments_active_unique on customer_assignments(customer_id, employee_id, role_code) where status = 'active';

alter table customer_assignments enable row level security;
create policy customer_assignments_isolation on customer_assignments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function assign_customer_employee(
  p_customer_id uuid, p_employee_id uuid, p_role_code text, p_is_primary boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if not has_permission('customers:assign_employee') then raise exception 'Not permitted'; end if;

  insert into customer_assignments (company_id, customer_id, employee_id, role_code, is_primary, created_by)
  values (current_company_id(), p_customer_id, p_employee_id, p_role_code, p_is_primary, auth.uid())
  on conflict (customer_id, employee_id, role_code) where status = 'active'
  do update set is_primary = p_is_primary
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function assign_customer_employee(uuid, uuid, text, boolean) to authenticated;

create or replace function remove_customer_employee(p_assignment_id uuid)
returns void language plpgsql security definer as $$
begin
  if not has_permission('customers:assign_employee') then raise exception 'Not permitted'; end if;
  update customer_assignments set status = 'inactive', removed_date = current_date where id = p_assignment_id;
end;
$$;

grant execute on function remove_customer_employee(uuid) to authenticated;

-- Route/Van/Territory/Branch reassignment history — logged whenever the
-- direct FK on customers changes, via reassign_customer() below.
create table customer_reassignment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  field_name text not null check (field_name in ('route_id', 'van_id', 'territory_id', 'branch_id')),
  old_value uuid,
  new_value uuid,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_customer_reassignment_customer on customer_reassignment_history(customer_id, changed_at desc);

alter table customer_reassignment_history enable row level security;
create policy customer_reassignment_history_isolation on customer_reassignment_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function reassign_customer(p_customer_id uuid, p_field_name text, p_new_value uuid)
returns void language plpgsql security definer as $$
declare
  v_old_value uuid;
  v_company_id uuid;
  v_permission text;
begin
  v_permission := case p_field_name
    when 'route_id' then 'customers:assign_route'
    when 'van_id' then 'customers:assign_van'
    else 'customers:edit'
  end;
  if not has_permission(v_permission) then raise exception 'Not permitted'; end if;
  if p_field_name not in ('route_id', 'van_id', 'territory_id', 'branch_id') then raise exception 'Invalid field'; end if;

  select company_id into v_company_id from customers where id = p_customer_id;
  if v_company_id is null then raise exception 'Customer not found'; end if;

  execute format('select %I from customers where id = $1', p_field_name) into v_old_value using p_customer_id;
  execute format('update customers set %I = $1, updated_by = $2 where id = $3', p_field_name)
    using p_new_value, auth.uid(), p_customer_id;

  insert into customer_reassignment_history (company_id, customer_id, field_name, old_value, new_value, changed_by)
  values (v_company_id, p_customer_id, p_field_name, v_old_value, p_new_value, auth.uid());
end;
$$;

grant execute on function reassign_customer(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- DUPLICATE DETECTION — a soft check (warn, don't hard-block), since
-- override requires a permission rather than being structurally impossible.
-- ---------------------------------------------------------------------------
create or replace function check_duplicate_customer(p_phone text, p_whatsapp text, p_email text, p_exclude_id uuid default null)
returns table (id uuid, business_name text, matched_on text) language sql stable as $$
  select id, business_name, 'phone' from customers
  where company_id = current_company_id() and p_phone is not null and primary_phone = p_phone and id is distinct from p_exclude_id
  union all
  select id, business_name, 'whatsapp' from customers
  where company_id = current_company_id() and p_whatsapp is not null and whatsapp = p_whatsapp and id is distinct from p_exclude_id
  union all
  select id, business_name, 'email' from customers
  where company_id = current_company_id() and p_email is not null and email = p_email and id is distinct from p_exclude_id;
$$;

grant execute on function check_duplicate_customer(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- GENERIC AUDIT LOG TRIGGER — audit_logs has existed since Phase 1 but
-- nothing in this codebase has ever actually written to it. This is the
-- first real, working population mechanism, built generic on purpose so
-- any future table can opt in with one line rather than writing this again.
-- ---------------------------------------------------------------------------
create or replace function log_audit_change()
returns trigger language plpgsql security definer as $$
declare
  v_company_id uuid;
begin
  v_company_id := coalesce(
    case when TG_OP = 'DELETE' then (to_jsonb(old)->>'company_id')::uuid else (to_jsonb(new)->>'company_id')::uuid end,
    current_company_id()
  );

  insert into audit_logs (company_id, user_id, entity_table, entity_id, action, old_data, new_data)
  values (
    v_company_id, auth.uid(), TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(new)->>'id')::uuid end,
    lower(TG_OP), case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_audit_customers on customers;
create trigger trg_audit_customers after insert or update or delete on customers
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_addresses on customer_addresses;
create trigger trg_audit_customer_addresses after insert or update or delete on customer_addresses
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_contacts on customer_contacts;
create trigger trg_audit_customer_contacts after insert or update or delete on customer_contacts
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_assignments on customer_assignments;
create trigger trg_audit_customer_assignments after insert or update or delete on customer_assignments
  for each row execute function log_audit_change();

-- ---------------------------------------------------------------------------
-- PERMISSIONS — new 'customers' module (free-text actions, same style as
-- 'devices' from Phase 3B.3).
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'customers', a, 'Customer master: ' || a
from unnest(array[
  'view', 'create', 'edit', 'delete_draft', 'approve', 'block', 'deactivate',
  'assign_route', 'assign_van', 'assign_employee', 'view_assignments', 'export', 'print'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'customers'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- CUSTOMER CODE GENERATION — automatic by default, manual allowed only with
-- permission (checked at the RPC layer since it needs has_permission()).
-- ---------------------------------------------------------------------------
create or replace function generate_customer_code(p_company_id uuid)
returns text language plpgsql stable as $$
declare
  v_seq integer;
begin
  select count(*) + 1 into v_seq from customers where company_id = p_company_id;
  return 'CUS-' || lpad(v_seq::text, 6, '0');
end;
$$;
