-- ============================================================================
-- 0071_post_sales_invoice.sql
-- Continues 0066-0070. The centerpiece function of this phase.
--
-- Reuses stock_movements (Phase 1, movement_type='sale_out') and
-- customer_ledger_transactions (4A.2 Part 2, transaction_type='sales_invoice').
-- customer_ledger_transactions already has a trigger
-- (apply_ledger_transaction, attached since 0037) that automatically
-- maintains customer_ledger.current_balance on insert — this function
-- only ever inserts a transaction row and lets that trigger do the
-- balance math, rather than updating the balance a second time itself.
-- ============================================================================

create table sales_invoice_posting_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  final_invoice_number text,
  attempted_by uuid references app_users(id),
  attempted_at timestamptz not null default now(),
  device_uid text,
  online boolean not null default true
);
create index idx_sales_invoice_posting_history_invoice on sales_invoice_posting_history(invoice_id);

alter table sales_invoice_posting_history enable row level security;
create policy sales_invoice_posting_history_isolation on sales_invoice_posting_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function calculate_invoice_due_date(p_invoice_id uuid, p_manual_date date default null, p_override_reason text default null)
returns date language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_term payment_terms%rowtype;
  v_due date;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id;

  if p_manual_date is not null then
    if not has_permission('sales_invoices:change_tax_date') then raise exception 'Not permitted to manually set the due date'; end if;
    update sales_invoices set due_date = p_manual_date, due_date_manual_override = true, due_date_override_reason = p_override_reason where id = p_invoice_id;
    return p_manual_date;
  end if;

  select * into v_term from payment_terms where id = v_invoice.payment_term_id;
  v_due := v_invoice.invoice_date + coalesce(v_term.credit_days, 0) * interval '1 day' + coalesce(v_term.grace_days, 0) * interval '1 day';

  update sales_invoices set due_date = v_due, due_date_credit_days = v_term.credit_days, due_date_grace_days = v_term.grace_days, due_date_manual_override = false where id = p_invoice_id;
  return v_due;
end;
$$;
grant execute on function calculate_invoice_due_date(uuid, date, text) to authenticated;

