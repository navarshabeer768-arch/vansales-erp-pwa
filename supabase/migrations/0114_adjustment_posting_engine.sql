-- ============================================================================
-- 0114_adjustment_posting_engine.sql
-- Continues 0113.
-- ============================================================================

alter table customer_unallocated_credits alter column receipt_id drop not null;
alter table customer_unallocated_credits add column if not exists credit_note_id uuid references credit_notes(id) on delete restrict;
alter table customer_unallocated_credits drop constraint if exists customer_unallocated_credits_source_check;
alter table customer_unallocated_credits add constraint customer_unallocated_credits_source_check check (
  (receipt_id is not null and credit_note_id is null) or (receipt_id is null and credit_note_id is not null)
);

create table credit_note_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  credit_note_id uuid not null references credit_notes(id) on delete restrict,
  ledger_transaction_id uuid,
  invoice_credited_amount numeric(14,2) not null default 0,
  unallocated_amount numeric(14,2) not null default 0,
  unallocated_credit_id uuid references customer_unallocated_credits(id) on delete set null,
  posted_by uuid references app_users(id),
  posted_at timestamptz not null default now(),
  reversed boolean not null default false
);
create index idx_credit_note_postings_note on credit_note_postings(credit_note_id);

alter table credit_note_postings enable row level security;
create policy credit_note_postings_isolation on credit_note_postings for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table debit_note_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  debit_note_id uuid not null references debit_notes(id) on delete restrict,
  ledger_transaction_id uuid,
  posted_by uuid references app_users(id),
  posted_at timestamptz not null default now(),
  reversed boolean not null default false
);
create index idx_debit_note_postings_note on debit_note_postings(debit_note_id);

alter table debit_note_postings enable row level security;
create policy debit_note_postings_isolation on debit_note_postings for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_adjustment_posting_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  attempt_number integer not null default 1,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  final_document_number text,
  ledger_transaction_id uuid,
  attempted_by uuid references app_users(id),
  attempted_at timestamptz not null default now(),
  device_uid text,
  online boolean not null default true
);
create index idx_customer_adjustment_posting_history_document on customer_adjustment_posting_history(document_table, document_id);

