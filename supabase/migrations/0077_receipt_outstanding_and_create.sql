-- ============================================================================
-- 0077_receipt_outstanding_and_create.sql
-- Continues 0076.
-- ============================================================================

create or replace function invoice_allocated_amount(p_invoice_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(allocated_amount), 0) from receipt_invoice_allocations
  where invoice_id = p_invoice_id and status = 'active';
$$;
grant execute on function invoice_allocated_amount(uuid) to authenticated;

create or replace function customer_outstanding_summary(p_customer_id uuid)
returns table (
  total_outstanding numeric, total_overdue numeric, current_amount numeric,
  days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_91_120 numeric, days_120_plus numeric,
  unallocated_advance numeric, open_invoices integer, partially_paid_invoices integer, overdue_invoices integer
) language plpgsql stable as $$
declare
  v_today date := current_date;
begin
  return query
  select
    coalesce(sum(outstanding), 0),
    coalesce(sum(outstanding) filter (where due_date < v_today), 0),
    coalesce(sum(outstanding) filter (where due_date >= v_today), 0),
    coalesce(sum(outstanding) filter (where v_today - due_date between 1 and 30), 0),
    coalesce(sum(outstanding) filter (where v_today - due_date between 31 and 60), 0),
    coalesce(sum(outstanding) filter (where v_today - due_date between 61 and 90), 0),
    coalesce(sum(outstanding) filter (where v_today - due_date between 91 and 120), 0),
    coalesce(sum(outstanding) filter (where v_today - due_date > 120), 0),
    coalesce((select sum(receipt_amount - allocated_amount) from receipt_vouchers where customer_id = p_customer_id and allocation_status in ('unallocated', 'advance') and status not in ('cancelled_before_posting')), 0),
    count(*) filter (where allocated = 0),
    count(*) filter (where allocated > 0 and outstanding > 0),
    count(*) filter (where due_date < v_today)
  from (
    select si.id, si.net_amount - invoice_allocated_amount(si.id) as outstanding, invoice_allocated_amount(si.id) as allocated, si.due_date
    from sales_invoices si
    where si.customer_id = p_customer_id and si.posting_status = 'posted' and si.status not in ('void_requested', 'voided')
      and si.net_amount - invoice_allocated_amount(si.id) > 0.001
  ) x;
end;
$$;
grant execute on function customer_outstanding_summary(uuid) to authenticated;

create or replace function customer_outstanding_invoices(p_customer_id uuid)
returns table (
  invoice_id uuid, invoice_number text, invoice_date date, due_date date, invoice_amount numeric,
  previously_paid_amount numeric, outstanding_amount numeric, overdue_days integer, payment_term text,
  invoice_type text, route text, van text, responsible_employee text, status text
) language plpgsql stable as $$
begin
  return query
  select
    si.id, coalesce(si.final_invoice_number, si.invoice_number), si.invoice_date, si.due_date, si.net_amount,
    invoice_allocated_amount(si.id), si.net_amount - invoice_allocated_amount(si.id),
    greatest((current_date - si.due_date)::integer, 0), pt.label, sit.label,
    r.name, v.name, au.full_name, si.status
  from sales_invoices si
  left join payment_terms pt on pt.id = si.payment_term_id
  left join sales_invoice_types sit on sit.id = si.invoice_type_id
  left join routes r on r.id = si.route_id
  left join vans v on v.id = si.van_id
  left join app_users au on au.id = si.salesman_id
  where si.customer_id = p_customer_id and si.posting_status = 'posted' and si.status not in ('void_requested', 'voided')
    and si.company_id = current_company_id()
    and si.net_amount - invoice_allocated_amount(si.id) > 0.001
  order by si.due_date nulls last, si.invoice_date;
end;
$$;
grant execute on function customer_outstanding_invoices(uuid) to authenticated;

