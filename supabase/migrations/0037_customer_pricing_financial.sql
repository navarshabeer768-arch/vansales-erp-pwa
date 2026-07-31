-- ============================================================================
-- 0037_customer_pricing_financial.sql
-- Customer Pricing & Financial Foundation (Phase 4A.2 Part 2).
--
-- Found on inspection: products.wholesale_price/retail_price/offer_price and
-- customers.price_level have existed since Phase 1, but neither is actually
-- read anywhere — POS only ever fetches products.selling_price. They're
-- dead schema, not live logic, so there's no existing price resolution to
-- break. resolve_customer_price() below is built as the real, reusable
-- engine the doc asks for; it is NOT wired into POS/create_sale's actual
-- fetch, since that's Sales Invoices territory this phase explicitly
-- excludes touching — same precedent as validate_customer_credit() in
-- Part 1. customer_groups.default_discount_pct (existed since Phase 1,
-- extended in 4A.1) is reused as-is for the "Customer Group Price" priority
-- tier rather than inventing a second group-pricing mechanism.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRICE LISTS
-- ---------------------------------------------------------------------------
create table price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  currency text not null default 'QAR',
  priority integer not null default 0, -- lower = checked first when a customer has more than one applicable list
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  effective_date date,
  expiry_date date,
  branch_id uuid references warehouses(id) on delete set null,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create index idx_price_lists_company on price_lists(company_id, status);

alter table price_lists enable row level security;
create policy price_lists_isolation on price_lists for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- CUSTOMER <-> PRICE LIST — default/secondary/temporary, with priority.
-- ---------------------------------------------------------------------------
create table customer_price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  price_list_id uuid not null references price_lists(id) on delete cascade,
  assignment_type text not null default 'default' check (assignment_type in ('default', 'secondary', 'temporary')),
  priority integer not null default 0,
  effective_date date,
  expiry_date date, -- required in practice for 'temporary', enforced at the app layer
  created_at timestamptz not null default now(),
  unique (customer_id, price_list_id)
);
create index idx_customer_price_lists_customer on customer_price_lists(customer_id);

alter table customer_price_lists enable row level security;
create policy customer_price_lists_isolation on customer_price_lists for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- PRODUCT PRICE RULES — one generic, scoped rule table covering price-list,
-- branch, route, and promotion pricing (each just a different scope on the
-- same shape), rather than a separate table per scope.
-- ---------------------------------------------------------------------------
create table product_price_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  scope_type text not null check (scope_type in ('price_list', 'branch', 'route', 'promotion')),
  price_list_id uuid references price_lists(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  price numeric(12,2) not null,
  min_selling_price numeric(12,2),
  max_discount_pct numeric(5,2),
  effective_date date,
  expiry_date date,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (
    (scope_type = 'price_list' and price_list_id is not null) or
    (scope_type = 'branch' and branch_id is not null) or
    (scope_type = 'route' and route_id is not null) or
    (scope_type = 'promotion')
  )
);
create index idx_product_price_rules_product on product_price_rules(product_id, is_active);
create index idx_product_price_rules_price_list on product_price_rules(price_list_id) where price_list_id is not null;

alter table product_price_rules enable row level security;
create policy product_price_rules_isolation on product_price_rules for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- CUSTOMER-SPECIFIC PRODUCT PRICES — highest priority in the engine.
-- ---------------------------------------------------------------------------
create table customer_product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  price numeric(12,2) not null,
  min_selling_price numeric(12,2),
  max_discount_pct numeric(5,2),
  effective_date date,
  expiry_date date,
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);
create index idx_customer_product_prices_customer on customer_product_prices(customer_id, is_active);

