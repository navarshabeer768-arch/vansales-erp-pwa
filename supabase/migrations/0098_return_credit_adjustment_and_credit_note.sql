-- ============================================================================
-- 0098_return_credit_adjustment_and_credit_note.sql
-- Continues 0096-0097.
-- ============================================================================

alter table sales_invoices add column if not exists credited_amount numeric(14,2) not null default 0;

create or replace function revalidate_invoice_allocation(p_invoice_id uuid, p_customer_id uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare
  v_invoice sales_invoices%rowtype;
  v_current_outstanding numeric;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.posting_status != 'posted' then raise exception 'Invoice % is not posted', v_invoice.invoice_number; end if;
  if v_invoice.customer_id != p_customer_id then raise exception 'Invoice % does not belong to this customer', v_invoice.invoice_number; end if;
  if v_invoice.status in ('void_requested', 'voided') then raise exception 'Invoice % has been voided', v_invoice.invoice_number; end if;

  v_current_outstanding := v_invoice.net_amount - v_invoice.paid_amount - v_invoice.credited_amount;
  if v_current_outstanding <= 0 then raise exception 'Invoice % has no outstanding balance', v_invoice.invoice_number; end if;
  if p_amount > v_current_outstanding + 0.001 then
    raise exception 'Allocation of % exceeds current outstanding % on invoice %', p_amount, v_current_outstanding, v_invoice.invoice_number;
  end if;

  return v_current_outstanding;
end;
$$;
grant execute on function revalidate_invoice_allocation(uuid, uuid, numeric) to authenticated;

create table sales_return_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  gross_return_value numeric(14,2) not null,
  discount_reversal numeric(14,2) not null default 0,
  promotion_reversal numeric(14,2) not null default 0,
  tax_reversal numeric(14,2) not null default 0,
  net_credit_amount numeric(14,2) not null,
  currency text not null default 'QAR',
  transaction_date date not null default current_date,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  ledger_transaction_id uuid,
  created_at timestamptz not null default now()
);
create index idx_sales_return_credit_adjustments_return on sales_return_credit_adjustments(return_id);

alter table sales_return_credit_adjustments enable row level security;
create policy sales_return_credit_adjustments_isolation on sales_return_credit_adjustments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create sequence if not exists sales_return_credit_note_seq;

create or replace function next_credit_note_no()
returns text language plpgsql as $$
declare v_num bigint;
begin
  select nextval('sales_return_credit_note_seq') into v_num;
  return 'CN-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;

create table sales_return_credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  credit_note_number text not null,
  return_id uuid not null references sales_returns(id) on delete restrict,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  customer_id uuid not null references customers(id) on delete restrict,
  discount_reversal numeric(14,2) not null default 0,
  promotion_reversal numeric(14,2) not null default 0,
  tax_reversal numeric(14,2) not null default 0,
  approved_credit_amount numeric(14,2) not null,
  reason text,
  currency text not null default 'QAR',
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'posted', 'allocated', 'cancelled', 'reversed')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (company_id, credit_note_number)
);
create index idx_sales_return_credit_notes_return on sales_return_credit_notes(return_id);

alter table sales_return_credit_notes enable row level security;
create policy sales_return_credit_notes_isolation on sales_return_credit_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_credit_note_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  credit_note_id uuid not null references sales_return_credit_notes(id) on delete cascade,
  original_invoice_item_id uuid references sales_invoice_items(id) on delete set null,
  return_item_id uuid not null references sales_return_items(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  quantity numeric(14,3) not null,
  uom_id uuid references units(id),
  base_quantity numeric(14,3) not null,
  original_price numeric(12,4) not null default 0,
  discount_reversal numeric(14,2) not null default 0,
  tax_reversal numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null,
  reason text
);
create index idx_sales_return_credit_note_items_note on sales_return_credit_note_items(credit_note_id);

