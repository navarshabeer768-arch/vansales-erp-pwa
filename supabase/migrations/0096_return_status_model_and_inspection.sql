-- ============================================================================
-- 0096_return_status_model_and_inspection.sql
-- Phase 5B.3 Part 2: Return Approval, Quality Inspection, Return Stock
-- Posting, Customer Balance Adjustment, Credit Note Generation,
-- Replacement Workflow, Return Printing, Offline Revalidation, Reversals.
-- ============================================================================

alter table stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'purchase_in', 'warehouse_transfer', 'van_load', 'van_unload', 'sale_out',
  'sales_return_in', 'purchase_return_out', 'adjustment', 'damage', 'loss', 'opening_stock',
  'damaged_return_in', 'expired_return_in', 'quarantine_return_in', 'rejected_return_out', 'return_reversal_out'
));

alter table sales_returns drop constraint if exists sales_returns_status_check;
alter table sales_returns add constraint sales_returns_status_check check (status in (
  'draft', 'pending_validation', 'validation_failed', 'pending_approval', 'partially_approved', 'approved',
  'returned_for_correction', 'on_hold', 'pending_inspection', 'inspection_in_progress', 'partially_accepted',
  'accepted', 'rejected', 'ready_to_post', 'posting', 'posted', 'posting_failed', 'replacement_pending',
  'replacement_approved', 'replacement_completed', 'credit_note_pending', 'credit_note_generated',
  'cancelled_before_posting', 'reversal_requested', 'reversed',
  'sync_pending', 'sync_failed', 'conflict', 'pending_submission', 'submitted', 'expired'
));

alter table sales_returns drop constraint if exists sales_returns_posting_status_check;
alter table sales_returns add constraint sales_returns_posting_status_check check (posting_status in (
  'not_posted', 'posting', 'posted', 'posting_failed', 'reversal_pending', 'reversed'
));

alter table sales_returns add column if not exists is_on_hold boolean not null default false;
alter table sales_returns add column if not exists final_number_generated_at timestamptz;
alter table sales_returns add column if not exists final_number_generated_by uuid references app_users(id);
alter table sales_returns add column if not exists version integer not null default 1;

create or replace function change_return_status(p_return_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_returns where id = p_return_id;
  if v_old is null then raise exception 'Return not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_validation' then p_new_status in ('validation_failed', 'pending_submission', 'pending_approval', 'pending_inspection', 'ready_to_post', 'cancelled_before_posting')
    when 'validation_failed' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'pending_inspection', 'ready_to_post', 'cancelled_before_posting', 'draft')
    when 'pending_approval' then p_new_status in ('approved', 'partially_approved', 'returned_for_correction', 'on_hold', 'cancelled_before_posting')
    when 'partially_approved' then p_new_status in ('pending_inspection', 'on_hold', 'cancelled_before_posting')
    when 'approved' then p_new_status in ('pending_inspection', 'ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled_before_posting')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'pending_inspection', 'ready_to_post', 'cancelled_before_posting')
    when 'pending_inspection' then p_new_status in ('inspection_in_progress', 'on_hold', 'cancelled_before_posting')
    when 'inspection_in_progress' then p_new_status in ('partially_accepted', 'accepted', 'rejected', 'on_hold')
    when 'partially_accepted' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'accepted' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'rejected' then p_new_status in ('cancelled_before_posting')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled_before_posting')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled_before_posting')
    when 'posted' then p_new_status in ('replacement_pending', 'credit_note_pending', 'credit_note_generated', 'reversal_requested')
    when 'replacement_pending' then p_new_status in ('replacement_approved', 'reversal_requested')
    when 'replacement_approved' then p_new_status in ('replacement_completed', 'reversal_requested')
    when 'replacement_completed' then p_new_status in ('reversal_requested')
    when 'credit_note_pending' then p_new_status in ('credit_note_generated', 'reversal_requested')
    when 'credit_note_generated' then p_new_status in ('reversal_requested')
    when 'reversal_requested' then p_new_status in ('reversed', 'posted', 'replacement_pending', 'credit_note_generated')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled_before_posting')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'pending_inspection', 'ready_to_post', 'cancelled_before_posting')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled_before_posting' then false
    when 'reversed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move return from % to %', v_old, p_new_status; end if;

  update sales_returns set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_return_id;
  insert into sales_return_status_history (company_id, return_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_return_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_return_status(uuid, text, text) to authenticated;

create table sales_return_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  inspector_id uuid references app_users(id),
  inspection_date timestamptz not null default now(),
  inspection_location text,
  status text not null default 'pending' check (status in (
    'not_required', 'pending', 'in_progress', 'completed', 'partially_accepted', 'accepted',
    'rejected', 'returned_for_reinspection', 'cancelled'
  )),
  notes text,
  created_at timestamptz not null default now(),
  unique (return_id)
);

