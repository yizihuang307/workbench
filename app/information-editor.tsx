"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Bold, Italic, List, ListOrdered, ListTodo, Paperclip, Redo2, Table2, Undo2 } from "lucide-react";
import { deriveDocumentTitle, DOCUMENT_LIMIT, FILE_LIMIT, htmlText, infoId, legacyDocumentHtml, linkifyPlainText, safeUrl, sanitizeDocumentHtml, TOTAL_FILE_LIMIT, type InfoBlock, type ResourceItem } from "./information";

type FileBlock = Extract<InfoBlock, { type: "file" }>;
type Props = { item: ResourceItem; fileBytes: number; onUpdate: (updater: (item: ResourceItem) => ResourceItem) => void; onNotice: (message: string) => void };

const ResourceImage = Node.create({
  name: "resourceImage", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes() { return { fileId: { default: null, parseHTML: (element) => element.getAttribute("data-file-id"), renderHTML: (attrs) => ({ "data-file-id": attrs.fileId }) }, src: { default: null }, alt: { default: "" }, width: { default: 520, parseHTML: (element) => Number(element.getAttribute("data-width")) || 520, renderHTML: (attrs) => ({ "data-width": attrs.width }) } }; },
  parseHTML() { return [{ tag: "img[data-file-id]" }]; },
  renderHTML({ HTMLAttributes }) { return ["img", mergeAttributes(HTMLAttributes)]; },
  addNodeView() { return ReactNodeViewRenderer(ResourceImageView); },
});

const ResourceAttachment = Node.create({
  name: "resourceAttachment", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes() { return {
    fileId: { default: null, parseHTML: (element) => element.getAttribute("data-file-id"), renderHTML: (attrs) => ({ "data-file-id": attrs.fileId }) },
    name: { default: "附件", parseHTML: (element) => element.getAttribute("data-name") || "附件", renderHTML: (attrs) => ({ "data-name": attrs.name }) },
    mime: { default: "application/octet-stream", parseHTML: (element) => element.getAttribute("data-mime") || "application/octet-stream", renderHTML: (attrs) => ({ "data-mime": attrs.mime }) },
    size: { default: 0, parseHTML: (element) => Number(element.getAttribute("data-size")) || 0, renderHTML: (attrs) => ({ "data-size": attrs.size }) },
  }; },
  parseHTML() { return [{ tag: "div[data-file-id][data-attachment]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-attachment": "true" })]; },
  addNodeView() { return ReactNodeViewRenderer(ResourceAttachmentView); },
});

function ResourceImageView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const width = Math.max(160, Math.min(900, Number(node.attrs.width) || 520));
  return <NodeViewWrapper className={`tiptap-image ${selected ? "selected" : ""}`} style={{ width }} data-drag-handle>
    <img src={node.attrs.src} alt={node.attrs.alt || "图片"} draggable={false} title="点击放大" onClick={() => window.dispatchEvent(new CustomEvent("resource-image-preview", { detail: { src: node.attrs.src, name: node.attrs.alt } }))} />
    <button className="image-resize-handle" aria-label="调整图片大小" title="拖动调整大小" onPointerDown={(event) => {
      event.preventDefault(); event.stopPropagation(); const startX = event.clientX, startWidth = width;
      const move = (moveEvent: PointerEvent) => updateAttributes({ width: Math.max(160, Math.min(900, startWidth + moveEvent.clientX - startX)) });
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    }} />
  </NodeViewWrapper>;
}

function ResourceAttachmentView({ node, selected }: ReactNodeViewProps) {
  return <NodeViewWrapper className={`tiptap-attachment ${selected ? "selected" : ""}`} data-drag-handle onDoubleClick={() => window.dispatchEvent(new CustomEvent("resource-file-download", { detail: { fileId: node.attrs.fileId } }))}>
    <span>{node.attrs.mime === "application/pdf" ? "PDF" : "FILE"}</span><div><strong>{node.attrs.name}</strong><small>{formatBytes(Number(node.attrs.size) || 0)} · 双击下载</small></div>
  </NodeViewWrapper>;
}