alter table sales_return_credit_note_items enable row level security;
create policy sales_return_credit_note_items_isolation on sales_return_credit_note_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_credit_note_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  credit_note_id uuid not null references sales_return_credit_notes(id) on delete cascade,
  allocation_type text not null check (allocation_type in ('original_invoice', 'customer_account', 'future_invoice')),
  invoice_id uuid references sales_invoices(id) on delete set null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  allocated_by uuid references app_users(id),
  allocated_at timestamptz not null default now()
);
create index idx_sales_return_credit_note_allocations_note on sales_return_credit_note_allocations(credit_note_id);

alter table sales_return_credit_note_allocations enable row level security;
create policy sales_return_credit_note_allocations_isolation on sales_return_credit_note_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_return_credit_adjustment(p_return_id uuid, p_net_credit_amount numeric)
returns uuid language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_invoice sales_invoices%rowtype;
  v_company_id uuid;
  v_adjustment_id uuid;
  v_ledger_id uuid;
  v_outstanding_before numeric;
  v_reduce_amount numeric;
begin
  select * into v_return from sales_returns where id = p_return_id;
  v_company_id := v_return.company_id;

  insert into sales_return_credit_adjustments (
    company_id, return_id, customer_id, original_invoice_id, gross_return_value, discount_reversal,
    promotion_reversal, tax_reversal, net_credit_amount
  ) values (
    v_company_id, p_return_id, v_return.customer_id, v_return.original_invoice_id, v_return.gross_return_amount,
    v_return.discount_reversal_amount, v_return.promotion_reversal_amount, v_return.tax_reversal_amount, p_net_credit_amount
  ) returning id into v_adjustment_id;

  insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
  values (v_company_id, v_return.customer_id, 'sales_return', 'sales_returns', p_return_id, 0, p_net_credit_amount, v_return.return_date, format('Return %s', v_return.return_number))
  returning id into v_ledger_id;

  update sales_return_credit_adjustments set ledger_transaction_id = v_ledger_id where id = v_adjustment_id;

  if v_return.original_invoice_id is not null then
    select * into v_invoice from sales_invoices where id = v_return.original_invoice_id;
    v_outstanding_before := v_invoice.net_amount - v_invoice.paid_amount - v_invoice.credited_amount;
    v_reduce_amount := least(p_net_credit_amount, greatest(v_outstanding_before, 0));

    if v_reduce_amount > 0 then
      update sales_invoices set
        credited_amount = credited_amount + v_reduce_amount,
        payment_status = case when (net_amount - paid_amount - credited_amount - v_reduce_amount) <= 0.001 then 'paid' else payment_status end
      where id = v_return.original_invoice_id;
    end if;
  end if;

  update customers set outstanding_balance = greatest(outstanding_balance - p_net_credit_amount, 0) where id = v_return.customer_id;

  return v_adjustment_id;
end;
$$;
grant execute on function create_return_credit_adjustment(uuid, numeric) to authenticated;

create or replace function generate_return_credit_note(p_return_id uuid, p_reason text default null)
returns uuid language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_company_id uuid;
  v_credit_note_id uuid;
  v_number text;
  v_item sales_return_items%rowtype;
  v_credit_item_amount numeric;
  v_total numeric := 0;
