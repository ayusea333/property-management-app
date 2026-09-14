-- 新規管理獲得(グループ会社6店舗からの管理獲得)・店舗別実績管理の第1弾。
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。
-- 既存のデータには一切影響しません。

-- 1) 汎用設定テーブル(今回は「3L側の取り分率のデフォルト値」のために使用します。
--    コードに直接2%・98%を書き込まず、ここから読み込む方式にします)
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('acquisition_default_3l_rate', '2')
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists "select auth - app_settings" on app_settings;
create policy "select auth - app_settings" on app_settings for select using (auth.role() = 'authenticated');
drop policy if exists "insert admin - app_settings" on app_settings;
create policy "insert admin - app_settings" on app_settings for insert with check (public.is_admin());
drop policy if exists "update admin - app_settings" on app_settings;
create policy "update admin - app_settings" on app_settings for update using (public.is_admin()) with check (public.is_admin());

-- 2) 紹介元店舗マスタ(グループ会社の6店舗などを登録する)
create table if not exists referral_stores (
  id text primary key default gen_random_uuid()::text,
  group_name text,
  store_name text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table referral_stores enable row level security;
drop policy if exists "select auth - referral_stores" on referral_stores;
create policy "select auth - referral_stores" on referral_stores for select using (auth.role() = 'authenticated');
drop policy if exists "insert perm - referral_stores" on referral_stores;
create policy "insert perm - referral_stores" on referral_stores for insert with check (public.can_edit('master'));
drop policy if exists "update perm - referral_stores" on referral_stores;
create policy "update perm - referral_stores" on referral_stores for update using (public.can_edit('master')) with check (public.can_edit('master'));
drop policy if exists "delete perm - referral_stores" on referral_stores;
create policy "delete perm - referral_stores" on referral_stores for delete using (public.can_edit('master'));

-- 3) 新規管理獲得(部屋ごとに1レコード。物件全体ではなく必ず部屋単位)
create table if not exists management_acquisitions (
  id text primary key default gen_random_uuid()::text,
  room_id text not null references rooms(id) on delete cascade,
  property_id text references properties(id) on delete set null,
  acquisition_type text not null default 'グループ会社', -- 'グループ会社' / '自社直接' / 'その他'
  referral_store_id text references referral_stores(id) on delete set null,
  referral_person text,
  start_date date not null,
  end_date date, -- nullのままなら「現在も管理中」
  acquisition_fee numeric default 0, -- 決定した獲得報酬額(決定額。KPIでは実際に売上計上された額を別途使う)
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 同じ部屋に「現在管理中(end_date が空)」のレコードが同時に2件以上存在しないようにする
create unique index if not exists management_acquisitions_active_room
  on management_acquisitions (room_id) where end_date is null;

alter table management_acquisitions enable row level security;
drop policy if exists "select auth - management_acquisitions" on management_acquisitions;
create policy "select auth - management_acquisitions" on management_acquisitions for select using (auth.role() = 'authenticated');
drop policy if exists "insert perm - management_acquisitions" on management_acquisitions;
create policy "insert perm - management_acquisitions" on management_acquisitions for insert with check (public.can_edit('acquisitions'));
drop policy if exists "update perm - management_acquisitions" on management_acquisitions;
create policy "update perm - management_acquisitions" on management_acquisitions for update using (public.can_edit('acquisitions')) with check (public.can_edit('acquisitions'));
drop policy if exists "delete perm - management_acquisitions" on management_acquisitions;
create policy "delete perm - management_acquisitions" on management_acquisitions for delete using (public.can_edit('acquisitions'));

-- 獲得報酬額(acquisition_fee)の事後変更だけは管理者に限定する
-- (新規登録時は通常の編集権限でOK。あとから金額を書き換える操作だけ管理者限定にする)
create or replace function public.check_acquisition_admin_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if NEW.acquisition_fee is distinct from OLD.acquisition_fee then
      raise exception '獲得報酬額の変更は管理者のみ行えます。';
    end if;
  end if;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  return NEW;
end;
$$;

drop trigger if exists trg_acquisition_admin_fields on management_acquisitions;
create trigger trg_acquisition_admin_fields before update on management_acquisitions
  for each row execute function public.check_acquisition_admin_fields();

-- 4) 月額支払額の履歴(いつからいくらを自動計上するかの履歴。過去の行は変更しない=積み重ね方式)
create table if not exists management_acquisition_rates (
  id text primary key default gen_random_uuid()::text,
  acquisition_id text not null references management_acquisitions(id) on delete cascade,
  effective_from text not null, -- '2026-09' の形式。この月以降に適用する
  monthly_base_amount numeric not null default 0,   -- 月額基準金額
  three_l_monthly_amount numeric not null default 0, -- 3L取り分(月額)
  group_monthly_amount numeric not null default 0,   -- 月額支払額(グループ会社)
  three_l_rate_percent numeric not null default 2,   -- 参考: その時点の3L側の率(%)
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (acquisition_id, effective_from)
);

