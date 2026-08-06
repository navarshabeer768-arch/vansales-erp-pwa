-- ============================================================================
-- 0106_adjustment_shared_polymorphic_tables.sql
-- Continues 0105.
--
-- adjustment_status_history/adjustment_notes/adjustment_sync_status/
-- adjustment_sync_conflicts are named singular (not per-document-type)
-- in the doc — built here as shared tables keyed by
-- (document_table, document_id) rather than three duplicated copies.
-- current_company_id() already exists (0001) — reused, not redeclared.
-- ============================================================================

create table adjustment_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  old_status text,
  new_status text not null,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_adjustment_status_history_document on adjustment_status_history(document_table, document_id);

alter table adjustment_status_history enable row level security;
create policy adjustment_status_history_isolation on adjustment_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table adjustment_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  note text not null,
  note_type text not null default 'general' check (note_type in ('general', 'customer', 'internal')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_adjustment_notes_document on adjustment_notes(document_table, document_id);

alter table adjustment_notes enable row level security;
create policy adjustment_notes_isolation on adjustment_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table adjustment_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'local_draft' check (status in (
    'local_draft', 'pending_upload', 'uploading', 'uploaded', 'pending_revalidation',
    'returned_for_correction', 'synced', 'sync_failed', 'conflict'
  )),
  last_error text,
  uploaded_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (document_table, document_id, device_id)
);

alter table adjustment_sync_status enable row level security;
create policy adjustment_sync_status_isolation on adjustment_sync_status for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table adjustment_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  device_id uuid references devices(id) on delete set null,
  conflict_type text not null check (conflict_type in (
    'invoice_voided', 'invoice_reversed', 'customer_changed', 'product_deactivated', 'duplicate_document',
    'amount_recalculated', 'return_already_processed', 'reason_deactivated'
  )),
  conflict_details jsonb not null default '{}',
  resolution text check (resolution in (
    'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version'
  ) or resolution is null),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_adjustment_sync_conflicts_document on adjustment_sync_conflicts(document_table, document_id);
create index idx_adjustment_sync_conflicts_status on adjustment_sync_conflicts(company_id, status);

alter table adjustment_sync_conflicts enable row level security;
create policy adjustment_sync_conflicts_isolation on adjustment_sync_conflicts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function invoice_eligible_for_adjustment(p_invoice_id uuid, p_customer_id uuid)
returns boolean language plpgsql stable as $$
declare v_invoice sales_invoices%rowtype;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  if not found then return false; end if;
  if v_invoice.posting_status != 'posted' then return false; end if;
  if v_invoice.status in ('void_requested', 'voided') then return false; end if;
  if v_invoice.customer_id != p_customer_id then return false; end if;
  if v_invoice.company_id != current_company_id() then return false; end if;
  return true;
end;
$$;
grant execute on function invoice_eligible_for_adjustment(uuid, uuid) to authenticated;

create or replace function invoice_items_for_adjustment(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, sku text, uom_label text,
  invoice_quantity numeric, base_quantity numeric, unit_price numeric, discount_amount numeric,
  tax_amount numeric, tax_rate numeric, tax_inclusive boolean, is_free_item boolean
) language plpgsql stable as $$
begin
  return query
  select sii.id, sii.product_id, p.name, p.sku, coalesce(u.code, 'unit'),
    sii.invoice_quantity, sii.base_quantity, sii.applied_price, sii.discount_amount,
    sii.tax_amount, sii.tax_rate, sii.tax_inclusive, sii.is_free_item
  from sales_invoice_items sii
  join products p on p.id = sii.product_id
  left join units u on u.id = sii.uom_id
  where sii.invoice_id = p_invoice_id
  order by sii.sequence;
end;
$$;
grant execute on function invoice_items_for_adjustment(uuid) to authenticated;
