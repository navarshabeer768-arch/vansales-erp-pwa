-- ============================================================================
-- 0086_post_receipt.sql
-- Continues 0081-0085. The centerpiece function of this phase.
-- ============================================================================

-- Part 1's payment_promises status set (open/kept/broken/cancelled) is
-- narrower than this phase's needs — extends it rather than duplicating
-- the table.
alter table payment_promises drop constraint if exists payment_promises_status_check;
alter table payment_promises add constraint payment_promises_status_check check (status in (
  'open', 'kept', 'partially_fulfilled', 'broken', 'overdue', 'cancelled'
));

create table receipt_posting_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  final_receipt_number text,
  attempted_by uuid references app_users(id),
  attempted_at timestamptz not null default now(),
  device_uid text,
  online boolean not null default true
);
create index idx_receipt_posting_history_receipt on receipt_posting_history(receipt_id);

alter table receipt_posting_history enable row level security;
create policy receipt_posting_history_isolation on receipt_posting_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function post_receipt(p_receipt_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_customer customers%rowtype;
  v_collection_type collection_types%rowtype;
  v_components_total numeric;
  v_final_number text;
  v_component record;
  v_alloc record;
  v_seq integer := 0;
  v_payment_summary text;
  v_advance_details receipt_advance_details%rowtype;
  v_unallocated_details receipt_unallocated_details%rowtype;
  v_attempt integer;
  v_new_status text;
begin
  if not has_permission('receipt_vouchers:post_receipt') then raise exception 'Not permitted'; end if;

  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id() for update;
  if not found then raise exception 'Receipt not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from receipt_posting_history where receipt_id = p_receipt_id;

  if v_receipt.posting_status = 'posted' then raise exception 'Receipt already posted'; end if;
  if v_receipt.status = 'cancelled_before_posting' then raise exception 'Cancelled receipts cannot be posted'; end if;
  if v_receipt.status = 'reversed' then raise exception 'Reversed receipts cannot be posted again'; end if;
  if v_receipt.is_on_hold or v_receipt.status = 'on_hold' then raise exception 'Held receipts cannot be posted'; end if;
  if v_receipt.status not in ('approved', 'ready_to_post', 'posting_failed') then
    raise exception 'Receipt must be approved and ready to post (currently %)', v_receipt.status;
  end if;

  begin
    update receipt_vouchers set status = 'posting', posting_status = 'posting' where id = p_receipt_id;

    select * into v_customer from customers where id = v_receipt.customer_id;
    if v_customer.status = 'deleted' then raise exception 'Customer % has been deleted', v_customer.business_name; end if;

    select coalesce(sum(amount), 0) into v_components_total from receipt_payment_components where receipt_id = p_receipt_id;
    if abs(v_components_total - v_receipt.receipt_amount) > 0.001 then
      raise exception 'Payment component total (%.2f) does not equal receipt amount (%.2f)', v_components_total, v_receipt.receipt_amount;
    end if;

    if v_receipt.approval_status not in ('approved', 'skipped_by_rule') then
      raise exception 'Receipt approval is not complete (status: %)', v_receipt.approval_status;
    end if;

    select * into v_collection_type from collection_types where id = v_receipt.collection_type_id;
    if v_receipt.final_receipt_number is null then
      v_final_number := next_receipt_no(v_collection_type.code);
      update receipt_vouchers set final_receipt_number = v_final_number, final_number_generated_at = now(), final_number_generated_by = auth.uid()
      where id = p_receipt_id;
    else
      v_final_number := v_receipt.final_receipt_number;
    end if;

    select string_agg(payment_method_code || ':' || amount::text, ', ') into v_payment_summary from receipt_payment_components where receipt_id = p_receipt_id;

    perform post_receipt_payment_components(p_receipt_id);
    for v_component in select * from receipt_payment_components where receipt_id = p_receipt_id and payment_method_code = 'cheque' loop
      perform post_cheque_component(v_component.id);
    end loop;

    v_seq := 0;
    for v_alloc in select * from receipt_invoice_allocations where receipt_id = p_receipt_id and status = 'active' order by allocation_order loop
      v_seq := v_seq + 1;
      perform post_invoice_allocation(p_receipt_id, v_alloc.invoice_id, v_receipt.customer_id, v_alloc.allocated_amount, v_seq, v_payment_summary);
    end loop;

    if v_receipt.advance_amount > 0 then
      select * into v_advance_details from receipt_advance_details where receipt_id = p_receipt_id;
      insert into customer_advance_balances (company_id, customer_id, receipt_id, original_amount, available_amount, receipt_date, expiry_date)
      values (v_receipt.company_id, v_receipt.customer_id, p_receipt_id, v_receipt.advance_amount, v_receipt.advance_amount, v_receipt.receipt_date, v_advance_details.expiry_date);
    elsif v_receipt.unallocated_amount > 0 and v_receipt.allocation_status = 'unallocated' then
      select * into v_unallocated_details from receipt_unallocated_details where receipt_id = p_receipt_id;
      insert into customer_unallocated_credits (company_id, customer_id, receipt_id, original_amount, available_amount, reason, expected_allocation_date, responsible_employee_id)
      values (v_receipt.company_id, v_receipt.customer_id, p_receipt_id, v_receipt.unallocated_amount, v_receipt.unallocated_amount,
        coalesce(v_unallocated_details.reason, 'Unallocated at posting'), v_unallocated_details.expected_allocation_date, v_receipt.responsible_employee_id);
    end if;

    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_receipt.company_id, v_receipt.customer_id, 'collection', 'receipt_vouchers', p_receipt_id, 0, v_receipt.receipt_amount, v_receipt.receipt_date, format('Receipt %s', v_final_number));

    update customers set outstanding_balance = greatest(outstanding_balance - v_receipt.receipt_amount, 0) where id = v_receipt.customer_id;

    v_new_status := case
      when v_receipt.advance_amount > 0 then 'advance'
      when v_receipt.allocation_status = 'unallocated' then 'unallocated'
      when v_receipt.allocated_amount >= v_receipt.receipt_amount - 0.001 then 'fully_allocated'
      when v_receipt.allocated_amount > 0 then 'partially_allocated'
      else 'posted'
    end;

    update receipt_vouchers set status = v_new_status, posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_receipt_id;

    if v_receipt.customer_visit_id is not null then
      update payment_promises set status = case when v_new_status in ('fully_allocated', 'posted') then 'kept' else 'partially_fulfilled' end
      where customer_visit_id = v_receipt.customer_visit_id and status = 'open';
    end if;

    insert into receipt_posting_history (company_id, receipt_id, attempt_number, status, final_receipt_number, attempted_by, device_uid, online)
    values (v_receipt.company_id, p_receipt_id, v_attempt, 'succeeded', v_final_number, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_receipt_number', v_final_number, 'receipt_id', p_receipt_id);

  exception when others then
    update receipt_vouchers set status = 'posting_failed', posting_status = 'posting_failed' where id = p_receipt_id;
    insert into receipt_posting_history (company_id, receipt_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_receipt.company_id, p_receipt_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_receipt(uuid, text, boolean) to authenticated;

create or replace function retry_failed_receipt_posting(p_receipt_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not has_permission('receipt_vouchers:retry_posting') then raise exception 'Not permitted'; end if;
  if (select status from receipt_vouchers where id = p_receipt_id) != 'posting_failed' then
    raise exception 'Only receipts with a failed posting attempt can be retried';
  end if;
  update receipt_vouchers set status = 'ready_to_post' where id = p_receipt_id;
  return post_receipt(p_receipt_id);
end;
$$;
grant execute on function retry_failed_receipt_posting(uuid) to authenticated;
