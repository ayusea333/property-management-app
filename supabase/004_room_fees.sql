-- 部屋マスタに駐車場代・その他費用を追加(入居者側ではなく部屋側で管理する方針に統一)
-- Supabaseの「SQL Editor」にこの内容をそのまま貼り付けて実行してください。

alter table rooms add column if not exists parking_fee numeric default 0;
alter table rooms add column if not exists other_fee numeric default 0;

-- 参考: tenants.parking_fee / tenants.other_fee は今後使いません(孤立した列として残りますが実害はありません)
