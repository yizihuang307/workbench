"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

type RecordCategory = {
  id: string;
  name: string;
};

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;

  const [record, setRecord] = useState<RecordItem | null>(null);
  const [category, setCategory] = useState<RecordCategory | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRecord = useCallback(async () => {
    try {
      const res = await fetch(`/api/records/${recordId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      const data = json.data as RecordItem;
      setRecord(data);
      try {
        const doc = JSON.parse(data.document_json);
        setEditorContent(doc.text ?? data.plain_text ?? "");
      } catch {
        setEditorContent(data.plain_text ?? "");
      }
    } catch {
      setNotice("加载记录失败");
    } finally {
      setReady(true);
    }
  }, [recordId]);

  const loadCategory = useCallback(async () => {
    if (!record) return;
    try {
      const res = await fetch("/api/record-categories");
      if (res.ok) {
        const json = await res.json();
        const cats = json.data as RecordCategory[];
        const cat = cats.find((c) => c.id === record.category_id);
        if (cat) setCategory(cat);
      }
    } catch { /* ignore */ }
  }, [record]);

  useEffect(() => { loadRecord(); }, [loadRecord]);
  useEffect(() => { loadCategory(); }, [loadCategory]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  async function saveRecord() {
    if (!record) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentJson: JSON.stringify({ text: editorContent }),
          plainText: editorContent,
          title: editorContent.slice(0, 50) || "未命名记录",
          version: record.version,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const json = await res.json();
      setRecord(json.data as RecordItem);
      setNotice("已保存");
    } catch {
      setNotice("保存失败");
    }
    setSaving(false);
  }

  async function deleteRecord() {
    if (!record) return;
    if (!confirm("确定删除这条记录吗？")) return;
    try {
      const res = await fetch(`/api/records/${record.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/records");
      }
    } catch { /* ignore */ }
  }

  if (!ready) {
    return (
      <div className="record-detail-page">
        <div className="record-detail-loading">加载中...</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="record-detail-page">
        <div className="record-detail-empty">
          <b>?</b>
          <p>记录不存在或已被删除</p>
          <button onClick={() => router.push("/records")}>返回列表</button>
        </div>
      </div>
    );
  }

  return (
    <div className="record-detail-page">
      <header className="record-detail-header">
        <button className="record-back" onClick={() => router.push("/records")}>
          ← 返回
        </button>
        <div className="record-detail-meta">
          <span className="record-category-tag">
            {category?.name ?? "未分类"}
          </span>
          <span className={`save-state ${saving ? "saving" : ""}`}>
            {saving ? "保存中…" : "已保存"}
          </span>
        </div>
        <div className="record-detail-actions">
          <button className="record-save" onClick={saveRecord} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button className="record-delete-btn" onClick={deleteRecord}>
            删除
          </button>
        </div>
      </header>

      <div className="record-detail-editor">
        <textarea
          className="record-document-editor"
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          onBlur={saveRecord}
          placeholder="开始记录..."
          data-placeholder="开始记录..."
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
