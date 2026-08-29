-- 売上・経費管理、部屋マスタの費用項目追加
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。

alter table rooms add column if not exists bicycle_fee numeric default 0;   -- 駐輪場代
alter table rooms add column if not exists support_fee numeric default 0;  -- 安サポ
alter table rooms add column if not exists management_fee numeric default 0; -- 管理料(月額)

create table if not exists sales (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  category text not null,
  property_id text references properties(id) on delete set null,
  room_id text references rooms(id) on delete set null,
  owner_id text references owners(id) on delete set null,
  content text,
  amount numeric not null default 0,
  source text default 'manual', -- 'manual' または 'auto_management_fee'
  source_ref text, -- 自動計上の場合、元になったtenant_id+target_monthなどの識別用
  created_at timestamptz not null default now()
);

alter table sales enable row level security;
drop policy if exists "allow all - sales" on sales;
create policy "allow all - sales" on sales for all using (true) with check (true);

-- 自動計上(管理料)の重複防止用
create unique index if not exists sales_auto_unique
  on sales (source, source_ref) where source <> 'manual';

create table if not exists expenses (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  property_id text references properties(id) on delete set null,
  room_id text references rooms(id) on delete set null,
  category text,
  content text,
  payee text,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;
drop policy if exists "allow all - expenses" on expenses;
create policy "allow all - expenses" on expenses for all using (true) with check (true);
