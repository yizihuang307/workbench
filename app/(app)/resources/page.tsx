"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ResourceCategory = {
  id: string;
  name: string;
  sort_key: string;
  is_seed: boolean;
};

type ResourceItem = {
  id: string;
  category_id: string;
  title: string;
  title_mode: string;
  document_json: string;
  plain_text: string;
  is_pinned: boolean;
  sort_key: string;
  version: number;
  updated_at: string;
};

export default function ResourcesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/resource-categories");
      if (res.ok) setCategories((await res.json()).data ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadResources = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/resources?${params}`);
      if (res.ok) setResources((await res.json()).data ?? []);
    } catch { /* ignore */ }
    setReady(true);
  }, [search]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadResources(); }, [loadResources]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  async function deleteResource(id: string) {
    setResources((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/resources/${id}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        (window as unknown as Record<string, string>).__lastDeletionToken = json.deletionToken;
      }
    } catch { /* ignore */ }
  }

  const resourcesByCategory = useMemo(() => {
    const result: Record<string, ResourceItem[]> = {};
    for (const c of categories) result[c.id] = [];
    result["_uncategorized"] = [];
    for (const r of resources) {
      if (r.category_id && result[r.category_id]) result[r.category_id].push(r);
      else result["_uncategorized"].push(r);
    }
    return result;
  }, [categories, resources]);

  return (
    <div className="info-page">
      <div className="info-toolbar">
        <div className="info-index">
          {categories.map((c) => (
            <button key={c.id}>{c.name}</button>
          ))}
        </div>
      </div>

      <div className="info-search">
        <input
          type="search"
          placeholder="搜索资料..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!ready ? (
        <div className="info-empty"><b>⋯</b><span>加载中…</span></div>
      ) : (
        <div className="resource-sections">
          {categories.map((c) => (
            <div key={c.id} className="resource-section">
              <header>
                <div><h2>{c.name}</h2><span>{(resourcesByCategory[c.id] || []).length} 个资料</span></div>
              </header>
              <div className="resource-preview">
                {(resourcesByCategory[c.id] || []).length === 0 ? (
                  <div className="info-empty compact">
                    <b>+</b>
                    <span>暂无资料</span>
                  </div>
                ) : (
                  (resourcesByCategory[c.id] || []).map((r) => (
                    <div key={r.id} className="resource-row">
                      <button className={`resource-pin ${r.is_pinned ? "active" : ""}`} aria-label="置顶">
                        {r.is_pinned ? "★" : "☆"}
                      </button>
                      <div className="resource-main" onClick={() => router.push(`/resources/${r.id}`)} style={{ cursor: "pointer" }}>
                        <strong>{r.title || "未命名资料"}</strong>
                        <span>{r.plain_text?.slice(0, 80) || "空资料"}</span>
                        <small>{new Date(r.updated_at).toLocaleDateString("zh-CN")}</small>
                      </div>
                      <button className="system-remove" onClick={() => deleteResource(r.id)} aria-label="删除">×</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}
    </div>
  );
}

