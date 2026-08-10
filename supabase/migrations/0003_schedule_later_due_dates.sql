-- 安排模块改造：week 合并到 later，并引入预计完成日期与逾期状态。
-- 迁移前建议记录以下基线，迁移后用同一查询核对数值不变：
-- select count(*) total, count(*) filter (where is_completed) completed,
--        count(*) filter (where is_p0) p0,
--        count(*) filter (where deleted_at is not null) soft_deleted
-- from public.tasks;

begin;

alter table public.tasks
  add column if not exists expected_completion_date date,
  add column if not exists is_overdue boolean not null default false;

update public.tasks set area = 'later' where area = 'week';
update public.tasks set is_overdue = false where is_completed or is_overdue is null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tasks'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%area%'
  loop
    execute format('alter table public.tasks drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tasks'
      and c.conname = 'tasks_area_check'
  ) then
    alter table public.tasks
      add constraint tasks_area_check check (area in ('today', 'later'));
  end if;
end
$$;

alter table public.tasks drop column if exists is_legacy;

create index if not exists idx_tasks_later_due
  on public.tasks (user_id, area, expected_completion_date, sort_key)
  where deleted_at is null;

-- 旧函数引用已删除的 is_legacy 且会清除 P0；以新规则替换。
create or replace function public.move_task(
  p_user_id uuid,
  p_task_id uuid,
  p_target_area text,
  p_before_id uuid default null,
  p_version integer default null
) returns void as $$
declare
  new_sort_key numeric;
  current_version integer;
begin
  if p_target_area not in ('today', 'later') then
    raise exception 'Invalid task area';
  end if;

  select version into current_version
    from public.tasks
   where id = p_task_id and user_id = p_user_id and deleted_at is null
   for update;
  if not found then raise exception 'Task not found'; end if;
  if p_version is not null and current_version != p_version then
    raise exception 'Version conflict: expected % got %', p_version, current_version;
  end if;

  if p_before_id is null then
    select coalesce(max(sort_key), 0) + 100000000000
      into new_sort_key
      from public.tasks
     where user_id = p_user_id and area = p_target_area and deleted_at is null;
  else
    select (
      coalesce((
        select max(sort_key) from public.tasks
         where user_id = p_user_id and area = p_target_area
           and deleted_at is null
           and sort_key < target.sort_key
      ), 0) + target.sort_key
    ) / 2
      into new_sort_key
      from public.tasks target
     where target.id = p_before_id
       and target.user_id = p_user_id
       and target.area = p_target_area
       and target.deleted_at is null;
    if new_sort_key is null then raise exception 'Before task not found'; end if;
  end if;

  update public.tasks
     set area = p_target_area,
         sort_key = new_sort_key,
         is_overdue = false,
         version = version + 1
   where id = p_task_id and user_id = p_user_id and deleted_at is null;
end;
$$ language plpgsql;

commit;

-- 迁移后验证（应与迁移前基线完全一致）：
-- select count(*) total, count(*) filter (where is_completed) completed,
--        count(*) filter (where is_p0) p0,
--        count(*) filter (where deleted_at is not null) soft_deleted
-- from public.tasks;
-- select area, count(*) from public.tasks group by area; -- 不应再出现 week
