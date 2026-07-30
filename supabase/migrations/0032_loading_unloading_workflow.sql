-- ============================================================================
-- 0032_loading_unloading_workflow.sql
-- Extends the existing Van Loading/Unloading tables (draft/quantity_verified/
-- system_quantity/signature_url already existed, unused) into a full
-- enterprise approval workflow, adds Van-to-Van transfers, serial number
-- selection at loading time, and DB-level duplicate-line prevention.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Status lifecycle: add 'reopened' and 'cancelled' alongside the existing
-- draft/pending_approval/approved/rejected.
-- ---------------------------------------------------------------------------
alter table van_loadings drop constraint if exists van_loadings_status_check;
alter table van_loadings add constraint van_loadings_status_check
  check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'reopened', 'cancelled'));
alter table van_loadings add column if not exists approval_notes text;
alter table van_loadings add column if not exists rejected_reason text;
alter table van_loadings add column if not exists cancel_reason text;
alter table van_loadings add column if not exists route_id uuid references routes(id) on delete set null;

alter table van_unloadings drop constraint if exists van_unloadings_status_check;
alter table van_unloadings add constraint van_unloadings_status_check
  check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'reopened', 'cancelled'));
alter table van_unloadings add column if not exists approval_notes text;
alter table van_unloadings add column if not exists rejected_reason text;
alter table van_unloadings add column if not exists cancel_reason text;
alter table van_unloadings add column if not exists signature_url text;

-- Picking verification fields (quantity_verified already existed — this adds
-- who/when it was picked, completing the Picking List requirement).
alter table van_loading_items add column if not exists picked_by uuid references app_users(id);
alter table van_loading_items add column if not exists picked_at timestamptz;
alter table van_loading_items add column if not exists free_quantity numeric(14,3) not null default 0;
alter table van_loading_items add column if not exists damaged_quantity numeric(14,3) not null default 0;
alter table van_loading_items add column if not exists remarks text;

-- Unload variance reason (system_quantity/difference already existed).
alter table van_unloading_items add column if not exists variance_reason text;

-- Duplicate-line prevention at the database level — the same product+batch
-- combination can't appear twice in one loading or unloading. Nulls (no
-- batch) are coalesced to a sentinel so "no batch" is still deduplicated
-- per product, matching how a real picking sheet would reject a duplicate.
create unique index if not exists idx_van_loading_items_no_dup
  on van_loading_items(loading_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists idx_van_unloading_items_no_dup
  on van_unloading_items(unloading_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid), item_type);

-- ---------------------------------------------------------------------------
-- APPROVAL HISTORY — one shared audit trail for loading, unloading, and
-- both kinds of transfers, so "who submitted/approved/rejected/reopened,
-- with what note, signed how" is never lost.
-- ---------------------------------------------------------------------------
create table approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('van_loading', 'van_unloading', 'warehouse_transfer', 'van_transfer')),
  entity_id uuid not null,
  action text not null check (action in ('submit', 'approve', 'reject', 'reopen', 'cancel', 'pick')),
  notes text,
  signature_url text,
  performed_by uuid references app_users(id),
  performed_at timestamptz not null default now()
);
create index idx_approval_history_entity on approval_history(entity_type, entity_id, performed_at);

alter table approval_history enable row level security;
create policy approval_history_isolation on approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- SERIAL NUMBER SELECTION at loading time — which specific serialized units
-- went out on this loading. On approval, those serials are relocated to
-- the van.
-- ---------------------------------------------------------------------------
create table van_loading_item_serials (
  id uuid primary key default gen_random_uuid(),
  loading_item_id uuid not null references van_loading_items(id) on delete cascade,
  serial_id uuid not null references product_serials(id) on delete cascade,
  unique (loading_item_id, serial_id)
);

alter table van_loading_item_serials enable row level security;
create policy van_loading_item_serials_isolation on van_loading_item_serials for all
  using (exists (select 1 from van_loading_items i join van_loadings l on l.id = i.loading_id where i.id = loading_item_id and l.company_id = current_company_id()))
  with check (exists (select 1 from van_loading_items i join van_loadings l on l.id = i.loading_id where i.id = loading_item_id and l.company_id = current_company_id()));

