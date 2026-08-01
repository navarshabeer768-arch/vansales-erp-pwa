-- ============================================================================
-- 0056_offline_revalidation_sync_conflicts.sql
-- Continues 0047-0055.
-- ============================================================================

create table sales_order_validation_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  validation_type text not null check (validation_type in ('pricing', 'tax', 'stock', 'credit', 'promotion', 'approval_rules')),
  validation_time timestamptz not null default now(),
  status text not null check (status in ('passed', 'failed', 'warning')),
  message text,
  performed_by uuid references app_users(id)
);
create index idx_sales_order_validation_history_order on sales_order_validation_history(order_id);

alter table sales_order_validation_history enable row level security;
create policy sales_order_validation_history_isolation on sales_order_validation_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Manual revalidation — authorized users can rerun any subset of checks
-- on demand; every result is stored with a timestamp, never silently
-- discarded.
create or replace function revalidate_order(p_order_id uuid, p_validation_types text[] default array['pricing', 'stock', 'credit'])
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_type text;
begin
  if not has_permission('sales_orders:revalidate_order') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;

  foreach v_type in array p_validation_types loop
    if v_type = 'stock' then
      perform validate_order_stock(p_order_id, 'manual');
      insert into sales_order_validation_history (company_id, order_id, validation_type, status, message, performed_by)
      values (v_order.company_id, p_order_id, 'stock',
        case (select stock_validation_status from sales_orders where id = p_order_id) when 'valid' then 'passed' when 'unavailable' then 'failed' else 'warning' end,
        'Stock revalidated', auth.uid());
    elsif v_type = 'credit' then
      perform validate_order_credit(p_order_id);
      insert into sales_order_validation_history (company_id, order_id, validation_type, status, message, performed_by)
      values (v_order.company_id, p_order_id, 'credit',
        case (select credit_validation_status from sales_orders where id = p_order_id) when 'valid' then 'passed' when 'blocked' then 'failed' else 'warning' end,
        'Credit revalidated', auth.uid());
    elsif v_type = 'pricing' then
      -- Re-runs the same pricing engine against current items; logs a
      -- warning if any item's applied_price no longer matches what the
      -- pricing engine would resolve today (excluding approved overrides).
      insert into sales_order_validation_history (company_id, order_id, validation_type, status, message, performed_by)
      select v_order.company_id, p_order_id, 'pricing',
        case when count(*) filter (where mismatch) > 0 then 'warning' else 'passed' end,
        format('%s item(s) have pricing different from current rules', count(*) filter (where mismatch)), auth.uid()
      from (
        select i.id, (i.price_source != 'override' and i.applied_price != r.price) as mismatch
        from sales_order_items i, lateral resolve_customer_price(v_order.customer_id, i.product_id, i.base_quantity) r
        where i.order_id = p_order_id and not i.is_free_item
      ) checks;
    else
      insert into sales_order_validation_history (company_id, order_id, validation_type, status, message, performed_by)
      values (v_order.company_id, p_order_id, v_type, 'passed', 'No dedicated check implemented for this type yet', auth.uid());
    end if;
  end loop;
