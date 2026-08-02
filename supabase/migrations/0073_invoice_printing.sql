-- ============================================================================
-- 0073_invoice_printing.sql
-- Continues 0066-0072. Reuses print_settings (3B.3) for template config.
-- ============================================================================

create table sales_invoice_print_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  print_type text not null check (print_type in ('original', 'duplicate', 'reprint')),
  paper_size text not null check (paper_size in ('58mm', '80mm', 'a4')),
  reprint_count integer not null default 0,
  reprint_reason text,
  printed_by uuid references app_users(id),
  printed_at timestamptz not null default now(),
  printer_name text,
  printer_type text check (printer_type in ('bluetooth', 'usb', 'wifi', 'network', 'browser')),
  device_id uuid references devices(id) on delete set null
);
create index idx_sales_invoice_print_history_invoice on sales_invoice_print_history(invoice_id);

alter table sales_invoice_print_history enable row level security;
create policy sales_invoice_print_history_isolation on sales_invoice_print_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_print_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  printer_name text,
  printer_type text,
  error_message text not null,
  device_id uuid references devices(id) on delete set null,
  occurred_by uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index idx_sales_invoice_print_errors_invoice on sales_invoice_print_errors(invoice_id);

alter table sales_invoice_print_errors enable row level security;
create policy sales_invoice_print_errors_isolation on sales_invoice_print_errors for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_invoice_print_error(
  p_invoice_id uuid, p_error_message text, p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid; v_error_id uuid;
begin
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  insert into sales_invoice_print_errors (company_id, invoice_id, printer_name, printer_type, error_message, device_id, occurred_by)
  values (v_company_id, p_invoice_id, p_printer_name, p_printer_type, p_error_message, v_device_id, auth.uid())
  returning id into v_error_id;

  return v_error_id;
end;
$$;
grant execute on function record_invoice_print_error(uuid, text, text, text, text) to authenticated;

create or replace function record_invoice_print(
  p_invoice_id uuid, p_paper_size text, p_print_type text default null, p_reprint_reason text default null,
  p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
  v_prior_count integer;
  v_type text;
  v_history_id uuid;
begin
  if not has_permission('sales_invoices:print_invoice') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  select count(*) into v_prior_count from sales_invoice_print_history where invoice_id = p_invoice_id;

  if p_print_type is not null then
    v_type := p_print_type;
    if v_type = 'reprint' and not has_permission('sales_invoices:reprint_invoice') then raise exception 'Not permitted to reprint'; end if;
  else
    v_type := case when v_prior_count = 0 then 'original' else 'reprint' end;
    if v_type = 'reprint' and not has_permission('sales_invoices:reprint_invoice') then raise exception 'Not permitted to reprint'; end if;
  end if;

  insert into sales_invoice_print_history (company_id, invoice_id, print_type, paper_size, reprint_count, reprint_reason, printed_by, printer_name, printer_type, device_id)
  values (v_company_id, p_invoice_id, v_type, p_paper_size, greatest(v_prior_count, 0), p_reprint_reason, auth.uid(), p_printer_name, p_printer_type, v_device_id)
  returning id into v_history_id;

  insert into print_logs (company_id, device_id, employee_id, document_type, reference_id, printer_type, copies)
  values (v_company_id, v_device_id, auth.uid(), 'invoice', p_invoice_id,
    case p_paper_size when 'a4' then 'browser_a4' when '58mm' then 'browser_58mm' else 'browser_80mm' end, 1);

  return v_history_id;
end;
$$;
grant execute on function record_invoice_print(uuid, text, text, text, text, text, text) to authenticated;