alter table sales_return_inspections enable row level security;
create policy sales_return_inspections_isolation on sales_return_inspections for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_id uuid not null references sales_return_inspections(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete cascade,
  requested_quantity numeric(14,3) not null,
  inspected_quantity numeric(14,3) not null default 0,
  accepted_saleable_quantity numeric(14,3) not null default 0,
  accepted_damaged_quantity numeric(14,3) not null default 0,
  accepted_expired_quantity numeric(14,3) not null default 0,
  quarantine_quantity numeric(14,3) not null default 0,
  rejected_quantity numeric(14,3) not null default 0,
  condition_code text,
  packaging_condition text,
  seal_status text,
  expiry_date date,
  damage_severity text check (damage_severity in ('none', 'minor', 'moderate', 'severe') or damage_severity is null),
  saleable_status text check (saleable_status in ('saleable', 'restock_van', 'restock_warehouse', 'damaged', 'expired', 'quarantine', 'scrap', 'supplier_claim', 'rejected_return') or saleable_status is null),
  quarantine_required boolean not null default false,
  disposal_recommended boolean not null default false,
  supplier_claim_recommended boolean not null default false,
  replacement_eligible boolean not null default false,
  credit_eligible boolean not null default true,
  rejected_reason text,
  return_to_customer_required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint sales_return_inspection_items_totals_check check (
    accepted_saleable_quantity + accepted_damaged_quantity + accepted_expired_quantity + quarantine_quantity + rejected_quantity <= inspected_quantity + 0.001
  )
);
create index idx_sales_return_inspection_items_inspection on sales_return_inspection_items(inspection_id);
create index idx_sales_return_inspection_items_return_item on sales_return_inspection_items(return_item_id);

alter table sales_return_inspection_items enable row level security;
create policy sales_return_inspection_items_isolation on sales_return_inspection_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_inspection_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_item_id uuid not null references sales_return_inspection_items(id) on delete cascade,
  is_reinspection boolean not null default false,
  previous_condition text,
  new_condition text,
  changed_by uuid references app_users(id),
  reason text,
  changed_at timestamptz not null default now()
);
create index idx_sales_return_inspection_history_item on sales_return_inspection_history(inspection_item_id);

alter table sales_return_inspection_history enable row level security;
create policy sales_return_inspection_history_isolation on sales_return_inspection_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_return_inspection(p_return_id uuid, p_inspection_location text default null)
returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_inspection_id uuid;
  v_item sales_return_items%rowtype;
begin
  if not has_permission('sales_returns:inspect_return') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_returns where id = p_return_id;
  if v_company_id is null then raise exception 'Return not found'; end if;

  insert into sales_return_inspections (company_id, return_id, inspector_id, inspection_location, status)
  values (v_company_id, p_return_id, auth.uid(), p_inspection_location, 'in_progress')
  on conflict (return_id) do update set inspector_id = auth.uid(), status = 'in_progress', inspection_date = now()
  returning id into v_inspection_id;

  for v_item in select * from sales_return_items where return_id = p_return_id and item_status = 'active' loop
    insert into sales_return_inspection_items (company_id, inspection_id, return_item_id, requested_quantity)
    values (v_company_id, v_inspection_id, v_item.id, v_item.base_return_quantity)
    on conflict do nothing;
  end loop;

  perform change_return_status(p_return_id, 'inspection_in_progress', 'Inspection started');
  return v_inspection_id;
