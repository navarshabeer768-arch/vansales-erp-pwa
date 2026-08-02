-- ============================================================================
-- 0072_void_requests_cancellation_permissions_audit.sql
-- Continues 0066-0071.
-- ============================================================================

create table sales_invoice_void_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  reason text not null,
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  original_snapshot jsonb not null,
  related_stock_movement_ids uuid[] not null default '{}',
  related_ledger_transaction_id uuid,
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz
);
create index idx_sales_invoice_void_requests_invoice on sales_invoice_void_requests(invoice_id);
create index idx_sales_invoice_void_requests_status on sales_invoice_void_requests(company_id, approval_status);

alter table sales_invoice_void_requests enable row level security;
create policy sales_invoice_void_requests_isolation on sales_invoice_void_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function create_invoice_void_request(p_invoice_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_snapshot jsonb;
  v_movement_ids uuid[];
  v_ledger_id uuid;
  v_request_id uuid;
begin
  if not has_permission('sales_invoices:request_void') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.posting_status != 'posted' then raise exception 'Only posted invoices can have a void request'; end if;

  select jsonb_build_object('invoice', to_jsonb(v_invoice), 'items', (select jsonb_agg(to_jsonb(i)) from sales_invoice_items i where i.invoice_id = p_invoice_id))
  into v_snapshot;

  select array_agg(id) into v_movement_ids from stock_movements where reference_table = 'sales_invoices' and reference_id = p_invoice_id;
  select id into v_ledger_id from customer_ledger_transactions where reference_table = 'sales_invoices' and reference_id = p_invoice_id limit 1;

  insert into sales_invoice_void_requests (company_id, invoice_id, reason, requested_by, original_snapshot, related_stock_movement_ids, related_ledger_transaction_id)
  values (v_invoice.company_id, p_invoice_id, p_reason, auth.uid(), v_snapshot, coalesce(v_movement_ids, '{}'), v_ledger_id)
  returning id into v_request_id;

  update sales_invoices set status = 'void_requested' where id = p_invoice_id;
  return v_request_id;
end;
$$;
grant execute on function create_invoice_void_request(uuid, text) to authenticated;

create or replace function decide_invoice_void_request(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_request sales_invoice_void_requests%rowtype;
begin
  if not has_permission('sales_invoices:approve_void') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_invoice_void_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  update sales_invoice_void_requests set
    approval_status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;

  update sales_invoices set status = case when p_approve then 'voided' else 'posted' end where id = v_request.invoice_id;
end;
$$;
grant execute on function decide_invoice_void_request(uuid, boolean, text) to authenticated;

create or replace function cancel_sales_invoice(p_invoice_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_invoice sales_invoices%rowtype;
begin
  if not has_permission('sales_invoices:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled_before_posting' then return; end if;
  if v_invoice.posting_status != 'not_posted' then raise exception 'Posted invoices cannot be cancelled through this function'; end if;

  update sales_invoice_approval_steps set status = 'cancelled'
  where approval_id in (select id from sales_invoice_approvals where invoice_id = p_invoice_id) and status = 'pending';

  perform change_sales_invoice_status(p_invoice_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into sales_invoice_notes (company_id, invoice_id, note, note_type, created_by)
    values (v_invoice.company_id, p_invoice_id, p_notes, 'internal', auth.uid());
  end if;

  perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'system', 'Draft Cancelled',
    format('Invoice %s was cancelled: %s', v_invoice.invoice_number, p_reason));
end;
$$;
grant execute on function cancel_sales_invoice(uuid, text, text) to authenticated;

insert into permissions (module, action, description)
select 'sales_invoices', a, 'Sales invoices: ' || a
from unnest(array[
  'validate_stock', 'select_stock_source', 'consume_reservation', 'allocate_batch', 'override_fifo_fefo', 'select_serial',
  'validate_credit', 'convert_credit_reservation', 'approve_credit_override',
  'submit_for_approval', 'approve_invoice', 'partially_approve_invoice', 'reject_invoice', 'return_for_correction',
  'place_on_hold', 'release_hold', 'approve_price_override', 'approve_discount_override', 'approve_free_quantity',
  'post_invoice', 'retry_failed_posting', 'cancel_unposted', 'request_void', 'approve_void',
  'print_invoice', 'reprint_invoice', 'manage_print_templates', 'use_controlled_offline_posting', 'resolve_offline_conflict',
  'view_stock_details', 'view_credit_details', 'view_cost', 'view_profit'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'sales_invoices'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'sales_invoice_stock_validations', 'sales_invoice_stock_allocations', 'sales_invoice_item_batches', 'sales_invoice_item_serials',
    'sales_invoice_credit_validations', 'sales_invoice_credit_conversions', 'sales_invoice_credit_override_requests',
    'sales_invoice_approvals', 'sales_invoice_approval_steps', 'sales_invoice_approval_history',
    'sales_invoice_price_override_approvals', 'sales_invoice_discount_override_approvals', 'sales_invoice_free_quantity_approvals',
    'sales_invoice_hold_history', 'sales_invoice_posting_history', 'sales_invoice_void_requests'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
