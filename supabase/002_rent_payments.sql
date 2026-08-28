-- 家賃入金管理・滞納確認のための追加
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。

-- 入居者(契約)に、駐車場代・その他費用・保証会社・口座振替の有無・
-- 送付方法・送付日を追加します(既存のデータは消えません)
alter table tenants add column if not exists parking_fee numeric default 0;
alter table tenants add column if not exists other_fee numeric default 0;
alter table tenants add column if not exists guarantor text;
alter table tenants add column if not exists debit boolean default false;
alter table tenants add column if not exists send_method text;
alter table tenants add column if not exists send_day text;

-- 月ごとの家賃入金記録
create table if not exists rent_payments (
  id text primary key default gen_random_uuid()::text,
  tenant_id text references tenants(id) on delete cascade,
  target_month text not null, -- '2026-09' の形式
  payment_date date not null,
  amount numeric,
  note text,
  source text default 'manual', -- 'manual' または 'guarantor_import'
  confirmed_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, target_month)
);

alter table rent_payments enable row level security;
drop policy if exists "allow all - rent_payments" on rent_payments;
create policy "allow all - rent_payments" on rent_payments for all using (true) with check (true);

-- 保証会社からの入金データ取込履歴(CSV取込機能で使用)
create table if not exists guarantor_imports (
  id text primary key default gen_random_uuid()::text,
  guarantor text not null,
  target_month text not null,
  file_name text,
  tenant_name_raw text,
  property_raw text,
  room_raw text,
  amount numeric,
  payment_date date,
  tenant_id text references tenants(id) on delete set null,
  status text default 'pending', -- matched / mismatch / unmatched / pending
  imported_at timestamptz not null default now()
);

alter table guarantor_imports enable row level security;
drop policy if exists "allow all - guarantor_imports" on guarantor_imports;
create policy "allow all - guarantor_imports" on guarantor_imports for all using (true) with check (true);
