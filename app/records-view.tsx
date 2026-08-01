"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { moveAndDeleteCategory, recordId, visibleRecords, type RecordItem, type RecordStore } from "./records";

type Props = { store: RecordStore; setStore: React.Dispatch<React.SetStateAction<RecordStore>>; onNotice: (message: string) => void };

export default function RecordsView({ store, setStore, onNotice }: Props) {
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [deleted, setDeleted] = useState<RecordItem | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const records = useMemo(() => visibleRecords(store, categoryId, query), [store, categoryId, query]);
  const selected = store.records.find((item) => item.id === selectedId) ?? null;

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  function createRecord() {
    const now = Date.now();
    const item = { id: recordId(), categoryId: categoryId === "all" ? store.defaultCategoryId : categoryId, body: "", pinned: false, createdAt: now, updatedAt: now };
    setStore((current) => ({ ...current, records: [item, ...current.records] }));
    setSelectedId(item.id);
  }

  function editBody(body: string) {
    if (!selected) return;
    setSaveState("saving");
    setStore((current) => ({ ...current, records: current.records.map((item) => item.id === selected.id ? { ...item, body: body.slice(0, 30000), updatedAt: Date.now() } : item) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 500);
  }

  function togglePinned(item: RecordItem) {
    setStore((current) => ({ ...current, records: current.records.map((record) => record.id === item.id ? { ...record, pinned: !record.pinned, updatedAt: Date.now() } : record) }));
  }

  function deleteRecord(item: RecordItem) {
    setStore((current) => ({ ...current, records: current.records.filter((record) => record.id !== item.id) }));
    if (selectedId === item.id) setSelectedId(null);
    setDeleted(item);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 5000);
  }

  function undoDelete() {
    if (!deleted) return;
    setStore((current) => ({ ...current, records: [deleted, ...current.records] }));
    setDeleted(null);
  }

  function addCategory() {
    const name = newCategory.trim().slice(0, 40);
    if (!name || store.categories.some((item) => item.name === name)) return;
    setStore((current) => ({ ...current, categories: [...current.categories, { id: recordId(), name, createdAt: Date.now() }] }));
    setNewCategory("");
  }

  function renameCategory(id: string, name: string) {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    setStore((current) => ({ ...current, categories: current.categories.map((item) => item.id === id ? { ...item, name: clean } : item) }));
  }

  function confirmDeleteCategory() {
    if (!deleteCategoryId || !moveTarget) return;
    setStore((current) => moveAndDeleteCategory(current, deleteCategoryId, moveTarget));
    if (categoryId === deleteCategoryId) setCategoryId("all");
    setDeleteCategoryId(null);
    setMoveTarget("");
    onNotice("分类已迁移并删除");
  }

  async function requestOrganize() {
    if (!selected?.body.trim()) return;
    setAiBusy(true);
    try {
      const response = await fetch("/api/organize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: selected.body }) });
      const data = await response.json() as { result?: string; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "AI 整理失败");
      setAiResult(data.result);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI 整理失败，请稍后重试");
    } finally { setAiBusy(false); }
  }

  function organize() {
    if (!store.aiConsent) { setConsentOpen(true); return; }
    void requestOrganize();
  }

  function acceptAi(mode: "replace" | "append") {
    if (!selected || !aiResult) return;
    editBody(mode === "replace" ? aiResult : `${selected.body.trim()}\n\n—— AI 整理结果 ——\n${aiResult}`);
    setAiResult("");
  }

  const title = categoryId === "all" ? "全部记录" : store.categories.find((item) => item.id === categoryId)?.name || "全部记录";
  return <div className="records-page">
    <header className="records-hero"><div><p>记录</p><h1>先记下来，再慢慢整理。</h1></div><button className="record-new" onClick={createRecord}>＋ 新建记录</button></header>
    <div className="records-layout">
      <aside className="category-panel" aria-label="记录分类">
        <div className="category-heading"><strong>分类</strong><button onClick={() => setCategoriesOpen(true)} aria-label="管理分类" title="管理分类">管理</button></div>
        <button className={categoryId === "all" ? "active" : ""} onClick={() => setCategoryId("all")}><span>全部记录</span><em>{store.records.length}</em></button>
        {store.categories.map((category) => <button key={category.id} className={categoryId === category.id ? "active" : ""} onClick={() => setCategoryId(category.id)}><span>{category.name}</span><em>{store.records.filter((item) => item.categoryId === category.id).length}</em></button>)}
        <label className="default-category"><span>快速记录默认分类</span><select value={store.defaultCategoryId} onChange={(event) => setStore((current) => ({ ...current, defaultCategoryId: event.target.value }))}>{store.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </aside>
      <section className="record-browser">
        <div className="record-toolbar"><div><h2>{title}</h2><span>共 {records.length} 项</span></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录正文" aria-label="搜索记录正文" /></div>
        <div className="record-list">
          {records.map((item) => { const lines = item.body.trim().split(/\n+/); return <article key={item.id} className={`record-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
            <button className={`pin ${item.pinned ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); togglePinned(item); }} aria-label={item.pinned ? "取消置顶" : "置顶"} title={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button>
            <div><strong>{lines[0] || "新记录"}</strong><p>{lines.slice(1).join(" ") || "开始输入正文…"}</p><small>{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
            <button className="record-delete" onClick={(event) => { event.stopPropagation(); deleteRecord(item); }} aria-label="删除记录" title="删除记录">×</button>
          </article>; })}
          {!records.length && <div className="record-empty"><b>＋</b><p>{query ? "没有匹配的记录" : "这里还没有记录"}</p><button onClick={createRecord}>写下第一条</button></div>}
        </div>
      </section>
      <section className={`record-editor ${selected ? "open" : ""}`} aria-label="记录编辑器">
        {selected ? <><header><select value={selected.categoryId} onChange={(event) => setStore((current) => ({ ...current, records: current.records.map((item) => item.id === selected.id ? { ...item, categoryId: event.target.value, updatedAt: Date.now() } : item) }))}>{store.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><span className={`save-state ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="editor-close" onClick={() => setSelectedId(null)} aria-label="关闭编辑器" title="关闭">×</button></header>
          <textarea autoFocus value={selected.body} onChange={(event) => editBody(event.target.value)} placeholder="直接写正文，不需要标题…" maxLength={30000} />
          <footer><span>{selected.body.length} / 30000</span><button className="ai-button" disabled={aiBusy || !selected.body.trim()} onClick={organize}>{aiBusy ? "正在整理…" : "AI 整理"}</button></footer></> : <div className="editor-placeholder"><b>记</b><p>选择一条记录继续编辑</p><span>内容会自动保存</span></div>}
      </section>
    </div>

    {categoriesOpen && <Dialog title="管理分类" onClose={() => setCategoriesOpen(false)}><div className="category-manager"><div className="category-add"><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新分类名称" maxLength={40} onKeyDown={(event) => event.key === "Enter" && addCategory()} /><button onClick={addCategory}>新增</button></div>{store.categories.map((category) => <div className="category-edit" key={category.id}><input defaultValue={category.name} onBlur={(event) => renameCategory(category.id, event.target.value)} /><button disabled={store.categories.length === 1} onClick={() => { setDeleteCategoryId(category.id); setMoveTarget(store.categories.find((item) => item.id !== category.id)?.id || ""); }}>删除</button></div>)}</div></Dialog>}
    {deleteCategoryId && <Dialog title="迁移并删除分类" onClose={() => setDeleteCategoryId(null)}><div className="category-delete-dialog"><p>先选择记录要迁移到的分类，再删除“{store.categories.find((item) => item.id === deleteCategoryId)?.name}”。</p><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>{store.categories.filter((item) => item.id !== deleteCategoryId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><footer><button onClick={() => setDeleteCategoryId(null)}>取消</button><button className="danger" onClick={confirmDeleteCategory}>迁移并删除</button></footer></div></Dialog>}
    {consentOpen && <Dialog title="发送当前记录给 AI？" onClose={() => setConsentOpen(false)}><div className="ai-consent"><p>AI 整理会把当前这一条记录的正文发送给外部 AI 服务。不会读取其他记录或整个分类。</p><p>记录可能包含敏感信息，请确认内容适合发送。</p><footer><button onClick={() => setConsentOpen(false)}>取消</button><button className="primary" onClick={() => { setStore((current) => ({ ...current, aiConsent: true })); setConsentOpen(false); void requestOrganize(); }}>确认并整理</button></footer></div></Dialog>}
    {aiResult && <Dialog title="AI 整理结果" onClose={() => setAiResult("")}><div className="ai-result"><div><h3>原文</h3><pre>{selected?.body}</pre></div><div><h3>整理结果</h3><pre>{aiResult}</pre></div><footer><button onClick={() => setAiResult("")}>取消</button><button onClick={() => acceptAi("append")}>同时保留</button><button className="primary" onClick={() => acceptAi("replace")}>替换当前内容</button></footer></div></Dialog>}
    {deleted && <div className="undo" role="status"><span>记录已删除</span><button onClick={undoDelete}>撤销</button></div>}
  </div>;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal records-modal" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="关闭">×</button><header><h2>{title}</h2></header>{children}</div></div>;
}
