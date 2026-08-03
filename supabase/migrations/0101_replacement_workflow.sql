-- ============================================================================
-- 0101_replacement_workflow.sql
-- Continues 0096-0100.
-- ============================================================================

create table sales_return_replacement_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete restrict,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  customer_id uuid not null references customers(id) on delete restrict,
  delivery_address text,
  route_id uuid references routes(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  responsible_employee_id uuid references app_users(id) on delete set null,
  required_date date,
  value_rule text not null default 'equal_value_replacement' check (value_rule in (
    'equal_value_replacement', 'same_product_replacement', 'price_difference_payable', 'price_difference_credited', 'no_price_difference_allowed'
  )),
  status text not null default 'requested' check (status in (
    'requested', 'pending_approval', 'approved', 'waiting_for_stock', 'ready', 'partially_issued',
    'issued', 'delivered', 'rejected', 'cancelled'
  )),
  replacement_invoice_id uuid references sales_invoices(id) on delete set null,
  delivered_quantity numeric(14,3) not null default 0,
  pending_quantity numeric(14,3) not null default 0,
  delivery_status text not null default 'not_scheduled' check (delivery_status in ('not_scheduled', 'scheduled', 'partially_delivered', 'delivered')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_return_replacement_orders_return on sales_return_replacement_orders(return_id);

alter table sales_return_replacement_orders enable row level security;
create policy sales_return_replacement_orders_isolation on sales_return_replacement_orders for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_replacement_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  replacement_order_id uuid not null references sales_return_replacement_orders(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete restrict,
  same_product boolean not null default true,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  approved_quantity numeric(14,3) not null check (approved_quantity > 0),
  price_difference numeric(14,2) not null default 0,
  tax_difference numeric(14,2) not null default 0,
  issued_quantity numeric(14,3) not null default 0
);
create index idx_sales_return_replacement_order_items_order on sales_return_replacement_order_items(replacement_order_id);

alter table sales_return_replacement_order_items enable row level security;
create policy sales_return_replacement_order_items_isolation on sales_return_replacement_order_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_replacement_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  replacement_order_id uuid not null references sales_return_replacement_orders(id) on delete cascade,
  linked_table text not null check (linked_table in ('sales_invoices', 'sales_orders')),
  linked_id uuid not null,
  link_type text not null check (link_type in ('replacement_invoice_draft', 'delivery_reference')),
  created_at timestamptz not null default now()
);
create index idx_sales_return_replacement_links_order on sales_return_replacement_links(replacement_order_id);

alter table sales_return_replacement_links enable row level security;
create policy sales_return_replacement_links_isolation on sales_return_replacement_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_replacement_order(
  p_return_id uuid, p_items jsonb, p_delivery_address text default null, p_route_id uuid default null,
  p_van_id uuid default null, p_responsible_employee_id uuid default null, p_required_date date default null,
  p_value_rule text default 'equal_value_replacement'
) returns uuid language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_return_item sales_return_items%rowtype;
  v_product products%rowtype;
  v_accepted_total numeric;
  v_already_requested numeric;
begin
  if not has_permission('sales_returns:approve_replacement') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id;
  if not found then raise exception 'Return not found'; end if;
  if v_return.status not in ('accepted', 'partially_accepted', 'posted', 'replacement_pending') then
    raise exception 'Return must be accepted before a replacement order can be created (currently %)', v_return.status;
  end if;

  insert into sales_return_replacement_orders (
    company_id, return_id, original_invoice_id, customer_id, delivery_address, route_id, van_id,
    responsible_employee_id, required_date, value_rule, created_by
  ) values (
    v_return.company_id, p_return_id, v_return.original_invoice_id, v_return.customer_id, p_delivery_address, p_route_id,
    p_van_id, coalesce(p_responsible_employee_id, auth.uid()), p_required_date, p_value_rule, auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_return_item from sales_return_items where id = (v_item->>'return_item_id')::uuid;
    if not found then raise exception 'Return item not found'; end if;

    v_accepted_total := v_return_item.accepted_saleable_quantity + v_return_item.accepted_damaged_quantity + v_return_item.accepted_expired_quantity;
    select coalesce(sum(approved_quantity), 0) into v_already_requested
    from sales_return_replacement_order_items where return_item_id = v_return_item.id;

    if (v_item->>'approved_quantity')::numeric + v_already_requested > v_accepted_total + 0.001 then
      raise exception 'Replacement quantity exceeds approved accepted quantity for this return item';
    end if;

    select * into v_product from products where id = coalesce((v_item->>'product_id')::uuid, v_return_item.product_id);
    if not v_product.is_active then raise exception 'Replacement product % is not active', v_product.name; end if;

    insert into sales_return_replacement_order_items (
      company_id, replacement_order_id, return_item_id, same_product, product_id, variant_id, approved_quantity, price_difference, tax_difference
    ) values (
      v_return.company_id, v_order_id, v_return_item.id, coalesce((v_item->>'same_product')::boolean, true),
      coalesce((v_item->>'product_id')::uuid, v_return_item.product_id), (v_item->>'variant_id')::uuid,
      (v_item->>'approved_quantity')::numeric, coalesce((v_item->>'price_difference')::numeric, 0), coalesce((v_item->>'tax_difference')::numeric, 0)
    );

    update sales_return_items set replacement_requested = true where id = v_return_item.id;
  end loop;

  perform change_return_status(p_return_id, 'replacement_pending', 'Replacement order created');
  return v_order_id;
end;
$$;
grant execute on function create_replacement_order(uuid, jsonb, text, uuid, uuid, uuid, date, text) to authenticated;

create or replace function process_replacement_order_action(p_order_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_new_status text; v_return_id uuid;
begin
  select return_id into v_return_id from sales_return_replacement_orders where id = p_order_id;
  if v_return_id is null then raise exception 'Replacement order not found'; end if;

  v_new_status := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'mark_waiting_for_stock' then 'waiting_for_stock'
    when 'mark_ready' then 'ready'
    when 'cancel' then 'cancelled'
    else null
  end;
  if v_new_status is null then raise exception 'Unknown replacement action: %', p_action; end if;

  if p_action = 'approve' and not has_permission('sales_returns:approve_replacement') then raise exception 'Not permitted'; end if;

  update sales_return_replacement_orders set status = v_new_status where id = p_order_id;

  if p_action = 'approve' then
    perform change_return_status(v_return_id, 'replacement_approved', 'Replacement order approved');
  end if;
end;
$$;
grant execute on function process_replacement_order_action(uuid, text, text) to authenticated;

create or replace function link_replacement_invoice_draft(p_order_id uuid, p_invoice_id uuid)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_link_id uuid;
begin
  if not has_permission('sales_returns:create_replacement_invoice_draft') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_return_replacement_orders where id = p_order_id;
  if v_company_id is null then raise exception 'Replacement order not found'; end if;

  insert into sales_return_replacement_links (company_id, replacement_order_id, linked_table, linked_id, link_type)
  values (v_company_id, p_order_id, 'sales_invoices', p_invoice_id, 'replacement_invoice_draft')
  returning id into v_link_id;

  update sales_return_replacement_orders set replacement_invoice_id = p_invoice_id, status = 'issued' where id = p_order_id;
  return v_link_id;
end;
$$;
grant execute on function link_replacement_invoice_draft(uuid, uuid) to authenticated;
