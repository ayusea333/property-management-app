-- 入居者(人物)と契約(部屋・期間・請求条件)を分けて管理する仕組みへの移行
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。
-- 実行しても、今登録されているデータが消えたり、入力し直しが必要になったりすることはありません。
-- (今までの1行が「入居者1件+契約1件」に自動的に分割されるだけです)

-- 1) 「入居者」マスタ(名前・連絡先など、人物そのものの情報だけ)を新設
create table if not exists residents (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  contact text,
  note text,
  created_at timestamptz not null default now()
);

alter table residents enable row level security;

drop policy if exists "select auth - residents" on residents;
create policy "select auth - residents" on residents for select using (auth.role() = 'authenticated');
drop policy if exists "insert perm - residents" on residents;
create policy "insert perm - residents" on residents for insert with check (public.can_edit('master'));
drop policy if exists "update perm - residents" on residents;
create policy "update perm - residents" on residents for update using (public.can_edit('master')) with check (public.can_edit('master'));
drop policy if exists "delete perm - residents" on residents;
create policy "delete perm - residents" on residents for delete using (public.can_edit('master'));

-- 2) 今までの「tenants(入居者)」テーブルを「contracts(契約)」という名前に変更します。
--    テーブルの中身・ID・他の表からの紐付け(家賃入金など)はそのまま引き継がれます。
alter table tenants rename to contracts;

-- 3) 契約テーブルに、「どの入居者の契約か」と「契約者(会社・代理人)が入居者と違う場合の情報」を追加
alter table contracts add column if not exists resident_id text references residents(id) on delete set null;
alter table contracts add column if not exists contractor_type text not null default '個人';
alter table contracts add column if not exists contractor_name text;

-- 契約の「名前」「連絡先」は、これからは入居者マスタ側で管理するため、
-- 契約を新規登録するときに必須ではなくします(列自体は古いデータのために残します)
alter table contracts alter column name drop not null;

-- 4) 既存データの自動移行:
--    今まで1行にまとまっていた「人物+契約」の情報を、
--    「入居者」1件(名前・連絡先)と、それに紐づく「契約」1件に自動的に分割します。
--    手で入力し直していただく必要はありません。
--    (もし同じ人が今すでに複数行に分かれて登録されている場合は、
--     この移行では別々の「入居者」になります。後で「契約」の編集画面から
--     入居者を選び直すことで、同じ入居者にまとめることができます)
do $$
declare
  r record;
  new_resident_id text;
begin
  for r in select id, name, contact from contracts where resident_id is null loop
    insert into residents (name, contact) values (r.name, r.contact) returning id into new_resident_id;
    update contracts set resident_id = new_resident_id where id = r.id;
  end loop;
end $$;

-- 5) バックアップ・復元機能を新しいテーブル構成にあわせて更新します。
--    (このタイミングで、これまで対象に入っていなかった「預り金・立替金」「オーナー精算・送金」
--     「修繕管理」もバックアップ対象に追加しています)
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
      'repairs', (select coalesce(jsonb_agg(t), '[]'::jsonb) from repairs t)
    )
  );

  -- 直近60件(3時間おきでおよそ7〜8日分)だけ残して古いものは削除
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

  -- 子のテーブルから先に削除(外部キーの都合)
  delete from guarantor_imports where true;
  delete from rent_payments where true;
  delete from sales where true;
  delete from expenses where true;
  delete from repairs where true;
  delete from trust_funds where true;
  delete from owner_settlements where true;
  delete from contracts where true;
  delete from residents where true;
  delete from rooms where true;
  delete from properties where true;
  delete from owners where true;
  delete from clients where true;
  delete from vendors where true;

  -- 親のテーブルから順に復元
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

  -- 万一、まだ「入居者」と「契約」が分かれていなかった頃の古いバックアップを復元した場合に備えて、
  -- 入居者が紐付いていない契約があれば自動的に入居者を補って紐付ける
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