alter table management_acquisition_rates enable row level security;
drop policy if exists "select auth - management_acquisition_rates" on management_acquisition_rates;
create policy "select auth - management_acquisition_rates" on management_acquisition_rates for select using (auth.role() = 'authenticated');

-- 1件目(その獲得についてまだ履歴が無い場合=新規登録時)は通常の編集権限でOK。
-- 2件目以降(=あとからの金額変更)は管理者のみ。
drop policy if exists "insert perm or first - management_acquisition_rates" on management_acquisition_rates;
create policy "insert perm or first - management_acquisition_rates" on management_acquisition_rates for insert
  with check (
    public.is_admin()
    or (
      public.can_edit('acquisitions')
      and not exists (
        select 1 from management_acquisition_rates existing
        where existing.acquisition_id = management_acquisition_rates.acquisition_id
      )
    )
  );

-- 一度登録した履歴行は書き換えない(訂正が必要な場合は管理者が削除して登録し直す)
drop policy if exists "delete admin - management_acquisition_rates" on management_acquisition_rates;
create policy "delete admin - management_acquisition_rates" on management_acquisition_rates for delete using (public.is_admin());

-- 5) 権限に「acquisitions」(新規管理獲得の編集権限)を追加
alter table profiles add column if not exists can_edit_acquisitions boolean not null default false;

create or replace function public.can_edit(perm text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select
      (not is_disabled) and (
        is_admin or
        case perm
          when 'master' then can_edit_master
          when 'rent_payments' then can_edit_rent_payments
          when 'sales' then can_edit_sales
          when 'expenses' then can_edit_expenses
          when 'trust_funds' then can_edit_trust_funds
          when 'owner_settlements' then can_edit_owner_settlements
          when 'repairs' then can_edit_repairs
          when 'acquisitions' then can_edit_acquisitions
          else false
        end
      )
     from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 6) バックアップ・復元の対象にも追加します
create or replace function public._snapshot_backup()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.backups (data)
  values (
    jsonb_build_object(
      'owners', (select coalesce(jsonb_agg(t), '[]'::jsonb) from owners t),
      'properties', (select coalesce(jsonb_agg(t), '[]'::jsonb) from properties t),
      'rooms', (select coalesce(jsonb_agg(t), '[]'::jsonb) from rooms t),
      'residents', (select coalesce(jsonb_agg(t), '[]'::jsonb) from residents t),
      'contracts', (select coalesce(jsonb_agg(t), '[]'::jsonb) from contracts t),
      'clients', (select coalesce(jsonb_agg(t), '[]'::jsonb) from clients t),
      'vendors', (select coalesce(jsonb_agg(t), '[]'::jsonb) from vendors t),
      'sales', (select coalesce(jsonb_agg(t), '[]'::jsonb) from sales t),
      'expenses', (select coalesce(jsonb_agg(t), '[]'::jsonb) from expenses t),
      'rent_payments', (select coalesce(jsonb_agg(t), '[]'::jsonb) from rent_payments t),
      'guarantor_imports', (select coalesce(jsonb_agg(t), '[]'::jsonb) from guarantor_imports t),
      'trust_funds', (select coalesce(jsonb_agg(t), '[]'::jsonb) from trust_funds t),
      'owner_settlements', (select coalesce(jsonb_agg(t), '[]'::jsonb) from owner_settlements t),
      'repairs', (select coalesce(jsonb_agg(t), '[]'::jsonb) from repairs t),
      'budgets', (select coalesce(jsonb_agg(t), '[]'::jsonb) from budgets t),
      'period_locks', (select coalesce(jsonb_agg(t), '[]'::jsonb) from period_locks t),
      'app_settings', (select coalesce(jsonb_agg(t), '[]'::jsonb) from app_settings t),
      'referral_stores', (select coalesce(jsonb_agg(t), '[]'::jsonb) from referral_stores t),
      'management_acquisitions', (select coalesce(jsonb_agg(t), '[]'::jsonb) from management_acquisitions t),
      'management_acquisition_rates', (select coalesce(jsonb_agg(t), '[]'::jsonb) from management_acquisition_rates t)
    )
  );

  delete from public.backups
  where id not in (
    select id from public.backups order by created_at desc limit 60
  );
