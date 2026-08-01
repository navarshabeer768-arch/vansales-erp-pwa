-- ============================================================================
-- 0052_override_requests_and_hold.sql
-- Continues 0047-0051.
-- ============================================================================

create table sales_order_price_override_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  original_price numeric(12,2) not null,
  requested_price numeric(12,2) not null,
  minimum_selling_price numeric(12,2),
  reason text,
  requested_by uuid references app_users(id),
  requested_at timestamptz not null default now(),
  approval_level text not null default 'branch_manager' check (approval_level in ('supervisor', 'branch_manager', 'credit_controller', 'accounts', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_order_price_override_requests_order on sales_order_price_override_requests(order_id);
create index idx_sales_order_price_override_requests_status on sales_order_price_override_requests(company_id, status);

alter table sales_order_price_override_requests enable row level security;
create policy sales_order_price_override_requests_isolation on sales_order_price_override_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_discount_override_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  requested_discount_pct numeric(5,2),
  requested_discount_amount numeric(12,2),
  allowed_employee_discount_pct numeric(5,2),
  product_max_discount_pct numeric(5,2),
  customer_max_discount_pct numeric(5,2),
  minimum_selling_price numeric(12,2),
  reason text,
  requested_by uuid references app_users(id),
  requested_at timestamptz not null default now(),
  approval_level text not null default 'sales_supervisor' check (approval_level in ('supervisor', 'branch_manager', 'credit_controller', 'accounts', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_order_discount_override_requests_order on sales_order_discount_override_requests(order_id);
create index idx_sales_order_discount_override_requests_status on sales_order_discount_override_requests(company_id, status);

alter table sales_order_discount_override_requests enable row level security;
create policy sales_order_discount_override_requests_isolation on sales_order_discount_override_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_free_quantity_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid references sales_order_items(id) on delete cascade,
  requested_free_product_id uuid not null references products(id) on delete restrict,
  requested_free_quantity numeric(12,3) not null,
  scheme_qualified_quantity numeric(12,3) not null default 0,
  manual_additional_quantity numeric(12,3) not null default 0,
  reason text,
  requested_by uuid references app_users(id),
  requested_at timestamptz not null default now(),
  approved_quantity numeric(12,3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  approved_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_order_free_quantity_requests_order on sales_order_free_quantity_requests(order_id);

alter table sales_order_free_quantity_requests enable row level security;
create policy sales_order_free_quantity_requests_isolation on sales_order_free_quantity_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Price override request — Part 1 already stores the override inline on
-- the item (original_price/requested_price/reason); this formalizes it
-- into an approvable request. "Do not allow an override request to
-- become effective before approval": the item's applied_price is left
-- as the ORIGINAL resolved price until approved, and only swapped to the
-- requested price on approval.
create or replace function request_price_override(p_order_item_id uuid, p_requested_price numeric, p_reason text, p_approval_level text default 'branch_manager')
returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_request_id uuid;
begin
  if not has_permission('sales_orders:request_price_override') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from sales_orders where id = v_item.order_id;

  insert into sales_order_price_override_requests (
    company_id, order_id, order_item_id, original_price, requested_price, reason, requested_by, approval_level
  ) values (
    v_order.company_id, v_order.id, p_order_item_id, v_item.original_price, p_requested_price, p_reason, auth.uid(), p_approval_level
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;
grant execute on function request_price_override(uuid, numeric, text, text) to authenticated;

create or replace function decide_price_override(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_request sales_order_price_override_requests%rowtype;
begin
  if not has_permission('sales_orders:approve_price_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_order_price_override_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  update sales_order_price_override_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;

  if p_approve then
    update sales_order_items set applied_price = v_request.requested_price, price_override_approved_by = auth.uid()
    where id = v_request.order_item_id;
  end if;
end;
$$;
grant execute on function decide_price_override(uuid, boolean, text) to authenticated;

create or replace function decide_discount_override(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_request sales_order_discount_override_requests%rowtype;
begin
  if not has_permission('sales_orders:approve_discount_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_order_discount_override_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  update sales_order_discount_override_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;
end;
$$;
grant execute on function decide_discount_override(uuid, boolean, text) to authenticated;

create or replace function decide_free_quantity_request(p_request_id uuid, p_approve boolean, p_approved_quantity numeric default null, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_request sales_order_free_quantity_requests%rowtype;
begin
  if not has_permission('sales_orders:approve_free_quantity') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_order_free_quantity_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  update sales_order_free_quantity_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_quantity = case when p_approve then coalesce(p_approved_quantity, v_request.requested_free_quantity) else 0 end,
    approved_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;
end;
$$;
grant execute on function decide_free_quantity_request(uuid, boolean, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ORDER HOLD
-- ---------------------------------------------------------------------------
alter table sales_orders add column if not exists is_on_hold boolean not null default false;

create table sales_order_hold_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  hold_reason text not null check (hold_reason in ('credit_review', 'stock_shortage', 'price_review', 'customer_issue', 'management_review', 'document_issue', 'other')),
  hold_notes text,
  held_by uuid references app_users(id),
  held_time timestamptz not null default now(),
  release_request text,
  released_by uuid references app_users(id),
  release_time timestamptz,
  release_notes text
);
create index idx_sales_order_hold_history_order on sales_order_hold_history(order_id);

alter table sales_order_hold_history enable row level security;
create policy sales_order_hold_history_isolation on sales_order_hold_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function place_order_on_hold(p_order_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_hold_id uuid;
begin
  if not has_permission('sales_orders:place_on_hold') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_orders where id = p_order_id;
  if v_company_id is null then raise exception 'Order not found'; end if;

  update sales_orders set is_on_hold = true where id = p_order_id;

  insert into sales_order_hold_history (company_id, order_id, hold_reason, hold_notes, held_by)
  values (v_company_id, p_order_id, p_reason, p_notes, auth.uid())
  returning id into v_hold_id;

  return v_hold_id;
end;
$$;
grant execute on function place_order_on_hold(uuid, text, text) to authenticated;

create or replace function release_order_hold(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_hold sales_order_hold_history%rowtype;
begin
  if not has_permission('sales_orders:release_hold') then raise exception 'Not permitted'; end if;
  select * into v_hold from sales_order_hold_history where id = p_hold_id;
  if not found then raise exception 'Hold record not found'; end if;

  update sales_order_hold_history set released_by = auth.uid(), release_time = now(), release_notes = p_notes where id = p_hold_id;

  -- Only clear is_on_hold if no other unreleased hold exists for this order.
  if not exists (select 1 from sales_order_hold_history where order_id = v_hold.order_id and released_by is null and id != p_hold_id) then
    update sales_orders set is_on_hold = false where id = v_hold.order_id;
  end if;
end;
$$;
grant execute on function release_order_hold(uuid, text) to authenticated;
