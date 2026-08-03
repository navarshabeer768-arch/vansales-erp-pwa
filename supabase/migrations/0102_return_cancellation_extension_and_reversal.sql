-- ============================================================================
-- 0102_return_cancellation_extension_and_reversal.sql
-- Continues 0096-0101.
-- ============================================================================

create or replace function cancel_return_draft(p_return_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_return sales_returns%rowtype;
begin
  if not has_permission('sales_returns:cancel_return_draft') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.status = 'cancelled_before_posting' then return; end if;
  if v_return.posting_status != 'not_posted' then raise exception 'Posted returns cannot be cancelled through this function'; end if;

  update sales_return_approval_steps set status = 'cancelled'
  where approval_id in (select id from sales_return_approvals where return_id = p_return_id) and status = 'pending';
  update sales_return_inspections set status = 'cancelled' where return_id = p_return_id and status in ('pending', 'in_progress');

  perform change_return_status(p_return_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into sales_return_notes (company_id, return_id, note, note_type, created_by)
    values (v_return.company_id, p_return_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_return_draft(uuid, text, text) to authenticated;

create table sales_return_cancellations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  reason text not null,
  notes text,
  cancelled_by uuid references app_users(id),
  cancelled_at timestamptz not null default now()
);
create index idx_sales_return_cancellations_return on sales_return_cancellations(return_id);

alter table sales_return_cancellations enable row level security;
create policy sales_return_cancellations_isolation on sales_return_cancellations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_reversal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  reason text not null,
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  original_snapshot jsonb not null,
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_return_reversal_requests_return on sales_return_reversal_requests(return_id);
create index idx_sales_return_reversal_requests_status on sales_return_reversal_requests(company_id, approval_status);

alter table sales_return_reversal_requests enable row level security;
create policy sales_return_reversal_requests_isolation on sales_return_reversal_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  reversal_request_id uuid references sales_return_reversal_requests(id) on delete set null,
  reversed_credit_amount numeric(14,2) not null default 0,
  stock_movements_reversed integer not null default 0,
  credit_note_reversed boolean not null default false,
  replacement_reversed boolean not null default false,
  reversed_by uuid references app_users(id),
  reversed_at timestamptz not null default now(),
  ledger_transaction_id uuid,
  notes text
);
create index idx_sales_return_reversals_return on sales_return_reversals(return_id);

alter table sales_return_reversals enable row level security;
create policy sales_return_reversals_isolation on sales_return_reversals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_partial_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  return_item_id uuid references sales_return_items(id) on delete set null,
  reversed_quantity numeric(14,3),
  reversed_amount numeric(14,2),
  reason text,
  reversed_by uuid references app_users(id),
  reversed_at timestamptz not null default now()
);
create index idx_sales_return_partial_reversals_return on sales_return_partial_reversals(return_id);

