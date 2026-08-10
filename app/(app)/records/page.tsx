"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability */

import { useCallback, useEffect, useRef, useState } from "react";

type RecordCategory = {
  id: string;
  name: string;
  sort_key: string;
  is_default_seed: boolean;
};

type RecordItem = {
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

type Deleted = { record: RecordItem };

export default function RecordsPage() {
  const [categories, setCategories] = useState<RecordCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/record-categories");
      if (res.ok) setCategories((await res.json()).data ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadRecords = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("categoryId", activeCategory);
      if (search) params.set("search", search);
      const res = await fetch(`/api/records?${params}`);
      if (res.ok) setRecords((await res.json()).data ?? []);
    } catch { /* ignore */ }
    setReady(true);
  }, [activeCategory, search]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  const selected = records.find((r) => r.id === selectedId);

  // 选择记录后加载内容
  useEffect(() => {
    if (selected) {
      try {
        const doc = JSON.parse(selected.document_json);
        setEditorContent(doc.text ?? selected.plain_text ?? "");
      } catch {
        setEditorContent(selected.plain_text ?? "");
      }
    }
  }, [selectedId]);

  async function createRecord() {
    const catId = categories[0]?.id;
    if (!catId) return setNotice("请先创建分类");
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: catId, documentJson: "{}", plainText: "" }),
      });
      if (!res.ok) throw new Error("创建失败");
      const json = await res.json();
      setRecords((prev) => [json.data as RecordItem, ...prev]);
      setSelectedId(json.data.id);
    } catch {
      setNotice("创建失败");
    }
  }

  async function saveRecord() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/records/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentJson: JSON.stringify({ text: editorContent }),
          plainText: editorContent,
          version: selected.version,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const json = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === selected.id ? json.data as RecordItem : r)));
    } catch {
      setNotice("保存失败");
    }
    setSaving(false);
  }

  async function deleteRecord(id: string) {
    const record = records.find((r) => r.id === id);
    if (!record) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDeleted({ record });
    try {
      const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        (window as unknown as Record<string, string>).__lastDeletionToken = json.deletionToken;
        setTimeout(() => setDeleted(null), 5000);
      }
    } catch { /* ignore */ }
  }

  async function undoDelete() {
    if (!deleted) return;
    const token = (window as unknown as Record<string, string>).__lastDeletionToken;
    if (token) {
      try {
        await fetch("/api/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "record", id: deleted.record.id, deletionToken: token }),
        });
      } catch { /* ignore */ }
    }
    setRecords((prev) => [...prev, deleted.record]);
    setDeleted(null);
  }

  return (
    <div className="records-page">
      <header className="records-hero">
        <div>
          <p>CAPTURE</p>
          <h1>随手记</h1>
        </div>
        <button className="record-new" onClick={createRecord} disabled={!ready}>
          新建记录
        </button>
      </header>

      <div className="category-bar">
        <button
          className={activeCategory === "all" ? "active" : ""}
          onClick={() => setActiveCategory("all")}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={activeCategory === cat.id ? "active" : ""}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="records-layout">
        <div className="record-browser">
          <div className="record-toolbar">
            <input
              type="search"
              placeholder="搜索记录..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="record-list">
            {!ready ? (
              <div className="record-empty"><b>⋯</b><p>加载中…</p></div>
            ) : !records.length ? (
              <div className="record-empty">
                <b>+</b>
                <p>还没有记录</p>
                <button onClick={createRecord}>创建第一条</button>
              </div>
            ) : (
              records.map((r) => (
                <div
                  key={r.id}
                  className={`record-card ${selectedId === r.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <button
                    className={`pin ${r.is_pinned ? "active" : ""}`}
                    aria-label="置顶"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.is_pinned ? "★" : "☆"}
                  </button>
                  <div>
                    <strong>{r.title || "未命名记录"}</strong>
                    <p>{r.plain_text?.slice(0, 100) || "空记录"}</p>
                    <small>{new Date(r.updated_at).toLocaleDateString("zh-CN")}</small>
                  </div>
                  <button
                    className="record-delete"
                    onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }}
                    aria-label="删除"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="record-editor">
          {selected ? (
            <>
              <header>
                <span className="editor-category">
                  {categories.find((c) => c.id === selected.category_id)?.name ?? "未分类"}
                </span>
                <span className={`save-state ${saving ? "saving" : ""}`}>
                  {saving ? "保存中…" : "已保存"}
                </span>
                <button className="editor-close" onClick={() => setSelectedId(null)} aria-label="关闭">
                  ×
                </button>
              </header>
              <textarea
                className="record-document-editor"
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                onBlur={saveRecord}
                placeholder="开始记录..."
                data-placeholder="开始记录..."
              />
            </>
          ) : (
            <div className="editor-placeholder">
              <b>+</b>
              <p>选择一条记录开始编辑</p>
              <span>或创建新的记录</span>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}

      {deleted && (
        <div className="undo" role="status">
          <span>已删除“{deleted.record.title}”</span>
          <button onClick={undoDelete}>撤销</button>
        </div>
      )}
    </div>
  );
}

