"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveDocumentTitle, FILE_LIMIT, htmlText, infoId, legacyDocumentHtml, linkifyPlainText, safeUrl, sanitizeDocumentHtml, tableHtml, totalFileBytes, TOTAL_FILE_LIMIT, urlMeta, visibleResources, type InfoBlock, type InfoSection, type InfoStore, type ResourceItem } from "./information";

type Props = { store: InfoStore; setStore: React.Dispatch<React.SetStateAction<InfoStore>>; storageError: boolean; onNotice: (message: string) => void };

export default function InformationView({ store, setStore, storageError, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSystem, setNewSystem] = useState(false);
  const [systemMenuId, setSystemMenuId] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftSection, setDraftSection] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const previousScroll = useRef(0);
  const draftId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resourceSections = store.sections.filter((section) => section.type === "resources");
  const systemSection = store.sections.find((section) => section.type === "systems");
  const editing = store.resources.find((item) => item.id === editingId) ?? null;
  const results = useMemo(() => visibleResources(store, "all", query), [store, query]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function openEditor(id: string) { previousScroll.current = window.scrollY; setEditingId(id); }
  function closeEditor() {
    if (draftId.current) {
      const draft = store.resources.find((item) => item.id === draftId.current);
      const meaningful = Boolean(draft && (htmlText(draft.documentHtml || "").trim() || draft.blocks.some((block) => block.type === "file" || block.type === "link" || (block.type === "text" && block.text.trim()))));
      if (!meaningful) setStore((current) => ({ ...current, resources: current.resources.filter((item) => item.id !== draftId.current) }));
      draftId.current = null;
    }
    setEditingId(null); requestAnimationFrame(() => window.scrollTo({ top: previousScroll.current }));
  }
  useEffect(() => {
    function key(event: KeyboardEvent) { if (event.key === "Escape") { if (editingId) closeEditor(); else { setManageOpen(false); setNewSystem(false); setSystemMenuId(null); setExpandedSectionId(null); } } }
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".system-row")) setSystemMenuId(null); }
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside); return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  });
  function updateResource(id: string, updater: (item: ResourceItem) => ResourceItem) {
    setSaveState("saving");
    setStore((current) => ({ ...current, resources: current.resources.map((item) => item.id === id ? updater(item) : item) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 450);
  }
  function createResource(sectionId: string) {
    // eslint-disable-next-line react-hooks/purity -- event-handler timestamp, not render output
    const now = Date.now(), item: ResourceItem = { id: infoId(), sectionId, title: "未命名资料", titleAuto: true, blocks: [{ id: infoId(), type: "text", text: "" }], pinned: false, createdAt: now, updatedAt: now };
    setStore((current) => ({ ...current, resources: [item, ...current.resources] })); draftId.current = item.id; openEditor(item.id);
  }
  function deleteResource(item: ResourceItem) {
    if (!window.confirm(`确定删除“${item.title}”吗？其中的本地文件也会被删除。`)) return;
    setStore((current) => ({ ...current, resources: current.resources.filter((resource) => resource.id !== item.id) })); closeEditor(); onNotice("资料已删除");
  }
  function addSection() {
    const name = draftSection.trim().slice(0, 40);
    if (!name || store.sections.some((section) => section.name === name)) { onNotice(name ? "分区名称不能重复" : "分区名称不能为空"); return; }
    setStore((current) => ({ ...current, sections: [...current.sections, { id: infoId(), name, type: "resources", order: current.sections.length, createdAt: Date.now() }] })); setDraftSection("");
  }

  if (editing) return <ResourceWorkspace item={editing} sections={resourceSections} saveState={storageError ? "error" : saveState} fileBytes={totalFileBytes(store)} onClose={closeEditor} onDelete={() => deleteResource(editing)} onUpdate={(updater) => updateResource(editing.id, updater)} onNotice={onNotice} />;

  return <div className="info-page">
    <header className="info-toolbar">
      <div className="info-index" aria-label="分区索引">{store.sections.map((section) => <button key={section.id} onClick={() => document.getElementById(`info-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{section.name}</button>)}</div>
      <button className="info-manage" onClick={() => setManageOpen(true)}>管理分区</button>
    </header>
    <label className="info-search"><span aria-hidden>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料、链接或文件名" aria-label="搜索信息" /><small>{query ? `共 ${results.length} 项` : ""}</small></label>

    {systemSection && <section className="system-section" id={`info-${systemSection.id}`}>
      <header><div><h2>{systemSection.name}</h2><span>共 {store.systems.length} 项</span></div><button onClick={() => setNewSystem(true)} aria-label="新增常用链接">＋</button></header>
      <div className="system-grid">{[...store.systems].sort((a,b) => a.order-b.order).map((item) => {
        const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
        return <article className="system-row" key={item.id}><button className="system-open" onClick={() => window.open(target.url, "_blank", "noopener,noreferrer")} title={item.name}><b><i aria-hidden>{item.name.slice(0,1).toUpperCase()}</i>{/^https?:\/\//.test(item.icon) && <img src={item.icon} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</b><span>{item.name}</span><small>{new URL(target.url).hostname}</small></button><button className="system-remove" aria-label={`操作${item.name}`} aria-expanded={systemMenuId === item.id} onClick={() => setSystemMenuId((current) => current === item.id ? null : item.id)}>···</button>{systemMenuId === item.id && <div className="system-menu" role="menu"><button onClick={() => { const name = window.prompt("编辑系统名称", item.name)?.trim().slice(0,200); if (name) setStore((current) => ({ ...current, systems: current.systems.map((system) => system.id === item.id ? { ...system, name, updatedAt: Date.now() } : system) })); setSystemMenuId(null); }}>编辑名称</button><button onClick={() => { setSystemMenuId(null); void refreshSystemMetadata(item.id, target.url, setStore, onNotice); }}>重新识别名称和 Logo</button><button className="danger" onClick={() => { setSystemMenuId(null); if (window.confirm(`确定删除“${item.name}”吗？`)) setStore((current) => ({ ...current, systems: current.systems.filter((system) => system.id !== item.id) })); }}>删除</button></div>}</article>;
      })}{!store.systems.length && <div className="info-empty"><b>↗</b><span>粘贴网址，名称和图标会自动生成</span><button onClick={() => setNewSystem(true)}>添加第一个系统</button></div>}</div>
    </section>}

    <div className="resource-sections">{resourceSections.map((section) => {
      const items = query ? results.filter((item) => item.sectionId === section.id) : visibleResources(store, section.id, "");
      const expanded = expandedSectionId === section.id;
      return <section className={`resource-section ${expanded ? "expanded" : ""}`} id={`info-${section.id}`} key={section.id}><header><div><h2>{section.name}</h2><span>共 {items.length} 项</span></div><button onClick={() => createResource(section.id)} aria-label={`在${section.name}中新建资料`}>＋</button></header><div className="resource-preview">{items.slice(0,expanded ? items.length : 5).map((item) => <ResourceRow key={item.id} item={item} onOpen={() => openEditor(item.id)} onPin={() => setStore((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === item.id ? { ...resource, pinned: !resource.pinned, updatedAt: Date.now() } : resource) }))} />)}{!items.length && <div className="info-empty compact"><span>{query ? "没有匹配结果" : "这里还没有资料"}</span></div>}</div>{items.length > 5 && <button className="view-all" onClick={() => setExpandedSectionId(expanded ? null : section.id)}>{expanded ? "收起" : "查看全部"} <span>{expanded ? "↑" : "→"}</span></button>}</section>;
    })}</div>

    {newSystem && <SystemDialog onClose={() => setNewSystem(false)} onSave={async (input) => {
      const meta = urlMeta(input); if (!meta || !systemSection) { onNotice("请输入有效的 http/https 网址"); return; }
      const duplicate = store.systems.some((system) => system.links.some((link) => link.url === meta.url));
      if (duplicate && !window.confirm("这个网址可能已经保存，仍要继续吗？")) return;
      const remote = await fetchSiteMetadata(meta.url);
      const now = Date.now(), linkId = infoId();
      setStore((current) => ({ ...current, systems: [...current.systems, { id: infoId(), sectionId: systemSection.id, name: remote?.title || meta.name, icon: remote?.icon || meta.icon, links: [{ id: linkId, url: remote?.finalUrl || meta.url, label: "主页" }], defaultLinkId: linkId, order: current.systems.length, createdAt: now, updatedAt: now }] })); setNewSystem(false); onNotice(remote ? "常用链接已添加" : "网站信息读取失败，已使用域名生成名称和图标");
    }} />}
    {manageOpen && <div className="info-dialog-backdrop"><section className="info-dialog" role="dialog" aria-modal="true" aria-label="管理分区"><button className="info-dialog-close" onClick={() => setManageOpen(false)} aria-label="关闭">×</button><h2>管理分区</h2><div className="section-add"><input autoFocus value={draftSection} maxLength={40} onChange={(event) => setDraftSection(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addSection()} placeholder="新分区名称" /><button onClick={addSection}>新增资料分区</button></div>{resourceSections.map((section) => <div className="section-manage-row" key={section.id}><input value={section.name} maxLength={40} onChange={(event) => setStore((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? { ...item, name: event.target.value } : item) }))} /><span>{store.resources.filter((item) => item.sectionId === section.id).length} 项</span></div>)}</section></div>}
  </div>;
}

function ResourceRow({ item, onOpen, onPin }: { item: ResourceItem; onOpen: () => void; onPin: () => void }) {
  const summary = item.blocks.map((block) => block.type === "text" ? block.text : block.type === "link" ? block.domain : block.name).filter(Boolean).join(" · ");
  return <article className="resource-row"><button className={`resource-pin ${item.pinned ? "active" : ""}`} onClick={onPin} aria-label={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button><button className="resource-main" onClick={onOpen}><strong>{item.title}</strong><span>{summary || "开始添加内容"}</span><small>{new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button></article>;
}

function ResourceWorkspace({ item, sections, saveState, fileBytes, onClose, onDelete, onUpdate, onNotice }: { item: ResourceItem; sections: InfoSection[]; saveState: string; fileBytes: number; onClose: () => void; onDelete: () => void; onUpdate: (updater: (item: ResourceItem) => ResourceItem) => void; onNotice: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const [initialHtml] = useState(() => enrichDocumentHtml(item.documentHtml || legacyDocumentHtml(item.blocks), item.blocks));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<Extract<InfoBlock,{type:"file"}> | null>(null);

  function saveDocument() {
    if (!editor.current) return;
    const clean = sanitizeDocumentHtml(editor.current.innerHTML);
    const referenced = new Set(Array.from(editor.current.querySelectorAll<HTMLElement>("[data-file-id]")).map((node) => node.dataset.fileId));
    const nextBlocks = item.blocks.filter((block) => block.type === "file" && referenced.has(block.id));
    onUpdate((current) => ({ ...current, documentHtml: clean, blocks: nextBlocks, title: current.titleAuto !== false ? deriveDocumentTitle(clean, nextBlocks) : current.title, titleAuto: current.titleAuto !== false, updatedAt: Date.now() }));
  }
  function command(name: string, value?: string) { editor.current?.focus(); document.execCommand(name, false, value); saveDocument(); }
  async function addFiles(files: FileList | File[] | null, point?: { x: number; y: number }) {
    if (!files || !editor.current) return;
    const incoming = Array.from(files); const currentFiles = item.blocks.filter((block) => block.type === "file").length;
    const added: Extract<InfoBlock,{type:"file"}>[] = []; let nextBytes = fileBytes;
    for (const file of incoming.slice(0, Math.max(0, 20-currentFiles))) {
      if (file.size > FILE_LIMIT) { onNotice(`${file.name} 超过 20MB`); continue; }
      if (nextBytes + file.size > TOTAL_FILE_LIMIT) { onNotice("本地文件总容量将超过 200MB"); break; }
      try { added.push({ id: infoId(), type: "file", name: file.name.slice(0,200), mime: file.type || "application/octet-stream", size: file.size, dataUrl: await readFile(file) }); nextBytes += file.size; }
      catch { onNotice(`${file.name} 读取失败`); }
    }
    if (incoming.length + currentFiles > 20) onNotice("每条资料最多保存 20 个文件");
    if (!added.length) return;
    if (point) placeCaretFromPoint(point.x, point.y);
    for (const block of added) document.execCommand("insertHTML", false, attachmentHtml(block));
    const clean = sanitizeDocumentHtml(editor.current.innerHTML);
    onUpdate((current) => { const nextBlocks = [...current.blocks.filter((block) => block.type === "file"), ...added]; return { ...current, documentHtml: clean, blocks: nextBlocks, title: current.titleAuto !== false ? deriveDocumentTitle(clean, nextBlocks) : current.title, updatedAt: Date.now() }; });
  }
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addFiles(files); return; }
    const text = event.clipboardData.getData("text/plain"); const selection = window.getSelection(); const url = safeUrl(text);
    event.preventDefault();
    if (url && selection && !selection.isCollapsed) document.execCommand("createLink", false, url);
    else if (url) document.execCommand("insertHTML", false, linkifyPlainText(text));
    else document.execCommand("insertText", false, text.slice(0, Math.max(0, 30000 - htmlText(editor.current?.innerHTML || "").length)));
    saveDocument();
  }
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.key === "Backspace" || event.key === "Delete") && selectedFile) { event.preventDefault(); editor.current?.querySelector(`[data-file-id="${CSS.escape(selectedFile)}"]`)?.remove(); setSelectedFile(null); saveDocument(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") { event.preventDefault(); command("bold"); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") { event.preventDefault(); command("italic"); }
    const cell = (event.target as Element).closest<HTMLTableCellElement>("td,th");
    if (event.key === "Tab" && cell) { event.preventDefault(); const cells = Array.from(cell.closest("table")?.querySelectorAll<HTMLElement>("td,th") || []); const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)]; if (next) placeCaretInside(next); else if (!event.shiftKey) { editTable("row-add"); const updated = Array.from(cell.closest("table")?.querySelectorAll<HTMLElement>("td,th") || []); placeCaretInside(updated.at(-1)); } }
  }
  function insertTable() { command("insertHTML", tableHtml(2,2)); }
  function editTable(action: "row-add"|"row-remove"|"column-add"|"column-remove") {
    const selection = window.getSelection(); const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const cell = anchor?.closest<HTMLTableCellElement>("td,th"); const row = cell?.parentElement; const table = cell?.closest("table"); if (!cell || !row || !table) { onNotice("请先把光标放进表格"); return; }
    if (action === "row-add") { const next = row.cloneNode(true) as HTMLTableRowElement; next.querySelectorAll("td,th").forEach((value) => value.innerHTML = "<br>"); row.after(next); }
    if (action === "row-remove") { if (table.rows.length <= 1) { onNotice("表格至少保留一行"); return; } row.remove(); }
    if (action === "column-add") Array.from(table.rows).forEach((value) => value.insertCell(cell.cellIndex + 1).innerHTML = "<br>");
    if (action === "column-remove") { if ((row as HTMLTableRowElement).cells.length <= 1) { onNotice("表格至少保留一列"); return; } Array.from(table.rows).forEach((value) => value.deleteCell(cell.cellIndex)); }
    saveDocument();
  }
  return <section className="resource-workspace"><header><button className="workspace-back" onClick={onClose}>← 返回总览</button><select value={item.sectionId} onChange={(event) => onUpdate((current) => ({ ...current, sectionId: event.target.value, updatedAt: Date.now() }))}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select><span className={`workspace-save ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="workspace-danger" onClick={onDelete}>删除</button><button className="workspace-close" onClick={onClose} aria-label="关闭">×</button></header><div className="workspace-title"><input value={item.title} maxLength={200} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value.slice(0,200), titleAuto: false, updatedAt: Date.now() }))} aria-label="资料标题" /><span>{item.title.length}/200</span></div><div className="document-toolbar" aria-label="正文格式工具栏" onMouseDown={(event) => { if ((event.target as Element).closest("button")) event.preventDefault(); }}><select defaultValue="p" aria-label="文字样式" onChange={(event) => command("formatBlock", event.target.value)}><option value="p">正文</option><option value="h2">标题</option><option value="h3">副标题</option></select><button onClick={() => command("bold")} aria-label="加粗"><b>B</b></button><button onClick={() => command("italic")} aria-label="斜体"><i>I</i></button><button onClick={() => command("insertUnorderedList")} aria-label="项目符号列表">• 列表</button><button onClick={() => command("insertOrderedList")} aria-label="编号列表">1. 列表</button><button onClick={() => command("insertHTML", '<ul><li data-checked="false">待办事项</li></ul><p><br></p>')} aria-label="待办列表">☐ 待办</button><button onClick={insertTable} aria-label="插入表格">▦ 表格</button><button onClick={() => editTable("row-add")} aria-label="添加表格行">行＋</button><button onClick={() => editTable("row-remove")} aria-label="删除表格行">行－</button><button onClick={() => editTable("column-add")} aria-label="添加表格列">列＋</button><button onClick={() => editTable("column-remove")} aria-label="删除表格列">列－</button><button onClick={() => fileInput.current?.click()} aria-label="添加附件">⌕ 附件</button><span className="toolbar-spacer"/><button onClick={() => command("undo")} aria-label="撤销">↶</button><button onClick={() => command("redo")} aria-label="重做">↷</button><input ref={fileInput} hidden multiple type="file" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} /></div><div className="document-shell" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); void addFiles(event.dataTransfer.files, { x: event.clientX, y: event.clientY }); }}><div ref={editor} className="document-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="资料正文" data-placeholder="输入文字，或将文件拖到这里…" dangerouslySetInnerHTML={{ __html: initialHtml }} onBeforeInput={(event) => { if (event.nativeEvent.inputType.startsWith("insert") && htmlText(editor.current?.innerHTML || "").length >= 30000) { event.preventDefault(); onNotice("正文最多 30000 字"); } }} onInput={saveDocument} onBlur={() => { if (editor.current && linkifyTextNodes(editor.current)) saveDocument(); }} onPaste={handlePaste} onKeyDown={handleKeyDown} onClick={(event) => { const target = event.target as Element; const checklist = target.closest<HTMLElement>("li[data-checked]"); if (checklist && event.nativeEvent.offsetX < 26) { checklist.dataset.checked = checklist.dataset.checked === "true" ? "false" : "true"; saveDocument(); return; } const anchor = target.closest<HTMLAnchorElement>("a"); if (anchor && (event.metaKey || event.ctrlKey)) { event.preventDefault(); window.open(anchor.href,"_blank","noopener,noreferrer"); return; } const figure = target.closest<HTMLElement>("[data-file-id]"); editor.current?.querySelectorAll("figure.selected").forEach((node) => node.classList.remove("selected")); figure?.classList.add("selected"); setSelectedFile(figure?.dataset.fileId || null); if (event.detail === 2 && figure?.dataset.fileId) { const file = item.blocks.find((block): block is Extract<InfoBlock,{type:"file"}> => block.type === "file" && block.id === figure.dataset.fileId); if (file?.mime.startsWith("image/")) setPreviewFile(file); else if (file) downloadFile(file); } }} /></div><footer className="document-status"><span>{htmlText(item.documentHtml || initialHtml).length} / 30000</span><span>自动保存 · 支持拖入或选择附件</span></footer>{previewFile && <div className="document-preview" role="dialog" aria-modal="true" aria-label={`预览${previewFile.name}`} onClick={() => setPreviewFile(null)}><button aria-label="关闭预览">×</button><img src={previewFile.dataUrl} alt={previewFile.name} /></div>}</section>;
}

