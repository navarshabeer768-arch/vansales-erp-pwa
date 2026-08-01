-- ============================================================================
-- 0041_route_execution_view_permission.sql
-- The route_execution permission list (0038) covered every named action from
-- the requirements doc but missed a plain "view" action — this app's sidebar
-- nav gating uniformly checks `${module}:view` for every module, and without
-- it the Daily Visit Plans / Route Monitoring nav items would never show for
-- anyone. view_monitoring stays as the distinct "Supervisor Live Monitoring"
-- permission; this is the general "can see this section at all" permission.
-- ============================================================================

insert into permissions (module, action, description)
values ('route_execution', 'view', 'Route execution: view')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'route_execution' and p.action = 'view'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;
