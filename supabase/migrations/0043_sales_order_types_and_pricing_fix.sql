-- ============================================================================
-- 0043_sales_order_types_and_pricing_fix.sql
-- Phase 5A.2 Part 1: Sales Order Entry, Pricing, Discounts, Mobile & PDT Order Entry.
--
-- Fixes a real bug found while inspecting the existing pricing engine:
-- resolve_customer_price()'s documented priority is Customer -> Customer
-- Group -> Price List -> Route Price -> Branch Price -> Promotion ->
-- Standard, and product_price_rules.scope_type already has a 'route'
-- option in its check constraint — but the function's actual logic
-- jumped straight from price_list to branch, never checking route scope
-- at all. Fixed here since Sales Order Entry is the first real caller.
-- ============================================================================

create or replace function resolve_customer_price(p_customer_id uuid, p_product_id uuid, p_quantity numeric default 1)
returns table (price numeric, min_selling_price numeric, max_discount_pct numeric, source text) language plpgsql stable as $$
declare
  v_customer customers%rowtype;
  v_standard_price numeric;
  v_group_discount_pct numeric;
  v_price_list_id uuid;
begin
  select * into v_customer from customers where id = p_customer_id;
  select selling_price into v_standard_price from products where id = p_product_id;

  -- 1. Customer-specific price — highest priority.
  select cpp.price, cpp.min_selling_price, cpp.max_discount_pct into price, min_selling_price, max_discount_pct
  from customer_product_prices cpp
  where cpp.customer_id = p_customer_id and cpp.product_id = p_product_id and cpp.is_active
    and (cpp.effective_date is null or cpp.effective_date <= current_date)
    and (cpp.expiry_date is null or cpp.expiry_date >= current_date)
  limit 1;
  if found and price is not null then source := 'customer_price'; return next; return; end if;

  -- 2. Customer group price (existing default_discount_pct off the standard price).
  select cg.default_discount_pct into v_group_discount_pct from customer_groups cg where cg.id = v_customer.group_id;
  if v_group_discount_pct is not null and v_group_discount_pct > 0 then
    price := round(v_standard_price * (1 - v_group_discount_pct / 100), 2);
    min_selling_price := null; max_discount_pct := null; source := 'customer_group_price';
    return next; return;
  end if;

  -- 3. Price list (customer's default/secondary/temporary list, by priority).
  select cpl.price_list_id into v_price_list_id
  from customer_price_lists cpl
  join price_lists pl on pl.id = cpl.price_list_id
  where cpl.customer_id = p_customer_id and pl.status = 'active'
    and (pl.effective_date is null or pl.effective_date <= current_date)
    and (pl.expiry_date is null or pl.expiry_date >= current_date)
    and (cpl.effective_date is null or cpl.effective_date <= current_date)
    and (cpl.expiry_date is null or cpl.expiry_date >= current_date)
  order by cpl.priority, pl.priority
  limit 1;

  if v_price_list_id is not null then
    select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
    from product_price_rules ppr
    where ppr.price_list_id = v_price_list_id and ppr.product_id = p_product_id and ppr.scope_type = 'price_list' and ppr.is_active
      and (ppr.effective_date is null or ppr.effective_date <= current_date)
      and (ppr.expiry_date is null or ppr.expiry_date >= current_date)
    limit 1;
    if found and price is not null then source := 'price_list'; return next; return; end if;
  end if;

  -- 4. Route price (customer's assigned route) — was missing entirely
  -- despite scope_type supporting it; now actually checked.
  if v_customer.route_id is not null then
    select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
    from product_price_rules ppr
    where ppr.route_id = v_customer.route_id and ppr.product_id = p_product_id and ppr.scope_type = 'route' and ppr.is_active
      and (ppr.effective_date is null or ppr.effective_date <= current_date)
      and (ppr.expiry_date is null or ppr.expiry_date >= current_date)
    order by ppr.priority
    limit 1;
    if found and price is not null then source := 'route_price'; return next; return; end if;
  end if;

  -- 5. Branch price (customer's assigned branch).
  if v_customer.branch_id is not null then
    select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
    from product_price_rules ppr
    where ppr.branch_id = v_customer.branch_id and ppr.product_id = p_product_id and ppr.scope_type = 'branch' and ppr.is_active
    limit 1;
    if found and price is not null then source := 'branch_price'; return next; return; end if;
  end if;

  -- 6. Promotion (date-bound, no branch/list/customer scoping required).
  select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
  from product_price_rules ppr
  where ppr.product_id = p_product_id and ppr.scope_type = 'promotion' and ppr.is_active
    and (ppr.effective_date is null or ppr.effective_date <= current_date)
    and (ppr.expiry_date is null or ppr.expiry_date >= current_date)
  order by ppr.priority
  limit 1;
  if found and price is not null then source := 'promotion'; return next; return; end if;

  -- 7. Standard selling price — always the fallback.
  price := v_standard_price; min_selling_price := null; max_discount_pct := null; source := 'standard_price';
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- SALES ORDER TYPES — configurable catalog, mirrors the existing
-- customer_types / van_staff_roles system+custom pattern.
-- ---------------------------------------------------------------------------
create table sales_order_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade, -- null = system default, available to all companies
  label text not null,
  default_stock_source text not null default 'van' check (default_stock_source in ('van', 'warehouse')),
  default_payment_type text, -- references payment_methods.code loosely (not FK — payment_methods is company-scoped or system)
  requires_approval boolean not null default false,
  requires_credit_validation boolean not null default false,
  reservation_rule text not null default 'none' check (reservation_rule in ('none', 'soft', 'hard')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_sales_order_types_system_code on sales_order_types(code) where company_id is null;
create unique index idx_sales_order_types_company_code on sales_order_types(code, company_id) where company_id is not null;

insert into sales_order_types (code, company_id, label, default_stock_source, default_payment_type, requires_approval, requires_credit_validation, reservation_rule, is_system) values
  ('van_sales', null, 'Van Sales', 'van', 'cash', false, false, 'none', true),
  ('pre_sales', null, 'Pre-Sales', 'warehouse', 'credit', true, true, 'soft', true),
  ('warehouse_order', null, 'Warehouse Order', 'warehouse', 'credit', true, true, 'soft', true),
  ('cash_order', null, 'Cash Order', 'van', 'cash', false, false, 'none', true),
  ('credit_order', null, 'Credit Order', 'van', 'credit', true, true, 'soft', true),
  ('hybrid_order', null, 'Hybrid Order', 'van', 'credit', true, true, 'soft', true),
  ('replacement_request', null, 'Replacement Request', 'van', 'credit', true, false, 'none', true),
  ('promotional_order', null, 'Promotional Order', 'van', 'cash', false, false, 'none', true),
  ('sample_order', null, 'Sample Order', 'van', 'cash', false, false, 'none', true),
  ('custom_order', null, 'Custom Order', 'van', 'credit', true, false, 'none', true);

alter table sales_order_types enable row level security;
create policy sales_order_types_read on sales_order_types for select
  using (company_id is null or company_id = current_company_id());
create policy sales_order_types_write on sales_order_types for insert with check (company_id = current_company_id());
create policy sales_order_types_update on sales_order_types for update using (company_id = current_company_id());
create policy sales_order_types_delete on sales_order_types for delete using (company_id = current_company_id());
