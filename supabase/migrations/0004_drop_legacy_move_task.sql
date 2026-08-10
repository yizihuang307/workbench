-- 0002 创建的四参数 move_task 仍引用已移除的 is_legacy。
-- 0003 的五参数版本是独立重载，因此需要显式删除旧签名。
drop function if exists public.move_task(uuid, uuid, text, uuid);
