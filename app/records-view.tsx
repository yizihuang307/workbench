"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { moveAndDeleteCategory, recordId, validCategoryName, visibleRecords, type RecordItem, type RecordStore } from "./records";

type Props = { store: RecordStore; setStore: React.Dispatch<React.SetStateAction<RecordStore>>; storageError: boolean; onNotice: (message: string) => void };

export default function RecordsView({ store, setStore, storageError, onNotice }: Props) {
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [deleted, setDeleted] = useState<RecordItem[]>([]);
  const [consentOpen, setConsentOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const records = useMemo(() => visibleRecords(store, categoryId, query), [store, categoryId, query]);
  const selected = store.records.find((item) => item.id === selectedId) ?? null;

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    undoTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => { if (storageError) setSaveState("error"); }, [storageError]);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest(".record-actions")) setMenuId(null);
    }
    function closeMenuByKey(event: KeyboardEvent) { if (event.key === "Escape") setMenuId(null); }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenuByKey);
    return () => { document.removeEventListener("mousedown", closeMenu); document.removeEventListener("keydown", closeMenuByKey); };
  }, []);

  function createRecord(targetCategoryId = categoryId === "all" ? store.defaultCategoryId : categoryId) {
    const now = Date.now();
    const item = { id: recordId(), categoryId: targetCategoryId, body: "", images: [], pinned: false, createdAt: now, updatedAt: now };
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

  function moveRecord(item: RecordItem, targetCategoryId: string) {
    setStore((current) => ({ ...current, records: current.records.map((record) => record.id === item.id ? { ...record, categoryId: targetCategoryId, updatedAt: Date.now() } : record) }));
    setMenuId(null);
    onNotice("记录已移动");
  }

  function pasteImages(files: File[]) {
    if (!selected) return;
    const available = 5 - (selected.images?.length || 0);
    if (available <= 0) { onNotice("每条记录最多保存 5 张图片"); return; }
    const accepted = files.filter((file) => file.type.startsWith("image/") && file.size <= 2 * 1024 * 1024).slice(0, available);
    if (!accepted.length) { onNotice("图片需小于 2MB，且每条最多 5 张"); return; }
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        setStore((current) => ({ ...current, records: current.records.map((record) => record.id === selected.id ? { ...record, images: [...(record.images || []), { id: recordId(), dataUrl: reader.result as string, name: file.name || "粘贴的图片" }].slice(0, 5), updatedAt: Date.now() } : record) }));
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(imageId: string) {
    if (!selected) return;
    setStore((current) => ({ ...current, records: current.records.map((record) => record.id === selected.id ? { ...record, images: (record.images || []).filter((image) => image.id !== imageId), updatedAt: Date.now() } : record) }));
  }

  function deleteRecord(item: RecordItem) {
    setStore((current) => ({ ...current, records: current.records.filter((record) => record.id !== item.id) }));
    if (selectedId === item.id) setSelectedId(null);
    setDeleted((current) => [...current, item]);
    const timer = setTimeout(() => {
      setDeleted((current) => current.filter((record) => record.id !== item.id));
      undoTimers.current.delete(timer);
    }, 5000);
    undoTimers.current.add(timer);
  }

  function undoDelete() {
    const latest = deleted[deleted.length - 1];
    if (!latest) return;
    setStore((current) => ({ ...current, records: [latest, ...current.records] }));
    setDeleted((current) => current.slice(0, -1));
  }

  function addCategory() {
    const name = validCategoryName(store.categories, newCategory);
    if (!name) { onNotice(newCategory.trim() ? "分类名称不能重复" : "分类名称不能为空"); return; }
    setStore((current) => ({ ...current, categories: [...current.categories, { id: recordId(), name, createdAt: Date.now() }] }));
    setNewCategory("");
  }

  function renameCategory(id: string, name: string) {
    const clean = validCategoryName(store.categories, name, id);
    const currentName = store.categories.find((item) => item.id === id)?.name;
    if (!clean) {
      onNotice(name.trim() ? "分类名称不能重复" : "分类名称不能为空");
      return currentName || "";
    }
    setStore((current) => ({ ...current, categories: current.categories.map((item) => item.id === id ? { ...item, name: clean } : item) }));
    return clean;
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
    <div className="category-bar" aria-label="记录分类">
      <button className={categoryId === "all" ? "active" : ""} onClick={() => setCategoryId("all")}>全部记录 <em>{store.records.length}</em></button>
      {store.categories.map((category) => <div className={`category-tab ${categoryId === category.id ? "active" : ""}`} key={category.id}><button onClick={() => setCategoryId(category.id)}>{category.name} <em>{store.records.filter((item) => item.categoryId === category.id).length}</em></button><button className="category-new" onClick={() => createRecord(category.id)} aria-label={`在${category.name}中新建记录`} title={`在${category.name}中新建`}>＋</button></div>)}
      <button className="category-manage" onClick={() => setCategoriesOpen(true)}>管理分类</button>
    </div>
    <div className="records-layout">
      <section className="record-browser">
        <div className="record-toolbar"><div><h2>{title}</h2><span>共 {records.length} 项</span></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录正文" aria-label="搜索记录正文" /></div>
        <div className="record-list">
          {records.map((item) => { const lines = item.body.trim().split(/\n+/); const preview = lines.slice(1).join(" ") || lines[0] || "开始输入正文…"; return <article key={item.id} className={`record-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
            <button className={`pin ${item.pinned ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); togglePinned(item); }} aria-label={item.pinned ? "取消置顶" : "置顶"} title={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button>
            <div><strong>{highlight(lines[0] || "新记录", query)}</strong><p>{highlight(preview, query)}</p>{item.images?.length ? <small>含 {item.images.length} 张图片 · </small> : null}<small>{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
            <div className="record-actions"><button className="record-more" onClick={(event) => { event.stopPropagation(); setMenuId(menuId === item.id ? null : item.id); }} aria-label="记录操作" title="记录操作">···</button>{menuId === item.id && <div className="record-menu" onClick={(event) => event.stopPropagation()}><strong>移动到</strong>{store.categories.filter((category) => category.id !== item.categoryId).map((category) => <button key={category.id} onClick={() => moveRecord(item, category.id)}>{category.name}</button>)}<button className="danger" onClick={() => { setMenuId(null); deleteRecord(item); }}>删除记录</button></div>}</div>
          </article>; })}
          {!records.length && <div className="record-empty"><b>＋</b><p>{query ? "没有匹配的记录" : "这里还没有记录"}</p>{categoryId !== "all" && <button onClick={() => createRecord(categoryId)}>写下第一条</button>}</div>}
        </div>
      </section>
      <section className={`record-editor ${selected ? "open" : ""}`} aria-label="记录编辑器">
        {selected ? <><header><span className="editor-category">{store.categories.find((category) => category.id === selected.categoryId)?.name}</span><span className={`save-state ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="editor-close" onClick={() => setSelectedId(null)} aria-label="关闭编辑器" title="关闭">×</button></header>
          <textarea autoFocus value={selected.body} onChange={(event) => editBody(event.target.value)} onPaste={(event) => { const files = [...event.clipboardData.files]; if (files.some((file) => file.type.startsWith("image/"))) { event.preventDefault(); pasteImages(files); } }} placeholder="直接写正文，可粘贴图片，不需要标题…" maxLength={30000} />
          {!!selected.images?.length && <div className="record-images">{selected.images.map((image) => <figure key={image.id}><img src={image.dataUrl} alt={image.name} /><button onClick={() => removeImage(image.id)} aria-label={`删除图片${image.name}`}>×</button></figure>)}</div>}
          <footer><span>{selected.body.length} / 30000</span><button className="ai-button" disabled={aiBusy || !selected.body.trim()} onClick={organize}>{aiBusy ? "正在整理…" : "AI 整理"}</button></footer></> : <div className="editor-placeholder"><b>记</b><p>选择一条记录继续编辑</p><span>内容会自动保存</span></div>}
      </section>
    </div>

    {categoriesOpen && <Dialog title="管理分类" onClose={() => setCategoriesOpen(false)}><div className="category-manager"><label className="manager-default"><span>快速记录默认分类</span><select value={store.defaultCategoryId} onChange={(event) => setStore((current) => ({ ...current, defaultCategoryId: event.target.value }))}>{store.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="category-add"><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新分类名称" maxLength={40} onKeyDown={(event) => event.key === "Enter" && addCategory()} /><button onClick={addCategory}>新增</button></div>{store.categories.map((category) => <CategoryEditor key={category.id} category={category} onRename={renameCategory} onDelete={() => { setCategoriesOpen(false); setDeleteCategoryId(category.id); setMoveTarget(store.categories.find((item) => item.id !== category.id)?.id || ""); }} deleteDisabled={store.categories.length === 1} />)}</div></Dialog>}
    {deleteCategoryId && <Dialog title="迁移并删除分类" onClose={() => setDeleteCategoryId(null)}><div className="category-delete-dialog"><p>先选择记录要迁移到的分类，再删除“{store.categories.find((item) => item.id === deleteCategoryId)?.name}”。</p><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>{store.categories.filter((item) => item.id !== deleteCategoryId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><footer><button onClick={() => setDeleteCategoryId(null)}>取消</button><button className="danger" onClick={confirmDeleteCategory}>迁移并删除</button></footer></div></Dialog>}
    {consentOpen && <Dialog title="发送当前记录给 AI？" onClose={() => setConsentOpen(false)}><div className="ai-consent"><p>AI 整理会把当前这一条记录的正文发送给外部 AI 服务。不会读取其他记录或整个分类。</p><p>记录可能包含敏感信息，请确认内容适合发送。</p><footer><button onClick={() => setConsentOpen(false)}>取消</button><button className="primary" onClick={() => { setStore((current) => ({ ...current, aiConsent: true })); setConsentOpen(false); void requestOrganize(); }}>确认并整理</button></footer></div></Dialog>}
    {aiResult && <Dialog title="AI 整理结果" onClose={() => setAiResult("")}><div className="ai-result"><div><h3>原文</h3><pre>{selected?.body}</pre></div><div><h3>整理结果</h3><pre>{aiResult}</pre></div><footer><button onClick={() => setAiResult("")}>取消</button><button onClick={() => acceptAi("append")}>同时保留</button><button className="primary" onClick={() => acceptAi("replace")}>替换当前内容</button></footer></div></Dialog>}
    {deleted.length > 0 && <div className="undo" role="status"><span>已删除 {deleted.length} 条</span><button onClick={undoDelete}>撤销最近一条</button></div>}
  </div>;
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? <mark key={index}>{part}</mark> : part);
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("modal-open");
    box.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && box.current) {
        const focusable = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, textarea")];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      returnFocus?.focus();
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal records-modal" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="关闭">×</button><header><h2>{title}</h2></header>{children}</div></div>;
}

function CategoryEditor({ category, onRename, onDelete, deleteDisabled }: { category: { id: string; name: string }; onRename: (id: string, name: string) => string; onDelete: () => void; deleteDisabled: boolean }) {
  const [name, setName] = useState(category.name);
  return <div className="category-edit"><input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => setName(onRename(category.id, name))} /><button disabled={deleteDisabled} onClick={onDelete}>删除</button></div>;
}