alter table customer_adjustment_posting_history enable row level security;
create policy customer_adjustment_posting_history_isolation on customer_adjustment_posting_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function post_credit_note(p_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_doc credit_notes%rowtype;
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_outstanding_before numeric;
  v_credited_amount numeric := 0;
  v_unallocated_amount numeric := 0;
  v_unallocated_id uuid;
  v_ledger_id uuid;
  v_attempt integer;
begin
  if not has_permission('financial_adjustments:post_credit_note') then raise exception 'Not permitted'; end if;
  select * into v_doc from credit_notes where id = p_id and company_id = current_company_id() for update;
  if not found then raise exception 'Credit note not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from customer_adjustment_posting_history where document_table = 'credit_notes' and document_id = p_id;

  if v_doc.posting_status = 'posted' then raise exception 'Credit note already posted'; end if;
  if v_doc.status = 'cancelled' then raise exception 'Cancelled credit notes cannot be posted'; end if;
  if v_doc.status = 'reversed' then raise exception 'Reversed credit notes cannot be posted again'; end if;
  if v_doc.is_on_hold then raise exception 'Held credit notes cannot be posted'; end if;
  if v_doc.status != 'ready_to_post' and v_doc.status != 'posting_failed' then raise exception 'Credit note must be approved and ready to post (currently %)', v_doc.status; end if;
  if v_doc.approval_status not in ('approved', 'not_required') then raise exception 'Credit note approval is not complete (status: %)', v_doc.approval_status; end if;

  begin
    update credit_notes set status = 'posting', posting_status = 'posting' where id = p_id;

    select * into v_customer from customers where id = v_doc.customer_id;
    if v_customer.status = 'deleted' then raise exception 'Customer % has been deleted', v_customer.business_name; end if;

    if v_doc.final_number_generated_at is null then
      update credit_notes set final_number_generated_at = now(), final_number_generated_by = auth.uid() where id = p_id;
    end if;

    if v_doc.original_invoice_id is not null then
      select * into v_invoice from sales_invoices where id = v_doc.original_invoice_id;
      v_outstanding_before := v_invoice.net_amount - v_invoice.paid_amount - v_invoice.credited_amount;
      v_credited_amount := least(v_doc.net_amount, greatest(v_outstanding_before, 0));

      if v_credited_amount > 0 then
        update sales_invoices set
          credited_amount = credited_amount + v_credited_amount,
          payment_status = case when (net_amount - paid_amount - credited_amount - v_credited_amount) <= 0.001 then 'paid' else payment_status end
        where id = v_doc.original_invoice_id;
      end if;
    end if;

    v_unallocated_amount := v_doc.net_amount - v_credited_amount;

    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_doc.company_id, v_doc.customer_id, 'credit_note', 'credit_notes', p_id, 0, v_doc.net_amount, v_doc.document_date, format('Credit note %s', v_doc.document_number))
    returning id into v_ledger_id;

    update customers set outstanding_balance = greatest(outstanding_balance - v_doc.net_amount, 0) where id = v_doc.customer_id;

    if v_unallocated_amount > 0.001 then
      insert into customer_unallocated_credits (company_id, customer_id, credit_note_id, original_amount, available_amount, reason, status)
      values (v_doc.company_id, v_doc.customer_id, p_id, v_unallocated_amount, v_unallocated_amount, format('Unallocated balance from credit note %s', v_doc.document_number), 'available')
      returning id into v_unallocated_id;
    end if;

    insert into credit_note_postings (company_id, credit_note_id, ledger_transaction_id, invoice_credited_amount, unallocated_amount, unallocated_credit_id, posted_by)
    values (v_doc.company_id, p_id, v_ledger_id, v_credited_amount, v_unallocated_amount, v_unallocated_id, auth.uid());

    update credit_notes set status = 'posted', posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_id;

    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, final_document_number, ledger_transaction_id, attempted_by, device_uid, online)
    values (v_doc.company_id, 'credit_notes', p_id, v_attempt, 'succeeded', v_doc.document_number, v_ledger_id, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_document_number', v_doc.document_number, 'invoice_credited', v_credited_amount, 'unallocated', v_unallocated_amount);

  exception when others then
    update credit_notes set status = 'posting_failed', posting_status = 'posting_failed' where id = p_id;
    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_doc.company_id, 'credit_notes', p_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_credit_note(uuid, text, boolean) to authenticated;

create or replace function post_debit_note(p_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_doc debit_notes%rowtype;
  v_customer customers%rowtype;
  v_ledger_id uuid;
  v_attempt integer;
begin
  if not has_permission('financial_adjustments:post_debit_note') then raise exception 'Not permitted'; end if;
  select * into v_doc from debit_notes where id = p_id and company_id = current_company_id() for update;
  if not found then raise exception 'Debit note not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from customer_adjustment_posting_history where document_table = 'debit_notes' and document_id = p_id;

  if v_doc.posting_status = 'posted' then raise exception 'Debit note already posted'; end if;
  if v_doc.status = 'cancelled' then raise exception 'Cancelled debit notes cannot be posted'; end if;
  if v_doc.status = 'reversed' then raise exception 'Reversed debit notes cannot be posted again'; end if;
  if v_doc.is_on_hold then raise exception 'Held debit notes cannot be posted'; end if;
  if v_doc.status != 'ready_to_post' and v_doc.status != 'posting_failed' then raise exception 'Debit note must be approved and ready to post (currently %)', v_doc.status; end if;
  if v_doc.approval_status not in ('approved', 'not_required') then raise exception 'Debit note approval is not complete (status: %)', v_doc.approval_status; end if;

  begin
    update debit_notes set status = 'posting', posting_status = 'posting' where id = p_id;

    select * into v_customer from customers where id = v_doc.customer_id;
    if v_customer.status = 'deleted' then raise exception 'Customer % has been deleted', v_customer.business_name; end if;

    if v_doc.final_number_generated_at is null then
      update debit_notes set final_number_generated_at = now(), final_number_generated_by = auth.uid() where id = p_id;
    end if;

    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_doc.company_id, v_doc.customer_id, 'debit_note', 'debit_notes', p_id, v_doc.net_amount, 0, v_doc.document_date, format('Debit note %s', v_doc.document_number))
    returning id into v_ledger_id;

    update customers set outstanding_balance = outstanding_balance + v_doc.net_amount where id = v_doc.customer_id;

    insert into debit_note_postings (company_id, debit_note_id, ledger_transaction_id, posted_by)
    values (v_doc.company_id, p_id, v_ledger_id, auth.uid());

    update debit_notes set status = 'posted', posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_id;

    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, final_document_number, ledger_transaction_id, attempted_by, device_uid, online)
    values (v_doc.company_id, 'debit_notes', p_id, v_attempt, 'succeeded', v_doc.document_number, v_ledger_id, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_document_number', v_doc.document_number);

  exception when others then
    update debit_notes set status = 'posting_failed', posting_status = 'posting_failed' where id = p_id;
    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_doc.company_id, 'debit_notes', p_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_debit_note(uuid, text, boolean) to authenticated;

create or replace function post_customer_adjustment(p_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_doc customer_adjustments%rowtype;
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_outstanding_before numeric;
  v_credited_amount numeric := 0;
  v_unallocated_amount numeric := 0;
  v_ledger_id uuid;
  v_attempt integer;
begin
  if not has_permission('financial_adjustments:create_adjustment') then raise exception 'Not permitted'; end if;
  select * into v_doc from customer_adjustments where id = p_id and company_id = current_company_id() for update;
  if not found then raise exception 'Customer adjustment not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from customer_adjustment_posting_history where document_table = 'customer_adjustments' and document_id = p_id;

  if v_doc.posting_status = 'posted' then raise exception 'Adjustment already posted'; end if;
  if v_doc.status = 'cancelled' then raise exception 'Cancelled adjustments cannot be posted'; end if;
  if v_doc.status = 'reversed' then raise exception 'Reversed adjustments cannot be posted again'; end if;
  if v_doc.is_on_hold then raise exception 'Held adjustments cannot be posted'; end if;
  if v_doc.status != 'ready_to_post' and v_doc.status != 'posting_failed' then raise exception 'Adjustment must be approved and ready to post (currently %)', v_doc.status; end if;
  if v_doc.approval_status not in ('approved', 'not_required') then raise exception 'Adjustment approval is not complete (status: %)', v_doc.approval_status; end if;

  begin
    update customer_adjustments set status = 'posting', posting_status = 'posting' where id = p_id;

    select * into v_customer from customers where id = v_doc.customer_id;
    if v_customer.status = 'deleted' then raise exception 'Customer % has been deleted', v_customer.business_name; end if;

    if v_doc.final_number_generated_at is null then
      update customer_adjustments set final_number_generated_at = now(), final_number_generated_by = auth.uid() where id = p_id;
    end if;

    select * into v_invoice from sales_invoices where id = v_doc.original_invoice_id;

    if v_doc.net_direction = 'credit' then
      v_outstanding_before := v_invoice.net_amount - v_invoice.paid_amount - v_invoice.credited_amount;
      v_credited_amount := least(v_doc.net_amount, greatest(v_outstanding_before, 0));
      v_unallocated_amount := v_doc.net_amount - v_credited_amount;

      if v_credited_amount > 0 then
        update sales_invoices set
          credited_amount = credited_amount + v_credited_amount,
          payment_status = case when (net_amount - paid_amount - credited_amount - v_credited_amount) <= 0.001 then 'paid' else payment_status end
        where id = v_doc.original_invoice_id;
      end if;

      insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
      values (v_doc.company_id, v_doc.customer_id, 'adjustment', 'customer_adjustments', p_id, 0, v_doc.net_amount, v_doc.document_date, format('Adjustment %s', v_doc.document_number))
      returning id into v_ledger_id;

      update customers set outstanding_balance = greatest(outstanding_balance - v_doc.net_amount, 0) where id = v_doc.customer_id;

      if v_unallocated_amount > 0.001 then
        insert into customer_unallocated_credits (company_id, customer_id, original_amount, available_amount, reason, status)
        values (v_doc.company_id, v_doc.customer_id, v_unallocated_amount, v_unallocated_amount, format('Unallocated balance from adjustment %s', v_doc.document_number), 'available');
      end if;
    else
      insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
      values (v_doc.company_id, v_doc.customer_id, 'adjustment', 'customer_adjustments', p_id, v_doc.net_amount, 0, v_doc.document_date, format('Adjustment %s', v_doc.document_number))
      returning id into v_ledger_id;

      update customers set outstanding_balance = outstanding_balance + v_doc.net_amount where id = v_doc.customer_id;
    end if;

    update customer_adjustments set status = 'posted', posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_id;

    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, final_document_number, ledger_transaction_id, attempted_by, device_uid, online)
    values (v_doc.company_id, 'customer_adjustments', p_id, v_attempt, 'succeeded', v_doc.document_number, v_ledger_id, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_document_number', v_doc.document_number, 'invoice_credited', v_credited_amount, 'unallocated', v_unallocated_amount);

  exception when others then
    update customer_adjustments set status = 'posting_failed', posting_status = 'posting_failed' where id = p_id;
    insert into customer_adjustment_posting_history (company_id, document_table, document_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_doc.company_id, 'customer_adjustments', p_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_customer_adjustment(uuid, text, boolean) to authenticated;

create or replace function retry_failed_adjustment_posting(p_document_table text, p_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_status text; v_status_fn text; v_result jsonb;
begin
  if not has_permission('financial_adjustments:post_credit_note') and not has_permission('financial_adjustments:post_debit_note') then raise exception 'Not permitted'; end if;
  if p_document_table not in ('credit_notes', 'debit_notes', 'customer_adjustments') then raise exception 'Unknown document table'; end if;

  execute format('select status from %I where id = $1', p_document_table) into v_status using p_id;
  if v_status != 'posting_failed' then raise exception 'Only documents with a failed posting attempt can be retried'; end if;

  v_status_fn := case p_document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;
  execute format('select %s($1, $2, $3)', v_status_fn) using p_id, 'ready_to_post', 'Retrying failed posting';

  if p_document_table = 'credit_notes' then
    v_result := post_credit_note(p_id);
  elsif p_document_table = 'debit_notes' then
    v_result := post_debit_note(p_id);
  else
    v_result := post_customer_adjustment(p_id);
  end if;

  return v_result;
end;
$$;
grant execute on function retry_failed_adjustment_posting(text, uuid) to authenticated;