alter table customer_product_prices enable row level security;
create policy customer_product_prices_isolation on customer_product_prices for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- CUSTOMER DISCOUNTS
-- ---------------------------------------------------------------------------
create table customer_discounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  discount_type text not null check (discount_type in ('percentage', 'fixed', 'product', 'category', 'invoice')),
  product_id uuid references products(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  discount_value numeric(10,2) not null, -- percentage (0-100) or fixed amount depending on discount_type
  maximum_discount numeric(12,2),
  requires_approval boolean not null default false,
  is_temporary boolean not null default false,
  expiry_date date,
  status text not null default 'active' check (status in ('active', 'pending_approval', 'expired', 'cancelled')),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_customer_discounts_customer on customer_discounts(customer_id, status);

alter table customer_discounts enable row level security;
create policy customer_discounts_isolation on customer_discounts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function expire_stale_customer_discounts()
returns integer language plpgsql security definer as $$
declare v_count integer;
begin
  update customer_discounts set status = 'expired'
  where company_id = current_company_id() and status = 'active' and is_temporary and expiry_date is not null and expiry_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function expire_stale_customer_discounts() to authenticated;

-- ---------------------------------------------------------------------------
-- FREE QUANTITY RULES — Buy X Get Y / bonus schemes.
-- ---------------------------------------------------------------------------
create table free_quantity_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  buy_product_id uuid not null references products(id) on delete cascade,
  buy_quantity numeric(10,2) not null,
  free_product_id uuid not null references products(id) on delete cascade,
  free_quantity numeric(10,2) not null,
  customer_id uuid references customers(id) on delete cascade, -- null = applies to all customers
  price_list_id uuid references price_lists(id) on delete cascade, -- null = not tied to a specific list
  effective_date date,
  expiry_date date,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_free_quantity_rules_buy_product on free_quantity_rules(buy_product_id, is_active);

alter table free_quantity_rules enable row level security;
create policy free_quantity_rules_isolation on free_quantity_rules for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- OPENING BALANCES — integrated with Accounting via a real journal entry,
-- not a number that floats disconnected from the books.
-- ---------------------------------------------------------------------------
create table customer_opening_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  balance_type text not null check (balance_type in ('debit', 'credit')),
  amount numeric(14,2) not null,
  reference_number text,
  posting_date date not null default current_date,
  remarks text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  journal_entry_id uuid references journal_entries(id) on delete set null,
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (customer_id) -- one opening balance per customer, matching how opening balances work in practice
);

alter table customer_opening_balances enable row level security;
create policy customer_opening_balances_isolation on customer_opening_balances for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Posts the opening balance to the books (Accounts Receivable vs Opening
-- Balance Equity) and applies it to the customer's outstanding_balance —
-- the real integration the doc asks for, not a disconnected number.
create or replace function approve_customer_opening_balance(p_opening_balance_id uuid)
returns void language plpgsql security definer as $$
declare
  v_ob customer_opening_balances%rowtype;
  v_ar_account_id uuid;
  v_equity_account_id uuid;
  v_entry_id uuid;
