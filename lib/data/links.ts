import { createClient } from "@/lib/supabase/server";
import type { Link, LinkGroup } from "@/types/domain";
import { AppError, conflict } from "@/lib/errors";

// ===== 分组 =====

export async function getLinkGroups(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("link_groups")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as LinkGroup[];
}

export async function createLinkGroup(userId: string, name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("link_groups")
    .insert({
      user_id: userId,
      name,
      sort_key: String(Date.now()),
      is_system: false,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as LinkGroup;
}

export async function updateLinkGroup(userId: string, groupId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("link_groups")
    .update({ name })
    .eq("id", groupId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function deleteLinkGroup(
  userId: string,
  groupId: string,
  migrateToId: string,
) {
  const supabase = await createClient();

  const { error: migrateError } = await supabase
    .from("links")
    .update({ group_id: migrateToId })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (migrateError) throw new AppError("INTERNAL_ERROR", migrateError.message);

  const { error } = await supabase
    .from("link_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 链接 =====

export async function getLinks(
  userId: string,
  groupId?: string,
  search?: string,
) {
  const supabase = await createClient();
  let query = supabase
    .from("links")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (groupId) query = query.eq("group_id", groupId);
  if (search) {
    query = query.or(`name.ilike.%${search}%,url.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as Link[];
}

export async function createLink(
  userId: string,
  groupId: string,
  url: string,
  normalizedUrl: string,
  name: string,
  faviconUrl?: string | null,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("links")
    .insert({
      user_id: userId,
      group_id: groupId,
      url,
      normalized_url: normalizedUrl,
      name,
      favicon_url: faviconUrl ?? null,
      sort_key: String(Date.now()),
      version: 1,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as Link;
}

export async function updateLink(
  userId: string,
  linkId: string,
  patch: Partial<Pick<Link, "group_id" | "url" | "normalized_url" | "name" | "favicon_url" | "sort_key">>,
  version: number,
) {
  const supabase = await createClient();

  const dbPatch: Record<string, unknown> = {};
  if (patch.group_id !== undefined) dbPatch.group_id = patch.group_id;
  if (patch.url !== undefined) dbPatch.url = patch.url;
  if (patch.normalized_url !== undefined) dbPatch.normalized_url = patch.normalized_url;
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.favicon_url !== undefined) dbPatch.favicon_url = patch.favicon_url;
  if (patch.sort_key !== undefined) dbPatch.sort_key = patch.sort_key;
  dbPatch.version = version + 1;

  const { data, error } = await supabase
    .from("links")
    .update(dbPatch)
    .eq("id", linkId)
    .eq("user_id", userId)
    .eq("version", version)
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  if (!data) throw conflict("链接已被修改，请刷新后重试");

  return data as Link;
}

export async function deleteLink(userId: string, linkId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("links")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function undoDeleteLink(userId: string, linkId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("links")
    .update({ deleted_at: null })
    .eq("id", linkId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// 记录打开
export async function recordLinkOpen(userId: string, linkId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("links")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}