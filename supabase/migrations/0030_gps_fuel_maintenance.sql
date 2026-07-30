-- ============================================================================
-- 0030_gps_fuel_maintenance.sql
-- GPS Tracking enhancements (trip stats, geofencing with real detection),
-- Fuel Management, Vehicle Maintenance + Scheduling, and computed
-- reminders/alerts (vehicle_alerts). This is a static PWA + Supabase with
-- no background server, so alerts are computed on demand (called when the
-- Dashboard/GPS/Fleet pages load) rather than pushed by a cron — that
-- limitation is real and is documented in the README, not hidden.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New permission modules: fuel, maintenance (gps_tracking already exists
-- from the original permission catalog — view/create/edit/delete/approve/
-- export for it were seeded on day one).
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select m, a, initcap(a) || ' access to ' || m
from unnest(array['fuel', 'maintenance']) as m
cross join unnest(array['view', 'create', 'edit', 'delete', 'approve', 'export']) as a
on conflict do nothing;

-- Back-fill: company_admin/super_admin in EVERY existing company get the
-- new permissions too (new companies get this automatically at creation
-- via clone_system_roles_for_company; existing ones need a one-time grant).
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.module in ('fuel', 'maintenance')
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- FUEL MANAGEMENT
-- ---------------------------------------------------------------------------
create table fuel_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  fuel_date date not null default current_date,
  fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'cng', 'electric')),
  quantity numeric(10,2) not null,
  cost numeric(12,2) not null,
  odometer_reading numeric(10,1) not null,
  vendor text,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_fuel_logs_van on fuel_logs(van_id, fuel_date desc);

alter table fuel_logs enable row level security;
create policy fuel_logs_isolation on fuel_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Mileage (distance-per-fuel-unit) between consecutive fuel entries for the
-- same van, computed from odometer deltas — the only reliable source,
-- since GPS-derived distance can have gaps if location sharing wasn't on.
create or replace function van_fuel_mileage(p_van_id uuid)
returns table (
  fuel_log_id uuid, fuel_date date, quantity numeric, cost numeric,
  odometer_reading numeric, distance_since_last numeric, mileage numeric
) language sql stable as $$
  select
    f.id, f.fuel_date, f.quantity, f.cost, f.odometer_reading,
    f.odometer_reading - lag(f.odometer_reading) over (order by f.odometer_reading) as distance_since_last,
    case when f.quantity > 0 then
      round((f.odometer_reading - lag(f.odometer_reading) over (order by f.odometer_reading)) / nullif(f.quantity, 0), 2)
    else null end as mileage
  from fuel_logs f
  where f.van_id = p_van_id
  order by f.odometer_reading;
$$;

grant execute on function van_fuel_mileage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- VEHICLE MAINTENANCE
-- ---------------------------------------------------------------------------
create table maintenance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  maintenance_type text not null check (maintenance_type in
    ('oil_change', 'brake_service', 'tyre_replacement', 'battery_replacement', 'general_service', 'inspection', 'custom')),
  description text,
  service_date date not null default current_date,
  odometer_reading numeric(10,1),
  cost numeric(12,2) not null default 0,
  vendor text,
  invoice_url text,
  next_service_date date,
  next_service_odometer numeric(10,1),
  status text not null default 'completed' check (status in ('scheduled', 'completed', 'cancelled')),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_maintenance_van on maintenance_records(van_id, service_date desc);

alter table maintenance_records enable row level security;
create policy maintenance_records_isolation on maintenance_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function approve_maintenance(p_record_id uuid)
returns void language plpgsql security definer as $$
begin
  if not has_permission('maintenance:approve') then
    raise exception 'Not permitted to approve maintenance';
  end if;
  update maintenance_records set approved_by = auth.uid(), approved_at = now() where id = p_record_id;
end;
$$;

grant execute on function approve_maintenance(uuid) to authenticated;