create or replace function calculate_allocation_preview(p_customer_id uuid, p_receipt_amount numeric, p_strategy text default 'oldest_due_date_first')
returns table (invoice_id uuid, invoice_number text, outstanding numeric, proposed_allocation numeric, remaining_balance numeric, allocation_order integer)
language plpgsql stable as $$
declare
  v_remaining numeric := p_receipt_amount;
  v_row record;
  v_order integer := 1;
  v_take numeric;
begin
  for v_row in
    select * from customer_outstanding_invoices(p_customer_id)
    order by
      case p_strategy
        when 'oldest_invoice_first' then invoice_date
        when 'oldest_due_date_first' then due_date
        else due_date
      end asc nulls last,
      case p_strategy when 'most_overdue_first' then overdue_days end desc,
      case p_strategy when 'smallest_balance_first' then outstanding_amount end asc,
      case p_strategy when 'largest_balance_first' then outstanding_amount end desc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_row.outstanding_amount, v_remaining);
    invoice_id := v_row.invoice_id; invoice_number := v_row.invoice_number; outstanding := v_row.outstanding_amount;
    proposed_allocation := v_take; remaining_balance := v_row.outstanding_amount - v_take; allocation_order := v_order;
    return next;
    v_remaining := v_remaining - v_take;
    v_order := v_order + 1;
  end loop;
end;
$$;
grant execute on function calculate_allocation_preview(uuid, numeric, text) to authenticated;

