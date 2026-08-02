-- ============================================================================
-- 0070_invoice_override_approvals_and_hold.sql
-- Continues 0066-0069.
-- ============================================================================

create table sales_invoice_price_override_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  request_id uuid not null references sales_invoice_price_requests(id) on delete cascade,
  decided_by uuid references app_users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  approved_price numeric(12,2),
  decision_reason text,
  decided_at timestamptz not null default now()
);

alter table sales_invoice_price_override_approvals enable row level security;
create policy sales_invoice_price_override_approvals_isolation on sales_invoice_price_override_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function recompute_invoice_totals_from_items(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_gross numeric; v_item_discount numeric; v_promo numeric; v_taxable numeric; v_tax numeric; v_net numeric; v_rounded numeric;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;

  select coalesce(sum(gross_amount), 0), coalesce(sum(discount_amount) filter (where not is_free_item), 0),
    coalesce(sum(gross_amount) filter (where is_free_item), 0), coalesce(sum(taxable_amount), 0), coalesce(sum(tax_amount), 0)
  into v_gross, v_item_discount, v_promo, v_taxable, v_tax
  from sales_invoice_items where invoice_id = p_invoice_id and item_status = 'active';

  v_net := v_gross - v_item_discount + v_tax;
  v_rounded := case v_invoice.round_off_rule
    when 'none' then v_net when 'nearest_whole' then round(v_net)
    when 'nearest_0_05' then round(v_net / 0.05) * 0.05 when 'nearest_0_10' then round(v_net / 0.10) * 0.10
    else v_net
  end;

  update sales_invoices set
    gross_amount = v_gross, item_discount_amount = v_item_discount, promotion_discount_amount = v_promo,
    taxable_amount = v_taxable, tax_amount = v_tax, round_off = round(v_rounded - v_net, 2), net_amount = v_rounded, updated_at = now()
  where id = p_invoice_id;
end;
$$;
grant execute on function recompute_invoice_totals_from_items(uuid) to authenticated;

create or replace function decide_invoice_price_override(p_request_id uuid, p_approve boolean, p_approved_price numeric default null, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_request sales_invoice_price_requests%rowtype;
  v_item sales_invoice_items%rowtype;
  v_final_price numeric;
begin
  if not has_permission('sales_invoices:approve_price_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_invoice_price_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status != 'pending' then raise exception 'Request already decided'; end if;

  v_final_price := coalesce(p_approved_price, v_request.requested_price);

  update sales_invoice_price_requests set status = case when p_approve then 'approved' else 'rejected' end where id = p_request_id;
  insert into sales_invoice_price_override_approvals (company_id, request_id, decided_by, decision, approved_price, decision_reason)
  values ((select company_id from sales_invoices where id = v_request.invoice_id), p_request_id, auth.uid(), case when p_approve then 'approved' else 'rejected' end, v_final_price, p_reason);

  if p_approve then
    select * into v_item from sales_invoice_items where id = v_request.invoice_item_id;
    update sales_invoice_items set applied_price = v_final_price, price_source = 'override',
      gross_amount = round(v_final_price * invoice_quantity, 2),
      net_amount = round(v_final_price * invoice_quantity, 2) - discount_amount + tax_amount
    where id = v_request.invoice_item_id;

    perform recompute_invoice_totals_from_items(v_request.invoice_id);
  end if;
end;
$$;
grant execute on function decide_invoice_price_override(uuid, boolean, numeric, text) to authenticated;

create table sales_invoice_discount_override_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  request_id uuid not null references sales_invoice_discount_requests(id) on delete cascade,
  decided_by uuid references app_users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  approved_discount_pct numeric(5,2),
  decision_reason text,
  decided_at timestamptz not null default now()
);

alter table sales_invoice_discount_override_approvals enable row level security;
create policy sales_invoice_discount_override_approvals_isolation on sales_invoice_discount_override_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function decide_invoice_discount_override(p_request_id uuid, p_approve boolean, p_approved_discount_pct numeric default null, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_request sales_invoice_discount_requests%rowtype;
  v_item sales_invoice_items%rowtype;
  v_final_pct numeric;
  v_new_discount_amt numeric;
begin
  if not has_permission('sales_invoices:approve_discount_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_invoice_discount_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status != 'pending' then raise exception 'Request already decided'; end if;

  v_final_pct := coalesce(p_approved_discount_pct, v_request.requested_discount_pct, 0);

  update sales_invoice_discount_requests set status = case when p_approve then 'approved' else 'rejected' end where id = p_request_id;
  insert into sales_invoice_discount_override_approvals (company_id, request_id, decided_by, decision, approved_discount_pct, decision_reason)
  values ((select company_id from sales_invoices where id = v_request.invoice_id), p_request_id, auth.uid(), case when p_approve then 'approved' else 'rejected' end, v_final_pct, p_reason);

  if p_approve and v_request.invoice_item_id is not null then
    select * into v_item from sales_invoice_items where id = v_request.invoice_item_id;
    v_new_discount_amt := round(v_item.applied_price * v_item.invoice_quantity * v_final_pct / 100, 2);
    update sales_invoice_items set discount_pct = v_final_pct, discount_amount = v_new_discount_amt, discount_source = 'manual_discount',
      net_amount = gross_amount - v_new_discount_amt + tax_amount
    where id = v_request.invoice_item_id;

    perform recompute_invoice_totals_from_items(v_request.invoice_id);
  end if;
end;
$$;
grant execute on function decide_invoice_discount_override(uuid, boolean, numeric, text) to authenticated;

create table sales_invoice_free_quantity_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  request_id uuid not null references sales_invoice_free_quantity_requests(id) on delete cascade,
  decided_by uuid references app_users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  approved_quantity numeric(12,3),
  decision_reason text,
  decided_at timestamptz not null default now()
);

alter table sales_invoice_free_quantity_approvals enable row level security;
create policy sales_invoice_free_quantity_approvals_isolation on sales_invoice_free_quantity_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function decide_invoice_free_quantity_request(p_request_id uuid, p_approve boolean, p_approved_quantity numeric default null, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_request sales_invoice_free_quantity_requests%rowtype;
  v_invoice sales_invoices%rowtype;
  v_product products%rowtype;
begin
  if not has_permission('sales_invoices:approve_free_quantity') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_invoice_free_quantity_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status != 'pending' then raise exception 'Request already decided'; end if;

  update sales_invoice_free_quantity_requests set status = case when p_approve then 'approved' else 'rejected' end where id = p_request_id;
  insert into sales_invoice_free_quantity_approvals (company_id, request_id, decided_by, decision, approved_quantity, decision_reason)
  values ((select company_id from sales_invoices where id = v_request.invoice_id), p_request_id, auth.uid(), case when p_approve then 'approved' else 'rejected' end, coalesce(p_approved_quantity, v_request.requested_free_quantity), p_reason);

  if p_approve then
    select * into v_invoice from sales_invoices where id = v_request.invoice_id;
    select * into v_product from products where id = v_request.product_id;

    insert into sales_invoice_items (
      company_id, invoice_id, product_id, unit_id, barcode, sku, description, conversion_factor,
      invoice_quantity, base_quantity, original_price, applied_price, price_source, discount_pct, discount_amount,
      tax_rate, is_tax_exempt, taxable_amount, tax_amount, gross_amount, net_amount, is_free_item, sequence
    ) values (
      v_invoice.company_id, v_request.invoice_id, v_product.id, v_product.base_unit_id, v_product.barcode, v_product.sku, v_product.description,
      1, coalesce(p_approved_quantity, v_request.requested_free_quantity), coalesce(p_approved_quantity, v_request.requested_free_quantity),
      v_product.selling_price, 0, 'manual_free_approved', 100, 0, 0, true, 0, 0, 0, 0, true,
      (select coalesce(max(sequence), 0) + 1 from sales_invoice_items where invoice_id = v_request.invoice_id)
    );

    perform recompute_invoice_totals_from_items(v_request.invoice_id);
  end if;
end;
$$;
grant execute on function decide_invoice_free_quantity_request(uuid, boolean, numeric, text) to authenticated;

create table sales_invoice_hold_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  hold_reason text not null check (hold_reason in ('credit_review', 'stock_review', 'price_review', 'tax_review', 'customer_issue', 'management_review', 'sync_conflict', 'other')),
  hold_notes text,
  held_by uuid references app_users(id),
  held_at timestamptz not null default now(),
  release_requested_by uuid references app_users(id),
  released_by uuid references app_users(id),
  released_at timestamptz,
  release_notes text
);
create index idx_sales_invoice_hold_history_invoice on sales_invoice_hold_history(invoice_id);

alter table sales_invoice_hold_history enable row level security;
create policy sales_invoice_hold_history_isolation on sales_invoice_hold_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function place_invoice_on_hold(p_invoice_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_hold_id uuid;
begin
  if not has_permission('sales_invoices:place_on_hold') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  if v_company_id is null then raise exception 'Invoice not found'; end if;

  insert into sales_invoice_hold_history (company_id, invoice_id, hold_reason, hold_notes, held_by)
  values (v_company_id, p_invoice_id, p_reason, p_notes, auth.uid()) returning id into v_hold_id;

  update sales_invoices set is_on_hold = true, status = 'on_hold' where id = p_invoice_id;
  return v_hold_id;
end;
$$;
grant execute on function place_invoice_on_hold(uuid, text, text) to authenticated;

create or replace function release_invoice_hold(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare
  v_hold sales_invoice_hold_history%rowtype;
  v_return_status text;
begin
  if not has_permission('sales_invoices:release_hold') then raise exception 'Not permitted'; end if;
  select * into v_hold from sales_invoice_hold_history where id = p_hold_id;
  if not found then raise exception 'Hold record not found'; end if;

  update sales_invoice_hold_history set released_by = auth.uid(), released_at = now(), release_notes = p_notes where id = p_hold_id;

  select case when approval_status = 'approved' then 'approved' when approval_status = 'pending' then 'pending_approval' else 'pending_validation' end
  into v_return_status from sales_invoices where id = v_hold.invoice_id;

  update sales_invoices set is_on_hold = false, status = v_return_status where id = v_hold.invoice_id;
end;
$$;
grant execute on function release_invoice_hold(uuid, text) to authenticated;
