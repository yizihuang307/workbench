"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

type ResourceCategory = {
  id: string;
  name: string;
};

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const resourceId = params.id as string;

  const [resource, setResource] = useState<ResourceItem | null>(null);
  const [category, setCategory] = useState<ResourceCategory | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadResource = useCallback(async () => {
    try {
      const res = await fetch(`/api/resources/${resourceId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      const data = json.data as ResourceItem;
      setResource(data);
      try {
        const doc = JSON.parse(data.document_json);
        setEditorContent(doc.text ?? data.plain_text ?? "");
      } catch {
        setEditorContent(data.plain_text ?? "");
      }
    } catch {
      setNotice("加载资料失败");
    } finally {
      setReady(true);
    }
  }, [resourceId]);

  const loadCategory = useCallback(async () => {
    if (!resource) return;
    try {
      const res = await fetch("/api/resource-categories");
      if (res.ok) {
        const json = await res.json();
        const cats = json.data as ResourceCategory[];
        const cat = cats.find((c) => c.id === resource.category_id);
        if (cat) setCategory(cat);
      }
    } catch { /* ignore */ }
  }, [resource]);

  useEffect(() => { loadResource(); }, [loadResource]);
  useEffect(() => { loadCategory(); }, [loadCategory]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  async function saveResource() {
    if (!resource) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentJson: JSON.stringify({ text: editorContent }),
          plainText: editorContent,
          title: editorContent.slice(0, 50) || "未命名资料",
          version: resource.version,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const json = await res.json();
      setResource(json.data as ResourceItem);
      setNotice("已保存");
    } catch {
      setNotice("保存失败");
    }
    setSaving(false);
  }

  async function deleteResource() {
    if (!resource) return;
    if (!confirm("确定删除这份资料吗？")) return;
    try {
      const res = await fetch(`/api/resources/${resource.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/resources");
      }
    } catch { /* ignore */ }
  }

  if (!ready) {
    return (
      <div className="resource-detail-page">
        <div className="resource-detail-loading">加载中...</div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="resource-detail-page">
        <div className="resource-detail-empty">
          <b>?</b>
          <p>资料不存在或已被删除</p>
          <button onClick={() => router.push("/resources")}>返回列表</button>
        </div>
      </div>
    );
  }

  return (
    <div className="resource-detail-page">
      <header className="resource-detail-header">
        <button className="resource-back" onClick={() => router.push("/resources")}>
          ← 返回
        </button>
        <div className="resource-detail-meta">
          <span className="resource-category-tag">
            {category?.name ?? "未分类"}
          </span>
          <span className={`save-state ${saving ? "saving" : ""}`}>
            {saving ? "保存中…" : "已保存"}
          </span>
        </div>
        <div className="resource-detail-actions">
          <button className="resource-save" onClick={saveResource} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button className="resource-delete-btn" onClick={deleteResource}>
            删除
          </button>
        </div>
      </header>

      <div className="resource-detail-editor">
        <textarea
          className="resource-document-editor"
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          onBlur={saveResource}
          placeholder="开始编辑资料..."
          data-placeholder="开始编辑资料..."
        />
      </div>

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}
    </div>
  );
}