create or replace function create_receipt_draft(
  p_collection_type_code text,
  p_customer_id uuid,
  p_payment_components jsonb,
  p_client_uuid text,
  p_invoice_allocations jsonb default null,
  p_allocation_mode text default 'manual',
  p_advance_details jsonb default null,
  p_unallocated_reason text default null,
  p_route_id uuid default null,
  p_beat_plan_id uuid default null,
  p_customer_visit_id uuid default null,
  p_daily_visit_plan_id uuid default null,
  p_van_id uuid default null,
  p_responsible_employee_id uuid default null,
  p_collection_source text default 'web',
  p_reference_number text default null,
  p_customer_reference text default null,
  p_remarks text default null,
  p_internal_notes text default null,
  p_manual_receipt_number text default null,
  p_device_uid text default null,
  p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_receipt_id uuid;
  v_existing_id uuid;
  v_collection_type collection_types%rowtype;
  v_customer customers%rowtype;
  v_receipt_number text;
  v_initial_status text;
  v_component jsonb;
  v_component_id uuid;
  v_components_total numeric := 0;
  v_allocation jsonb;
  v_allocated_total numeric := 0;
  v_invoice sales_invoices%rowtype;
  v_outstanding numeric;
  v_receipt_amount numeric;
  v_allocation_status text;
  v_seq integer := 0;
begin
  if v_company_id is null then raise exception 'No company context for current user'; end if;

  select id into v_existing_id from receipt_vouchers where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then return v_existing_id; end if;

  if p_payment_components is null or jsonb_array_length(p_payment_components) = 0 then
    raise exception 'A receipt must have at least one payment component';
  end if;

  select * into v_collection_type from collection_types
  where code = p_collection_type_code and (company_id is null or company_id = v_company_id) and is_active
  order by company_id nulls last limit 1;
  if not found then raise exception 'Unknown or inactive collection type: %', p_collection_type_code; end if;

  select * into v_customer from customers where id = p_customer_id and company_id = v_company_id;
  if not found then raise exception 'Customer not found'; end if;
  if v_customer.status = 'deleted' then raise exception 'Cannot record a receipt for a deleted customer'; end if;

  select coalesce(sum((c->>'amount')::numeric), 0) into v_components_total from jsonb_array_elements(p_payment_components) c;
  if v_components_total <= 0 then raise exception 'Payment component total must be greater than zero'; end if;
  v_receipt_amount := v_components_total;

  if v_collection_type.reference_required and p_reference_number is null then
    raise exception '% requires a reference number', v_collection_type.label;
  end if;

  if p_manual_receipt_number is not null and p_manual_receipt_number != '' then
    v_receipt_number := p_manual_receipt_number;
  else
    v_receipt_number := next_receipt_no(p_collection_type_code);
  end if;

  v_initial_status := case when p_is_offline then 'sync_pending' else 'draft' end;

  if p_invoice_allocations is not null and jsonb_array_length(p_invoice_allocations) > 0 then
    select coalesce(sum((a->>'amount')::numeric), 0) into v_allocated_total from jsonb_array_elements(p_invoice_allocations) a;
  end if;
  if v_allocated_total > v_receipt_amount then raise exception 'Allocated amount cannot exceed the receipt amount'; end if;

  v_allocation_status := case
    when p_advance_details is not null then 'advance'
    when v_allocated_total = 0 and p_unallocated_reason is not null then 'unallocated'
    when v_allocated_total = 0 then 'not_allocated'
    when v_allocated_total >= v_receipt_amount then 'fully_allocated'
    else 'partially_allocated'
  end;

  insert into receipt_vouchers (
    company_id, receipt_number, collection_type_id, customer_id, customer_contact, customer_address,
    route_id, beat_plan_id, customer_visit_id, daily_visit_plan_id, van_id, responsible_employee_id, collection_source,
    receipt_amount, allocated_amount, unallocated_amount, advance_amount, reference_number, customer_reference,
    remarks, internal_notes, status, allocation_status, client_uuid, device_uid, created_by, updated_by
  ) values (
    v_company_id, v_receipt_number, v_collection_type.id, p_customer_id, v_customer.primary_phone, null,
    p_route_id, p_beat_plan_id, p_customer_visit_id, p_daily_visit_plan_id, p_van_id, coalesce(p_responsible_employee_id, auth.uid()), p_collection_source,
    v_receipt_amount, v_allocated_total, greatest(v_receipt_amount - v_allocated_total, 0),
    case when p_advance_details is not null then v_receipt_amount - v_allocated_total else 0 end,
    p_reference_number, p_customer_reference, p_remarks, p_internal_notes, v_initial_status, v_allocation_status,
    p_client_uuid, p_device_uid, auth.uid(), auth.uid()
  ) returning id into v_receipt_id;

  v_seq := 0;
  for v_component in select * from jsonb_array_elements(p_payment_components) loop
    v_seq := v_seq + 1;
    insert into receipt_payment_components (company_id, receipt_id, payment_method_code, amount, reference, bank_or_terminal, notes, sequence)
    values (v_company_id, v_receipt_id, v_component->>'payment_method_code', (v_component->>'amount')::numeric,
      v_component->>'reference', v_component->>'bank_or_terminal', v_component->>'notes', v_seq)
    returning id into v_component_id;

    if v_component->>'payment_method_code' = 'cheque' and v_component->'cheque' is not null then
      insert into cheque_receipt_details (payment_component_id, company_id, cheque_number, cheque_date, bank_name, branch_name, account_name, cheque_amount, drawer_name, is_post_dated, deposit_date, notes)
      values (
        v_component_id, v_company_id, v_component->'cheque'->>'cheque_number', (v_component->'cheque'->>'cheque_date')::date,
        v_component->'cheque'->>'bank_name', v_component->'cheque'->>'branch_name', v_component->'cheque'->>'account_name',
        (v_component->>'amount')::numeric, v_component->'cheque'->>'drawer_name',
        coalesce((v_component->'cheque'->>'is_post_dated')::boolean, false), (v_component->'cheque'->>'deposit_date')::date, v_component->'cheque'->>'notes'
      );
    elsif v_component->>'payment_method_code' = 'card' and v_component->'card' is not null then
      insert into card_receipt_details (payment_component_id, company_id, card_type, terminal, merchant_reference, authorization_code, last_four_digits, transaction_date, notes)
      values (
        v_component_id, v_company_id, v_component->'card'->>'card_type', v_component->'card'->>'terminal',
        v_component->'card'->>'merchant_reference', v_component->'card'->>'authorization_code', v_component->'card'->>'last_four_digits',
        coalesce((v_component->'card'->>'transaction_date')::timestamptz, now()), v_component->'card'->>'notes'
      );
    elsif v_component->>'payment_method_code' = 'bank_transfer' and v_component->'bank' is not null then
      insert into bank_transfer_receipt_details (payment_component_id, company_id, bank_account, transfer_reference, transaction_date, value_date, sender_bank, sender_account_reference, notes)
      values (
        v_component_id, v_company_id, v_component->'bank'->>'bank_account', v_component->'bank'->>'transfer_reference',
        coalesce((v_component->'bank'->>'transaction_date')::timestamptz, now()), (v_component->'bank'->>'value_date')::date,
        v_component->'bank'->>'sender_bank', v_component->'bank'->>'sender_account_reference', v_component->'bank'->>'notes'
      );
    elsif v_component->>'payment_method_code' = 'wallet' and v_component->'wallet' is not null then
      insert into wallet_receipt_details (payment_component_id, company_id, provider, transaction_id, reference, transaction_date, notes)
      values (
        v_component_id, v_company_id, v_component->'wallet'->>'provider', v_component->'wallet'->>'transaction_id',
        v_component->'wallet'->>'reference', coalesce((v_component->'wallet'->>'transaction_date')::timestamptz, now()), v_component->'wallet'->>'notes'
      );
    end if;
  end loop;

  if p_invoice_allocations is not null then
    v_seq := 0;
    for v_allocation in select * from jsonb_array_elements(p_invoice_allocations) loop
      v_seq := v_seq + 1;
      select * into v_invoice from sales_invoices where id = (v_allocation->>'invoice_id')::uuid;
      if v_invoice.customer_id != p_customer_id then raise exception 'Cannot allocate to another customer''s invoice'; end if;

      v_outstanding := v_invoice.net_amount - invoice_allocated_amount(v_invoice.id);
      if (v_allocation->>'amount')::numeric > v_outstanding + 0.001 then
        raise exception 'Allocation of % exceeds outstanding % on invoice %', v_allocation->>'amount', v_outstanding, v_invoice.invoice_number;
      end if;

      insert into receipt_invoice_allocations (company_id, receipt_id, invoice_id, invoice_outstanding_snapshot, allocated_amount, allocation_order, allocation_method)
      values (v_company_id, v_receipt_id, v_invoice.id, v_outstanding, (v_allocation->>'amount')::numeric, v_seq, p_allocation_mode);
    end loop;
  end if;

  if p_advance_details is not null then
    insert into receipt_advance_details (receipt_id, company_id, purpose, expected_use, expiry_date, notes)
    values (v_receipt_id, v_company_id, p_advance_details->>'purpose', p_advance_details->>'expected_use',
      (p_advance_details->>'expiry_date')::date, p_advance_details->>'notes');
  elsif p_unallocated_reason is not null then
    insert into receipt_unallocated_details (receipt_id, company_id, reason, responsible_employee_id)
    values (v_receipt_id, v_company_id, p_unallocated_reason, coalesce(p_responsible_employee_id, auth.uid()));
  end if;

  insert into receipt_status_history (company_id, receipt_id, old_status, new_status, changed_by)
  values (v_company_id, v_receipt_id, null, v_initial_status, auth.uid());

  if p_customer_visit_id is not null then
    update customer_visits set visit_outcome = case when v_allocation_status = 'fully_allocated' then 'payment_collected' else 'partial_payment_collected' end
    where id = p_customer_visit_id;
  end if;

  return v_receipt_id;
end;
$$;
grant execute on function create_receipt_draft(
  text, uuid, jsonb, text, jsonb, text, jsonb, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, boolean
) to authenticated;
