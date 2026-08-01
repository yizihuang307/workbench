"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyAiResult, blocksText, moveAndDeleteCategory, recordBlocks, recordId, validCategoryName, visibleRecords, type RecordBlock, type RecordItem, type RecordStore } from "./records";

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
  const [consentRecordId, setConsentRecordId] = useState<string | null>(null);
  const [aiBusyIds, setAiBusyIds] = useState<string[]>([]);
  const [aiResults, setAiResults] = useState<Array<{ recordId: string; result: string }>>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [moveMenuPosition, setMoveMenuPosition] = useState({ top: 0, left: 0 });
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
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
      if (!(event.target instanceof Element) || !event.target.closest(".record-actions")) { setMenuId(null); setMoveMenuId(null); }
    }
    function closeMenuByKey(event: KeyboardEvent) { if (event.key === "Escape") { setMenuId(null); setMoveMenuId(null); } }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenuByKey);
    return () => { document.removeEventListener("mousedown", closeMenu); document.removeEventListener("keydown", closeMenuByKey); };
  }, []);

  function createRecord(targetCategoryId = categoryId === "all" ? store.defaultCategoryId : categoryId) {
    const now = Date.now();
    const item = { id: recordId(), categoryId: targetCategoryId, body: "", blocks: [{ type: "text" as const, text: "" }], images: [], pinned: false, createdAt: now, updatedAt: now };
    setStore((current) => ({ ...current, records: [item, ...current.records] }));
    setSelectedId(item.id);
  }

  function editDocument(blocks: RecordBlock[]) {
    if (!selected) return;
    setSaveState("saving");
    setStore((current) => ({ ...current, records: current.records.map((item) => item.id === selected.id ? { ...item, body: blocksText(blocks).slice(0, 30000), blocks, images: [], updatedAt: Date.now() } : item) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 500);
  }

  function togglePinned(item: RecordItem) {
    setStore((current) => ({ ...current, records: current.records.map((record) => record.id === item.id ? { ...record, pinned: !record.pinned, updatedAt: Date.now() } : record) }));
  }

  function moveRecord(item: RecordItem, targetCategoryId: string) {
    setStore((current) => ({ ...current, records: current.records.map((record) => record.id === item.id ? { ...record, categoryId: targetCategoryId, updatedAt: Date.now() } : record) }));
    setMenuId(null);
    setMoveMenuId(null);
    onNotice("记录已移动");
  }

  function showMoveMenu(itemId: string, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    setMoveMenuPosition({ top: rect.top, left: rect.right + 2 });
    setMoveMenuId(itemId);
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

  async function requestOrganize(recordId: string) {
    const record = store.records.find((item) => item.id === recordId);
    if (!record?.body.trim() || aiBusyIds.includes(recordId)) return;
    setAiBusyIds((current) => [...current, recordId]);
    try {
      const response = await fetch("/api/organize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: record.body }) });
      const data = await response.json() as { result?: string; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "AI 整理失败");
      setAiResults((current) => [...current.filter((item) => item.recordId !== recordId), { recordId, result: data.result! }]);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI 整理失败，请稍后重试");
    } finally { setAiBusyIds((current) => current.filter((id) => id !== recordId)); }
  }

  function organize() {
    if (!selected) return;
    if (!store.aiConsent) { setConsentRecordId(selected.id); return; }
    void requestOrganize(selected.id);
  }

  function acceptAi(mode: "replace" | "append") {
    const activeResult = aiResults[0];
    if (!activeResult) return;
    setStore((current) => applyAiResult(current, activeResult.recordId, activeResult.result, mode));
    if (selectedId === activeResult.recordId) { setSaveState("saved"); setEditorEpoch((value) => value + 1); }
    setAiResults((current) => current.slice(1));
  }

  const title = categoryId === "all" ? "全部记录" : store.categories.find((item) => item.id === categoryId)?.name || "全部记录";
  return <div className="records-page">
    <div className="category-bar" aria-label="记录分类">
      <button className={categoryId === "all" ? "active" : ""} onClick={() => setCategoryId("all")}>全部记录 <em>{store.records.length}</em></button>
      {store.categories.map((category) => <div className={`category-tab ${categoryId === category.id ? "active" : ""}`} key={category.id}><button onClick={() => setCategoryId(category.id)}>{category.name} <em>{store.records.filter((item) => item.categoryId === category.id).length}</em></button></div>)}
      <button className="category-manage" onClick={() => setCategoriesOpen(true)}>管理分类</button>
    </div>
    <div className="records-layout">
      <section className="record-browser">
        <div className="record-toolbar"><div className="record-toolbar-title"><div><h2>{title}</h2><span>共 {records.length} 项</span></div><button className="record-create" onClick={() => createRecord()} aria-label="新建记录" title="新建记录">＋</button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录正文" aria-label="搜索记录正文" /></div>
        <div className="record-list">
          {records.map((item) => { const lines = item.body.trim().split(/\n+/); const preview = lines.slice(1).join(" ") || lines[0] || "开始输入正文…"; return <article key={item.id} className={`record-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
            <button className={`pin ${item.pinned ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); togglePinned(item); }} aria-label={item.pinned ? "取消置顶" : "置顶"} title={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button>
            <div><strong>{highlight(lines[0] || "新记录", query)}</strong><p>{highlight(preview, query)}</p>{recordBlocks(item).filter((block) => block.type === "image").length ? <small>含 {recordBlocks(item).filter((block) => block.type === "image").length} 张图片 · </small> : null}<small>{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
            <div className="record-actions"><button className="record-more" onClick={(event) => { event.stopPropagation(); const opening = menuId !== item.id; setMenuId(opening ? item.id : null); setMoveMenuId(null); }} aria-label="记录操作" title="记录操作">···</button>{menuId === item.id && <div className="record-menu" onClick={(event) => event.stopPropagation()} onMouseLeave={() => setMoveMenuId(null)}><button className="move-trigger" onMouseEnter={(event) => showMoveMenu(item.id, event.currentTarget)} onFocus={(event) => showMoveMenu(item.id, event.currentTarget)} onClick={(event) => showMoveMenu(item.id, event.currentTarget)} aria-haspopup="menu" aria-expanded={moveMenuId === item.id}>移动到 <span>›</span></button>{moveMenuId === item.id && <div className="record-move-menu" role="menu" style={{ top: moveMenuPosition.top, left: moveMenuPosition.left }}>{store.categories.filter((category) => category.id !== item.categoryId).map((category) => <button role="menuitem" key={category.id} onClick={() => moveRecord(item, category.id)}>{category.name}</button>)}</div>}<button className="danger" onClick={() => { setMenuId(null); setMoveMenuId(null); deleteRecord(item); }}>删除记录</button></div>}</div>
          </article>; })}
          {!records.length && <div className="record-empty"><b>＋</b><p>{query ? "没有匹配的记录" : "这里还没有记录"}</p>{categoryId !== "all" && <button onClick={() => createRecord(categoryId)}>写下第一条</button>}</div>}
        </div>
      </section>
      <section className={`record-editor ${selected ? "open" : ""}`} aria-label="记录编辑器">
        {selected ? <><header><span className="editor-category">{store.categories.find((category) => category.id === selected.categoryId)?.name}</span><span className="editor-count">{selected.body.length} / 30000</span><button className="ai-button" disabled={aiBusyIds.includes(selected.id) || !selected.body.trim()} onClick={organize}>{aiBusyIds.includes(selected.id) ? "正在整理…" : "AI 整理"}</button><span className={`save-state ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="editor-close" onClick={() => setSelectedId(null)} aria-label="关闭编辑器" title="关闭">×</button></header>
          <DocumentEditor key={`${selected.id}-${editorEpoch}`} record={selected} onChange={editDocument} onNotice={onNotice} onPreview={setPreviewImage} /></> : <div className="editor-placeholder"><b>记</b><p>选择一条记录继续编辑</p><span>内容会自动保存</span></div>}
      </section>
    </div>

    {categoriesOpen && <Dialog title="管理分类" onClose={() => setCategoriesOpen(false)}><div className="category-manager"><div className="category-add"><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新分类名称" maxLength={40} onKeyDown={(event) => event.key === "Enter" && addCategory()} /><button onClick={addCategory}>新增</button></div>{store.categories.map((category) => <CategoryEditor key={category.id} category={category} onRename={renameCategory} onDelete={() => { setCategoriesOpen(false); setDeleteCategoryId(category.id); setMoveTarget(store.categories.find((item) => item.id !== category.id)?.id || ""); }} deleteDisabled={store.categories.length === 1} />)}</div></Dialog>}
    {deleteCategoryId && <Dialog title="迁移并删除分类" onClose={() => setDeleteCategoryId(null)}><div className="category-delete-dialog"><p>先选择记录要迁移到的分类，再删除“{store.categories.find((item) => item.id === deleteCategoryId)?.name}”。</p><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>{store.categories.filter((item) => item.id !== deleteCategoryId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><footer><button onClick={() => setDeleteCategoryId(null)}>取消</button><button className="danger" onClick={confirmDeleteCategory}>迁移并删除</button></footer></div></Dialog>}
    {consentRecordId && <Dialog title="发送当前记录给 AI？" onClose={() => setConsentRecordId(null)}><div className="ai-consent"><p>AI 整理会把当前这一条记录的正文发送给外部 AI 服务。不会读取其他记录或整个分类。</p><p>记录可能包含敏感信息，请确认内容适合发送。</p><footer><button onClick={() => setConsentRecordId(null)}>取消</button><button className="primary" onClick={() => { const recordId = consentRecordId; setStore((current) => ({ ...current, aiConsent: true })); setConsentRecordId(null); void requestOrganize(recordId); }}>确认并整理</button></footer></div></Dialog>}
    {aiResults[0] && <Dialog title="AI 整理结果" onClose={() => setAiResults((current) => current.slice(1))}><div className="ai-result"><div><h3>原文</h3><pre>{store.records.find((record) => record.id === aiResults[0].recordId)?.body}</pre></div><div><h3>整理结果</h3><pre>{aiResults[0].result}</pre></div><footer><button onClick={() => setAiResults((current) => current.slice(1))}>取消</button><button onClick={() => acceptAi("append")}>同时保留</button><button className="primary" onClick={() => acceptAi("replace")}>替换当前内容</button></footer></div></Dialog>}
    {previewImage && <Dialog title={previewImage.name || "图片预览"} onClose={() => setPreviewImage(null)}><div className="image-preview"><img src={previewImage.src} alt={previewImage.name} /></div></Dialog>}
    {deleted.length > 0 && <div className="undo" role="status"><span>已删除 {deleted.length} 条</span><button onClick={undoDelete}>撤销最近一条</button></div>}
  </div>;
}

function DocumentEditor({ record, onChange, onNotice, onPreview }: { record: RecordItem; onChange: (blocks: RecordBlock[]) => void; onNotice: (message: string) => void; onPreview: (image: { src: string; name: string }) => void }) {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    root.replaceChildren();
    for (const block of recordBlocks(record)) {
      if (block.type === "text") root.append(document.createTextNode(block.text));
      else root.append(makeImage(block));
    }
    root.focus();
  }, [record.id]);

  function emit() {
    if (editor.current) onChange(readBlocks(editor.current));
  }

  async function paste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const imageFiles = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      const remaining = Math.max(0, 30000 - (editor.current?.innerText.length || 0));
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain").slice(0, remaining));
      emit();
      return;
    }
    const currentCount = editor.current?.querySelectorAll("img[data-record-image-id]").length || 0;
    const accepted = imageFiles.filter((file) => file.size <= 2 * 1024 * 1024).slice(0, 5 - currentCount);
    if (!accepted.length) { onNotice("图片需小于 2MB，且每条最多 5 张"); return; }
    let range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
    for (const file of accepted) {
      const dataUrl = await fileDataUrl(file);
      const image = makeImage({ id: recordId(), dataUrl, name: file.name || "粘贴的图片" });
      range = insertAtRange(editor.current!, range, image);
    }
    emit();
  }

  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const chosen = editor.current?.querySelector<HTMLImageElement>("img.record-inline-image.selected");
    if ((event.key === "Backspace" || event.key === "Delete") && chosen) {
      event.preventDefault();
      chosen.remove();
      emit();
    }
  }

  function click(event: React.MouseEvent<HTMLDivElement>) {
    const image = event.target instanceof HTMLImageElement ? event.target : null;
    editor.current?.querySelectorAll("img.selected").forEach((node) => node.classList.remove("selected"));
    if (!image?.matches("img[data-record-image-id]")) return;
    image.classList.add("selected");
    onPreview({ src: image.src, name: image.alt });
  }

  function dragStart(event: React.DragEvent<HTMLDivElement>) {
    const image = event.target instanceof HTMLImageElement ? event.target : null;
    if (!image?.dataset.recordImageId) return;
    event.dataTransfer.setData("text/x-record-image", image.dataset.recordImageId);
    event.dataTransfer.effectAllowed = "move";
  }

  function drop(event: React.DragEvent<HTMLDivElement>) {
    const id = event.dataTransfer.getData("text/x-record-image");
    if (!id || !editor.current) return;
    event.preventDefault();
    const image = editor.current.querySelector<HTMLImageElement>(`img[data-record-image-id="${CSS.escape(id)}"]`);
    if (!image) return;
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = document.createRange();
    if (caret) range.setStart(caret.offsetNode, caret.offset); else range.selectNodeContents(editor.current);
    range.collapse(false);
    image.remove();
    range.insertNode(image);
    emit();
  }

  return <div className="record-document-editor" ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="记录正文，可粘贴和拖动图片" data-placeholder="直接写正文，可粘贴图片，不需要标题…" onInput={emit} onPaste={paste} onKeyDown={keyDown} onClick={click} onDragStart={dragStart} onDragOver={(event) => event.preventDefault()} onDrop={drop} />;
}

function makeImage(image: { id: string; dataUrl: string; name: string }) {
  const node = document.createElement("img");
  node.src = image.dataUrl;
  node.alt = image.name;
  node.dataset.recordImageId = image.id;
  node.className = "record-inline-image";
  node.draggable = true;
  node.title = "拖动调整位置；选中后按 Delete 删除";
  return node;
}

function readBlocks(root: HTMLElement): RecordBlock[] {
  const blocks: RecordBlock[] = [];
  function text(value: string) {
    if (!value) return;
    const last = blocks[blocks.length - 1];
    if (last?.type === "text") last.text += value; else blocks.push({ type: "text", text: value });
  }
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { text(node.textContent || ""); return; }
    if (node instanceof HTMLImageElement && node.dataset.recordImageId && node.src.startsWith("data:image/")) {
      blocks.push({ type: "image", id: node.dataset.recordImageId, dataUrl: node.src, name: node.alt || "粘贴的图片" }); return;
    }
    if (node instanceof HTMLBRElement) { text("\n"); return; }
    const element = node instanceof HTMLElement ? node : null;
    [...node.childNodes].forEach(walk);
    if (element && (element.tagName === "DIV" || element.tagName === "P") && node !== root) text("\n");
  }
  [...root.childNodes].forEach(walk);
  return blocks.length ? blocks : [{ type: "text", text: "" }];
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function insertAtRange(root: HTMLElement, source: Range | null, node: Node) {
  const range = source || document.createRange();
  if (!source) { range.selectNodeContents(root); range.collapse(false); }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range.cloneRange();
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
