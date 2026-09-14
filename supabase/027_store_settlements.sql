-- 新規管理獲得・店舗別実績管理の第3弾: 店舗精算(グループ会社の各店舗への支払いを、
-- オーナー精算と同じ考え方で「精算(金額の確定)」と「送金(実際の振込)」を別々に記録します)
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。
-- 既存のデータには一切影響しません。

create table if not exists store_settlements (
  id text primary key default gen_random_uuid()::text,
  referral_store_id text not null references referral_stores(id) on delete cascade,
  target_month text not null, -- 'YYYY-MM'
  amount numeric not null default 0,
  status text not null default '未精算',
  settlement_date date,
  remittance_date date,
  remittance_method text,
  note text,
  created_at timestamptz not null default now(),
  unique (referral_store_id, target_month)
);

alter table store_settlements enable row level security;

drop policy if exists "select auth - store_settlements" on store_settlements;
create policy "select auth - store_settlements" on store_settlements for select using (auth.role() = 'authenticated');
drop policy if exists "insert perm - store_settlements" on store_settlements;
create policy "insert perm - store_settlements" on store_settlements for insert with check (public.can_edit('store_settlements'));
drop policy if exists "update perm - store_settlements" on store_settlements;
create policy "update perm - store_settlements" on store_settlements for update using (public.can_edit('store_settlements')) with check (public.can_edit('store_settlements'));
drop policy if exists "delete perm - store_settlements" on store_settlements;
create policy "delete perm - store_settlements" on store_settlements for delete using (public.can_edit('store_settlements'));

-- 「店舗精算」タブの編集権限を、ユーザーごとにON/OFFできるようにする(オーナー精算の権限とは別に管理します)
alter table profiles add column if not exists can_edit_store_settlements boolean not null default false;

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
          when 'store_settlements' then can_edit_store_settlements
          else false
        end
      )
     from public.profiles where id = auth.uid()),
    false
  );
$$;

-- バックアップ・復元の対象にも追加します
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
      'management_acquisition_rates', (select coalesce(jsonb_agg(t), '[]'::jsonb) from management_acquisition_rates t),
      'store_settlements', (select coalesce(jsonb_agg(t), '[]'::jsonb) from store_settlements t)
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

  delete from store_settlements where true;
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
  insert into store_settlements select * from jsonb_populate_recordset(null::store_settlements, coalesce(b.data->'store_settlements', '[]'::jsonb));

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
