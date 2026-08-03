-- ============================================================================
-- 0100_post_return.sql
-- Continues 0096-0099. The centerpiece function of this phase.
-- ============================================================================

create table sales_return_posting_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  final_return_number text,
  attempted_by uuid references app_users(id),
  attempted_at timestamptz not null default now(),
  device_uid text,
  online boolean not null default true
);
create index idx_sales_return_posting_history_return on sales_return_posting_history(return_id);

alter table sales_return_posting_history enable row level security;
create policy sales_return_posting_history_isolation on sales_return_posting_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Only accepted (saleable + damaged + expired + quarantine) quantity
-- participates in the credit calculation — rejected quantity and free
-- items generate no financial credit, per the doc's own decision table.
create or replace function calculate_return_credit_eligible_amount(p_return_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_total numeric := 0;
  v_item record;
  v_accepted_ratio numeric;
begin
  for v_item in select * from sales_return_items where return_id = p_return_id and item_status = 'active' loop
    if v_item.base_return_quantity > 0 then
      v_accepted_ratio := (v_item.accepted_saleable_quantity + v_item.accepted_damaged_quantity + v_item.accepted_expired_quantity + v_item.quarantine_quantity) / v_item.base_return_quantity;
    else
      v_accepted_ratio := 0;
    end if;
    v_total := v_total + (v_item.net_return_amount * v_accepted_ratio);
  end loop;
  return round(v_total, 2);
end;
$$;
grant execute on function calculate_return_credit_eligible_amount(uuid) to authenticated;

create or replace function post_return(p_return_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_return_type sales_return_types%rowtype;
  v_customer customers%rowtype;
  v_item sales_return_items%rowtype;
  v_location_type text;
  v_location_id uuid;
  v_credit_amount numeric;
  v_attempt integer;
  v_new_status text;
  v_credit_adjustment_id uuid;
begin
  if not has_permission('sales_returns:post_return') then raise exception 'Not permitted'; end if;

  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id() for update;
  if not found then raise exception 'Return not found'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt from sales_return_posting_history where return_id = p_return_id;

  if v_return.posting_status = 'posted' then raise exception 'Return already posted'; end if;
  if v_return.status = 'cancelled_before_posting' then raise exception 'Cancelled returns cannot be posted'; end if;
  if v_return.status = 'reversed' then raise exception 'Reversed returns cannot be posted again'; end if;
  if v_return.is_on_hold or v_return.status = 'on_hold' then raise exception 'Held returns cannot be posted'; end if;
  if v_return.status = 'rejected' then raise exception 'Rejected returns cannot increase stock and cannot be posted'; end if;
  if v_return.status not in ('accepted', 'partially_accepted', 'ready_to_post', 'posting_failed') then
    raise exception 'Return must be inspected and ready to post (currently %)', v_return.status;
  end if;

  begin
    update sales_returns set status = 'posting', posting_status = 'posting' where id = p_return_id;

    select * into v_customer from customers where id = v_return.customer_id;
    if v_customer.status = 'deleted' then raise exception 'Customer % has been deleted', v_customer.business_name; end if;

    if v_return.approval_status not in ('approved', 'partially_approved', 'skipped_by_rule') then
      raise exception 'Return approval is not complete (status: %)', v_return.approval_status;
    end if;
    if not exists (select 1 from sales_return_inspections where return_id = p_return_id and status in ('completed', 'partially_accepted', 'accepted', 'rejected')) then
      raise exception 'Return has not completed inspection';
    end if;

    select * into v_return_type from sales_return_types where id = v_return.return_type_id;

    if v_return.final_number_generated_at is null then
      update sales_returns set final_number_generated_at = now(), final_number_generated_by = auth.uid() where id = p_return_id;
    end if;

    if v_return.van_id is not null then
      v_location_type := 'van'; v_location_id := v_return.van_id;
    else
      v_location_type := 'warehouse';
      select id into v_location_id from warehouses where company_id = v_return.company_id and (v_return.warehouse_id is null or id = v_return.warehouse_id) order by (id = v_return.warehouse_id) desc limit 1;
      if v_location_id is null then raise exception 'No warehouse available to post return stock into'; end if;
    end if;

    for v_item in select * from sales_return_items where return_id = p_return_id and item_status = 'active' loop
      perform post_return_item_stock(v_item.id, v_location_type, v_location_id);

      if v_item.rejected_quantity > 0 and v_item.original_invoice_item_id is not null then
        update sales_return_items set base_return_quantity = base_return_quantity - v_item.rejected_quantity
        where id = v_item.id;
      end if;
    end loop;

    v_credit_amount := calculate_return_credit_eligible_amount(p_return_id);

    if v_credit_amount > 0 and v_return_type.credit_note_eligible then
      v_credit_adjustment_id := create_return_credit_adjustment(p_return_id, v_credit_amount);
    end if;

    v_new_status := case
      when exists (select 1 from sales_return_items where return_id = p_return_id and rejected_quantity > 0) then 'partially_accepted'
      else 'posted'
    end;
    if v_return.replacement_requested then v_new_status := 'replacement_pending'; end if;

    update sales_returns set status = v_new_status, posting_status = 'posted', posted_by = auth.uid(), posted_date = now() where id = p_return_id;

    if v_return.customer_visit_id is not null then
      update customer_visits set visit_outcome = 'return_requested' where id = v_return.customer_visit_id and visit_outcome in ('return_requested', 'damaged_return_requested');
    end if;

    insert into sales_return_posting_history (company_id, return_id, attempt_number, status, final_return_number, attempted_by, device_uid, online)
    values (v_return.company_id, p_return_id, v_attempt, 'succeeded', v_return.return_number, auth.uid(), p_device_uid, not p_is_offline);

    return jsonb_build_object('success', true, 'final_return_number', v_return.return_number, 'return_id', p_return_id, 'credit_amount', v_credit_amount);

  exception when others then
    update sales_returns set status = 'posting_failed', posting_status = 'posting_failed' where id = p_return_id;
    insert into sales_return_posting_history (company_id, return_id, attempt_number, status, error_message, attempted_by, device_uid, online)
    values (v_return.company_id, p_return_id, v_attempt, 'failed', sqlerrm, auth.uid(), p_device_uid, not p_is_offline);
    raise;
  end;
end;
$$;
grant execute on function post_return(uuid, text, boolean) to authenticated;

create or replace function retry_failed_return_posting(p_return_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not has_permission('sales_returns:retry_posting') then raise exception 'Not permitted'; end if;
  if (select status from sales_returns where id = p_return_id) != 'posting_failed' then
    raise exception 'Only returns with a failed posting attempt can be retried';
  end if;
  update sales_returns set status = 'ready_to_post' where id = p_return_id;
  return post_return(p_return_id);
end;
$$;
grant execute on function retry_failed_return_posting(uuid) to authenticated;
