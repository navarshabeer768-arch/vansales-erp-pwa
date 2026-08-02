-- ============================================================================
-- 0066_invoice_status_model_and_stock_validation.sql
-- Phase 5B.1 Part 2: Stock Posting, Credit Posting, Invoice Approvals,
-- Final Invoice Posting, Printing, Offline Invoice Control.
-- ============================================================================

alter table sales_invoices drop constraint if exists sales_invoices_status_check;
alter table sales_invoices add constraint sales_invoices_status_check check (status in (
  'draft', 'pending_validation', 'validation_failed', 'pending_submission', 'pending_approval',
  'partially_approved', 'approved', 'returned_for_correction', 'on_hold', 'ready_to_post',
  'posting', 'posted', 'posting_failed', 'cancelled_before_posting', 'void_requested', 'voided',
  'sync_pending', 'sync_failed', 'conflict', 'submitted', 'expired'
));

alter table sales_invoices drop constraint if exists sales_invoices_posting_status_check;
alter table sales_invoices add constraint sales_invoices_posting_status_check check (posting_status in (
  'not_posted', 'posting', 'posted', 'posting_failed', 'reversal_pending', 'reversed'
));

alter table sales_invoices add column if not exists is_on_hold boolean not null default false;
alter table sales_invoices add column if not exists payment_classification text not null default 'cash' check (payment_classification in ('cash', 'credit', 'hybrid'));
alter table sales_invoices add column if not exists final_number_generated_at timestamptz;
alter table sales_invoices add column if not exists final_number_generated_by uuid references app_users(id);
alter table sales_invoices add column if not exists due_date date;
alter table sales_invoices add column if not exists due_date_credit_days integer;
alter table sales_invoices add column if not exists due_date_grace_days integer;
alter table sales_invoices add column if not exists due_date_manual_override boolean not null default false;
alter table sales_invoices add column if not exists due_date_override_reason text;
alter table sales_invoices add column if not exists stock_source_type text check (stock_source_type in (
  'van_stock', 'warehouse_stock', 'specific_warehouse', 'specific_van', 'reserved_sales_order_stock', 'combined'
) or stock_source_type is null);
alter table sales_invoices add column if not exists source_warehouse_id uuid references warehouses(id) on delete set null;
alter table sales_invoices add column if not exists source_van_id uuid references vans(id) on delete set null;
alter table sales_invoices add column if not exists allocation_method text not null default 'fefo' check (allocation_method in ('fifo', 'fefo', 'manual'));
alter table sales_invoices add column if not exists stock_validation_status text not null default 'not_validated' check (stock_validation_status in (
  'not_validated', 'valid', 'partially_available', 'unavailable', 'reservation_invalid', 'batch_conflict', 'serial_conflict', 'validation_expired'
));
alter table sales_invoices add column if not exists stock_last_validated_at timestamptz;
alter table sales_invoices add column if not exists stock_validated_by uuid references app_users(id);
alter table sales_invoices add column if not exists credit_validation_status text not null default 'not_validated' check (credit_validation_status in (
  'not_validated', 'valid', 'warning', 'near_limit', 'over_limit', 'blocked', 'override_pending', 'override_approved', 'conflict'
));
alter table sales_invoices add column if not exists approval_status text not null default 'not_required';
alter table sales_invoices add column if not exists version integer not null default 1;

