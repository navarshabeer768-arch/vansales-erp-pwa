-- ============================================================================
-- 0093_replacement_override_editing_notes.sql
-- Continues 0091-0092.
-- ============================================================================

create table sales_return_replacement_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete cascade,
  same_product boolean not null default true,
  requested_product_id uuid references products(id) on delete set null,
  requested_variant_id uuid references product_variants(id) on delete set null,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  reason text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  required_date date,
  delivery_address text,
  approval_status text not null default 'not_required' check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_return_replacement_requests_item on sales_return_replacement_requests(return_item_id);

alter table sales_return_replacement_requests enable row level security;
create policy sales_return_replacement_requests_isolation on sales_return_replacement_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_replacement_request(
  p_return_item_id uuid, p_requested_quantity numeric, p_same_product boolean default true,
  p_requested_product_id uuid default null, p_requested_variant_id uuid default null, p_reason text default null,
  p_priority text default 'normal', p_required_date date default null, p_delivery_address text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_id uuid;
begin
  select company_id into v_company_id from sales_return_items where id = p_return_item_id;
  if v_company_id is null then raise exception 'Return item not found'; end if;

  insert into sales_return_replacement_requests (
    company_id, return_item_id, same_product, requested_product_id, requested_variant_id, requested_quantity,
    reason, priority, required_date, delivery_address, created_by
  ) values (
    v_company_id, p_return_item_id, p_same_product, p_requested_product_id, p_requested_variant_id, p_requested_quantity,
    p_reason, p_priority, p_required_date, p_delivery_address, auth.uid()
  ) returning id into v_id;

  update sales_return_items set replacement_requested = true where id = p_return_item_id;
  update sales_returns set replacement_requested = true where id = (select return_id from sales_return_items where id = p_return_item_id);

  return v_id;
end;
$$;
grant execute on function create_replacement_request(uuid, numeric, boolean, uuid, uuid, text, text, date, text) to authenticated;

create table sales_return_value_override_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete cascade,
  original_return_value numeric(14,2) not null,
  requested_return_value numeric(14,2) not null,
  reason text not null,
  requested_by uuid references app_users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references app_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_sales_return_value_override_requests_item on sales_return_value_override_requests(return_item_id);

alter table sales_return_value_override_requests enable row level security;
create policy sales_return_value_override_requests_isolation on sales_return_value_override_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function request_return_value_override(p_return_item_id uuid, p_requested_value numeric, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_original numeric; v_id uuid;
begin
  if not has_permission('sales_returns:request_value_override') then raise exception 'Not permitted'; end if;
  select company_id, net_return_amount into v_company_id, v_original from sales_return_items where id = p_return_item_id;
  if v_company_id is null then raise exception 'Return item not found'; end if;

  insert into sales_return_value_override_requests (company_id, return_item_id, original_return_value, requested_return_value, reason, requested_by)
  values (v_company_id, p_return_item_id, v_original, p_requested_value, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function request_return_value_override(uuid, numeric, text) to authenticated;

create table sales_return_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  note text not null,
  note_type text not null default 'general' check (note_type in ('general', 'customer', 'internal', 'visit')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_return_notes_return on sales_return_notes(return_id);

alter table sales_return_notes enable row level security;
create policy sales_return_notes_isolation on sales_return_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function update_draft_return(
  p_return_id uuid, p_customer_id uuid default null, p_original_invoice_id uuid default null,
  p_return_reason_code text default null, p_customer_reference text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_reason_id uuid;
  v_customer_or_invoice_changed boolean := false;
begin
  if not has_permission('sales_returns:edit_return_draft') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.status != 'draft' then raise exception 'Only draft returns can be edited (currently %)', v_return.status; end if;

  if (p_customer_id is not null and p_customer_id != v_return.customer_id)
    or (p_original_invoice_id is not null and p_original_invoice_id != v_return.original_invoice_id) then
    v_customer_or_invoice_changed := true;
  end if;

  if v_customer_or_invoice_changed then
    delete from sales_return_item_serials where return_item_id in (select id from sales_return_items where return_id = p_return_id);
    delete from sales_return_item_batches where return_item_id in (select id from sales_return_items where return_id = p_return_id);
    delete from sales_return_replacement_requests where return_item_id in (select id from sales_return_items where return_id = p_return_id);
    delete from sales_return_items where return_id = p_return_id;
    update sales_returns set
      gross_return_amount = 0, discount_reversal_amount = 0, promotion_reversal_amount = 0,
      tax_reversal_amount = 0, net_return_amount = 0, total_return_quantity = 0, total_base_quantity = 0
    where id = p_return_id;
  end if;

  if p_return_reason_code is not null then
    select id into v_reason_id from sales_return_reasons where code = p_return_reason_code and (company_id is null or company_id = v_return.company_id) order by company_id nulls last limit 1;
  end if;

  update sales_returns set
    customer_id = coalesce(p_customer_id, customer_id),
    original_invoice_id = case when p_original_invoice_id is not null then p_original_invoice_id else original_invoice_id end,
    return_reason_id = coalesce(v_reason_id, return_reason_id),
    customer_reference = coalesce(p_customer_reference, customer_reference),
    notes = coalesce(p_notes, notes),
    updated_by = auth.uid(), updated_at = now()
  where id = p_return_id;
end;
$$;
grant execute on function update_draft_return(uuid, uuid, uuid, text, text, text) to authenticated;

create or replace function cancel_return_draft(p_return_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_return sales_returns%rowtype;
begin
  if not has_permission('sales_returns:cancel_return_draft') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.status = 'cancelled_before_posting' then return; end if;
  if v_return.posting_status != 'not_posted' then raise exception 'Posted returns cannot be cancelled through this function'; end if;

  perform change_return_status(p_return_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into sales_return_notes (company_id, return_id, note, note_type, created_by)
    values (v_return.company_id, p_return_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_return_draft(uuid, text, text) to authenticated;

create or replace function delete_unsynced_return_draft(p_return_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('sales_returns:delete_unsynced_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from sales_returns where id = p_return_id and company_id = current_company_id();
  if v_status is null then raise exception 'Return not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from sales_returns where id = p_return_id;
end;
$$;
grant execute on function delete_unsynced_return_draft(uuid) to authenticated;