-- Recurring schedule definitions (drives the "Maintenance Due" reminders).
create table maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  maintenance_type text not null check (maintenance_type in
    ('oil_change', 'brake_service', 'tyre_replacement', 'battery_replacement', 'general_service', 'inspection', 'custom')),
  interval_km numeric(10,1),
  interval_days integer,
  last_service_date date,
  last_service_odometer numeric(10,1),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_maintenance_schedules_van on maintenance_schedules(van_id);

alter table maintenance_schedules enable row level security;
create policy maintenance_schedules_isolation on maintenance_schedules for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- GEOFENCING
-- ---------------------------------------------------------------------------
create table geofences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  fence_type text not null check (fence_type in ('warehouse', 'customer', 'route', 'custom')),
  warehouse_id uuid references warehouses(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters numeric(8,1) not null default 200,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_geofences_company on geofences(company_id, is_active);

alter table geofences enable row level security;
create policy geofences_isolation on geofences for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table geofence_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  geofence_id uuid not null references geofences(id) on delete cascade,
  event_type text not null check (event_type in ('arrival', 'exit')),
  occurred_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null
);
create index idx_geofence_events_van on geofence_events(van_id, occurred_at desc);

alter table geofence_events enable row level security;
create policy geofence_events_isolation on geofence_events for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table vehicle_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid references vans(id) on delete cascade,
  employee_id uuid references app_users(id) on delete cascade, -- for driver-linked alerts (e.g. license expiry) that aren't tied to a specific van
  alert_type text not null check (alert_type in (
    'maintenance_due', 'fuel_consumption', 'vehicle_offline', 'gps_lost',
    'permit_expiry', 'insurance_expiry', 'registration_expiry', 'license_expiry', 'unauthorized_movement'
  )),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  is_acknowledged boolean not null default false,
  acknowledged_by uuid references app_users(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_vehicle_alerts_company on vehicle_alerts(company_id, is_acknowledged, created_at desc);
-- Avoid spamming duplicate unacknowledged alerts of the same type for the
-- same van or the same employee. Two separate partial indexes because a
-- plain unique index on a nullable column never treats two NULLs as equal
-- — a single index on (van_id, alert_type) would silently fail to
-- deduplicate the employee-linked alerts, which always have van_id null.
create unique index idx_vehicle_alerts_dedup_van on vehicle_alerts(van_id, alert_type) where is_acknowledged = false and van_id is not null;
create unique index idx_vehicle_alerts_dedup_employee on vehicle_alerts(employee_id, alert_type) where is_acknowledged = false and employee_id is not null;

alter table vehicle_alerts enable row level security;
create policy vehicle_alerts_isolation on vehicle_alerts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function acknowledge_vehicle_alert(p_alert_id uuid)
returns void language plpgsql security definer as $$
begin
  update vehicle_alerts set is_acknowledged = true, acknowledged_by = auth.uid(), acknowledged_at = now() where id = p_alert_id;
end;
$$;

grant execute on function acknowledge_vehicle_alert(uuid) to authenticated;

-- Haversine distance in meters between two lat/lng points.
create or replace function haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$$;

-- ---------------------------------------------------------------------------
-- Real-time geofence detection: fires on every gps_logs insert (i.e. every
-- location update from useShareLocation), so arrival/exit is detected the
-- moment a position lands, regardless of which page/device sent it.
-- ---------------------------------------------------------------------------
create or replace function detect_geofence_events()
returns trigger language plpgsql security definer as $$
declare
  v_fence record;
  v_was_inside boolean;
  v_is_inside boolean;
  v_prev_lat double precision;
  v_prev_lng double precision;
begin
  if new.van_id is null then
    return new; -- geofencing needs a van to attribute the event to; nothing to do without one
  end if;

  select latitude, longitude into v_prev_lat, v_prev_lng
  from gps_logs
  where van_id = new.van_id and id != new.id
  order by recorded_at desc limit 1;

  for v_fence in select * from geofences where company_id = new.company_id and is_active = true loop
    v_is_inside := haversine_meters(new.latitude, new.longitude, v_fence.center_lat, v_fence.center_lng) <= v_fence.radius_meters;

    if v_prev_lat is null then
      v_was_inside := false; -- first-ever ping for this van: treat as "was outside" so an inside ping registers as arrival
    else
      v_was_inside := haversine_meters(v_prev_lat, v_prev_lng, v_fence.center_lat, v_fence.center_lng) <= v_fence.radius_meters;
    end if;

    if v_is_inside and not v_was_inside then
      insert into geofence_events (company_id, van_id, geofence_id, event_type, latitude, longitude)
      values (new.company_id, new.van_id, v_fence.id, 'arrival', new.latitude, new.longitude);
    elsif v_was_inside and not v_is_inside then
      insert into geofence_events (company_id, van_id, geofence_id, event_type, latitude, longitude)
      values (new.company_id, new.van_id, v_fence.id, 'exit', new.latitude, new.longitude);
    end if;
  end loop;

  -- Unauthorized movement: van is pinging from outside every active geofence
  -- for this company. A single out-of-fence ping is normal (a van on the
  -- road between stops); this only fires once a van has been continuously
  -- outside every fence for a while, so ordinary travel doesn't spam alerts.
  if not exists (
    select 1 from geofences g
    where g.company_id = new.company_id and g.is_active = true
      and haversine_meters(new.latitude, new.longitude, g.center_lat, g.center_lng) <= g.radius_meters
  ) and exists (select 1 from geofences where company_id = new.company_id and is_active = true)
    and not exists (
      select 1 from gps_logs
      where van_id = new.van_id and recorded_at > now() - interval '30 minutes' and recorded_at < new.recorded_at
        and exists (
          select 1 from geofences g2
          where g2.company_id = new.company_id and g2.is_active = true
            and haversine_meters(gps_logs.latitude, gps_logs.longitude, g2.center_lat, g2.center_lng) <= g2.radius_meters
        )
    )
  then
    insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
    values (new.company_id, new.van_id, 'unauthorized_movement', 'warning',
      'Van has been outside all known geofences for over 30 minutes.')
    on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_detect_geofence_events on gps_logs;
create trigger trg_detect_geofence_events after insert on gps_logs
for each row execute function detect_geofence_events();

-- ---------------------------------------------------------------------------
-- GPS trip stats for a van on a given day: distance travelled, travel time
-- (moving time), and stop duration (time between points where the van
-- didn't move meaningfully), all computed from gps_logs.
-- ---------------------------------------------------------------------------
create or replace function van_gps_stats(p_van_id uuid, p_date date)
returns table (
  distance_km numeric, travel_minutes numeric, stop_minutes numeric,
  point_count integer, first_seen timestamptz, last_seen timestamptz
) language plpgsql stable as $$
declare
  v_row record;
  v_prev_lat double precision;
  v_prev_lng double precision;
  v_prev_at timestamptz;
  v_distance double precision := 0;
  v_travel_seconds numeric := 0;
  v_stop_seconds numeric := 0;
  v_count integer := 0;
  v_first timestamptz;
  v_last timestamptz;
begin
  for v_row in
    select latitude, longitude, recorded_at
    from gps_logs
    where van_id = p_van_id and recorded_at::date = p_date
    order by recorded_at asc
  loop
    v_count := v_count + 1;
    if v_first is null then v_first := v_row.recorded_at; end if;
    v_last := v_row.recorded_at;

    if v_prev_at is not null then
      declare
        v_seg_distance double precision := haversine_meters(v_prev_lat, v_prev_lng, v_row.latitude, v_row.longitude);
        v_seg_seconds numeric := extract(epoch from (v_row.recorded_at - v_prev_at));
      begin
        v_distance := v_distance + v_seg_distance;
        -- Moved more than 15m in this interval = travelling; otherwise treat as stopped.
        if v_seg_distance > 15 then
          v_travel_seconds := v_travel_seconds + v_seg_seconds;
        else
          v_stop_seconds := v_stop_seconds + v_seg_seconds;
        end if;
      end;
    end if;

    v_prev_lat := v_row.latitude;
    v_prev_lng := v_row.longitude;
    v_prev_at := v_row.recorded_at;
  end loop;

  distance_km := round((v_distance / 1000)::numeric, 2);
  travel_minutes := round((v_travel_seconds / 60)::numeric, 1);
  stop_minutes := round((v_stop_seconds / 60)::numeric, 1);
  point_count := v_count;
  first_seen := v_first;
  last_seen := v_last;
  return next;
end;
$$;

grant execute on function van_gps_stats(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Computed alerts: maintenance due, document expiry, offline vans. Called
-- on demand (Dashboard/Fleet page load) rather than pushed by a cron —
-- this project has no background server to run one.
-- ---------------------------------------------------------------------------
create or replace function refresh_vehicle_alerts()
returns integer language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_count integer := 0;
begin
  if v_company_id is null then raise exception 'No company context'; end if;

  -- Maintenance due (by date or by odometer, whichever schedule is set).
  insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
  select v_company_id, ms.van_id, 'maintenance_due', 'warning',
    initcap(replace(ms.maintenance_type, '_', ' ')) || ' due for ' || v.name
  from maintenance_schedules ms
  join vans v on v.id = ms.van_id
  where ms.company_id = v_company_id and ms.is_active = true
    and (
      (ms.interval_days is not null and ms.last_service_date is not null and ms.last_service_date + ms.interval_days <= current_date + 7)
      or (ms.interval_km is not null and ms.last_service_odometer is not null and v.current_odometer is not null
          and v.current_odometer - ms.last_service_odometer >= ms.interval_km - 200)
    )
  on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;
  get diagnostics v_count = row_count;

  -- Document expiry (insurance/registration/permit) within 30 days.
  insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
  select v_company_id, v.id, 'insurance_expiry', case when v.insurance_expiry < current_date then 'critical' else 'warning' end,
    'Insurance for ' || v.name || ' expires ' || v.insurance_expiry
  from vans v where v.company_id = v_company_id and v.insurance_expiry is not null and v.insurance_expiry <= current_date + 30 and v.is_archived = false
  on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;

  insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
  select v_company_id, v.id, 'registration_expiry', case when v.registration_expiry < current_date then 'critical' else 'warning' end,
    'Registration for ' || v.name || ' expires ' || v.registration_expiry
  from vans v where v.company_id = v_company_id and v.registration_expiry is not null and v.registration_expiry <= current_date + 30 and v.is_archived = false
  on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;

  insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
  select v_company_id, v.id, 'permit_expiry', case when v.permit_expiry < current_date then 'critical' else 'warning' end,
    'Road permit for ' || v.name || ' expires ' || v.permit_expiry
  from vans v where v.company_id = v_company_id and v.permit_expiry is not null and v.permit_expiry <= current_date + 30 and v.is_archived = false
  on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;

  -- Driver license expiry.
  insert into vehicle_alerts (company_id, employee_id, alert_type, severity, message)
  select v_company_id, dp.user_id, 'license_expiry', case when dp.license_expiry < current_date then 'critical' else 'warning' end,
    'Driver license for ' || u.full_name || ' expires ' || dp.license_expiry
  from driver_profiles dp
  join app_users u on u.id = dp.user_id
  where dp.company_id = v_company_id and dp.license_expiry is not null and dp.license_expiry <= current_date + 30
  on conflict (employee_id, alert_type) where is_acknowledged = false and employee_id is not null do nothing;

  -- Vehicle offline: has an active staff assignment (so it's expected to be reporting) but no GPS ping in 2 hours.
  insert into vehicle_alerts (company_id, van_id, alert_type, severity, message)
  select v_company_id, v.id, 'vehicle_offline', 'warning',
    v.name || ' has not reported a GPS position in over 2 hours'
  from vans v
  where v.company_id = v_company_id and v.is_archived = false
    and exists (select 1 from van_staff_assignments vsa where vsa.van_id = v.id and vsa.status = 'active')
    and (v.last_location_at is null or v.last_location_at < now() - interval '2 hours')
  on conflict (van_id, alert_type) where is_acknowledged = false and van_id is not null do nothing;

  return (select count(*) from vehicle_alerts where company_id = v_company_id and is_acknowledged = false);
end;
$$;

grant execute on function refresh_vehicle_alerts() to authenticated;
