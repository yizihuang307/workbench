-- ============================================================
-- 补充迁移：排序存储过程
-- 需要在 0001_initial_schema.sql 之后执行
-- ============================================================

-- 通用的排序/移动存储过程
create or replace function reorder_entity(
  p_user_id       uuid,
  p_table         text,
  p_id            uuid,
  p_group_col     text,
  p_target_group_id uuid default null,
  p_before_id     uuid default null,
  p_version       integer default null
) returns void as $$
declare
  current_group_id uuid;
  current_sort_key numeric;
  current_version  integer;
  prev_sort_key    numeric;
  next_sort_key    numeric;
  new_sort_key     numeric;
  sql_text         text;
begin
  -- 获取当前实体信息
  execute format(
    'select %I, sort_key, version from %I where id = $1 and user_id = $2 and deleted_at is null',
    p_group_col, p_table
  ) into current_group_id, current_sort_key, current_version
  using p_id, p_user_id;

  if not found then
    raise exception 'Entity not found';
  end if;

  -- 乐观锁检查
  if p_version is not null and current_version != p_version then
    raise exception 'Version conflict: expected % got %', p_version, current_version;
  end if;

  -- 使用目标 group，如果没有指定则保持原 group
  if p_target_group_id is not null then
    current_group_id := p_target_group_id;
  end if;

  -- 计算新排序值
  if p_before_id is not null then
    -- 获取 before 项和前一项的排序值
    execute format(
      'select coalesce(max(sort_key), 0) from %I where user_id = $1 and %I = $2 and deleted_at is null and sort_key < (select sort_key from %I where id = $3)',
      p_table, p_group_col, p_table
    ) into prev_sort_key using p_user_id, current_group_id, p_before_id;

    execute format(
      'select sort_key from %I where id = $1', p_table
    ) into next_sort_key using p_before_id;

    new_sort_key := (prev_sort_key + next_sort_key) / 2.0;
  else
    -- 放到末尾
    execute format(
      'select coalesce(max(sort_key), 0) + 100000000000 from %I where user_id = $1 and %I = $2 and deleted_at is null',
      p_table, p_group_col
    ) into new_sort_key using p_user_id, current_group_id;
  end if;

  -- 更新实体
  sql_text := format(
    'update %I set %I = $1, sort_key = $2, version = version + 1, updated_at = now() where id = $3 and user_id = $4',
    p_table, p_group_col
  );
  execute sql_text using current_group_id, new_sort_key, p_id, p_user_id;

  -- 如果 sort_key 空间不足，归一化该组
  if new_sort_key = prev_sort_key or new_sort_key = next_sort_key then
    perform normalize_sort_keys(p_user_id, p_table, p_group_col, current_group_id);
  end if;
end;
$$ language plpgsql;

-- 移动任务的专门函数
create or replace function move_task(
  p_user_id   uuid,
  p_task_id   uuid,
  p_target_area text,
  p_before_id uuid default null
) returns void as $$
begin
  perform reorder_entity(p_user_id, 'tasks', p_task_id, 'area', null, p_before_id);
  -- 如果目标区域不是 today，清除 p0 和 legacy
  if p_target_area != 'today' then
    update tasks set is_p0 = false, is_legacy = false
    where id = p_task_id and user_id = p_user_id;
  end if;
  -- 更新 area
  update tasks set area = p_target_area
  where id = p_task_id and user_id = p_user_id;
end;
$$ language plpgsql;