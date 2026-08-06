-- ============================================================================
-- 0115_adjustment_allocation_cancellation_reversal.sql
-- Continues 0113-0114.
-- ============================================================================

create or replace function allocate_credit_note_unallocated_credit(p_unallocated_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid language plpgsql security definer as $$
declare
  v_unallocated customer_unallocated_credits%rowtype;
  v_outstanding_before numeric;
  v_allocation_id uuid;
begin
  if not has_permission('financial_adjustments:allocate_credits') then raise exception 'Not permitted'; end if;
  select * into v_unallocated from customer_unallocated_credits where id = p_unallocated_id for update;
  if not found then raise exception 'Unallocated credit not found'; end if;
  if v_unallocated.status not in ('available', 'partially_allocated') then raise exception 'Unallocated credit is % and cannot be allocated', v_unallocated.status; end if;
  if p_amount > v_unallocated.available_amount + 0.001 then raise exception 'Amount exceeds available unallocated credit of %', v_unallocated.available_amount; end if;

  v_outstanding_before := revalidate_invoice_allocation(p_invoice_id, v_unallocated.customer_id, p_amount);

  insert into customer_unallocated_allocations (
    company_id, unallocated_id, invoice_id, allocated_amount, unallocated_balance_before, unallocated_balance_after,
    invoice_outstanding_before, invoice_outstanding_after, allocated_by
  ) values (
    v_unallocated.company_id, p_unallocated_id, p_invoice_id, p_amount, v_unallocated.available_amount, v_unallocated.available_amount - p_amount,
    v_outstanding_before, v_outstanding_before - p_amount, auth.uid()
  ) returning id into v_allocation_id;

  update customer_unallocated_credits set
    available_amount = available_amount - p_amount, allocated_amount = allocated_amount + p_amount,
    status = case when available_amount - p_amount <= 0.001 then 'fully_allocated' else 'partially_allocated' end
  where id = p_unallocated_id;

  update sales_invoices set
    credited_amount = credited_amount + p_amount,
    payment_status = case when (net_amount - paid_amount - credited_amount - p_amount) <= 0.001 then 'paid' else payment_status end
  where id = p_invoice_id;

  return v_allocation_id;
end;
$$;
grant execute on function allocate_credit_note_unallocated_credit(uuid, uuid, numeric) to authenticated;

create table debit_note_invoice_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  debit_note_id uuid not null references debit_notes(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete restrict,
  linked_amount numeric(14,2) not null check (linked_amount > 0),
  linked_by uuid references app_users(id),
  linked_at timestamptz not null default now()
);
create index idx_debit_note_invoice_links_note on debit_note_invoice_links(debit_note_id);

alter table debit_note_invoice_links enable row level security;
create policy debit_note_invoice_links_isolation on debit_note_invoice_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function link_debit_note_to_invoice(p_debit_note_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_link_id uuid;
begin
  if not has_permission('financial_adjustments:allocate_debits') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from debit_notes where id = p_debit_note_id and posting_status = 'posted';
  if v_company_id is null then raise exception 'Posted debit note not found'; end if;

  insert into debit_note_invoice_links (company_id, debit_note_id, invoice_id, linked_amount, linked_by)
  values (v_company_id, p_debit_note_id, p_invoice_id, p_amount, auth.uid())
  returning id into v_link_id;

  return v_link_id;
end;
$$;
grant execute on function link_debit_note_to_invoice(uuid, uuid, numeric) to authenticated;

create or replace function cancel_credit_note_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc credit_notes%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from credit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Credit note not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;
  if v_doc.posting_status = 'posted' then raise exception 'Posted credit notes cannot be cancelled — request a reversal instead'; end if;

  update financial_adjustment_approval_steps set status = 'cancelled'
  where approval_id in (select id from financial_adjustment_approvals where document_table = 'credit_notes' and document_id = p_id) and status = 'pending';

  perform change_credit_note_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'credit_notes', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_credit_note_draft(uuid, text, text) to authenticated;

create or replace function cancel_debit_note_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc debit_notes%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from debit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Debit note not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;
  if v_doc.posting_status = 'posted' then raise exception 'Posted debit notes cannot be cancelled — request a reversal instead'; end if;

  update financial_adjustment_approval_steps set status = 'cancelled'
  where approval_id in (select id from financial_adjustment_approvals where document_table = 'debit_notes' and document_id = p_id) and status = 'pending';

  perform change_debit_note_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'debit_notes', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_debit_note_draft(uuid, text, text) to authenticated;

create or replace function cancel_customer_adjustment_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc customer_adjustments%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from customer_adjustments where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Customer adjustment not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;
  if v_doc.posting_status = 'posted' then raise exception 'Posted adjustments cannot be cancelled — request a reversal instead'; end if;

  update financial_adjustment_approval_steps set status = 'cancelled'
  where approval_id in (select id from financial_adjustment_approvals where document_table = 'customer_adjustments' and document_id = p_id) and status = 'pending';

  perform change_customer_adjustment_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'customer_adjustments', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_customer_adjustment_draft(uuid, text, text) to authenticated;

alter table customer_adjustment_posting_history add column if not exists invoice_credited_amount numeric(14,2) not null default 0;
alter table customer_adjustment_posting_history add column if not exists unallocated_amount numeric(14,2) not null default 0;
alter table customer_adjustment_posting_history add column if not exists unallocated_credit_id uuid references customer_unallocated_credits(id) on delete set null;

create or replace function post_customer_adjustment(p_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_doc customer_adjustments%rowtype;
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_outstanding_before numeric;
  v_credited_amount numeric := 0;
  v_unallocated_amount numeric := 0;
  v_unallocated_id uuid;
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
        values (v_doc.company_id, v_doc.customer_id, v_unallocated_amount, v_unallocated_amount, format('Unallocated balance from adjustment %s', v_doc.document_number), 'available')
        returning id into v_unallocated_id;
      end if;
    else
      insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
      values (v_doc.company_id, v_doc.customer_id, 'adjustment', 'customer_adjustments', p_id, v_doc.net_amount, 0, v_doc.document_date, format('Adjustment %s', v_doc.document_number))
      returning id into v_ledger_id;

      update customers set outstanding_balance = outstanding_balance + v_doc.net_amount where id = v_doc.customer_id;
    end if;

    update customer_adjustments set status = 'posted', posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_id;

    insert into customer_adjustment_posting_history (
      company_id, document_table, document_id, attempt_number, status, final_document_number, ledger_transaction_id,
      invoice_credited_amount, unallocated_amount, unallocated_credit_id, attempted_by, device_uid, online
    )
    values (
      v_doc.company_id, 'customer_adjustments', p_id, v_attempt, 'succeeded', v_doc.document_number, v_ledger_id,
      v_credited_amount, v_unallocated_amount, v_unallocated_id, auth.uid(), p_device_uid, not p_is_offline
    );

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

create table customer_adjustment_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  reason text not null,
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  original_snapshot jsonb not null,
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz,
  reversed_credited_amount numeric(14,2) not null default 0,
  reversed_unallocated_amount numeric(14,2) not null default 0,
  ledger_transaction_id uuid,
  reversed_by uuid references app_users(id),
  reversed_at timestamptz
);
create index idx_customer_adjustment_reversals_document on customer_adjustment_reversals(document_table, document_id);
create index idx_customer_adjustment_reversals_status on customer_adjustment_reversals(company_id, approval_status);

alter table customer_adjustment_reversals enable row level security;
create policy customer_adjustment_reversals_isolation on customer_adjustment_reversals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_adjustment_reversal_request(p_document_table text, p_document_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_posting_status text;
  v_snapshot jsonb;
  v_request_id uuid;
  v_status_fn text;
begin
  if p_document_table not in ('credit_notes', 'debit_notes', 'customer_adjustments') then raise exception 'Unknown document table'; end if;
  if not has_permission('financial_adjustments:reverse_documents') then raise exception 'Not permitted'; end if;

  execute format('select company_id, posting_status from %I where id = $1 and company_id = current_company_id()', p_document_table)
    into v_company_id, v_posting_status using p_document_id;
  if v_company_id is null then raise exception 'Document not found'; end if;
  if v_posting_status != 'posted' then raise exception 'Only posted documents can have a reversal request'; end if;

  execute format('select to_jsonb(d) from %I d where d.id = $1', p_document_table) into v_snapshot using p_document_id;

  insert into customer_adjustment_reversals (company_id, document_table, document_id, reason, requested_by, original_snapshot)
  values (v_company_id, p_document_table, p_document_id, p_reason, auth.uid(), v_snapshot)
  returning id into v_request_id;

  v_status_fn := case p_document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;
  execute format('select %s($1, $2, $3)', v_status_fn) using p_document_id, 'reversal_requested', p_reason;

  return v_request_id;
end;
$$;
grant execute on function create_adjustment_reversal_request(text, uuid, text) to authenticated;

create or replace function execute_adjustment_reversal(p_reversal_id uuid, p_approve boolean, p_decision_reason text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_reversal customer_adjustment_reversals%rowtype;
  v_status_fn text;
  v_net_amount numeric;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_credited_amount numeric := 0;
  v_unallocated_amount numeric := 0;
  v_unallocated_id uuid;
  v_ledger_id uuid;
  v_document_number text;
begin
  if not has_permission('financial_adjustments:reverse_documents') then raise exception 'Not permitted'; end if;
  select * into v_reversal from customer_adjustment_reversals where id = p_reversal_id;
  if not found then raise exception 'Reversal request not found'; end if;
  if v_reversal.approval_status != 'pending' then raise exception 'Request already decided'; end if;

  v_status_fn := case v_reversal.document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;

  update customer_adjustment_reversals set
    approval_status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decision_reason = p_decision_reason, decided_at = now()
  where id = p_reversal_id;

  if not p_approve then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_reversal.document_id, 'posted', 'Reversal request rejected: ' || coalesce(p_decision_reason, '');
    return jsonb_build_object('approved', false);
  end if;

  execute format('select customer_id, original_invoice_id, net_amount, document_number from %I where id = $1', v_reversal.document_table)
    into v_customer_id, v_invoice_id, v_net_amount, v_document_number using v_reversal.document_id;

  if v_reversal.document_table = 'debit_notes' then
    update customers set outstanding_balance = greatest(outstanding_balance - v_net_amount, 0) where id = v_customer_id;
    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_reversal.company_id, v_customer_id, 'adjustment', v_reversal.document_table, v_reversal.document_id, 0, v_net_amount, current_date, format('Reversal of %s', v_document_number))
    returning id into v_ledger_id;
  else
    if v_reversal.document_table = 'credit_notes' then
      select coalesce(invoice_credited_amount, 0), coalesce(unallocated_amount, 0), unallocated_credit_id
      into v_credited_amount, v_unallocated_amount, v_unallocated_id
      from credit_note_postings where credit_note_id = v_reversal.document_id and not reversed order by posted_at desc limit 1;

      update credit_note_postings set reversed = true where credit_note_id = v_reversal.document_id and not reversed;
    else
      select coalesce(invoice_credited_amount, 0), coalesce(unallocated_amount, 0), unallocated_credit_id
      into v_credited_amount, v_unallocated_amount, v_unallocated_id
      from customer_adjustment_posting_history where document_table = 'customer_adjustments' and document_id = v_reversal.document_id and status = 'succeeded'
      order by attempted_at desc limit 1;
    end if;

    if v_invoice_id is not null and v_credited_amount > 0 then
      update sales_invoices set
        credited_amount = greatest(credited_amount - v_credited_amount, 0),
        payment_status = case when net_amount - paid_amount - greatest(credited_amount - v_credited_amount, 0) > 0.001 then 'partially_paid' else payment_status end
      where id = v_invoice_id;
    end if;

    if v_unallocated_id is not null then
      update customer_unallocated_credits set status = 'reversed', available_amount = 0 where id = v_unallocated_id;
    end if;

    update customers set outstanding_balance = outstanding_balance + v_net_amount where id = v_customer_id;

    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_reversal.company_id, v_customer_id, 'adjustment', v_reversal.document_table, v_reversal.document_id, v_net_amount, 0, current_date, format('Reversal of %s', v_document_number))
    returning id into v_ledger_id;
  end if;

  update customer_adjustment_reversals set
    reversed_credited_amount = v_credited_amount, reversed_unallocated_amount = v_unallocated_amount,
    ledger_transaction_id = v_ledger_id, reversed_by = auth.uid(), reversed_at = now()
  where id = p_reversal_id;

  execute format('update %I set status = $1, posting_status = $2 where id = $3', v_reversal.document_table) using 'reversed', 'reversed', v_reversal.document_id;
  insert into adjustment_status_history (company_id, document_table, document_id, old_status, new_status, reason, changed_by)
  values (v_reversal.company_id, v_reversal.document_table, v_reversal.document_id, 'reversal_requested', 'reversed', p_decision_reason, auth.uid());

  return jsonb_build_object('approved', true, 'credited_reversed', v_credited_amount, 'unallocated_reversed', v_unallocated_amount);
end;
$$;
grant execute on function execute_adjustment_reversal(uuid, boolean, text) to authenticated;