end;
$$;

create or replace function public.restore_backup(target_id text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  b record;
  r record;
  new_resident_id text;
begin
  if not public.is_admin() then
    raise exception '権限がありません';
  end if;

  select * into b from public.backups where id = target_id;
  if not found then
    raise exception 'バックアップが見つかりません';
  end if;

  delete from management_acquisition_rates where true;
  delete from management_acquisitions where true;
  delete from referral_stores where true;
  delete from app_settings where true;
  delete from period_locks where true;
  delete from guarantor_imports where true;
  delete from rent_payments where true;
  delete from sales where true;
  delete from expenses where true;
  delete from repairs where true;
  delete from trust_funds where true;
  delete from owner_settlements where true;
  delete from budgets where true;
  delete from contracts where true;
  delete from residents where true;
  delete from rooms where true;
  delete from properties where true;
  delete from owners where true;
  delete from clients where true;
  delete from vendors where true;

  insert into owners select * from jsonb_populate_recordset(null::owners, b.data->'owners');
  insert into clients select * from jsonb_populate_recordset(null::clients, b.data->'clients');
  insert into vendors select * from jsonb_populate_recordset(null::vendors, b.data->'vendors');
  insert into properties select * from jsonb_populate_recordset(null::properties, b.data->'properties');
  insert into rooms select * from jsonb_populate_recordset(null::rooms, b.data->'rooms');
  insert into residents select * from jsonb_populate_recordset(null::residents, coalesce(b.data->'residents', '[]'::jsonb));
  insert into contracts select * from jsonb_populate_recordset(null::contracts, coalesce(b.data->'contracts', b.data->'tenants'));
  insert into sales select * from jsonb_populate_recordset(null::sales, b.data->'sales');
  insert into expenses select * from jsonb_populate_recordset(null::expenses, b.data->'expenses');
  insert into rent_payments select * from jsonb_populate_recordset(null::rent_payments, b.data->'rent_payments');
  insert into guarantor_imports select * from jsonb_populate_recordset(null::guarantor_imports, b.data->'guarantor_imports');
  insert into trust_funds select * from jsonb_populate_recordset(null::trust_funds, coalesce(b.data->'trust_funds', '[]'::jsonb));
  insert into owner_settlements select * from jsonb_populate_recordset(null::owner_settlements, coalesce(b.data->'owner_settlements', '[]'::jsonb));
  insert into repairs select * from jsonb_populate_recordset(null::repairs, coalesce(b.data->'repairs', '[]'::jsonb));
  insert into budgets select * from jsonb_populate_recordset(null::budgets, coalesce(b.data->'budgets', '[]'::jsonb));
  insert into period_locks select * from jsonb_populate_recordset(null::period_locks, coalesce(b.data->'period_locks', '[]'::jsonb));
  insert into app_settings select * from jsonb_populate_recordset(null::app_settings, coalesce(b.data->'app_settings', '[]'::jsonb));
  insert into referral_stores select * from jsonb_populate_recordset(null::referral_stores, coalesce(b.data->'referral_stores', '[]'::jsonb));
  insert into management_acquisitions select * from jsonb_populate_recordset(null::management_acquisitions, coalesce(b.data->'management_acquisitions', '[]'::jsonb));
  insert into management_acquisition_rates select * from jsonb_populate_recordset(null::management_acquisition_rates, coalesce(b.data->'management_acquisition_rates', '[]'::jsonb));

  -- app_settingsが空になってしまった場合に備えて、デフォルト値を保証する
  insert into app_settings (key, value) values ('acquisition_default_3l_rate', '2') on conflict (key) do nothing;

  for r in select id, name, contact from contracts where resident_id is null loop
    insert into residents (name, contact) values (r.name, r.contact) returning id into new_resident_id;
    update contracts set resident_id = new_resident_id where id = r.id;
  end loop;

  insert into public.edit_logs (user_id, user_email, table_label, action, summary)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    '全体',
    '復元',
    'バックアップ(' || to_char(b.created_at, 'YYYY-MM-DD HH24:MI') || ')に復元しました'
  );
end;
$$;