-- ---------------------------------------------------------------------------
-- Lifecycle RPCs for Van Loading: submit / reject / reopen / cancel, plus
-- picking, plus an approve that also relocates selected serials and logs
-- to approval_history with an optional note/signature.
-- ---------------------------------------------------------------------------
create or replace function submit_van_loading(p_loading_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:create') then raise exception 'Not permitted'; end if;
  update van_loadings set status = 'pending_approval', approval_notes = p_notes where id = p_loading_id and status in ('draft', 'reopened');
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_loading', p_loading_id, 'submit', p_notes, auth.uid());
end;
$$;
grant execute on function submit_van_loading(uuid, text) to authenticated;

create or replace function record_loading_pick(p_item_id uuid, p_picked_quantity numeric)
returns void language plpgsql security definer as $$
declare v_loading_id uuid;
begin
  if not has_permission('van_loading:edit') then raise exception 'Not permitted'; end if;
  update van_loading_items set quantity_verified = p_picked_quantity, picked_by = auth.uid(), picked_at = now()
  where id = p_item_id
  returning loading_id into v_loading_id;
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_loading', v_loading_id, 'pick', 'Picked ' || p_picked_quantity, auth.uid());
end;
$$;
grant execute on function record_loading_pick(uuid, numeric) to authenticated;

create or replace function reject_van_loading(p_loading_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:approve') then raise exception 'Not permitted'; end if;
  update van_loadings set status = 'rejected', rejected_reason = p_reason
  where id = p_loading_id and status = 'pending_approval';
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_loading', p_loading_id, 'reject', p_reason, auth.uid());
end;
$$;
grant execute on function reject_van_loading(uuid, text) to authenticated;

create or replace function reopen_van_loading(p_loading_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:approve') then raise exception 'Not permitted'; end if;
  update van_loadings set status = 'reopened' where id = p_loading_id and status in ('rejected', 'pending_approval');
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_loading', p_loading_id, 'reopen', p_notes, auth.uid());
end;
$$;
grant execute on function reopen_van_loading(uuid, text) to authenticated;

create or replace function cancel_van_loading(p_loading_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:delete') then raise exception 'Not permitted'; end if;
  update van_loadings set status = 'cancelled', cancel_reason = p_reason
  where id = p_loading_id and status != 'approved';
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_loading', p_loading_id, 'cancel', p_reason, auth.uid());
end;
$$;
grant execute on function cancel_van_loading(uuid, text) to authenticated;

-- Replaces the Phase-1 approve_van_loading with one that also accepts a
-- note/signature, logs to approval_history, and relocates any serials
-- selected for the loaded items.
create or replace function approve_van_loading(
  p_loading_id uuid, p_approver_id uuid, p_notes text default null, p_signature_url text default null
) returns void language plpgsql security definer as $$
declare
  v_loading van_loadings%rowtype;
  v_item record;
begin
  select * into v_loading from van_loadings where id = p_loading_id and company_id = current_company_id();
  if not found then raise exception 'Loading sheet not found'; end if;
  if v_loading.status = 'approved' then raise exception 'Loading already approved'; end if;

  for v_item in select * from van_loading_items where loading_id = p_loading_id loop
    perform _add_warehouse_stock(v_loading.warehouse_id, v_item.product_id, v_item.batch_id,
      -coalesce(v_item.quantity_verified, v_item.quantity_requested));
    perform _add_van_stock(v_loading.van_id, v_item.product_id, v_item.batch_id,
      coalesce(v_item.quantity_verified, v_item.quantity_requested));

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id, 'van_load',
      'warehouse', v_loading.warehouse_id, 'van', v_loading.van_id,
      coalesce(v_item.quantity_verified, v_item.quantity_requested), 'van_loadings', p_loading_id, p_approver_id);

    -- Relocate any serials selected for this line to the van.
    update product_serials set current_location_type = 'van', current_location_id = v_loading.van_id
    where id in (select serial_id from van_loading_item_serials where loading_item_id = v_item.id);
  end loop;

  update van_loadings set status = 'approved', approved_by = p_approver_id, approved_at = now(),
    approval_notes = coalesce(p_notes, approval_notes), signature_url = coalesce(p_signature_url, signature_url)
  where id = p_loading_id;

  insert into approval_history (company_id, entity_type, entity_id, action, notes, signature_url, performed_by)
  values (current_company_id(), 'van_loading', p_loading_id, 'approve', p_notes, p_signature_url, p_approver_id);
end;
$$;

grant execute on function approve_van_loading(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Same lifecycle for Van Unloading.
-- ---------------------------------------------------------------------------
create or replace function submit_van_unloading(p_unloading_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_unloading:create') then raise exception 'Not permitted'; end if;
  update van_unloadings set status = 'pending_approval', approval_notes = p_notes where id = p_unloading_id and status in ('draft', 'reopened');
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_unloading', p_unloading_id, 'submit', p_notes, auth.uid());
end;
$$;
grant execute on function submit_van_unloading(uuid, text) to authenticated;

create or replace function reject_van_unloading(p_unloading_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_unloading:approve') then raise exception 'Not permitted'; end if;
  update van_unloadings set status = 'rejected', rejected_reason = p_reason
  where id = p_unloading_id and status = 'pending_approval';
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_unloading', p_unloading_id, 'reject', p_reason, auth.uid());
end;
$$;
grant execute on function reject_van_unloading(uuid, text) to authenticated;

create or replace function reopen_van_unloading(p_unloading_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_unloading:approve') then raise exception 'Not permitted'; end if;
  update van_unloadings set status = 'reopened' where id = p_unloading_id and status in ('rejected', 'pending_approval');
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_unloading', p_unloading_id, 'reopen', p_notes, auth.uid());
end;
$$;
grant execute on function reopen_van_unloading(uuid, text) to authenticated;

create or replace function cancel_van_unloading(p_unloading_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_unloading:delete') then raise exception 'Not permitted'; end if;
  update van_unloadings set status = 'cancelled', cancel_reason = p_reason
  where id = p_unloading_id and status != 'approved';
  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (current_company_id(), 'van_unloading', p_unloading_id, 'cancel', p_reason, auth.uid());
end;
$$;
grant execute on function cancel_van_unloading(uuid, text) to authenticated;

-- Replaces the Phase-1 approve_van_unloading with one that captures the
-- expected-vs-actual variance per line (making system_quantity authoritative
-- from live van_stock at approval time if not already supplied) and logs
-- to approval_history.
create or replace function approve_van_unloading(
  p_unloading_id uuid, p_approver_id uuid, p_notes text default null, p_signature_url text default null
) returns void language plpgsql security definer as $$
declare
  v_unloading van_unloadings%rowtype;
  v_item record;
begin
  select * into v_unloading from van_unloadings where id = p_unloading_id and company_id = current_company_id();
  if not found then raise exception 'Unloading sheet not found'; end if;
  if v_unloading.status = 'approved' then raise exception 'Unloading already approved'; end if;

  for v_item in select * from van_unloading_items where unloading_id = p_unloading_id loop
    if v_item.system_quantity is null then
      update van_unloading_items set system_quantity = (
        select coalesce(quantity, 0) from van_stock
        where van_id = v_unloading.van_id and product_id = v_item.product_id
          and batch_id is not distinct from v_item.batch_id
      ) where id = v_item.id;
    end if;

    perform _add_van_stock(v_unloading.van_id, v_item.product_id, v_item.batch_id, -v_item.quantity);

    if v_item.item_type = 'remaining' then
      perform _add_warehouse_stock(v_unloading.warehouse_id, v_item.product_id, v_item.batch_id, v_item.quantity);
    elsif v_item.item_type = 'customer_return' then
      perform _add_warehouse_stock(v_unloading.warehouse_id, v_item.product_id, v_item.batch_id, v_item.quantity);
    end if;

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id,
      case when v_item.item_type = 'remaining' then 'van_unload'
           when v_item.item_type = 'customer_return' then 'sales_return_in'
           when v_item.item_type = 'damaged' then 'damage'
           else 'adjustment' end,
      'van', v_unloading.van_id,
      case when v_item.item_type in ('remaining', 'customer_return') then 'warehouse' else 'none' end,
      case when v_item.item_type in ('remaining', 'customer_return') then v_unloading.warehouse_id else null end,
      v_item.quantity, 'van_unloadings', p_unloading_id, p_approver_id);
  end loop;

  update van_unloadings set status = 'approved', approved_by = p_approver_id, approved_at = now(),
    approval_notes = coalesce(p_notes, approval_notes), signature_url = coalesce(p_signature_url, signature_url)
  where id = p_unloading_id;

  insert into approval_history (company_id, entity_type, entity_id, action, notes, signature_url, performed_by)
  values (current_company_id(), 'van_unloading', p_unloading_id, 'approve', p_notes, p_signature_url, p_approver_id);
end;
$$;

grant execute on function approve_van_unloading(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- VAN-TO-VAN TRANSFERS (the one direction the existing warehouse_transfers
-- table structurally can't express).
-- ---------------------------------------------------------------------------
create table van_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  transfer_no text not null,
  from_van_id uuid not null references vans(id) on delete cascade,
  to_van_id uuid not null references vans(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  is_emergency boolean not null default false,
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  received_by uuid references app_users(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, transfer_no)
);

alter table van_transfers enable row level security;
create policy van_transfers_isolation on van_transfers for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table van_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references van_transfers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null
);

alter table van_transfer_items enable row level security;
create policy van_transfer_items_isolation on van_transfer_items for all
  using (exists (select 1 from van_transfers t where t.id = transfer_id and t.company_id = current_company_id()))
  with check (exists (select 1 from van_transfers t where t.id = transfer_id and t.company_id = current_company_id()));

alter table stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'purchase_in', 'warehouse_transfer', 'van_load', 'van_unload', 'sale_out',
  'sales_return_in', 'purchase_return_out', 'adjustment', 'damage', 'loss', 'opening_stock',
  'closing_stock', 'reconciliation_adjustment', 'van_transfer'
));

create or replace function approve_van_transfer(p_transfer_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_transfer van_transfers%rowtype;
  v_item record;
begin
  if not has_permission('van_loading:approve') then raise exception 'Not permitted'; end if;

  select * into v_transfer from van_transfers where id = p_transfer_id and company_id = current_company_id();
  if not found then raise exception 'Transfer not found'; end if;
  if v_transfer.status = 'approved' then raise exception 'Transfer already approved'; end if;

  for v_item in select * from van_transfer_items where transfer_id = p_transfer_id loop
    perform _add_van_stock(v_transfer.from_van_id, v_item.product_id, v_item.batch_id, -v_item.quantity);
    perform _add_van_stock(v_transfer.to_van_id, v_item.product_id, v_item.batch_id, v_item.quantity);

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id, 'van_transfer',
      'van', v_transfer.from_van_id, 'van', v_transfer.to_van_id,
      v_item.quantity, 'van_transfers', p_transfer_id, p_approver_id);
  end loop;

  update van_transfers set status = 'approved', approved_by = p_approver_id, approved_at = now()
  where id = p_transfer_id;

  insert into approval_history (company_id, entity_type, entity_id, action, performed_by)
  values (current_company_id(), 'van_transfer', p_transfer_id, 'approve', p_approver_id);
end;
$$;

grant execute on function approve_van_transfer(uuid, uuid) to authenticated;

create or replace function mark_van_transfer_received(p_transfer_id uuid)
returns void language plpgsql security definer as $$
begin
  update van_transfers set received_by = auth.uid(), received_at = now() where id = p_transfer_id;
end;
$$;
grant execute on function mark_van_transfer_received(uuid) to authenticated;

-- Extend warehouse_transfers with the same received-by tracking this doc asks for.
alter table warehouse_transfers add column if not exists received_by uuid references app_users(id);
alter table warehouse_transfers add column if not exists received_at timestamptz;
alter table warehouse_transfers add column if not exists is_emergency boolean not null default false;

create or replace function mark_warehouse_transfer_received(p_transfer_id uuid)
returns void language plpgsql security definer as $$
begin
  update warehouse_transfers set received_by = auth.uid(), received_at = now() where id = p_transfer_id;
end;
$$;
grant execute on function mark_warehouse_transfer_received(uuid) to authenticated;
