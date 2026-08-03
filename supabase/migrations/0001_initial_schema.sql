-- ============================================================
-- 个人工作台：初始数据库迁移
-- 包含：12 张业务表 + 索引 + RLS + 触发器 + 种子数据
-- ============================================================

-- 0. 扩展
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================================================
-- 1. 用户表
-- ============================================================

-- 1.1 profiles：每用户一行，由触发器自动创建
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone    text not null default 'Asia/Shanghai',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "用户只能读取自己的 profile"
  on profiles for select
  using (auth.uid() = id);

create policy "用户只能更新自己的 profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 新用户注册时自动创建 profile
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 1.2 user_preferences
create table if not exists user_preferences (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  quick_record_category_id uuid,
  hide_completed           boolean not null default false,
  schema_version           integer not null default 1,
  updated_at               timestamptz not null default now()
);

alter table user_preferences enable row level security;

create policy "用户只能访问自己的偏好"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. 排序辅助函数
-- ============================================================

-- 生成排序中值
create or replace function sort_mid(
  prev_key numeric default 0,
  next_key numeric default 100000000000
) returns numeric as $$
declare
  mid numeric;
begin
  mid := (prev_key + next_key) / 2.0;
  if mid = prev_key or mid = next_key then
    return prev_key + 1.0;
  end if;
  return mid;
end;
$$ language plpgsql immutable;

-- 归一化组内排序值
create or replace function normalize_sort_keys(
  p_user_id uuid,
  p_table text,
  p_group_col text default null,
  p_group_id uuid default null
) returns void as $$
declare
  item record;
  idx  integer := 0;
  gap  integer := 100000000000 / 1000;
begin
  if p_group_col is null then
    for item in
      execute format(
        'select id from %I where user_id = $1 and deleted_at is null order by sort_key, created_at',
        p_table
      ) using p_user_id
    loop
      execute format(
        'update %I set sort_key = $1 where id = $2 and user_id = $3',
        p_table
      ) using idx * gap, item.id, p_user_id;
      idx := idx + 1;
    end loop;
  else
    for item in
      execute format(
        'select id from %I where user_id = $1 and %I = $2 and deleted_at is null order by sort_key, created_at',
        p_table, p_group_col
      ) using p_user_id, p_group_id
    loop
      execute format(
        'update %I set sort_key = $1 where id = $2 and user_id = $3',
        p_table
      ) using idx * gap, item.id, p_user_id;
      idx := idx + 1;
    end loop;
  end if;
end;
$$ language plpgsql;

-- ============================================================
-- 3. 今日事（tasks）
-- ============================================================

