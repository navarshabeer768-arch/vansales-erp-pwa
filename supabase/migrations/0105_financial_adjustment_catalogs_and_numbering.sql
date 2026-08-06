-- ============================================================================
-- 0105_financial_adjustment_catalogs_and_numbering.sql
-- Phase 5B.4 Part 1: Credit Notes, Debit Notes, Customer Adjustment Entry.
--
-- credit_notes/debit_notes/customer_adjustments are a NEW, general-purpose
-- manual entry module — distinct from sales_return_credit_notes (5B.3
-- Part 2), which is auto-generated during return posting and already
-- fully working. They coexist. customer_ledger_transactions already
-- has 'credit_note'/'debit_note' transaction types (4A.2 Part 2) —
-- reused in Part 2 of this phase, not needed for this draft-only Part
-- 1. "Branch" reuses warehouses, same as sales_returns.branch_id.
-- ============================================================================

create table financial_document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  document_category text not null check (document_category in ('credit_note', 'debit_note', 'customer_adjustment')),
  label text not null,
  invoice_required boolean not null default false,
  return_required boolean not null default false,
  requires_reason boolean not null default true,
  default_adjustment_type text check (default_adjustment_type in (
    'item_adjustment', 'amount_adjustment', 'price_adjustment', 'quantity_adjustment',
    'discount_adjustment', 'tax_adjustment', 'promotion_adjustment', 'mixed_adjustment'
  )),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_financial_document_types_system_code on financial_document_types(code) where company_id is null;
create unique index idx_financial_document_types_company_code on financial_document_types(code, company_id) where company_id is not null;

insert into financial_document_types (code, company_id, document_category, label, invoice_required, return_required, default_adjustment_type, is_system) values
  ('manual_credit_note', null, 'credit_note', 'Manual Credit Note', false, false, 'amount_adjustment', true),
  ('credit_note_from_return', null, 'credit_note', 'Credit Note From Sales Return', false, true, 'amount_adjustment', true),
  ('customer_goodwill_credit', null, 'credit_note', 'Customer Goodwill Credit', false, false, 'amount_adjustment', true),
  ('short_billing_adjustment', null, 'credit_note', 'Short Billing Adjustment', true, false, 'amount_adjustment', true),
  ('special_discount_adjustment', null, 'credit_note', 'Special Discount Adjustment', true, false, 'discount_adjustment', true),
  ('manual_debit_note', null, 'debit_note', 'Manual Debit Note', false, false, 'amount_adjustment', true),
  ('customer_penalty_debit', null, 'debit_note', 'Customer Penalty Debit', false, false, 'amount_adjustment', true),
  ('over_billing_adjustment', null, 'debit_note', 'Over Billing Adjustment', true, false, 'amount_adjustment', true),
  ('price_correction', null, 'customer_adjustment', 'Price Correction', true, false, 'price_adjustment', true),
  ('quantity_adjustment', null, 'customer_adjustment', 'Quantity Adjustment', true, false, 'quantity_adjustment', true),
  ('discount_adjustment', null, 'customer_adjustment', 'Discount Adjustment', true, false, 'discount_adjustment', true),
  ('promotion_adjustment', null, 'customer_adjustment', 'Promotion Adjustment', true, false, 'promotion_adjustment', true),
  ('tax_adjustment', null, 'customer_adjustment', 'Tax Adjustment', true, false, 'tax_adjustment', true),
  ('commercial_adjustment', null, 'customer_adjustment', 'Commercial Adjustment', false, false, 'mixed_adjustment', true),
  ('other_financial_adjustment', null, 'customer_adjustment', 'Other Financial Adjustment', false, false, 'mixed_adjustment', true);

alter table financial_document_types enable row level security;
create policy financial_document_types_read on financial_document_types for select
  using (company_id is null or company_id = current_company_id());
create policy financial_document_types_write on financial_document_types for insert with check (company_id = current_company_id());
create policy financial_document_types_update on financial_document_types for update using (company_id = current_company_id());
create policy financial_document_types_delete on financial_document_types for delete using (company_id = current_company_id());

create table financial_adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  applies_to text not null check (applies_to in ('credit_note', 'debit_note', 'customer_adjustment', 'all')),
  label text not null,
  requires_notes boolean not null default false,
  is_active boolean not null default true
);
create unique index idx_financial_adjustment_reasons_system_code on financial_adjustment_reasons(code) where company_id is null;
create unique index idx_financial_adjustment_reasons_company_code on financial_adjustment_reasons(code, company_id) where company_id is not null;

insert into financial_adjustment_reasons (code, company_id, applies_to, label, requires_notes) values
  ('pricing_error', null, 'all', 'Pricing Error', false),
  ('quantity_dispute', null, 'all', 'Quantity Dispute', false),
  ('discount_not_applied', null, 'credit_note', 'Discount Not Applied', false),
  ('discount_applied_in_error', null, 'debit_note', 'Discount Applied In Error', false),
  ('promotion_error', null, 'all', 'Promotion Error', false),
  ('tax_calculation_error', null, 'all', 'Tax Calculation Error', false),
  ('short_delivery', null, 'credit_note', 'Short Delivery', false),
  ('over_delivery', null, 'debit_note', 'Over Delivery', false),
  ('customer_goodwill', null, 'credit_note', 'Customer Goodwill', true),
  ('late_payment_penalty', null, 'debit_note', 'Late Payment Penalty', true),
  ('damaged_on_delivery', null, 'credit_note', 'Damaged On Delivery', false),
  ('commercial_negotiation', null, 'all', 'Commercial Negotiation', true),
  ('system_error_correction', null, 'all', 'System Error Correction', false),
  ('duplicate_billing', null, 'credit_note', 'Duplicate Billing', false),
  ('missing_charge', null, 'debit_note', 'Missing Charge', false),
  ('other', null, 'all', 'Other', true);

alter table financial_adjustment_reasons enable row level security;
create policy financial_adjustment_reasons_read on financial_adjustment_reasons for select
  using (company_id is null or company_id = current_company_id());
create policy financial_adjustment_reasons_write on financial_adjustment_reasons for insert with check (company_id = current_company_id());
create policy financial_adjustment_reasons_update on financial_adjustment_reasons for update using (company_id = current_company_id());
create policy financial_adjustment_reasons_delete on financial_adjustment_reasons for delete using (company_id = current_company_id());

create sequence if not exists credit_note_seq;
create sequence if not exists debit_note_seq;
create sequence if not exists customer_adjustment_seq;

create or replace function next_financial_document_no(p_document_category text, p_branch_code text default null)
returns text language plpgsql as $$
declare v_num bigint; v_prefix text; v_branch_part text;
begin
  v_prefix := case p_document_category
    when 'credit_note' then 'CRN'
    when 'debit_note' then 'DBN'
    when 'customer_adjustment' then 'ADJ'
    else 'DOC'
  end;
  v_branch_part := case when p_branch_code is not null then p_branch_code || '-' else '' end;

  case p_document_category
    when 'credit_note' then select nextval('credit_note_seq') into v_num;
    when 'debit_note' then select nextval('debit_note_seq') into v_num;
    else select nextval('customer_adjustment_seq') into v_num;
  end case;

  return v_prefix || '-' || v_branch_part || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;
