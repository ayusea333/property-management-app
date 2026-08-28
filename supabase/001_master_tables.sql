-- マスタ管理用テーブル(オーナー・物件・部屋・入居者・取引先・業者)
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。

create table if not exists owners (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  kana text,
  phone text,
  email text,
  address text,
  contact text,
  bank_info text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  address text,
  owner_id text references owners(id) on delete set null,
  type text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id text primary key default gen_random_uuid()::text,
  property_id text references properties(id) on delete cascade,
  room_number text not null,
  rent numeric default 0,
  common_fee numeric default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  id text primary key default gen_random_uuid()::text,
  room_id text references rooms(id) on delete set null,
  name text not null,
  contact text,
  move_in_date date,
  move_out_date date,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  category text,
  contact text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists vendors (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  category text,
  contact text,
  note text,
  created_at timestamptz not null default now()
);

-- RLS(行レベルセキュリティ)を有効化し、まずは公開キーだけで
-- 読み書きできるシンプルなポリシーにしています(ログイン機能は次のステップで追加予定)。
alter table owners enable row level security;
alter table properties enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table clients enable row level security;
alter table vendors enable row level security;

drop policy if exists "allow all - owners" on owners;
create policy "allow all - owners" on owners for all using (true) with check (true);

drop policy if exists "allow all - properties" on properties;
create policy "allow all - properties" on properties for all using (true) with check (true);

drop policy if exists "allow all - rooms" on rooms;
create policy "allow all - rooms" on rooms for all using (true) with check (true);

drop policy if exists "allow all - tenants" on tenants;
create policy "allow all - tenants" on tenants for all using (true) with check (true);

drop policy if exists "allow all - clients" on clients;
create policy "allow all - clients" on clients for all using (true) with check (true);

drop policy if exists "allow all - vendors" on vendors;
create policy "allow all - vendors" on vendors for all using (true) with check (true);