function attachmentHtml(block: Extract<InfoBlock,{type:"file"}>) {
  const name = block.name.replace(/[&<>"']/g, (value) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[value] || value));
  const visual = block.mime.startsWith("image/") ? `<img src="${block.dataUrl}" alt="${name}">` : `<span class="document-file-icon">${block.mime === "application/pdf" ? "PDF" : "FILE"}</span>`;
  return `<figure data-file-id="${block.id}" contenteditable="false">${visual}<figcaption><strong>${name}</strong><small>${formatBytes(block.size)}</small></figcaption></figure><p><br></p>`;
}
function enrichDocumentHtml(html: string, blocks: InfoBlock[]) {
  return html.replace(/<figure\b[^>]*data-file-id="([^"]+)"[^>]*>[\s\S]*?<\/figure>/gi, (whole, id: string) => {
    const block = blocks.find((value): value is Extract<InfoBlock,{type:"file"}> => value.type === "file" && value.id === id);
    return block ? attachmentHtml(block).replace(/<p><br><\/p>$/, "") : "";
  });
}
function linkifyTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; let node: Node | null;
  while ((node = walker.nextNode())) if (node.parentElement && !node.parentElement.closest("a,figure")) nodes.push(node as Text);
  let changed = false;
  nodes.forEach((text) => { if (!/(?:https?:\/\/|www\.)[^\s<>]+/i.test(text.data)) return; const holder = document.createElement("span"); holder.innerHTML = linkifyPlainText(text.data); text.replaceWith(...Array.from(holder.childNodes)); changed = true; });
  return changed;
}
function placeCaretInside(node?: HTMLElement) { if (!node) return; const range = document.createRange(); range.selectNodeContents(node); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
function downloadFile(block: Extract<InfoBlock,{type:"file"}>) { const anchor = document.createElement("a"); anchor.href = block.dataUrl; anchor.download = block.name; anchor.click(); }
function placeCaretFromPoint(x: number, y: number) {
  const documentWithCaret = document as Document & { caretRangeFromPoint?: (x:number,y:number)=>Range; caretPositionFromPoint?: (x:number,y:number)=>CaretPosition | null };
  const range = documentWithCaret.caretRangeFromPoint?.(x,y);
  const position = documentWithCaret.caretPositionFromPoint?.(x,y);
  const selection = window.getSelection(); if (!selection) return;
  selection.removeAllRanges();
  if (range) selection.addRange(range);
  else if (position) { const next = document.createRange(); next.setStart(position.offsetNode, position.offset); next.collapse(true); selection.addRange(next); }
}
function SystemDialog({ onSave, onClose }: { onSave: (value:string)=>Promise<void>; onClose:()=>void }) { const [value,setValue]=useState(""); const [loading,setLoading]=useState(false); async function submit(){ if(!safeUrl(value)||loading)return; setLoading(true); try{await onSave(value);}finally{setLoading(false);} } return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="新增常用链接"><button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button><h2>新增常用链接</h2><p>只需粘贴网址，名称和 Logo 会自动识别。</p><input autoFocus value={value} onChange={(event)=>setValue(event.target.value)} onKeyDown={(event)=>event.key==="Enter"&&void submit()} placeholder="https://example.com" /><footer><button onClick={onClose}>取消</button><button className="primary" disabled={!safeUrl(value)||loading} onClick={()=>void submit()}>{loading?"识别中…":"添加"}</button></footer></section></div>; }
async function fetchSiteMetadata(url:string){ try{const response=await fetch("/api/site-metadata",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})}); if(!response.ok)return null; return await response.json() as {title:string;icon:string;finalUrl:string};}catch{return null;} }
async function refreshSystemMetadata(id:string,url:string,setStore:React.Dispatch<React.SetStateAction<InfoStore>>,onNotice:(message:string)=>void){ const meta=await fetchSiteMetadata(url); if(!meta){onNotice("网站名称和 Logo 识别失败");return;} setStore((current)=>({...current,systems:current.systems.map((item)=>item.id===id?{...item,name:meta.title,icon:meta.icon,updatedAt:Date.now()}:item)})); onNotice("名称和 Logo 已更新"); }
function readFile(file: File) { return new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }); }
function formatBytes(size:number) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`; }