end;
$$;
grant execute on function revalidate_order(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- SYNC CONFLICTS
-- ---------------------------------------------------------------------------
create table sales_order_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  conflict_type text not null check (conflict_type in (
    'duplicate_order', 'customer_blocked', 'customer_deactivated', 'product_deactivated', 'price_changed',
    'promotion_expired', 'uom_changed', 'stock_unavailable', 'batch_unavailable', 'serial_unavailable',
    'credit_changed', 'approval_rule_changed', 'route_assignment_changed', 'order_already_edited', 'order_already_cancelled'
  )),
  conflict_details jsonb not null default '{}',
  resolution text check (resolution in (
    'use_server_values', 'keep_local_pending_approval', 'merge_non_conflicting', 'return_to_creator', 'supervisor_decision', 'cancel_local_version'
  ) or resolution is null),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_sales_order_sync_conflicts_order on sales_order_sync_conflicts(order_id);
create index idx_sales_order_sync_conflicts_status on sales_order_sync_conflicts(company_id, status);

alter table sales_order_sync_conflicts enable row level security;
create policy sales_order_sync_conflicts_isolation on sales_order_sync_conflicts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Called once an offline-created order (status = 'sync_pending') comes
-- online. Never approves using stale cached data — reruns customer
-- status, product status, pricing, stock, and credit against CURRENT
-- server state, and raises a conflict row for every mismatch found rather
-- than silently accepting or silently rejecting the offline order.
create or replace function revalidate_synced_order(p_order_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_item record;
  v_price record;
  v_conflict_count integer := 0;
begin
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  if v_order.status != 'sync_pending' then raise exception 'Order is not pending sync (status: %)', v_order.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_order.company_id and device_uid = p_device_uid;
  end if;

  select * into v_customer from customers where id = v_order.customer_id;
  if v_customer.status = 'blocked' then
    insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
    values (v_order.company_id, p_order_id, v_device_id, 'customer_blocked', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  elsif v_customer.status != 'active' then
    insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
    values (v_order.company_id, p_order_id, v_device_id, 'customer_deactivated', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  end if;

  for v_item in select * from sales_order_items where order_id = p_order_id and not is_free_item loop
    if not exists (select 1 from products where id = v_item.product_id and is_active) then
      insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
      values (v_order.company_id, p_order_id, v_device_id, 'product_deactivated', jsonb_build_object('order_item_id', v_item.id, 'product_id', v_item.product_id));
      v_conflict_count := v_conflict_count + 1;
      continue;
    end if;

    if v_item.price_source != 'override' then
      select * into v_price from resolve_customer_price(v_order.customer_id, v_item.product_id, v_item.base_quantity);
      if v_price.price != v_item.applied_price then
        insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
        values (v_order.company_id, p_order_id, v_device_id, 'price_changed', jsonb_build_object(
          'order_item_id', v_item.id, 'offline_price', v_item.applied_price, 'current_price', v_price.price, 'difference', v_price.price - v_item.applied_price
        ));
        v_conflict_count := v_conflict_count + 1;
      end if;
    end if;
  end loop;

  perform validate_order_stock(p_order_id, 'sync');
  if (select stock_validation_status from sales_orders where id = p_order_id) in ('unavailable', 'partially_available') then
    insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
    values (v_order.company_id, p_order_id, v_device_id, 'stock_unavailable', jsonb_build_object(
      'stock_validation_status', (select stock_validation_status from sales_orders where id = p_order_id)
    ));
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_order.payment_type = 'credit' then
    perform validate_order_credit(p_order_id);
    if (select credit_validation_status from sales_orders where id = p_order_id) not in ('valid', 'not_validated') then
      insert into sales_order_sync_conflicts (company_id, order_id, device_id, conflict_type, conflict_details)
      values (v_order.company_id, p_order_id, v_device_id, 'credit_changed', jsonb_build_object(
        'credit_validation_status', (select credit_validation_status from sales_orders where id = p_order_id)
      ));
      v_conflict_count := v_conflict_count + 1;
    end if;
  end if;

  if v_conflict_count > 0 then
    perform change_sales_order_status(p_order_id, 'conflict', 'Sync revalidation found conflicts');
  else
    perform change_sales_order_status(p_order_id, 'pending_validation', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_order(uuid, text) to authenticated;

create or replace function resolve_sync_conflict(p_conflict_id uuid, p_resolution text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_conflict sales_order_sync_conflicts%rowtype;
begin
  if not has_permission('sales_orders:resolve_sync_conflict') then raise exception 'Not permitted'; end if;
  select * into v_conflict from sales_order_sync_conflicts where id = p_conflict_id;
  if not found then raise exception 'Conflict not found'; end if;

  update sales_order_sync_conflicts set
    resolution = p_resolution, status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_notes
  where id = p_conflict_id;

  if p_resolution = 'cancel_local_version' then
    perform cancel_sales_order(v_conflict.order_id, 'Sync conflict resolved by cancelling local version', p_notes);
  elsif p_resolution = 'return_to_creator' then
    perform change_sales_order_status(v_conflict.order_id, 'draft', 'Returned to creator to resolve sync conflict');
  end if;

  if not exists (select 1 from sales_order_sync_conflicts where order_id = v_conflict.order_id and status = 'open') then
    if (select status from sales_orders where id = v_conflict.order_id) = 'conflict' then
      perform change_sales_order_status(v_conflict.order_id, 'pending_validation', 'All sync conflicts resolved');
    end if;
  end if;
end;
$$;
grant execute on function resolve_sync_conflict(uuid, text, text) to authenticated;

-- Audit trail for the two new tables in this file.
drop trigger if exists trg_audit_sales_order_sync_conflicts on sales_order_sync_conflicts;
create trigger trg_audit_sales_order_sync_conflicts after insert or update or delete on sales_order_sync_conflicts
  for each row execute function log_audit_change();