create or replace function post_sales_invoice(p_invoice_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_item record;
  v_final_number text;
  v_invoice_type sales_invoice_types%rowtype;
  v_due_date date;
  v_movement_type text := 'sale_out';
  v_attempt integer;
  v_credit_amount numeric;
begin
  if not has_permission('sales_invoices:post_invoice') then raise exception 'Not permitted'; end if;

  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id() for update;
  if not found then raise exception 'Invoice not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from sales_invoice_posting_history where invoice_id = p_invoice_id;

  if v_invoice.posting_status = 'posted' then raise exception 'Invoice already posted'; end if;
  if v_invoice.status = 'cancelled_before_posting' then raise exception 'Cancelled invoices cannot be posted'; end if;
  if v_invoice.is_on_hold or v_invoice.status = 'on_hold' then raise exception 'Held invoices cannot be posted'; end if;
  if v_invoice.status not in ('approved', 'ready_to_post', 'posting_failed') then
    raise exception 'Invoice must be approved and ready to post (currently %)', v_invoice.status;
  end if;

  begin
    update sales_invoices set status = 'posting', posting_status = 'posting' where id = p_invoice_id;

    select * into v_customer from customers where id = v_invoice.customer_id;
    if v_invoice.customer_id is not null and v_customer.status != 'active' then
      raise exception 'Customer % is not active', v_customer.business_name;
    end if;

    perform validate_invoice_stock(p_invoice_id);
    select stock_validation_status into v_invoice.stock_validation_status from sales_invoices where id = p_invoice_id;
    if v_invoice.stock_validation_status not in ('valid', 'partially_available') then
      raise exception 'Stock validation failed: %', v_invoice.stock_validation_status;
    end if;

    if v_invoice.payment_type in ('credit', 'hybrid') then
      perform validate_invoice_credit(p_invoice_id);
      select credit_validation_status into v_invoice.credit_validation_status from sales_invoices where id = p_invoice_id;
      if v_invoice.credit_validation_status not in ('valid', 'warning', 'override_approved') then
        raise exception 'Credit validation failed: %', v_invoice.credit_validation_status;
      end if;
    end if;

    if v_invoice.approval_status not in ('approved', 'skipped_by_rule') then
      raise exception 'Invoice approval is not complete (status: %)', v_invoice.approval_status;
    end if;

    select * into v_invoice_type from sales_invoice_types where id = v_invoice.invoice_type_id;
    if v_invoice.final_invoice_number is null then
      v_final_number := next_sales_invoice_no(v_invoice_type.code);
      update sales_invoices set final_invoice_number = v_final_number, final_number_generated_at = now(), final_number_generated_by = auth.uid()
      where id = p_invoice_id;
    else
      v_final_number := v_invoice.final_invoice_number;
    end if;

    for v_item in select * from sales_invoice_items where invoice_id = p_invoice_id and not is_free_item and item_status = 'active' loop
      perform allocate_invoice_item_stock(v_item.id);

      insert into stock_movements (
        company_id, product_id, batch_id, movement_type, from_location_type, from_location_id, to_location_type, to_location_id,
        quantity, reference_table, reference_id, notes, created_by
      )
      select
        v_invoice.company_id, v_item.product_id,
        (select batch_id from sales_invoice_item_batches ib join sales_invoice_stock_allocations a on a.id = ib.allocation_id where a.invoice_item_id = v_item.id limit 1),
        v_movement_type,
        case when v_invoice.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end,
        coalesce(v_invoice.source_van_id, v_invoice.source_warehouse_id, v_invoice.van_id, v_invoice.warehouse_id),
        'customer', v_invoice.customer_id, v_item.base_quantity, 'sales_invoices', p_invoice_id,
        format('Invoice %s', coalesce(v_final_number, v_invoice.invoice_number)), auth.uid();
    end loop;

    if v_invoice.payment_type in ('credit', 'hybrid') and v_invoice.customer_id is not null then
      perform consume_credit_reservation_for_invoice(p_invoice_id);

      v_due_date := calculate_invoice_due_date(p_invoice_id);
      v_credit_amount := case when v_invoice.payment_type = 'hybrid' then v_invoice.expected_credit_portion else v_invoice.net_amount end;

      insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
      values (
        v_invoice.company_id, v_invoice.customer_id, 'sales_invoice', 'sales_invoices', p_invoice_id,
        v_credit_amount, 0, v_invoice.invoice_date, format('Invoice %s', coalesce(v_final_number, v_invoice.invoice_number))
      );
    end if;

    update sales_invoices set
      status = 'posted', posting_status = 'posted', posted_by = auth.uid(), posted_date = now()
    where id = p_invoice_id;

    insert into sales_invoice_posting_history (company_id, invoice_id, attempt_number, status, final_invoice_number, attempted_by, device_uid, online)
    values (v_invoice.company_id, p_invoice_id, v_attempt, 'succeeded', v_final_number, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_invoice_number', v_final_number, 'invoice_id', p_invoice_id);

  exception when others then
    update sales_invoices set status = 'posting_failed', posting_status = 'posting_failed' where id = p_invoice_id;
    insert into sales_invoice_posting_history (company_id, invoice_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_invoice.company_id, p_invoice_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_sales_invoice(uuid, text, boolean) to authenticated;

create or replace function retry_failed_invoice_posting(p_invoice_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not has_permission('sales_invoices:retry_failed_posting') then raise exception 'Not permitted'; end if;
  if (select status from sales_invoices where id = p_invoice_id) != 'posting_failed' then
    raise exception 'Only invoices with a failed posting attempt can be retried';
  end if;
  update sales_invoices set status = 'ready_to_post' where id = p_invoice_id;
  return post_sales_invoice(p_invoice_id);
end;
$$;
grant execute on function retry_failed_invoice_posting(uuid) to authenticated;