export default function InformationEditor({ item, fileBytes, onUpdate, onNotice }: Props) {
  const latest = useRef({ item, fileBytes, onUpdate, onNotice });
  const insertFilesRef = useRef<(files: File[], position?: number) => void>(() => undefined);
  const [initialHtml] = useState(() => enrichEditorHtml(item.documentHtml || legacyDocumentHtml(item.blocks), item.blocks));
  const [tableActive, setTableActive] = useState(false);
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const fileInputId = `resource-files-${item.id}`;

  useEffect(() => { latest.current = { item, fileBytes, onUpdate, onNotice }; }, [item, fileBytes, onUpdate, onNotice]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { autolink: true, linkOnPaste: true, openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }), TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: true } }), ResourceImage, ResourceAttachment],
    content: initialHtml,
    editorProps: {
      attributes: { class: "tiptap-document", "aria-label": "资料正文" },
      handleDrop(view, event) { const files = Array.from(event.dataTransfer?.files || []); if (!files.length) return false; event.preventDefault(); insertFilesRef.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos); return true; },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); insertFilesRef.current(files); return true; }
        const text = event.clipboardData?.getData("text/plain") || ""; const url = safeUrl(text);
        if (url && !view.state.selection.empty) { event.preventDefault(); editor?.chain().focus().setLink({ href: url }).run(); return true; }
        if (url) { event.preventDefault(); editor?.chain().focus().insertContent(linkifyPlainText(text)).run(); return true; }
        return false;
      },
    },
    onUpdate({ editor: current }) {
      if (htmlText(current.getHTML()).length > DOCUMENT_LIMIT) { current.commands.undo(); latest.current.onNotice("正文最多 30000 字"); return; }
      save(current.getHTML());
    },
    onSelectionUpdate({ editor: current }) { setTableActive(current.isActive("table")); },
  });

  function save(rawHtml: string, added: FileBlock[] = []) {
    const clean = sanitizeDocumentHtml(rawHtml);
    const referenced = new Set(Array.from(clean.matchAll(/data-file-id="([^"]+)"/g), (match) => match[1]));
    latest.current.onUpdate((current) => {
      const candidates = [...current.blocks.filter((block): block is FileBlock => block.type === "file"), ...added];
      const blocks = Array.from(new Map(candidates.filter((block) => referenced.has(block.id)).map((block) => [block.id, block])).values());
      return { ...current, documentHtml: clean, blocks, title: current.titleAuto !== false ? deriveDocumentTitle(clean, blocks) : current.title, updatedAt: Date.now() };
    });
  }

  async function insertFiles(files: File[], position?: number) {
    if (!editor) return; const currentFiles = latest.current.item.blocks.filter((block) => block.type === "file").length; let nextBytes = latest.current.fileBytes; const added: FileBlock[] = [];
    for (const file of files.slice(0, Math.max(0, 20 - currentFiles))) {
      if (file.size > FILE_LIMIT) { latest.current.onNotice(`${file.name} 超过 20MB`); continue; }
      if (nextBytes + file.size > TOTAL_FILE_LIMIT) { latest.current.onNotice("本地文件总容量将超过 200MB"); break; }
      try { added.push({ id: infoId(), type: "file", name: file.name.slice(0, 200), mime: file.type || "application/octet-stream", size: file.size, dataUrl: await readFile(file) }); nextBytes += file.size; } catch { latest.current.onNotice(`${file.name} 读取失败`); }
    }
    if (files.length + currentFiles > 20) latest.current.onNotice("每条资料最多保存 20 个文件"); if (!added.length) return;
    const nodes = added.map((block) => block.mime.startsWith("image/") ? { type: "resourceImage", attrs: { fileId: block.id, src: block.dataUrl, alt: block.name, width: 520 } } : { type: "resourceAttachment", attrs: { fileId: block.id, name: block.name, mime: block.mime, size: block.size } });
    const chain = editor.chain().focus(); if (typeof position === "number") chain.insertContentAt(position, nodes).run(); else chain.insertContent(nodes).run(); save(editor.getHTML(), added);
  }
  useEffect(() => { insertFilesRef.current = (files, position) => void insertFiles(files, position); });

  useEffect(() => {
    const image = (event: Event) => setPreview((event as CustomEvent<{ src: string; name: string }>).detail);
    const download = (event: Event) => { const id = (event as CustomEvent<{ fileId: string }>).detail.fileId; const block = latest.current.item.blocks.find((value): value is FileBlock => value.type === "file" && value.id === id); if (block) downloadFile(block); };
    window.addEventListener("resource-image-preview", image); window.addEventListener("resource-file-download", download); return () => { window.removeEventListener("resource-image-preview", image); window.removeEventListener("resource-file-download", download); };
  }, []);

  if (!editor) return <div className="editor-loading">编辑器加载中…</div>;
  const action = (name: string, run: () => void, active = false, content: ReactNode = name) => <button type="button" className={active ? "active" : ""} aria-label={name} title={name} onMouseDown={(event) => event.preventDefault()} onClick={run}>{content}</button>;
  return <div className="tiptap-shell">
    <div className="tiptap-toolbar" aria-label="正文格式工具栏">
      <select aria-label="文字样式" value={editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"} onChange={(event) => event.target.value === "h2" ? editor.chain().focus().toggleHeading({ level: 2 }).run() : event.target.value === "h3" ? editor.chain().focus().toggleHeading({ level: 3 }).run() : editor.chain().focus().setParagraph().run()}><option value="p">正文</option><option value="h2">标题</option><option value="h3">副标题</option></select>
      <div className="toolbar-group">{action("加粗", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), <Bold />)}{action("斜体", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), <Italic />)}</div>
      <div className="toolbar-group">{action("项目符号", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"), <List />)}{action("编号", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"), <ListOrdered />)}{action("待办", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"), <ListTodo />)}</div>
      <div className="toolbar-group">{action("表格", () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run(), false, <Table2 />)}{action("附件", () => document.getElementById(fileInputId)?.click(), false, <Paperclip />)}</div><span />
      <div className="toolbar-group history">{action("撤销", () => editor.chain().focus().undo().run(), false, <Undo2 />)}{action("重做", () => editor.chain().focus().redo().run(), false, <Redo2 />)}</div>
      <input id={fileInputId} hidden multiple type="file" onChange={(event) => { void insertFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} />
    </div>
    <div className="tiptap-page" onClick={(event) => { if (event.target === event.currentTarget) editor.chain().focus("end").run(); }}><EditorContent editor={editor} />{tableActive && <div className="table-context" role="toolbar" aria-label="表格操作">{action("添加行", () => editor.chain().focus().addRowAfter().run(), false, "＋行")}{action("删除行", () => editor.chain().focus().deleteRow().run(), false, "－行")}{action("添加列", () => editor.chain().focus().addColumnAfter().run(), false, "＋列")}{action("删除列", () => editor.chain().focus().deleteColumn().run(), false, "－列")}{action("删除表格", () => editor.chain().focus().deleteTable().run(), false, "删除")}</div>}</div>
    <footer className="tiptap-status"><span>{htmlText(editor.getHTML()).length} / 30000</span><span>自动保存 · 支持拖入或选择附件</span></footer>
    {preview && <div className="document-preview" role="dialog" aria-modal="true" aria-label={`预览${preview.name}`} onClick={() => setPreview(null)}><button aria-label="关闭预览">×</button><img src={preview.src} alt={preview.name} /></div>}
  </div>;
}

function enrichEditorHtml(html: string, blocks: InfoBlock[]) {
  return html.replace(/<(figure|div|img)\b[^>]*data-file-id="([^"]+)"[^>]*>[\s\S]*?<\/\1>|<img\b[^>]*data-file-id="([^"]+)"[^>]*>/gi, (whole, _tag: string, wrappedId: string, imageId: string) => {
    const id = wrappedId || imageId; const block = blocks.find((value): value is FileBlock => value.type === "file" && value.id === id); if (!block) return "";
    const name = escapeHtml(block.name); return block.mime.startsWith("image/") ? `<img data-file-id="${block.id}" data-width="520" src="${block.dataUrl}" alt="${name}">` : `<div data-file-id="${block.id}" data-attachment="true" data-name="${name}" data-mime="${escapeHtml(block.mime)}" data-size="${block.size}"></div>`;
  });
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character)); }
function readFile(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function downloadFile(block: FileBlock) { const anchor = document.createElement("a"); anchor.href = block.dataUrl; anchor.download = block.name; anchor.click(); }
function formatBytes(size: number) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`; }