create table if not exists tasks (
  id           uuid primary key default extensions.uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  area         text not null check (area in ('today', 'week', 'later')),
  is_completed boolean not null default false,
  is_p0        boolean not null default false,
  is_legacy    boolean not null default false,
  sort_key     numeric(20,10) not null default 0,
  completed_at timestamptz,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table tasks enable row level security;

create policy "用户只能访问自己的任务"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_tasks_user_list on tasks (user_id, deleted_at, sort_key);
create index idx_tasks_user_area on tasks (user_id, area, deleted_at, sort_key);
create index idx_tasks_completed on tasks (user_id, completed_at desc) where is_completed;

-- ============================================================
-- 4. 随手记（records & record_categories & record_assets）
-- ============================================================

create table if not exists record_categories (
  id             uuid primary key default extensions.uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 40),
  sort_key       numeric(20,10) not null default 0,
  is_default_seed boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

alter table record_categories enable row level security;

create policy "用户只能访问自己的记录分类"
  on record_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_record_categories_user on record_categories (user_id, deleted_at, sort_key);

create table if not exists records (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references record_categories(id) on delete restrict,
  title         text not null default '未命名记录',
  title_mode    text not null default 'auto' check (title_mode in ('auto', 'manual')),
  document_json text not null default '{}',
  plain_text    text not null default '',
  is_pinned     boolean not null default false,
  sort_key      numeric(20,10) not null default 0,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table records enable row level security;

create policy "用户只能访问自己的记录"
  on records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_records_user_list on records (user_id, deleted_at, sort_key);
create index idx_records_user_cat on records (user_id, category_id, deleted_at, sort_key);
create index idx_records_plain_text on records using gin (plain_text extensions.gin_trgm_ops);

create table if not exists record_assets (
  id           uuid primary key default extensions.uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  record_id    uuid not null references records(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   integer not null,
  sort_key     numeric(20,10) not null default 0,
  created_at   timestamptz not null default now()
);

alter table record_assets enable row level security;

create policy "用户只能访问自己的记录附件"
  on record_assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_record_assets_record on record_assets (record_id, sort_key);

-- ============================================================
-- 5. 传送门（link_groups & links）
-- ============================================================

create table if not exists link_groups (
  id         uuid primary key default extensions.uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  sort_key   numeric(20,10) not null default 0,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table link_groups enable row level security;

create policy "用户只能访问自己的链接分组"
  on link_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_link_groups_user on link_groups (user_id, deleted_at, sort_key);

create table if not exists links (
  id             uuid primary key default extensions.uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  group_id       uuid not null references link_groups(id) on delete restrict,
  url            text not null,
  normalized_url text not null,
  name           text not null check (char_length(name) between 1 and 200),
  favicon_url    text,
  sort_key       numeric(20,10) not null default 0,
  last_opened_at timestamptz,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

alter table links enable row level security;

create policy "用户只能访问自己的链接"
  on links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_links_user_list on links (user_id, deleted_at, sort_key);
create index idx_links_user_group on links (user_id, group_id, deleted_at, sort_key);
create index idx_links_user_url on links (user_id, normalized_url) where deleted_at is null;
create index idx_links_name on links using gin (name extensions.gin_trgm_ops);

-- ============================================================
-- 6. 资料库（resource_categories & resources & resource_assets）
-- ============================================================

create table if not exists resource_categories (
  id         uuid primary key default extensions.uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  sort_key   numeric(20,10) not null default 0,
  is_seed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table resource_categories enable row level security;

create policy "用户只能访问自己的资料分类"
  on resource_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_resource_categories_user on resource_categories (user_id, deleted_at, sort_key);

create table if not exists resources (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references resource_categories(id) on delete restrict,
  title         text not null default '未命名资料',
  title_mode    text not null default 'auto' check (title_mode in ('auto', 'manual')),
  document_json text not null default '{}',
  plain_text    text not null default '',
  is_pinned     boolean not null default false,
  sort_key      numeric(20,10) not null default 0,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table resources enable row level security;

create policy "用户只能访问自己的资料"
  on resources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_resources_user_list on resources (user_id, deleted_at, sort_key);
create index idx_resources_user_cat on resources (user_id, category_id, deleted_at, sort_key);
create index idx_resources_plain_text on resources using gin (plain_text extensions.gin_trgm_ops);

create table if not exists resource_assets (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  resource_id   uuid not null references resources(id) on delete cascade,
  storage_path  text not null,
  original_name text not null,
  mime_type     text not null,
  size_bytes    integer not null,
  sort_key      numeric(20,10) not null default 0,
  created_at    timestamptz not null default now()
);

alter table resource_assets enable row level security;

create policy "用户只能访问自己的资料附件"
  on resource_assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_resource_assets_resource on resource_assets (resource_id, sort_key);

-- ============================================================
-- 7. AI 整理（ai_runs）
-- ============================================================

create table if not exists ai_runs (
  id          uuid primary key default extensions.uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  record_id   uuid not null references records(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  input_hash  text not null,
  result_text text,
  error_code  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table ai_runs enable row level security;

create policy "用户只能访问自己的 AI 运行"
  on ai_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_ai_runs_record on ai_runs (record_id, created_at desc);

-- ============================================================
-- 8. 审计日志（audit_events）
-- ============================================================

create table if not exists audit_events (
  id          uuid primary key default extensions.uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  action      text not null,
  request_id  text not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table audit_events enable row level security;

create policy "用户只能读取自己的审计日志"
  on audit_events for select
  using (auth.uid() = user_id);

-- 审计日志不允许用户写入，由服务端 admin 写入
create policy "审计日志不允许用户直接写入"
  on audit_events for insert
  with check (false);

create policy "审计日志不允许用户修改"
  on audit_events for update
  using (false);

create policy "审计日志不允许用户删除"
  on audit_events for delete
  using (false);

create index idx_audit_events_user on audit_events (user_id, created_at desc);
create index idx_audit_events_entity on audit_events (entity_type, entity_id);

-- ============================================================
-- 9. 自动更新 updated_at 触发器
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 为所有有 updated_at 的表添加触发器
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where column_name = 'updated_at' and table_schema = 'public'
  loop
    execute format(
      'create trigger tg_%I_updated_at before update on %I for each row execute function update_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ============================================================
-- 10. Storage 配置
-- ============================================================

-- 注意：Storage bucket 需要在 Supabase Dashboard 手动创建
-- bucket 名称：user-assets
-- 路径模板：<user_id>/<entity>/<entity_id>/<uuid>
-- 权限：私有桶，通过 RLS policy 控制访问

-- Storage RLS 示例（需要在 Supabase Dashboard SQL Editor 中执行）：
-- create policy "用户只能访问自己的文件"
--   on storage.objects for all
--   using (auth.uid()::text = (storage.foldername(name))[1])
--   with check (auth.uid()::text = (storage.foldername(name))[1]);