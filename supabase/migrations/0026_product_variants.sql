-- ============================================================================
-- 0026_product_variants.sql
-- Extends product_variants with barcode/image/absolute-price-override, and
-- adds a lightweight variant_stock table for per-variant quantity tracking
-- per warehouse/van. This is deliberately kept separate from the core
-- warehouse_stock/van_stock tables (and their FIFO/batch movement engine)
-- rather than threading variant_id through every existing stock RPC —
-- that would be a much bigger, riskier change to code that's already
-- working in production. Variant stock here is a simple counter; batch/
-- expiry tracking for variants is not covered by this table.
-- ============================================================================

alter table product_variants add column if not exists barcode text;
alter table product_variants add column if not exists image_url text;
alter table product_variants add column if not exists cost_price numeric(12,2);
alter table product_variants add column if not exists selling_price_override numeric(12,2);

alter table product_variants enable row level security;
create policy product_variants_full_isolation on product_variants for all
  using (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()))
  with check (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()));

create table variant_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (variant_id, location_type, location_id)
);
create index idx_variant_stock_variant on variant_stock(variant_id);

alter table variant_stock enable row level security;
create policy variant_stock_isolation on variant_stock for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function adjust_variant_stock(
  p_variant_id uuid, p_location_type text, p_location_id uuid, p_delta numeric
) returns void language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
begin
  if not has_permission('inventory:edit') then
    raise exception 'Not permitted to adjust variant stock';
  end if;

  insert into variant_stock (company_id, variant_id, location_type, location_id, quantity)
  values (v_company_id, p_variant_id, p_location_type, p_location_id, p_delta)
  on conflict (variant_id, location_type, location_id)
  do update set quantity = variant_stock.quantity + excluded.quantity, updated_at = now();

  if (select quantity from variant_stock where variant_id = p_variant_id and location_type = p_location_type and location_id = p_location_id) < 0 then
    raise exception 'Variant stock cannot go negative';
  end if;
end;
$$;

grant execute on function adjust_variant_stock(uuid, text, uuid, numeric) to authenticated;