end;
$$;
grant execute on function create_return_inspection(uuid, text) to authenticated;

create or replace function record_inspection_item_result(
  p_inspection_item_id uuid, p_inspected_quantity numeric, p_accepted_saleable numeric default 0,
  p_accepted_damaged numeric default 0, p_accepted_expired numeric default 0, p_quarantine numeric default 0,
  p_rejected numeric default 0, p_condition_code text default null, p_damage_severity text default null,
  p_saleable_status text default null, p_expiry_date date default null, p_rejected_reason text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_item sales_return_inspection_items%rowtype;
  v_total numeric;
begin
  if not has_permission('sales_returns:inspect_return') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_return_inspection_items where id = p_inspection_item_id;
  if not found then raise exception 'Inspection item not found'; end if;

  if p_inspected_quantity > v_item.requested_quantity + 0.001 then
    raise exception 'Inspected quantity (%.3f) cannot exceed requested quantity (%.3f)', p_inspected_quantity, v_item.requested_quantity;
  end if;

  v_total := p_accepted_saleable + p_accepted_damaged + p_accepted_expired + p_quarantine + p_rejected;
  if v_total > p_inspected_quantity + 0.001 then
    raise exception 'Accepted + rejected quantities (%.3f) cannot exceed inspected quantity (%.3f)', v_total, p_inspected_quantity;
  end if;

  if v_item.condition_code is not null and v_item.condition_code != p_condition_code then
    insert into sales_return_inspection_history (company_id, inspection_item_id, is_reinspection, previous_condition, new_condition, changed_by, reason)
    values (v_item.company_id, p_inspection_item_id, true, v_item.condition_code, p_condition_code, auth.uid(), 'Reinspection');
  end if;

  update sales_return_inspection_items set
    inspected_quantity = p_inspected_quantity, accepted_saleable_quantity = p_accepted_saleable,
    accepted_damaged_quantity = p_accepted_damaged, accepted_expired_quantity = p_accepted_expired,
    quarantine_quantity = p_quarantine, rejected_quantity = p_rejected, condition_code = p_condition_code,
    damage_severity = p_damage_severity, saleable_status = p_saleable_status, expiry_date = p_expiry_date,
    rejected_reason = p_rejected_reason, notes = p_notes,
    quarantine_required = p_quarantine > 0, disposal_recommended = p_saleable_status = 'scrap',
    supplier_claim_recommended = p_saleable_status = 'supplier_claim'
  where id = p_inspection_item_id;
end;
$$;
grant execute on function record_inspection_item_result(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, date, text, text) to authenticated;

create or replace function complete_return_inspection(p_return_id uuid)
returns void language plpgsql security definer as $$
declare
  v_inspection_id uuid;
  v_total_requested numeric;
  v_total_accepted numeric;
  v_total_rejected numeric;
  v_new_status text;
begin
  if not has_permission('sales_returns:inspect_return') then raise exception 'Not permitted'; end if;
  select id into v_inspection_id from sales_return_inspections where return_id = p_return_id;
  if v_inspection_id is null then raise exception 'No inspection found for this return'; end if;

  select
    coalesce(sum(requested_quantity), 0),
    coalesce(sum(accepted_saleable_quantity + accepted_damaged_quantity + accepted_expired_quantity + quarantine_quantity), 0),
    coalesce(sum(rejected_quantity), 0)
  into v_total_requested, v_total_accepted, v_total_rejected
  from sales_return_inspection_items where inspection_id = v_inspection_id;

  v_new_status := case
    when v_total_accepted <= 0 then 'rejected'
    when v_total_accepted >= v_total_requested - 0.001 then 'accepted'
    else 'partially_accepted'
  end;

  update sales_return_inspections set status = v_new_status where id = v_inspection_id;
  perform change_return_status(p_return_id, v_new_status, 'Inspection completed');
end;
$$;
grant execute on function complete_return_inspection(uuid) to authenticated;
