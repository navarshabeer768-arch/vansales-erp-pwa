-- ============================================================================
-- 0108_debit_notes_core.sql
-- Continues 0105-0107. Mirrors credit_notes' shape — a debit note
-- increases what the customer owes, a credit note decreases it; the
-- sign is semantic (handled at posting time in Part 2), not structural.
-- ============================================================================

create table debit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete set null,
  document_number text not null,
  temporary_number text,
  document_type_id uuid not null references financial_document_types(id),
  document_date date not null default current_date,
  customer_id uuid not null references customers(id) on delete restrict,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  adjustment_type text not null check (adjustment_type in (
    'item_adjustment', 'amount_adjustment', 'price_adjustment', 'quantity_adjustment',
    'discount_adjustment', 'tax_adjustment', 'promotion_adjustment', 'mixed_adjustment'
  )),
  reason_id uuid references financial_adjustment_reasons(id),
  reference_number text,
  internal_notes text,
  customer_notes text,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in (
    'draft', 'pending_validation', 'submitted', 'returned', 'cancelled', 'sync_pending', 'sync_failed', 'conflict'
  )),
  document_source text not null default 'web' check (document_source in ('web', 'mobile', 'pdt', 'offline', 'office')),
  responsible_employee_id uuid references app_users(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  client_uuid text,
  device_uid text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, document_number),
  unique (company_id, client_uuid)
);
create index idx_debit_notes_company_date on debit_notes(company_id, document_date);
create index idx_debit_notes_customer on debit_notes(customer_id);
create index idx_debit_notes_invoice on debit_notes(original_invoice_id);
create index idx_debit_notes_status on debit_notes(company_id, status);

alter table debit_notes enable row level security;
create policy debit_notes_isolation on debit_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_debit_notes_updated_at before update on debit_notes
  for each row execute function set_updated_at();

create table debit_note_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  debit_note_id uuid not null references debit_notes(id) on delete cascade,
  original_invoice_item_id uuid references sales_invoice_items(id) on delete set null,
  product_id uuid references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  description text,
  uom_id uuid references units(id),
  quantity numeric(14,3),
  unit_price numeric(12,4),
  original_price numeric(12,4),
  corrected_price numeric(12,4),
  price_difference numeric(12,4),
  original_quantity numeric(14,3),
  corrected_quantity numeric(14,3),
  quantity_difference numeric(14,3),
  original_discount numeric(14,2),
  corrected_discount numeric(14,2),
  discount_difference numeric(14,2),
  original_tax numeric(14,2),
  corrected_tax numeric(14,2),
  tax_difference numeric(14,2),
  adjustment_amount numeric(14,2) not null default 0,
  reason_id uuid references financial_adjustment_reasons(id),
  item_notes text,
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_debit_note_items_note on debit_note_items(debit_note_id);
create index idx_debit_note_items_invoice_item on debit_note_items(original_invoice_item_id);

