"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveTitle, FILE_LIMIT, infoId, safeUrl, totalFileBytes, TOTAL_FILE_LIMIT, urlMeta, visibleResources, type InfoBlock, type InfoSection, type InfoStore, type ResourceItem } from "./information";

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
      const meaningful = draft?.blocks.some((block) => block.type === "text" ? Boolean(block.text.trim()) : true);
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
  function blocks(next: InfoBlock[]) { onUpdate((current) => ({ ...current, blocks: next, title: current.titleAuto !== false ? deriveTitle(next) : current.title, titleAuto: current.titleAuto !== false, updatedAt: Date.now() })); }
  function addLink() { const raw = window.prompt("粘贴网页链接"); if (!raw) return; const meta = urlMeta(raw); if (!meta) { onNotice("请输入有效的 http/https 网址"); return; } if (item.blocks.filter((block) => block.type === "link").length >= 20) { onNotice("每条资料最多保存 20 个链接"); return; } blocks([...item.blocks, { id: infoId(), type: "link", url: meta.url, title: meta.name, domain: meta.domain }]); }
  async function addFiles(files: FileList | null) { if (!files) return; const currentFiles = item.blocks.filter((block) => block.type === "file").length; const added: InfoBlock[] = []; let nextBytes = fileBytes; for (const file of Array.from(files).slice(0, Math.max(0, 20-currentFiles))) { if (file.size > FILE_LIMIT) { onNotice(`${file.name} 超过 20MB`); continue; } if (nextBytes + file.size > TOTAL_FILE_LIMIT) { onNotice("本地文件总容量将超过 200MB"); break; } const dataUrl = await readFile(file); added.push({ id: infoId(), type: "file", name: file.name, mime: file.type || "application/octet-stream", size: file.size, dataUrl }); nextBytes += file.size; } if (added.length) blocks([...item.blocks, ...added]); if (files.length + currentFiles > 20) onNotice("每条资料最多保存 20 个文件"); }
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= item.blocks.length) return; const next = [...item.blocks]; [next[index], next[target]] = [next[target], next[index]]; blocks(next); }
  return <section className="resource-workspace"><header><button className="workspace-back" onClick={onClose}>← 返回总览</button><select value={item.sectionId} onChange={(event) => onUpdate((current) => ({ ...current, sectionId: event.target.value, updatedAt: Date.now() }))}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select><span className={`workspace-save ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="workspace-danger" onClick={onDelete}>删除</button><button className="workspace-close" onClick={onClose} aria-label="关闭">×</button></header><div className="workspace-title"><input value={item.title} maxLength={200} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value.slice(0,200), titleAuto: false, updatedAt: Date.now() }))} aria-label="资料标题" /><span>{item.title.length}/200</span></div><div className="workspace-actions"><button onClick={() => blocks([...item.blocks, { id: infoId(), type: "text", text: "" }])}>＋ 文字</button><button onClick={addLink}>＋ 链接</button><button onClick={() => fileInput.current?.click()}>＋ 文件</button><input ref={fileInput} hidden multiple type="file" onChange={(event) => void addFiles(event.target.files)} /></div><div className="block-editor">{item.blocks.map((block, index) => <div className="info-block" key={block.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/block-index", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData("text/block-index")); if (!Number.isInteger(from) || from === index) return; const next = [...item.blocks], [picked] = next.splice(from,1); next.splice(index,0,picked); blocks(next); }}><div className="block-grip" aria-hidden>⠿</div>{block.type === "text" ? <textarea value={block.text} maxLength={30000} onChange={(event) => blocks(item.blocks.map((value) => value.id === block.id ? { ...block, text: event.target.value } : value))} placeholder="输入文字…" /> : block.type === "link" ? <div className="link-block"><b>{block.title}</b><span>{block.domain}</span><button onClick={() => window.open(block.url,"_blank","noopener,noreferrer")}>打开 ↗</button></div> : <FilePreview block={block} />}<div className="block-actions"><button onClick={() => move(index,-1)} disabled={index===0} aria-label="上移">↑</button><button onClick={() => move(index,1)} disabled={index===item.blocks.length-1} aria-label="下移">↓</button><button onClick={() => blocks(item.blocks.filter((value) => value.id !== block.id))} aria-label="删除内容块">×</button></div></div>)}</div></section>;
}

function FilePreview({ block }: { block: Extract<InfoBlock,{type:"file"}> }) { const preview = block.mime.startsWith("image/") ? <img src={block.dataUrl} alt={block.name} /> : block.mime === "application/pdf" ? <iframe src={block.dataUrl} title={block.name} /> : block.mime.startsWith("text/") ? <span>文本文件</span> : <span>{block.mime || "文件"}</span>; return <div className="file-block"><div>{preview}</div><b>{block.name}</b><small>{formatBytes(block.size)}</small><a href={block.dataUrl} download={block.name}>下载</a></div>; }
function SystemDialog({ onSave, onClose }: { onSave: (value:string)=>Promise<void>; onClose:()=>void }) { const [value,setValue]=useState(""); const [loading,setLoading]=useState(false); async function submit(){ if(!safeUrl(value)||loading)return; setLoading(true); try{await onSave(value);}finally{setLoading(false);} } return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="新增常用链接"><button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button><h2>新增常用链接</h2><p>只需粘贴网址，名称和 Logo 会自动识别。</p><input autoFocus value={value} onChange={(event)=>setValue(event.target.value)} onKeyDown={(event)=>event.key==="Enter"&&void submit()} placeholder="https://example.com" /><footer><button onClick={onClose}>取消</button><button className="primary" disabled={!safeUrl(value)||loading} onClick={()=>void submit()}>{loading?"识别中…":"添加"}</button></footer></section></div>; }
async function fetchSiteMetadata(url:string){ try{const response=await fetch("/api/site-metadata",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})}); if(!response.ok)return null; return await response.json() as {title:string;icon:string;finalUrl:string};}catch{return null;} }
async function refreshSystemMetadata(id:string,url:string,setStore:React.Dispatch<React.SetStateAction<InfoStore>>,onNotice:(message:string)=>void){ const meta=await fetchSiteMetadata(url); if(!meta){onNotice("网站名称和 Logo 识别失败");return;} setStore((current)=>({...current,systems:current.systems.map((item)=>item.id===id?{...item,name:meta.title,icon:meta.icon,updatedAt:Date.now()}:item)})); onNotice("名称和 Logo 已更新"); }
function readFile(file: File) { return new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }); }
function formatBytes(size:number) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`; }
