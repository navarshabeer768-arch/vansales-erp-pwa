-- ============================================================================
-- 0084_payment_method_posting_records.sql
-- Continues 0081-0083.
-- ============================================================================

create table cash_collection_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(14,2) not null,
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  collected_by uuid references app_users(id),
  van_id uuid references vans(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  collection_location text,
  collection_date timestamptz not null default now(),
  settlement_status text not null default 'unsettled' check (settlement_status in ('unsettled', 'partially_settled', 'settled', 'short', 'excess', 'disputed')),
  cash_account_reference text
);
create index idx_cash_collection_records_receipt on cash_collection_records(receipt_id);

alter table cash_collection_records enable row level security;
create policy cash_collection_records_isolation on cash_collection_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table cash_denomination_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cash_collection_id uuid not null references cash_collection_records(id) on delete cascade,
  denomination numeric(8,2) not null,
  quantity integer not null check (quantity >= 0),
  line_amount numeric(12,2) not null
);
create index idx_cash_denomination_records_collection on cash_denomination_records(cash_collection_id);

alter table cash_denomination_records enable row level security;
create policy cash_denomination_records_isolation on cash_denomination_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table card_collection_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(14,2) not null,
  card_type text,
  terminal text,
  merchant_reference text,
  authorization_code text,
  last_four_digits text,
  transaction_date timestamptz,
  verification_status text not null default 'pending_verification' check (verification_status in ('pending_verification', 'verified', 'rejected', 'reversed')),
  settlement_status text not null default 'unsettled' check (settlement_status in ('unsettled', 'settled'))
);
create index idx_card_collection_records_receipt on card_collection_records(receipt_id);

alter table card_collection_records enable row level security;
create policy card_collection_records_isolation on card_collection_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table bank_transfer_collection_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(14,2) not null,
  receiving_bank_account text,
  transfer_reference text,
  transaction_date timestamptz,
  value_date date,
  sender_bank text,
  verification_status text not null default 'pending_verification' check (verification_status in ('pending_verification', 'verified', 'rejected', 'reversed')),
  verified_by uuid references app_users(id),
  verification_date timestamptz,
  attachment_reference text
);
create index idx_bank_transfer_collection_records_receipt on bank_transfer_collection_records(receipt_id);

alter table bank_transfer_collection_records enable row level security;
create policy bank_transfer_collection_records_isolation on bank_transfer_collection_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table digital_payment_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete restrict,
  payment_component_id uuid not null references receipt_payment_components(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(14,2) not null,
  provider text not null,
  transaction_id text,
  reference text,
  transaction_time timestamptz,
  verification_status text not null default 'pending_verification' check (verification_status in ('pending_verification', 'verified', 'rejected')),
  provider_status text,
  verified_by uuid references app_users(id)
);
create index idx_digital_payment_records_receipt on digital_payment_records(receipt_id);

alter table digital_payment_records enable row level security;
create policy digital_payment_records_isolation on digital_payment_records for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function post_receipt_payment_components(p_receipt_id uuid)
returns void language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_component record;
  v_cash_id uuid;
  v_denom_text text;
  v_pair text;
  v_qty integer;
  v_denom numeric;
begin
  select * into v_receipt from receipt_vouchers where id = p_receipt_id;

  for v_component in select * from receipt_payment_components where receipt_id = p_receipt_id loop
    if v_component.payment_method_code = 'cash' then
      insert into cash_collection_records (company_id, receipt_id, payment_component_id, customer_id, amount, collected_by, van_id, route_id, collection_date)
      values (v_receipt.company_id, p_receipt_id, v_component.id, v_receipt.customer_id, v_component.amount, v_receipt.responsible_employee_id, v_receipt.van_id, v_receipt.route_id, v_receipt.receipt_time)
      returning id into v_cash_id;

      if v_component.notes like '%Denominations:%' then
        v_denom_text := split_part(v_component.notes, 'Denominations:', 2);
        foreach v_pair in array string_to_array(trim(v_denom_text), ', ') loop
          if v_pair like '%x%' then
            v_qty := split_part(v_pair, 'x', 1)::integer;
            v_denom := split_part(v_pair, 'x', 2)::numeric;
            insert into cash_denomination_records (company_id, cash_collection_id, denomination, quantity, line_amount)
            values (v_receipt.company_id, v_cash_id, v_denom, v_qty, v_denom * v_qty);
          end if;
        end loop;
      end if;

    elsif v_component.payment_method_code = 'card' then
      insert into card_collection_records (
        company_id, receipt_id, payment_component_id, customer_id, amount, card_type, terminal, merchant_reference,
        authorization_code, last_four_digits, transaction_date, verification_status
      )
      select v_receipt.company_id, p_receipt_id, v_component.id, v_receipt.customer_id, v_component.amount,
        cd.card_type, cd.terminal, cd.merchant_reference, cd.authorization_code, cd.last_four_digits, cd.transaction_date,
        case when cd.authorization_code is not null and cd.authorization_code != '' then 'verified' else 'pending_verification' end
      from card_receipt_details cd where cd.payment_component_id = v_component.id;

    elsif v_component.payment_method_code = 'bank_transfer' then
      insert into bank_transfer_collection_records (
        company_id, receipt_id, payment_component_id, customer_id, amount, receiving_bank_account, transfer_reference,
        transaction_date, value_date, sender_bank, verification_status
      )
      select v_receipt.company_id, p_receipt_id, v_component.id, v_receipt.customer_id, v_component.amount,
        btd.bank_account, btd.transfer_reference, btd.transaction_date, btd.value_date, btd.sender_bank, btd.verification_status
      from bank_transfer_receipt_details btd where btd.payment_component_id = v_component.id;

    elsif v_component.payment_method_code in ('wallet', 'online') then
      insert into digital_payment_records (company_id, receipt_id, payment_component_id, customer_id, amount, provider, transaction_id, reference, transaction_time)
      select v_receipt.company_id, p_receipt_id, v_component.id, v_receipt.customer_id, v_component.amount,
        coalesce(wd.provider, v_component.payment_method_code), wd.transaction_id, wd.reference, wd.transaction_date
      from receipt_payment_components rpc left join wallet_receipt_details wd on wd.payment_component_id = rpc.id
      where rpc.id = v_component.id;
    end if;
  end loop;
end;
$$;
grant execute on function post_receipt_payment_components(uuid) to authenticated;