alter table debit_note_items enable row level security;
create policy debit_note_items_isolation on debit_note_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_debit_note_status(p_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from debit_notes where id = p_id;
  if v_old is null then raise exception 'Debit note not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'submitted', 'cancelled', 'sync_pending')
    when 'pending_validation' then p_new_status in ('submitted', 'returned', 'cancelled')
    when 'submitted' then p_new_status in ('returned', 'cancelled')
    when 'returned' then p_new_status in ('draft', 'submitted', 'cancelled')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'conflict' then p_new_status in ('draft', 'sync_pending', 'cancelled')
    when 'cancelled' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move debit note from % to %', v_old, p_new_status; end if;

  update debit_notes set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_id;
  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, reason, changed_by)
  values (v_company_id, 'debit_notes', p_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_debit_note_status(uuid, text, text) to authenticated;

create or replace function create_debit_note_draft(
  p_document_type_code text,
  p_customer_id uuid,
  p_client_uuid text,
  p_items jsonb default '[]',
  p_amount_only_value numeric default null,
  p_original_invoice_id uuid default null,
  p_reason_code text default null,
  p_adjustment_type text default null,
  p_reference_number text default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_document_source text default 'web',
  p_responsible_employee_id uuid default null,
  p_route_id uuid default null,
  p_van_id uuid default null,
  p_device_uid text default null,
  p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_id uuid;
  v_existing_id uuid;
  v_doc_type financial_document_types%rowtype;
  v_customer customers%rowtype;
  v_reason_id uuid;
  v_document_number text;
  v_initial_status text;
  v_item jsonb;
  v_seq integer := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_line_amount numeric;
begin
  if v_company_id is null then raise exception 'No company context for current user'; end if;

  select id into v_existing_id from debit_notes where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_doc_type from financial_document_types
  where code = p_document_type_code and document_category = 'debit_note' and (company_id is null or company_id = v_company_id) and is_active
  order by company_id nulls last limit 1;
  if not found then raise exception 'Unknown or inactive debit note type: %', p_document_type_code; end if;

  select * into v_customer from customers where id = p_customer_id and company_id = v_company_id;
  if not found then raise exception 'Customer not found'; end if;
  if v_customer.status = 'deleted' then raise exception 'Cannot record an adjustment for a deleted customer'; end if;

  if v_doc_type.invoice_required and p_original_invoice_id is null then
    raise exception '% requires an original invoice', v_doc_type.label;
  end if;
  if p_original_invoice_id is not null and not invoice_eligible_for_adjustment(p_original_invoice_id, p_customer_id) then
    raise exception 'Invoice is not eligible for adjustment (not posted, voided, or belongs to another customer)';
  end if;

  if p_reason_code is not null then
    select id into v_reason_id from financial_adjustment_reasons
    where code = p_reason_code and applies_to in ('debit_note', 'all') and (company_id is null or company_id = v_company_id)
    order by company_id nulls last limit 1;
  end if;

  v_document_number := next_financial_document_no('debit_note');
  v_initial_status := case when p_is_offline then 'sync_pending' else 'draft' end;

  insert into debit_notes (
    company_id, document_number, document_type_id, customer_id, original_invoice_id,
    adjustment_type, reason_id, reference_number, internal_notes, customer_notes, status, document_source,
    responsible_employee_id, route_id, van_id, client_uuid, device_uid, created_by, updated_by
  ) values (
    v_company_id, v_document_number, v_doc_type.id, p_customer_id, p_original_invoice_id,
    coalesce(p_adjustment_type, v_doc_type.default_adjustment_type, 'amount_adjustment'), v_reason_id, p_reference_number,
    p_internal_notes, p_customer_notes, v_initial_status, p_document_source, coalesce(p_responsible_employee_id, auth.uid()),
    p_route_id, p_van_id, p_client_uuid, p_device_uid, auth.uid(), auth.uid()
  ) returning id into v_id;

  if p_amount_only_value is not null and jsonb_array_length(p_items) = 0 then
    v_net := p_amount_only_value;
    v_gross := p_amount_only_value;
  else
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_seq := v_seq + 1;

      v_line_amount := coalesce((v_item->>'adjustment_amount')::numeric, 0);
      if v_line_amount = 0 and (v_item->>'corrected_price') is not null and (v_item->>'original_price') is not null then
        v_line_amount := ((v_item->>'corrected_price')::numeric - (v_item->>'original_price')::numeric) * coalesce((v_item->>'quantity')::numeric, 1);
      end if;
      if v_line_amount = 0 and (v_item->>'corrected_quantity') is not null and (v_item->>'original_quantity') is not null then
        v_line_amount := ((v_item->>'corrected_quantity')::numeric - (v_item->>'original_quantity')::numeric) * coalesce((v_item->>'unit_price')::numeric, 0);
      end if;
      if v_line_amount = 0 and (v_item->>'corrected_discount') is not null and (v_item->>'original_discount') is not null then
        v_line_amount := (v_item->>'corrected_discount')::numeric - (v_item->>'original_discount')::numeric;
      end if;
      if v_line_amount = 0 and (v_item->>'corrected_tax') is not null and (v_item->>'original_tax') is not null then
        v_line_amount := (v_item->>'corrected_tax')::numeric - (v_item->>'original_tax')::numeric;
      end if;

      insert into debit_note_items (
        company_id, debit_note_id, original_invoice_item_id, product_id, variant_id, description, uom_id, quantity, unit_price,
        original_price, corrected_price, price_difference, original_quantity, corrected_quantity, quantity_difference,
        original_discount, corrected_discount, discount_difference, original_tax, corrected_tax, tax_difference,
        adjustment_amount, reason_id, item_notes, sequence
      ) values (
        v_company_id, v_id, (v_item->>'invoice_item_id')::uuid, (v_item->>'product_id')::uuid, (v_item->>'variant_id')::uuid,
        v_item->>'description', (v_item->>'uom_id')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
        (v_item->>'original_price')::numeric, (v_item->>'corrected_price')::numeric,
        case when (v_item->>'corrected_price') is not null then (v_item->>'corrected_price')::numeric - (v_item->>'original_price')::numeric end,
        (v_item->>'original_quantity')::numeric, (v_item->>'corrected_quantity')::numeric,
        case when (v_item->>'corrected_quantity') is not null then (v_item->>'corrected_quantity')::numeric - (v_item->>'original_quantity')::numeric end,
        (v_item->>'original_discount')::numeric, (v_item->>'corrected_discount')::numeric,
        case when (v_item->>'corrected_discount') is not null then (v_item->>'corrected_discount')::numeric - (v_item->>'original_discount')::numeric end,
        (v_item->>'original_tax')::numeric, (v_item->>'corrected_tax')::numeric,
        case when (v_item->>'corrected_tax') is not null then (v_item->>'corrected_tax')::numeric - (v_item->>'original_tax')::numeric end,
        v_line_amount,
        coalesce((select id from financial_adjustment_reasons where code = v_item->>'reason_code' and (company_id is null or company_id = v_company_id) order by company_id nulls last limit 1), v_reason_id),
        v_item->>'item_notes', v_seq
      );

      v_net := v_net + v_line_amount;
      v_gross := v_gross + abs(v_line_amount);
    end loop;
  end if;

  update debit_notes set gross_amount = v_gross, tax_amount = 0, discount_amount = 0, net_amount = v_net where id = v_id;

  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, changed_by)
  values (v_company_id, 'debit_notes', v_id, null, v_initial_status, auth.uid());

  return v_id;
end;
$$;
grant execute on function create_debit_note_draft(
  text, uuid, text, jsonb, numeric, uuid, text, text, text, text, text, text, uuid, uuid, uuid, text, boolean
) to authenticated;
