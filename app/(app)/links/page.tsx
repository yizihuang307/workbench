"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LinkGroup = {
  id: string;
  name: string;
  sort_key: string;
  is_system: boolean;
};

type LinkItem = {
  id: string;
  group_id: string;
  url: string;
  name: string;
  favicon_url: string | null;
  sort_key: string;
  last_opened_at: string | null;
  version: number;
};

export default function LinksPage() {
  const [groups, setGroups] = useState<LinkGroup[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/link-groups");
      if (res.ok) {
        const data = (await res.json()).data as LinkGroup[];
        setGroups(data ?? []);
        if (data?.length && !newGroupId) setNewGroupId(data[0].id);
      }
    } catch { /* ignore */ }
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/links");
      if (res.ok) setLinks((await res.json()).data ?? []);
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  useEffect(() => { loadGroups(); loadLinks(); }, [loadGroups, loadLinks]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  async function addLink() {
    if (!newUrl.trim() || !newGroupId) return;
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), groupId: newGroupId }),
      });
      if (!res.ok) throw new Error("添加失败");
      const json = await res.json();
      setLinks((prev) => [...prev, json.data as LinkItem]);
      setNewUrl("");
      setShowAddDialog(false);
    } catch {
      setNotice("添加失败，请检查网址格式");
    }
  }

  async function deleteLink(id: string) {
    const link = links.find((l) => l.id === id);
    if (!link) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        (window as unknown as Record<string, string>).__lastDeletionToken = json.deletionToken;
        setTimeout(() => {}, 5000);
      }
    } catch { /* ignore */ }
  }

  const linksByGroup = useMemo(() => {
    const result: Record<string, LinkItem[]> = {};
    for (const g of groups) result[g.id] = [];
    for (const l of links) {
      (result[l.group_id] ||= []).push(l);
    }
    return result;
  }, [groups, links]);

  return (
    <div className="info-page">
      <div className="info-toolbar">
        <div className="info-index">
          {groups.map((g) => (
            <button key={g.id}>{g.name}</button>
          ))}
        </div>
        <button className="info-manage" onClick={() => setShowAddDialog(true)}>
          添加链接
        </button>
      </div>

      {showAddDialog && (
        <div className="info-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowAddDialog(false)}>
          <div className="info-dialog small">
            <button className="info-dialog-close" onClick={() => setShowAddDialog(false)}>×</button>
            <h2>添加链接</h2>
            <div className="dialog-fields">
              <div className="dialog-field">
                <span>网址</span>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
                />
              </div>
              <div className="dialog-field">
                <span>分组</span>
                <select
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  style={{ minHeight: 40, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <footer>
              <button onClick={() => setShowAddDialog(false)}>取消</button>
              <button className="primary" onClick={addLink} disabled={!newUrl.trim()}>
                添加
              </button>
            </footer>
          </div>
        </div>
      )}

      {!ready ? (
        <div className="info-empty"><b>⋯</b><span>加载中…</span></div>
      ) : (
        <div className="resource-sections">
          {groups.map((g) => (
            <div key={g.id} className="resource-section">
              <header>
                <div><h2>{g.name}</h2><span>{(linksByGroup[g.id] || []).length} 个链接</span></div>
              </header>
              <div className="resource-preview">
                {(linksByGroup[g.id] || []).length === 0 ? (
                  <div className="info-empty compact">
                    <b>+</b>
                    <span>暂无链接</span>
                  </div>
                ) : (
                  (linksByGroup[g.id] || []).map((link) => (
                    <div key={link.id} className="resource-row">
                      <a
                        className="resource-main"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async () => {
                          try { await fetch(`/api/links/${link.id}/open`, { method: "POST" }); } catch {}
                        }}
                      >
                        <strong>{link.name || link.url}</strong>
                        <span>{link.url}</span>
                      </a>
                      <button
                        className="system-remove"
                        onClick={() => deleteLink(link.id)}
                        aria-label="删除"
                      >
                        ×
                      </button>
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

