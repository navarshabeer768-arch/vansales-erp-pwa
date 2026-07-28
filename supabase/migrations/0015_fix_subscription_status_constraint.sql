-- ============================================================================
-- 0015_fix_subscription_status_constraint.sql
-- BUGFIX: 0012_company_approval_workflow.sql changed bootstrap_company to
-- insert subscription_status = 'trial', but the original check constraint
-- from 0001 only allowed ('active','suspended','cancelled') — it never
-- included 'trial'. Every company creation (self-registration AND platform
-- admin's "New company") has been failing on this constraint ever since.
-- ============================================================================

alter table companies drop constraint if exists companies_subscription_status_check;
alter table companies add constraint companies_subscription_status_check
  check (subscription_status in ('trial', 'active', 'suspended', 'cancelled'));