create or replace function change_sales_invoice_status(p_invoice_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_invoices where id = p_invoice_id;
  if v_old is null then raise exception 'Invoice not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_validation' then p_new_status in ('validation_failed', 'pending_submission', 'pending_approval', 'ready_to_post', 'cancelled_before_posting')
    when 'validation_failed' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'pending_submission' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled_before_posting', 'draft')
    when 'pending_approval' then p_new_status in ('partially_approved', 'approved', 'returned_for_correction', 'on_hold', 'cancelled_before_posting')
    when 'partially_approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'approved' then p_new_status in ('ready_to_post', 'on_hold', 'cancelled_before_posting')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled_before_posting')
    when 'on_hold' then p_new_status in ('pending_approval', 'approved', 'ready_to_post', 'cancelled_before_posting')
    when 'ready_to_post' then p_new_status in ('posting', 'on_hold', 'cancelled_before_posting')
    when 'posting' then p_new_status in ('posted', 'posting_failed')
    when 'posting_failed' then p_new_status in ('ready_to_post', 'cancelled_before_posting')
    when 'posted' then p_new_status in ('void_requested')
    when 'void_requested' then p_new_status in ('voided', 'posted')
    when 'sync_pending' then p_new_status in ('pending_validation', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled_before_posting')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
    when 'submitted' then p_new_status in ('pending_validation', 'pending_approval', 'ready_to_post', 'cancelled_before_posting')
    when 'expired' then p_new_status in ('draft')
    when 'cancelled_before_posting' then false
    when 'voided' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move invoice from % to %', v_old, p_new_status; end if;

  update sales_invoices set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_invoice_id;
  insert into sales_invoice_status_history (company_id, invoice_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_invoice_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_sales_invoice_status(uuid, text, text) to authenticated;

create table sales_invoice_stock_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_item_id uuid references sales_invoice_items(id) on delete cascade,
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  requested_base_quantity numeric(14,3) not null,
  available_quantity numeric(14,3) not null default 0,
  reserved_quantity numeric(14,3) not null default 0,
  short_quantity numeric(14,3) not null default 0,
  status text not null check (status in (
    'not_validated', 'valid', 'partially_available', 'unavailable', 'reservation_invalid', 'batch_conflict', 'serial_conflict', 'validation_expired'
  )),
  validation_message text,
  validated_by uuid references app_users(id),
  validated_at timestamptz not null default now()
);
create index idx_sales_invoice_stock_validations_invoice on sales_invoice_stock_validations(invoice_id);

alter table sales_invoice_stock_validations enable row level security;
create policy sales_invoice_stock_validations_isolation on sales_invoice_stock_validations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function validate_invoice_stock(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_item record;
  v_location_type text;
  v_location_id uuid;
  v_atp record;
  v_reservation sales_order_stock_reservations%rowtype;
  v_status text;
  v_any_short boolean := false;
  v_any_available boolean := false;
  v_overall text;
begin
  if not has_permission('sales_invoices:validate_stock') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;

  delete from sales_invoice_stock_validations where invoice_id = p_invoice_id;

  v_location_type := case when v_invoice.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_invoice.source_van_id, v_invoice.van_id) else coalesce(v_invoice.source_warehouse_id, v_invoice.warehouse_id) end;

  for v_item in select * from sales_invoice_items where invoice_id = p_invoice_id and not is_free_item and item_status = 'active' loop
    if v_item.order_item_id is not null then
      select * into v_reservation from sales_order_stock_reservations
      where order_item_id = v_item.order_item_id and status in ('active', 'partially_reserved', 'fully_reserved')
      order by created_at desc limit 1;

      if v_reservation.id is not null then
        if v_reservation.remaining_quantity >= v_item.base_quantity then
          v_status := 'valid'; v_any_available := true;
        elsif v_reservation.remaining_quantity > 0 then
          v_status := 'partially_available'; v_any_short := true; v_any_available := true;
        else
          v_status := 'reservation_invalid'; v_any_short := true;
        end if;

        insert into sales_invoice_stock_validations (
          company_id, invoice_id, invoice_item_id, location_type, location_id, requested_base_quantity,
          available_quantity, reserved_quantity, short_quantity, status, validation_message, validated_by
        ) values (
          v_invoice.company_id, p_invoice_id, v_item.id, v_reservation.location_type, v_reservation.location_id, v_item.base_quantity,
          v_reservation.remaining_quantity, v_reservation.remaining_quantity, greatest(v_item.base_quantity - v_reservation.remaining_quantity, 0),
          v_status, format('Reservation has %.3f remaining of %.3f requested', v_reservation.remaining_quantity, v_item.base_quantity), auth.uid()
        );
        continue;
      end if;
    end if;

    if v_location_id is null then
      v_status := 'unavailable'; v_any_short := true;
      insert into sales_invoice_stock_validations (
        company_id, invoice_id, invoice_item_id, location_type, location_id, requested_base_quantity, status, validation_message, validated_by
      ) values (v_invoice.company_id, p_invoice_id, v_item.id, v_location_type, '00000000-0000-0000-0000-000000000000', v_item.base_quantity, v_status, 'No stock source location configured', auth.uid());
      continue;
    end if;

    select * into v_atp from calculate_available_to_promise(v_location_type, v_location_id, v_item.product_id);

    if v_atp.available_to_promise >= v_item.base_quantity then
      v_status := 'valid'; v_any_available := true;
    elsif v_atp.available_to_promise > 0 then
      v_status := 'partially_available'; v_any_short := true; v_any_available := true;
    else
      v_status := 'unavailable'; v_any_short := true;
    end if;

    insert into sales_invoice_stock_validations (
      company_id, invoice_id, invoice_item_id, location_type, location_id, requested_base_quantity,
      available_quantity, reserved_quantity, short_quantity, status, validation_message, validated_by
    ) values (
      v_invoice.company_id, p_invoice_id, v_item.id, v_location_type, v_location_id, v_item.base_quantity,
      v_atp.available_to_promise, 0, greatest(v_item.base_quantity - v_atp.available_to_promise, 0), v_status,
      format('Available %.3f of requested %.3f', v_atp.available_to_promise, v_item.base_quantity), auth.uid()
    );
  end loop;

  v_overall := case
    when v_any_short and not v_any_available then 'unavailable'
    when v_any_short then 'partially_available'
    else 'valid'
  end;

  update sales_invoices set stock_validation_status = v_overall, stock_last_validated_at = now(), stock_validated_by = auth.uid() where id = p_invoice_id;
end;
$$;
grant execute on function validate_invoice_stock(uuid) to authenticated;
