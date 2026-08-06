-- ============================================================================
-- 0110_adjustment_draft_editing_and_cancellation.sql
-- Continues 0105-0109.
-- ============================================================================

create or replace function update_credit_note_draft(
  p_id uuid, p_customer_id uuid default null, p_original_invoice_id uuid default null,
  p_reason_code text default null, p_reference_number text default null,
  p_internal_notes text default null, p_customer_notes text default null, p_amount_only_value numeric default null
) returns void language plpgsql security definer as $$
declare
  v_doc credit_notes%rowtype;
  v_reason_id uuid;
  v_changed boolean := false;
begin
  if not has_permission('financial_adjustments:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from credit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Credit note not found'; end if;
  if v_doc.status != 'draft' then raise exception 'Only draft credit notes can be edited (currently %)', v_doc.status; end if;

  if (p_customer_id is not null and p_customer_id != v_doc.customer_id)
    or (p_original_invoice_id is not null and p_original_invoice_id != v_doc.original_invoice_id) then
    v_changed := true;
  end if;

  if v_changed then
    delete from credit_note_items where credit_note_id = p_id;
    update credit_notes set gross_amount = 0, discount_amount = 0, tax_amount = 0, net_amount = coalesce(p_amount_only_value, 0) where id = p_id;
  elsif p_amount_only_value is not null then
    update credit_notes set gross_amount = p_amount_only_value, net_amount = p_amount_only_value where id = p_id;
  end if;

  if p_reason_code is not null then
    select id into v_reason_id from financial_adjustment_reasons where code = p_reason_code and (company_id is null or company_id = v_doc.company_id) order by company_id nulls last limit 1;
  end if;

  update credit_notes set
    customer_id = coalesce(p_customer_id, customer_id),
    original_invoice_id = case when p_original_invoice_id is not null then p_original_invoice_id else original_invoice_id end,
    reason_id = coalesce(v_reason_id, reason_id),
    reference_number = coalesce(p_reference_number, reference_number),
    internal_notes = coalesce(p_internal_notes, internal_notes),
    customer_notes = coalesce(p_customer_notes, customer_notes),
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
end;
$$;
grant execute on function update_credit_note_draft(uuid, uuid, uuid, text, text, text, text, numeric) to authenticated;

create or replace function cancel_credit_note_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc credit_notes%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from credit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Credit note not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;

  perform change_credit_note_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'credit_notes', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_credit_note_draft(uuid, text, text) to authenticated;

create or replace function delete_unsynced_credit_note_draft(p_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from credit_notes where id = p_id and company_id = current_company_id();
  if v_status is null then raise exception 'Credit note not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from credit_notes where id = p_id;
end;
$$;
grant execute on function delete_unsynced_credit_note_draft(uuid) to authenticated;

create or replace function update_debit_note_draft(
  p_id uuid, p_customer_id uuid default null, p_original_invoice_id uuid default null,
  p_reason_code text default null, p_reference_number text default null,
  p_internal_notes text default null, p_customer_notes text default null, p_amount_only_value numeric default null
) returns void language plpgsql security definer as $$
declare
  v_doc debit_notes%rowtype;
  v_reason_id uuid;
  v_changed boolean := false;
begin
  if not has_permission('financial_adjustments:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from debit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Debit note not found'; end if;
  if v_doc.status != 'draft' then raise exception 'Only draft debit notes can be edited (currently %)', v_doc.status; end if;

  if (p_customer_id is not null and p_customer_id != v_doc.customer_id)
    or (p_original_invoice_id is not null and p_original_invoice_id != v_doc.original_invoice_id) then
    v_changed := true;
  end if;

  if v_changed then
    delete from debit_note_items where debit_note_id = p_id;
    update debit_notes set gross_amount = 0, discount_amount = 0, tax_amount = 0, net_amount = coalesce(p_amount_only_value, 0) where id = p_id;
  elsif p_amount_only_value is not null then
    update debit_notes set gross_amount = p_amount_only_value, net_amount = p_amount_only_value where id = p_id;
  end if;

  if p_reason_code is not null then
    select id into v_reason_id from financial_adjustment_reasons where code = p_reason_code and (company_id is null or company_id = v_doc.company_id) order by company_id nulls last limit 1;
  end if;

  update debit_notes set
    customer_id = coalesce(p_customer_id, customer_id),
    original_invoice_id = case when p_original_invoice_id is not null then p_original_invoice_id else original_invoice_id end,
    reason_id = coalesce(v_reason_id, reason_id),
    reference_number = coalesce(p_reference_number, reference_number),
    internal_notes = coalesce(p_internal_notes, internal_notes),
    customer_notes = coalesce(p_customer_notes, customer_notes),
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
end;
$$;
grant execute on function update_debit_note_draft(uuid, uuid, uuid, text, text, text, text, numeric) to authenticated;

create or replace function cancel_debit_note_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc debit_notes%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from debit_notes where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Debit note not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;

  perform change_debit_note_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'debit_notes', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_debit_note_draft(uuid, text, text) to authenticated;

create or replace function delete_unsynced_debit_note_draft(p_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from debit_notes where id = p_id and company_id = current_company_id();
  if v_status is null then raise exception 'Debit note not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from debit_notes where id = p_id;
end;
$$;
grant execute on function delete_unsynced_debit_note_draft(uuid) to authenticated;

create or replace function update_customer_adjustment_draft(
  p_id uuid, p_reason_code text default null, p_reference_number text default null,
  p_internal_notes text default null, p_customer_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_doc customer_adjustments%rowtype;
  v_reason_id uuid;
begin
  if not has_permission('financial_adjustments:edit_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from customer_adjustments where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Customer adjustment not found'; end if;
  if v_doc.status != 'draft' then raise exception 'Only draft adjustments can be edited (currently %)', v_doc.status; end if;

  if p_reason_code is not null then
    select id into v_reason_id from financial_adjustment_reasons where code = p_reason_code and (company_id is null or company_id = v_doc.company_id) order by company_id nulls last limit 1;
  end if;

  update customer_adjustments set
    reason_id = coalesce(v_reason_id, reason_id),
    reference_number = coalesce(p_reference_number, reference_number),
    internal_notes = coalesce(p_internal_notes, internal_notes),
    customer_notes = coalesce(p_customer_notes, customer_notes),
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
end;
$$;
grant execute on function update_customer_adjustment_draft(uuid, text, text, text, text) to authenticated;

create or replace function cancel_customer_adjustment_draft(p_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_doc customer_adjustments%rowtype;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_doc from customer_adjustments where id = p_id and company_id = current_company_id();
  if not found then raise exception 'Customer adjustment not found'; end if;
  if v_doc.status = 'cancelled' then return; end if;

  perform change_customer_adjustment_status(p_id, 'cancelled', p_reason);
  if p_notes is not null then
    insert into adjustment_notes (company_id, document_table, document_id, note, note_type, created_by)
    values (v_doc.company_id, 'customer_adjustments', p_id, p_notes, 'internal', auth.uid());
  end if;
end;
$$;
grant execute on function cancel_customer_adjustment_draft(uuid, text, text) to authenticated;

create or replace function delete_unsynced_customer_adjustment_draft(p_id uuid)
returns void language plpgsql security definer as $$
declare v_status text;
begin
  if not has_permission('financial_adjustments:cancel_draft') then raise exception 'Not permitted'; end if;
  select status into v_status from customer_adjustments where id = p_id and company_id = current_company_id();
  if v_status is null then raise exception 'Customer adjustment not found'; end if;
  if v_status not in ('draft', 'sync_failed') then raise exception 'Only unsynced drafts can be deleted (currently %)', v_status; end if;
  delete from customer_adjustments where id = p_id;
end;
$$;
grant execute on function delete_unsynced_customer_adjustment_draft(uuid) to authenticated;