begin
  if not has_permission('sales_returns:generate_credit_note') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id;
  v_company_id := v_return.company_id;
  v_number := next_credit_note_no();

  insert into sales_return_credit_notes (
    company_id, credit_note_number, return_id, original_invoice_id, customer_id, discount_reversal,
    promotion_reversal, tax_reversal, approved_credit_amount, reason, status, created_by
  ) values (
    v_company_id, v_number, p_return_id, v_return.original_invoice_id, v_return.customer_id, v_return.discount_reversal_amount,
    v_return.promotion_reversal_amount, v_return.tax_reversal_amount, v_return.net_return_amount, p_reason, 'posted', auth.uid()
  ) returning id into v_credit_note_id;

  for v_item in select * from sales_return_items where return_id = p_return_id and item_status = 'active' loop
    v_credit_item_amount := v_item.net_return_amount * (v_item.accepted_saleable_quantity + v_item.accepted_damaged_quantity + v_item.accepted_expired_quantity + v_item.quarantine_quantity) / nullif(v_item.base_return_quantity, 0);
    v_credit_item_amount := coalesce(v_credit_item_amount, 0);

    insert into sales_return_credit_note_items (
      company_id, credit_note_id, original_invoice_item_id, return_item_id, product_id, variant_id, quantity, uom_id,
      base_quantity, original_price, discount_reversal, tax_reversal, credit_amount, reason
    ) values (
      v_company_id, v_credit_note_id, v_item.original_invoice_item_id, v_item.id, v_item.product_id, v_item.variant_id,
      v_item.return_quantity, v_item.uom_id, v_item.base_return_quantity, v_item.original_unit_price, v_item.discount_reversal,
      v_item.tax_reversal, v_credit_item_amount, p_reason
    );
    v_total := v_total + v_credit_item_amount;
  end loop;

  update sales_return_credit_notes set approved_credit_amount = v_total where id = v_credit_note_id;
  update sales_returns set credit_note_reference = v_number where id = p_return_id;

  return v_credit_note_id;
end;
$$;
grant execute on function generate_return_credit_note(uuid, text) to authenticated;

create or replace function allocate_credit_note_to_invoice(p_credit_note_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid language plpgsql security definer as $$
declare
  v_note sales_return_credit_notes%rowtype;
  v_already_allocated numeric;
  v_company_id uuid;
  v_allocation_id uuid;
begin
  if not has_permission('sales_returns:generate_credit_note') then raise exception 'Not permitted'; end if;
  select * into v_note from sales_return_credit_notes where id = p_credit_note_id;
  if not found then raise exception 'Credit note not found'; end if;

  select coalesce(sum(allocated_amount), 0) into v_already_allocated from sales_return_credit_note_allocations where credit_note_id = p_credit_note_id;
  if v_already_allocated + p_amount > v_note.approved_credit_amount + 0.001 then
    raise exception 'Allocation exceeds approved credit note amount';
  end if;

  v_company_id := v_note.company_id;
  insert into sales_return_credit_note_allocations (company_id, credit_note_id, allocation_type, invoice_id, allocated_amount, allocated_by)
  values (v_company_id, p_credit_note_id, 'original_invoice', p_invoice_id, p_amount, auth.uid())
  returning id into v_allocation_id;

  update sales_invoices set
    credited_amount = credited_amount + p_amount,
    payment_status = case when (net_amount - paid_amount - credited_amount - p_amount) <= 0.001 then 'paid' else payment_status end
  where id = p_invoice_id;

  update sales_return_credit_notes set status = 'allocated' where id = p_credit_note_id;

  return v_allocation_id;
end;
$$;
grant execute on function allocate_credit_note_to_invoice(uuid, uuid, numeric) to authenticated;

create table sales_return_cash_refund_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  reason text,
  requested_by uuid references app_users(id),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  preferred_payment_method text references payment_methods(code) on delete set null,
  decided_by uuid references app_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_sales_return_cash_refund_requests_return on sales_return_cash_refund_requests(return_id);

alter table sales_return_cash_refund_requests enable row level security;
create policy sales_return_cash_refund_requests_isolation on sales_return_cash_refund_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_cash_refund_request(p_return_id uuid, p_requested_amount numeric, p_reason text default null, p_preferred_payment_method text default null)
returns uuid language plpgsql security definer as $$
declare v_return sales_returns%rowtype; v_id uuid;
begin
  select * into v_return from sales_returns where id = p_return_id;
  if not found then raise exception 'Return not found'; end if;

  insert into sales_return_cash_refund_requests (company_id, return_id, customer_id, original_invoice_id, requested_amount, reason, requested_by, preferred_payment_method)
  values (v_return.company_id, p_return_id, v_return.customer_id, v_return.original_invoice_id, p_requested_amount, p_reason, auth.uid(), p_preferred_payment_method)
  returning id into v_id;

  update sales_returns set cash_refund_requested = true where id = p_return_id;
  return v_id;
end;
$$;
grant execute on function create_cash_refund_request(uuid, numeric, text, text) to authenticated;
