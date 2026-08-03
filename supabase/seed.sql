-- ============================================================
-- 种子数据：新用户注册后自动创建默认分类和分组
-- ============================================================

-- 为新用户创建默认记录分类
create or replace function seed_new_user_data()
returns trigger as $$
declare
  gap numeric := 100000000000;
begin
  -- 随手记默认分类
  insert into public.record_categories (user_id, name, sort_key, is_default_seed)
  values
    (new.id, '随手记', gap, true),
    (new.id, '会议纪要', gap * 2, true);

  -- 传送门默认分组
  insert into public.link_groups (user_id, name, sort_key, is_system)
  values (new.id, '未分组', 0, true);

  -- 资料库默认分类
  insert into public.resource_categories (user_id, name, sort_key, is_seed)
  values
    (new.id, '工作资料', gap, true),
    (new.id, '学习收藏', gap * 2, true);

  -- 用户偏好
  insert into public.user_preferences (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

-- 挂载到 profile 创建后
create or replace trigger on_profile_created
  after insert on public.profiles
  for each row execute function seed_new_user_data();