import { getUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// 旧 localStorage/IndexedDB 数据迁移到 Supabase
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  try {
    const body = await request.json() as {
      schemaVersion?: number;
      tasks?: unknown[];
      records?: unknown[];
      links?: unknown[];
      resources?: unknown[];
    };

    const results = { tasks: 0, records: 0, links: 0, resources: 0, skipped: 0, errors: 0 };

    // 迁移任务
    if (Array.isArray(body.tasks)) {
      for (const item of body.tasks) {
        if (typeof item !== "object" || !item) { results.skipped++; continue; }
        const t = item as Record<string, unknown>;
        const { error } = await supabase.from("tasks").upsert({
          id: t.id as string,
          user_id: userId,
          title: String(t.label ?? t.title ?? "").slice(0, 200),
          area: String(t.area ?? t.group ?? "today"),
          is_completed: Boolean(t.done ?? t.isCompleted),
          is_p0: Boolean(t.priority ?? t.isP0),
          is_legacy: Boolean(t.legacy ?? t.isLegacy),
          sort_key: String(t.sortKey ?? t.createdAt ?? Date.now()),
          completed_at: t.completedAt ? new Date(t.completedAt as number).toISOString() : null,
          version: 1,
          created_at: new Date(t.createdAt as number ?? Date.now()).toISOString(),
          updated_at: new Date((t.updatedAt as number) ?? Date.now()).toISOString(),
        }, { onConflict: "id" });
        if (error) results.errors++;
        else results.tasks++;
      }
    }

    // 迁移记录
    if (Array.isArray(body.records)) {
      for (const item of body.records) {
        if (typeof item !== "object" || !item) { results.skipped++; continue; }
        const r = item as Record<string, unknown>;
        const { error } = await supabase.from("records").upsert({
          id: r.id as string,
          user_id: userId,
          category_id: r.categoryId as string,
          title: String(r.title ?? "未命名记录").slice(0, 200),
          title_mode: r.titleMode === "manual" ? "manual" : "auto",
          document_json: typeof r.documentJson === "string" ? r.documentJson : "{}",
          plain_text: String(r.plainText ?? r.body ?? ""),
          is_pinned: Boolean(r.isPinned ?? r.pinned),
          sort_key: String(r.sortKey ?? r.createdAt ?? Date.now()),
          version: 1,
          created_at: new Date(r.createdAt as number ?? Date.now()).toISOString(),
          updated_at: new Date((r.updatedAt as number) ?? Date.now()).toISOString(),
        }, { onConflict: "id" });
        if (error) results.errors++;
        else results.records++;
      }
    }

    // 迁移链接
    if (Array.isArray(body.links)) {
      for (const item of body.links) {
        if (typeof item !== "object" || !item) { results.skipped++; continue; }
        const l = item as Record<string, unknown>;
        const url = String(l.url ?? "");
        const { error } = await supabase.from("links").upsert({
          id: l.id as string,
          user_id: userId,
          group_id: l.groupId as string,
          url,
          normalized_url: url.replace(/\/$/, "").toLowerCase(),
          name: String(l.name ?? "").slice(0, 200),
          favicon_url: l.faviconUrl as string ?? null,
          sort_key: String(l.sortKey ?? l.createdAt ?? Date.now()),
          version: 1,
          created_at: new Date(l.createdAt as number ?? Date.now()).toISOString(),
          updated_at: new Date((l.updatedAt as number) ?? Date.now()).toISOString(),
        }, { onConflict: "id" });
        if (error) results.errors++;
        else results.links++;
      }
    }

    // 迁移资料
    if (Array.isArray(body.resources)) {
      for (const item of body.resources) {
        if (typeof item !== "object" || !item) { results.skipped++; continue; }
        const res = item as Record<string, unknown>;
        const { error } = await supabase.from("resources").upsert({
          id: res.id as string,
          user_id: userId,
          category_id: res.categoryId ?? res.sectionId as string,
          title: String(res.title ?? "未命名资料").slice(0, 200),
          title_mode: res.titleMode === "manual" ? "manual" : "auto",
          document_json: typeof res.documentJson === "string" ? res.documentJson : "{}",
          plain_text: String(res.plainText ?? ""),
          is_pinned: Boolean(res.isPinned ?? res.pinned),
          sort_key: String(res.sortKey ?? res.order ?? res.createdAt ?? Date.now()),
          version: 1,
          created_at: new Date(res.createdAt as number ?? Date.now()).toISOString(),
          updated_at: new Date((res.updatedAt as number) ?? Date.now()).toISOString(),
        }, { onConflict: "id" });
        if (error) results.errors++;
        else results.resources++;
      }
    }

    return Response.json({ success: true, requestId, results });
  } catch (err) {
    return new AppError("INTERNAL_ERROR", "迁移失败").toResponse(requestId);
  }
}