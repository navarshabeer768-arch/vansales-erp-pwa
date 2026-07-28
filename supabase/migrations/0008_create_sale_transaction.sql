-- ============================================================================
-- 0008_create_sale_transaction.sql
-- One atomic entry point for the POS/Van Sales UI. Computes totals server-side
-- from authoritative product data, validates van stock, and either fully
-- commits (sale + items + payments + stock deduction + customer balance) or
-- fully rolls back — never a half-created sale.
-- ============================================================================

create or replace function create_sale(
  p_customer_id uuid,
  p_van_id uuid,
  p_salesman_id uuid,
  p_sale_type text,       -- 'cash' | 'credit' | 'pos'
  p_items jsonb,          -- [{product_id, batch_id, quantity, discount_pct, is_free_item}]
  p_payments jsonb,       -- [{method, amount, reference_no}]
  p_client_uuid text,     -- offline-generated idempotency key
  p_latitude numeric default null,
  p_longitude numeric default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_sale_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_product products%rowtype;
  v_available numeric;
  v_qty numeric;
  v_unit_price numeric;
  v_discount_pct numeric;
  v_discount_amt numeric;
  v_tax_amt numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_tax_total numeric := 0;
  v_grand_total numeric := 0;
  v_paid_total numeric := 0;
  v_invoice_no text;
begin
  if v_company_id is null then
    raise exception 'No company context for current user';
  end if;

  -- Idempotency: if this client_uuid was already processed (e.g. offline retry
  -- after a flaky connection), return the existing sale instead of duplicating.
  select id into v_existing_id from sales
    where company_id = v_company_id and client_uuid = p_client_uuid;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must have at least one item';
  end if;

  v_invoice_no := next_document_no(v_company_id, 'INV', 'sales_invoice_seq');

  -- Pass 1: validate stock and compute totals from authoritative product data
  -- (never trust client-supplied prices/taxes).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'product_id')::uuid and company_id = v_company_id;
    if not found then
      raise exception 'Product % not found', v_item->>'product_id';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'Quantity must be greater than zero for product %', v_product.name;
    end if;

    if p_van_id is not null then
      select coalesce(quantity, 0) into v_available from van_stock
        where van_id = p_van_id and product_id = v_product.id
          and batch_id is not distinct from nullif(v_item->>'batch_id', '')::uuid;
      if coalesce(v_available, 0) < v_qty then
        raise exception 'Insufficient van stock for % (have %, need %)', v_product.name, coalesce(v_available, 0), v_qty;
      end if;
    end if;

    v_unit_price := v_product.selling_price;
    v_discount_pct := coalesce((v_item->>'discount_pct')::numeric, 0);
    if (v_item->>'is_free_item')::boolean is true then
      v_unit_price := 0;
      v_discount_pct := 0;
    end if;

    v_discount_amt := round(v_unit_price * v_qty * v_discount_pct / 100, 2);
    v_tax_amt := round((v_unit_price * v_qty - v_discount_amt) * v_product.tax_rate / 100, 2);
    v_line_total := (v_unit_price * v_qty) - v_discount_amt + v_tax_amt;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_discount_total := v_discount_total + v_discount_amt;
    v_tax_total := v_tax_total + v_tax_amt;
  end loop;

  v_grand_total := v_subtotal - v_discount_total + v_tax_total;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_paid_total := v_paid_total + (v_payment->>'amount')::numeric;
  end loop;

  if p_sale_type != 'credit' and v_paid_total < v_grand_total then
    raise exception 'Payment total (%) is less than the sale total (%) for a % sale', v_paid_total, v_grand_total, p_sale_type;
  end if;

  -- Create the sale header
  insert into sales (
    company_id, invoice_no, customer_id, van_id, salesman_id, sale_type, channel,
    subtotal, discount_amount, tax_amount, total_amount, paid_amount, status,
    client_uuid, latitude, longitude
  ) values (
    v_company_id, v_invoice_no, p_customer_id, p_van_id, p_salesman_id, p_sale_type,
    case when p_van_id is not null then 'van' else 'pos' end,
    v_subtotal, v_discount_total, v_tax_total, v_grand_total, v_paid_total, 'completed',
    p_client_uuid, p_latitude, p_longitude
  ) returning id into v_sale_id;

  -- Pass 2: insert line items (re-walk the same array, same computation)
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := v_product.selling_price;
    v_discount_pct := coalesce((v_item->>'discount_pct')::numeric, 0);
    if (v_item->>'is_free_item')::boolean is true then
      v_unit_price := 0;
      v_discount_pct := 0;
    end if;
    v_discount_amt := round(v_unit_price * v_qty * v_discount_pct / 100, 2);
    v_tax_amt := round((v_unit_price * v_qty - v_discount_amt) * v_product.tax_rate / 100, 2);
    v_line_total := (v_unit_price * v_qty) - v_discount_amt + v_tax_amt;

    insert into sale_items (
      sale_id, product_id, batch_id, unit_id, quantity, unit_price,
      discount_pct, discount_amount, tax_rate, tax_amount, is_free_item, line_total
    ) values (
      v_sale_id, v_product.id, nullif(v_item->>'batch_id', '')::uuid, v_product.base_unit_id,
      v_qty, v_unit_price, v_discount_pct, v_discount_amt, v_product.tax_rate, v_tax_amt,
      coalesce((v_item->>'is_free_item')::boolean, false), v_line_total
    );

    if p_van_id is not null then
      perform _add_van_stock(p_van_id, v_product.id, nullif(v_item->>'batch_id', '')::uuid, -v_qty);
    end if;

    insert into stock_movements (
      company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id
    ) values (
      v_company_id, v_product.id, nullif(v_item->>'batch_id', '')::uuid, 'sale_out',
      case when p_van_id is not null then 'van' else 'warehouse' end, p_van_id,
      'customer', p_customer_id, v_qty, 'sales', v_sale_id
    );
  end loop;

  -- Payments
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into sale_payments (sale_id, method, amount, reference_no)
    values (v_sale_id, v_payment->>'method', (v_payment->>'amount')::numeric, v_payment->>'reference_no');
  end loop;

  -- Customer running balance (credit sales / underpaid sales)
  if p_customer_id is not null and (v_grand_total - v_paid_total) > 0 then
    update customers set outstanding_balance = outstanding_balance + (v_grand_total - v_paid_total)
    where id = p_customer_id;
  end if;

  return v_sale_id;
end;
$$;

grant execute on function create_sale(uuid, uuid, uuid, text, jsonb, jsonb, text, numeric, numeric) to authenticated;
