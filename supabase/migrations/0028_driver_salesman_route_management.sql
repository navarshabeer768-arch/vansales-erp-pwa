-- ============================================================================
-- 0028_driver_salesman_route_management.sql
-- Driver Management (profile/license/medical/emergency contact/attendance/
-- documents), Salesman Management (targets/collection targets/commission),
-- and Route Management extensions (area/region/priority/distance/time,
-- 'custom' frequency).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DRIVER PROFILES (1:1 extension of app_users for drivers)
-- ---------------------------------------------------------------------------
create table driver_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  license_number text,
  license_expiry date,
  medical_expiry date,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  updated_at timestamptz not null default now()
);

alter table driver_profiles enable row level security;
create policy driver_profiles_isolation on driver_profiles for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table driver_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  document_type text not null check (document_type in ('license', 'medical', 'id_card', 'contract', 'other')),
  document_no text,
  expiry_date date,
  file_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_driver_documents_user on driver_documents(user_id);

alter table driver_documents enable row level security;
create policy driver_documents_isolation on driver_documents for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table driver_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('present', 'absent', 'leave', 'half_day')),
  check_in_time time,
  check_out_time time,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, attendance_date)
);
create index idx_driver_attendance_date on driver_attendance(company_id, attendance_date);

alter table driver_attendance enable row level security;
create policy driver_attendance_isolation on driver_attendance for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- SALESMAN TARGETS (sales target, collection target, commission rate per
-- calendar month)
-- ---------------------------------------------------------------------------
create table salesman_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  target_month date not null, -- always stored as the 1st of the month
  sales_target numeric(14,2) not null default 0,
  collection_target numeric(14,2) not null default 0,
  commission_rate numeric(5,2) not null default 0, -- percentage
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, target_month)
);
create index idx_salesman_targets_month on salesman_targets(company_id, target_month);

alter table salesman_targets enable row level security;
create policy salesman_targets_isolation on salesman_targets for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- ROUTE MANAGEMENT extensions
-- ---------------------------------------------------------------------------
alter table routes add column if not exists area text;
alter table routes add column if not exists region text;
alter table routes add column if not exists priority text not null default 'medium';
alter table routes add column if not exists distance_km numeric(8,1);
alter table routes add column if not exists estimated_time_minutes integer;

alter table routes drop constraint if exists routes_priority_check;
alter table routes add constraint routes_priority_check check (priority in ('low', 'medium', 'high'));

alter table routes drop constraint if exists routes_frequency_check;
alter table routes add constraint routes_frequency_check check (frequency in ('daily', 'weekly', 'monthly', 'custom'));

alter table route_customers add column if not exists visit_frequency text not null default 'daily';
alter table route_customers drop constraint if exists route_customers_visit_frequency_check;
alter table route_customers add constraint route_customers_visit_frequency_check check (visit_frequency in ('daily', 'weekly', 'monthly', 'custom'));
alter table route_customers add column if not exists day_of_month integer;
alter table route_customers add column if not exists custom_notes text;
