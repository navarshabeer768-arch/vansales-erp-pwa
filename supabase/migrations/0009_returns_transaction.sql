-- ============================================================================
-- 0009_returns_transaction.sql
-- Approval RPC for the Returns module. Scope for this phase: sales_return
-- (customer hands goods back — restock + credit the customer) and
-- purchase_return (goods go back to a supplier — de-stock a warehouse).
-- damage/expiry return records remain in the schema for future use, but
-- those flows are already handled at the point of van unloading.
-- ============================================================================

create or replace function approve_return(p_return_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_return returns%rowtype;
  v_item record;
  v_total numeric := 0;
begin
  select * into v_return from returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.status = 'approved' then raise exception 'Return already approved'; end if;
  if v_return.return_type not in ('sales_return', 'purchase_return') then
    raise exception 'Approval for % returns is handled via Van Unloading, not this workflow', v_return.return_type;
  end if;
  if v_return.location_type is null or v_return.location_id is null then
    raise exception 'Return has no stock location set';
  end if;

  for v_item in select * from return_items where return_id = p_return_id loop
    if v_return.return_type = 'sales_return' then
      if v_return.location_type = 'warehouse' then
        perform _add_warehouse_stock(v_return.location_id, v_item.product_id, v_item.batch_id, v_item.quantity);
      else
        perform _add_van_stock(v_return.location_id, v_item.product_id, v_item.batch_id, v_item.quantity);
      end if;
    else -- purchase_return: stock leaves the warehouse back to the supplier
      if v_return.location_type != 'warehouse' then
        raise exception 'Purchase returns must be from a warehouse';
      end if;
      perform _add_warehouse_stock(v_return.location_id, v_item.product_id, v_item.batch_id, -v_item.quantity);
    end if;

    insert into stock_movements (
      company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by
    ) values (
      current_company_id(), v_item.product_id, v_item.batch_id,
      case when v_return.return_type = 'sales_return' then 'sales_return_in' else 'purchase_return_out' end,
      case when v_return.return_type = 'sales_return' then 'customer' else v_return.location_type end,
      case when v_return.return_type = 'sales_return' then v_return.customer_id else v_return.location_id end,
      case when v_return.return_type = 'sales_return' then v_return.location_type else 'supplier' end,
      case when v_return.return_type = 'sales_return' then v_return.location_id else v_return.supplier_id end,
      v_item.quantity, 'returns', p_return_id, p_approver_id
    );

    v_total := v_total + v_item.line_total;
  end loop;

  if v_return.return_type = 'sales_return' and v_return.customer_id is not null then
    update customers set outstanding_balance = outstanding_balance - v_total where id = v_return.customer_id;
  end if;

  update returns set status = 'approved', approved_by = p_approver_id, approved_at = now(), total_amount = v_total
  where id = p_return_id;
end;
$$;

grant execute on function approve_return(uuid, uuid) to authenticated;