alter table sales_return_partial_reversals enable row level security;
create policy sales_return_partial_reversals_isolation on sales_return_partial_reversals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_return_reversal_request(p_return_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_snapshot jsonb;
  v_request_id uuid;
begin
  if not has_permission('sales_returns:request_reversal') then raise exception 'Not permitted'; end if;
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.posting_status != 'posted' then raise exception 'Only posted returns can have a reversal request'; end if;

  select jsonb_build_object(
    'return', to_jsonb(v_return),
    'items', (select jsonb_agg(to_jsonb(i)) from sales_return_items i where i.return_id = p_return_id and i.item_status = 'active'),
    'stock_postings', (select jsonb_agg(to_jsonb(p)) from sales_return_stock_postings p where p.return_id = p_return_id and not p.reversed),
    'credit_adjustment', (select to_jsonb(a) from sales_return_credit_adjustments a where a.return_id = p_return_id and a.status = 'posted')
  ) into v_snapshot;

  insert into sales_return_reversal_requests (company_id, return_id, reason, requested_by, original_snapshot)
  values (v_return.company_id, p_return_id, p_reason, auth.uid(), v_snapshot)
  returning id into v_request_id;

  perform change_return_status(p_return_id, 'reversal_requested', p_reason);
  return v_request_id;
end;
$$;
grant execute on function create_return_reversal_request(uuid, text) to authenticated;

create or replace function execute_return_reversal(p_reversal_request_id uuid, p_approve boolean, p_decision_reason text default null, p_notes text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_request sales_return_reversal_requests%rowtype;
  v_return sales_returns%rowtype;
  v_posting record;
  v_adjustment record;
  v_stock_reversed integer := 0;
  v_credit_reversed numeric := 0;
  v_ledger_id uuid;
  v_reversal_id uuid;
  v_credit_note_reversed boolean := false;
begin
  if not has_permission('sales_returns:approve_return_reversal') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_return_reversal_requests where id = p_reversal_request_id;
  if not found then raise exception 'Reversal request not found'; end if;
  if v_request.approval_status != 'pending' then raise exception 'Request already decided'; end if;

  update sales_return_reversal_requests set
    approval_status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decision_reason = p_decision_reason, decided_at = now()
  where id = p_reversal_request_id;

  if not p_approve then
    perform change_return_status(v_request.return_id, 'posted', 'Reversal request rejected: ' || coalesce(p_decision_reason, ''));
    return jsonb_build_object('approved', false);
  end if;

  select * into v_return from sales_returns where id = v_request.return_id for update;

  for v_posting in select * from sales_return_stock_postings where return_id = v_return.id and not reversed loop
    insert into stock_movements (company_id, product_id, movement_type, quantity, from_location_type, from_location_id, to_location_type, to_location_id, batch_id, reference_table, reference_id)
    select v_return.company_id, sri.product_id, 'return_reversal_out', v_posting.quantity, v_posting.location_type, v_posting.location_id, 'customer', null, v_posting.batch_id, 'sales_returns', v_return.id
    from sales_return_items sri where sri.id = v_posting.return_item_id;

    if (select is_saleable from sales_return_stock_destinations where code = v_posting.destination_code limit 1) then
      if v_posting.location_type = 'warehouse' then
        update warehouse_stock set quantity = greatest(quantity - v_posting.quantity, 0), updated_at = now()
        where warehouse_id = v_posting.location_id and product_id = (select product_id from sales_return_items where id = v_posting.return_item_id) and batch_id is not distinct from v_posting.batch_id;
      else
        update van_stock set quantity = greatest(quantity - v_posting.quantity, 0), updated_at = now()
        where van_id = v_posting.location_id and product_id = (select product_id from sales_return_items where id = v_posting.return_item_id) and batch_id is not distinct from v_posting.batch_id;
      end if;
    end if;

    update sales_return_stock_postings set reversed = true where id = v_posting.id;
    v_stock_reversed := v_stock_reversed + 1;
  end loop;

  update product_serials set status = 'sold'
  where id in (
    select serial_id from sales_return_item_serials srs join sales_return_items sri on sri.id = srs.return_item_id where sri.return_id = v_return.id
  );

  select * into v_adjustment from sales_return_credit_adjustments where return_id = v_return.id and status = 'posted';
  if v_adjustment.id is not null then
    v_credit_reversed := v_adjustment.net_credit_amount;
    if v_adjustment.original_invoice_id is not null then
      update sales_invoices set
        credited_amount = greatest(credited_amount - v_credit_reversed, 0),
        payment_status = case when net_amount - paid_amount - greatest(credited_amount - v_credit_reversed, 0) > 0.001 then 'partially_paid' else payment_status end
      where id = v_adjustment.original_invoice_id;
    end if;
    update customers set outstanding_balance = outstanding_balance + v_credit_reversed where id = v_return.customer_id;

    insert into customer_ledger_transactions (company_id, customer_id, transaction_type, reference_table, reference_id, debit, credit, transaction_date, description)
    values (v_return.company_id, v_return.customer_id, 'adjustment', 'sales_returns', v_return.id, v_credit_reversed, 0, current_date, format('Reversal of return %s', v_return.return_number))
    returning id into v_ledger_id;

    update sales_return_credit_adjustments set status = 'reversed' where id = v_adjustment.id;
  end if;

  if exists (select 1 from sales_return_credit_notes where return_id = v_return.id and status not in ('cancelled', 'reversed')) then
    update sales_return_credit_notes set status = 'reversed' where return_id = v_return.id and status not in ('cancelled', 'reversed');
    v_credit_note_reversed := true;
  end if;

  update sales_return_replacement_orders set status = 'cancelled' where return_id = v_return.id and status not in ('delivered', 'cancelled', 'rejected');

  insert into sales_return_reversals (company_id, return_id, reversal_request_id, reversed_credit_amount, stock_movements_reversed, credit_note_reversed, replacement_reversed, reversed_by, ledger_transaction_id, notes)
  values (v_return.company_id, v_return.id, p_reversal_request_id, v_credit_reversed, v_stock_reversed, v_credit_note_reversed, true, auth.uid(), v_ledger_id, p_notes)
  returning id into v_reversal_id;

  update sales_returns set status = 'reversed', posting_status = 'reversed' where id = v_return.id;

  return jsonb_build_object('approved', true, 'reversal_id', v_reversal_id, 'stock_movements_reversed', v_stock_reversed, 'credit_reversed', v_credit_reversed);
end;
$$;
grant execute on function execute_return_reversal(uuid, boolean, text, text) to authenticated;
