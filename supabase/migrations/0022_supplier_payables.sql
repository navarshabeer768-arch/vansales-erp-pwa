-- ============================================================================
-- 0022_supplier_payables.sql
-- Adds an accounts-payable balance to suppliers (mirroring
-- customers.outstanding_balance for AR), auto-increased by receive_goods(),
-- and a pay_supplier() RPC that atomically records a payment and reduces it.
-- ============================================================================

alter table suppliers add column if not exists outstanding_payable numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- receive_goods() now also increases the supplier's payable balance by the
-- total cost of what was received (only when a supplier is given).
-- ---------------------------------------------------------------------------
create or replace function receive_goods(
  p_warehouse_id uuid,
  p_supplier_id uuid,
  p_po_id uuid,
  p_supplier_invoice_no text,
  p_items jsonb
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_grn_id uuid;
  v_item jsonb;
  v_batch_id uuid;
  v_grn_no text;
  v_po_total_ordered numeric;
  v_po_total_received numeric;
  v_total_cost numeric := 0;
begin
  if v_company_id is null then raise exception 'No company context'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A goods receipt must have at least one item';
  end if;

  v_grn_no := 'GRN-' || to_char(now(), 'YYMM') || '-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');

  insert into goods_receipts (company_id, grn_no, po_id, supplier_id, warehouse_id, supplier_invoice_no, received_by)
  values (v_company_id, v_grn_no, p_po_id, p_supplier_id, p_warehouse_id, p_supplier_invoice_no, auth.uid())
  returning id into v_grn_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_batch_id := nullif(v_item->>'batch_id', '')::uuid;

    if v_batch_id is null and coalesce(v_item->>'batch_no', '') != '' then
      insert into batches (company_id, product_id, batch_no, expiry_date, cost_price)
      values (
        v_company_id, (v_item->>'product_id')::uuid, v_item->>'batch_no',
        nullif(v_item->>'expiry_date', '')::date, (v_item->>'unit_cost')::numeric
      )
      on conflict (company_id, product_id, batch_no) do update set expiry_date = excluded.expiry_date
      returning id into v_batch_id;
    end if;

    insert into goods_receipt_items (grn_id, product_id, batch_id, quantity, unit_cost)
    values (v_grn_id, (v_item->>'product_id')::uuid, v_batch_id, (v_item->>'quantity')::numeric, (v_item->>'unit_cost')::numeric);

    perform _add_warehouse_stock(p_warehouse_id, (v_item->>'product_id')::uuid, v_batch_id, (v_item->>'quantity')::numeric);

    insert into stock_movements (
      company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by
    ) values (
      v_company_id, (v_item->>'product_id')::uuid, v_batch_id, 'purchase_in',
      'supplier', p_supplier_id, 'warehouse', p_warehouse_id,
      (v_item->>'quantity')::numeric, 'goods_receipts', v_grn_id, auth.uid()
    );

    update products set cost_price = (v_item->>'unit_cost')::numeric
    where id = (v_item->>'product_id')::uuid and company_id = v_company_id;

    v_total_cost := v_total_cost + (v_item->>'quantity')::numeric * (v_item->>'unit_cost')::numeric;

    if p_po_id is not null then
      update purchase_order_items
      set received_quantity = received_quantity + (v_item->>'quantity')::numeric
      where po_id = p_po_id and product_id = (v_item->>'product_id')::uuid;
    end if;
  end loop;

  if p_supplier_id is not null and v_total_cost > 0 then
    update suppliers set outstanding_payable = outstanding_payable + v_total_cost where id = p_supplier_id;
  end if;

  if p_po_id is not null then
    select sum(quantity), sum(received_quantity) into v_po_total_ordered, v_po_total_received
    from purchase_order_items where po_id = p_po_id;

    update purchase_orders set status = case
      when v_po_total_received >= v_po_total_ordered then 'received'
      when v_po_total_received > 0 then 'partially_received'
      else status
    end where id = p_po_id;
  end if;

  return v_grn_id;
end;
$$;

grant execute on function receive_goods(uuid, uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- pay_supplier(): atomic — inserts the payment record and reduces the
-- payable balance in one transaction.
-- ---------------------------------------------------------------------------
create or replace function pay_supplier(
  p_supplier_id uuid, p_amount numeric, p_method text, p_reference_no text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_payment_id uuid;
begin
  if v_company_id is null then raise exception 'No company context'; end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;

  insert into supplier_payments (company_id, supplier_id, amount, method, reference_no)
  values (v_company_id, p_supplier_id, p_amount, p_method, p_reference_no)
  returning id into v_payment_id;

  update suppliers set outstanding_payable = outstanding_payable - p_amount where id = p_supplier_id;

  return v_payment_id;
end;
$$;

grant execute on function pay_supplier(uuid, numeric, text, text) to authenticated;