begin
  if not has_permission('customer_pricing:manage_opening_balances') then raise exception 'Not permitted'; end if;

  select * into v_ob from customer_opening_balances where id = p_opening_balance_id and status = 'pending';
  if not found then raise exception 'Opening balance not found or already decided'; end if;

  -- No Chart of Accounts is seeded anywhere in this app — companies set
  -- their own up (or don't). Rather than assume a numbering convention
  -- no company has ever been told to follow, look for recognizably-named
  -- accounts. If a company hasn't set up accounting yet, the journal
  -- posting is skipped (the customer balance + ledger effects below
  -- still apply either way) — a real, visible degradation, not a silent
  -- assumption dressed up as guaranteed integration.
  select id into v_ar_account_id from accounts
  where company_id = v_ob.company_id and account_type = 'asset' and name ilike '%receivable%' limit 1;
  select id into v_equity_account_id from accounts
  where company_id = v_ob.company_id and account_type = 'equity' and (name ilike '%opening%' or name ilike '%retained%') limit 1;
  if v_equity_account_id is null then
    select id into v_equity_account_id from accounts where company_id = v_ob.company_id and account_type = 'equity' limit 1;
  end if;

  if v_ar_account_id is not null and v_equity_account_id is not null then
    insert into journal_entries (company_id, entry_no, entry_date, reference_table, reference_id, description, created_by)
    values (v_ob.company_id, 'OB-' || to_char(now(), 'YYMMDD') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0'),
      v_ob.posting_date, 'customer_opening_balances', v_ob.id,
      'Opening balance for customer', auth.uid())
    returning id into v_entry_id;

    if v_ob.balance_type = 'debit' then
      insert into journal_entry_lines (entry_id, account_id, debit, credit) values (v_entry_id, v_ar_account_id, v_ob.amount, 0);
      insert into journal_entry_lines (entry_id, account_id, debit, credit) values (v_entry_id, v_equity_account_id, 0, v_ob.amount);
    else
      insert into journal_entry_lines (entry_id, account_id, debit, credit) values (v_entry_id, v_equity_account_id, v_ob.amount, 0);
      insert into journal_entry_lines (entry_id, account_id, debit, credit) values (v_entry_id, v_ar_account_id, 0, v_ob.amount);
    end if;
  end if;

  update customer_opening_balances set status = 'approved', approved_by = auth.uid(), approved_at = now(), journal_entry_id = v_entry_id
  where id = p_opening_balance_id;

  update customers set outstanding_balance = outstanding_balance + (case when v_ob.balance_type = 'debit' then v_ob.amount else -v_ob.amount end)
  where id = v_ob.customer_id;

  insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
  values (v_ob.company_id, v_ob.customer_id, 'opening_balance', 'customer_opening_balances', v_ob.id,
    case when v_ob.balance_type = 'debit' then v_ob.amount else 0 end,
    case when v_ob.balance_type = 'credit' then v_ob.amount else 0 end,
    v_ob.posting_date, coalesce(v_ob.remarks, 'Opening balance'));
end;
$$;

grant execute on function approve_customer_opening_balance(uuid) to authenticated;

create or replace function reject_customer_opening_balance(p_opening_balance_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('customer_pricing:manage_opening_balances') then raise exception 'Not permitted'; end if;
  update customer_opening_balances set status = 'rejected', remarks = coalesce(remarks || ' | ', '') || 'Rejected: ' || p_reason
  where id = p_opening_balance_id and status = 'pending';
end;
$$;

grant execute on function reject_customer_opening_balance(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- CUSTOMER LEDGER FOUNDATION — a running-balance header per customer, and
-- the transaction log behind it. Only real transactions are ever inserted
-- (opening balances here; sales/collections/returns/credit-notes/debit-
-- notes/adjustments/write-offs are explicitly future phases per this
-- phase's own instructions — the structure is ready for them, nothing
-- fake is seeded into it).
-- ---------------------------------------------------------------------------
create table customer_ledger (
  customer_id uuid primary key references customers(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  last_transaction_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table customer_ledger enable row level security;
create policy customer_ledger_isolation on customer_ledger for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  transaction_type text not null check (transaction_type in (
    'opening_balance', 'sales_invoice', 'collection', 'credit_note', 'debit_note',
    'sales_return', 'adjustment', 'write_off'
  )),
  reference_table text,
  reference_id uuid,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  running_balance numeric(14,2),
  transaction_date date not null default current_date,
  description text,
  created_at timestamptz not null default now(),
  check (debit = 0 or credit = 0)
);
create index idx_customer_ledger_transactions_customer on customer_ledger_transactions(customer_id, transaction_date, created_at);

alter table customer_ledger_transactions enable row level security;
create policy customer_ledger_transactions_isolation on customer_ledger_transactions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Keeps customer_ledger's running balance and last_transaction_at correct
-- automatically as transactions are appended — the reusable mechanism
-- every future phase (Sales Invoices, Collections, Returns, ...) plugs
-- into just by inserting a row here, rather than re-deriving a balance.
create or replace function apply_ledger_transaction()
returns trigger language plpgsql security definer as $$
declare
  v_prior_balance numeric;
begin
  insert into customer_ledger (customer_id, company_id, opening_balance, current_balance, last_transaction_at)
  values (new.customer_id, new.company_id, 0, 0, new.created_at)
  on conflict (customer_id) do nothing;

  select current_balance into v_prior_balance from customer_ledger where customer_id = new.customer_id;

  new.running_balance := coalesce(v_prior_balance, 0) + new.debit - new.credit;

  update customer_ledger set
    current_balance = new.running_balance,
    opening_balance = case when new.transaction_type = 'opening_balance' then new.debit - new.credit else opening_balance end,
    last_transaction_at = new.created_at, updated_at = now()
  where customer_id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists trg_apply_ledger_transaction on customer_ledger_transactions;
create trigger trg_apply_ledger_transaction before insert on customer_ledger_transactions
  for each row execute function apply_ledger_transaction();

-- ---------------------------------------------------------------------------
-- AGING STRUCTURE — configurable bucket day-thresholds, seeded with the
-- doc's own defaults. Populated today from opening balances only; future
-- invoices populate it automatically once that module exists.
-- ---------------------------------------------------------------------------
create table customer_aging_configuration (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  bucket_label text not null,
  min_days integer not null,
  max_days integer, -- null = open-ended (the "120+" bucket)
  sort_order integer not null,
  unique (company_id, bucket_label)
);

alter table customer_aging_configuration enable row level security;
create policy customer_aging_configuration_isolation on customer_aging_configuration for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function seed_default_aging_buckets(p_company_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into customer_aging_configuration (company_id, bucket_label, min_days, max_days, sort_order) values
    (p_company_id, 'Current', 0, 0, 1),
    (p_company_id, '1-30 Days', 1, 30, 2),
    (p_company_id, '31-60 Days', 31, 60, 3),
    (p_company_id, '61-90 Days', 61, 90, 4),
    (p_company_id, '91-120 Days', 91, 120, 5),
    (p_company_id, '120+ Days', 121, null, 6)
  on conflict (company_id, bucket_label) do nothing;
end;
$$;

-- Seed for every existing company.
do $$
declare v_company_id uuid;
begin
  for v_company_id in select id from companies loop
    perform seed_default_aging_buckets(v_company_id);
  end loop;
end $$;

-- Aging report for a customer: how much of their opening balance falls into
-- each bucket, based on the opening balance's posting date. Once Sales
-- Invoices exist, each unpaid invoice's due date feeds this the same way.
create or replace function customer_aging_summary(p_customer_id uuid)
returns table (bucket_label text, amount numeric) language plpgsql stable as $$
declare
  v_company_id uuid;
  v_bucket record;
  v_days_old integer;
  v_ob_amount numeric;
begin
  select company_id into v_company_id from customers where id = p_customer_id;

  select case when balance_type = 'debit' then amount else 0 end, current_date - posting_date
  into v_ob_amount, v_days_old
  from customer_opening_balances where customer_id = p_customer_id and status = 'approved';

  for v_bucket in select * from customer_aging_configuration where company_id = v_company_id order by sort_order loop
    bucket_label := v_bucket.bucket_label;
    amount := 0;
    if v_ob_amount is not null and v_days_old >= v_bucket.min_days and (v_bucket.max_days is null or v_days_old <= v_bucket.max_days) then
      amount := v_ob_amount;
    end if;
    return next;
  end loop;
end;
$$;

grant execute on function customer_aging_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PRICE PRIORITY ENGINE — the reusable service future Sales Orders/Invoices
-- must call. Customer Price -> Customer Group Price (reusing the existing
-- customer_groups.default_discount_pct from Phase 1) -> Price List ->
-- Branch Price -> Promotion -> Standard Selling Price.
-- ---------------------------------------------------------------------------
create or replace function resolve_customer_price(p_customer_id uuid, p_product_id uuid, p_quantity numeric default 1)
returns table (price numeric, min_selling_price numeric, max_discount_pct numeric, source text) language plpgsql stable as $$
declare
  v_customer customers%rowtype;
  v_standard_price numeric;
  v_group_discount_pct numeric;
  v_price_list_id uuid;
  v_rule record;
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

  -- 4. Branch price (customer's assigned branch).
  if v_customer.branch_id is not null then
    select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
    from product_price_rules ppr
    where ppr.branch_id = v_customer.branch_id and ppr.product_id = p_product_id and ppr.scope_type = 'branch' and ppr.is_active
    limit 1;
    if found and price is not null then source := 'branch_price'; return next; return; end if;
  end if;

  -- 5. Promotion (date-bound, no branch/list/customer scoping required).
  select ppr.price, ppr.min_selling_price, ppr.max_discount_pct into price, min_selling_price, max_discount_pct
  from product_price_rules ppr
  where ppr.product_id = p_product_id and ppr.scope_type = 'promotion' and ppr.is_active
    and (ppr.effective_date is null or ppr.effective_date <= current_date)
    and (ppr.expiry_date is null or ppr.expiry_date >= current_date)
  order by ppr.priority
  limit 1;
  if found and price is not null then source := 'promotion'; return next; return; end if;

  -- 6. Standard selling price — always the fallback.
  price := v_standard_price; min_selling_price := null; max_discount_pct := null; source := 'standard_price';
  return next;
end;
$$;

grant execute on function resolve_customer_price(uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- PERMISSIONS — new 'customer_pricing' module.
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'customer_pricing', a, 'Customer pricing: ' || a
from unnest(array[
  'view', 'edit', 'approve', 'manage_discounts', 'manage_price_lists',
  'manage_opening_balances', 'view_ledger', 'export_reports'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'customer_pricing'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- AUDIT LOG — reuse the generic trigger from Phase 4A.1.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_price_lists on price_lists;
create trigger trg_audit_price_lists after insert or update or delete on price_lists
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_product_price_rules on product_price_rules;
create trigger trg_audit_product_price_rules after insert or update or delete on product_price_rules
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_product_prices on customer_product_prices;
create trigger trg_audit_customer_product_prices after insert or update or delete on customer_product_prices
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_discounts on customer_discounts;
create trigger trg_audit_customer_discounts after insert or update or delete on customer_discounts
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_opening_balances on customer_opening_balances;
create trigger trg_audit_customer_opening_balances after insert or update or delete on customer_opening_balances
  for each row execute function log_audit_change();
