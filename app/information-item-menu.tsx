"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type Target = { id: string; name: string };
type Props = { top: number; left: number; targets: Target[]; deleteLabel: string; onMove: (id: string) => void; onEdit?: () => void; onDelete: () => void };

export default function InformationItemMenu({ top, left, targets, deleteLabel, onMove, onEdit, onDelete }: Props) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePosition, setMovePosition] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function openMove(button: HTMLButtonElement) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = button.getBoundingClientRect();
    setMovePosition({ top: rect.top, left: Math.min(window.innerWidth - 120, rect.right + 4) });
    setMoveOpen(true);
  }
  function scheduleClose() { closeTimer.current = setTimeout(() => setMoveOpen(false), 120); }
  return <>
    <div className="information-item-menu" style={{ top, left }} role="menu" onMouseLeave={scheduleClose}>
      <button className="move-trigger" onMouseEnter={(event) => openMove(event.currentTarget)} onFocus={(event) => openMove(event.currentTarget)} onClick={(event) => openMove(event.currentTarget)} aria-haspopup="menu" aria-expanded={moveOpen}>移动到 <span>›</span></button>
      {onEdit && <button onMouseEnter={() => setMoveOpen(false)} onClick={onEdit}>编辑</button>}
      <button className="danger" onMouseEnter={() => setMoveOpen(false)} onClick={onDelete}>{deleteLabel}</button>
    </div>
    {moveOpen && createPortal(<div className="information-move-menu" role="menu" style={movePosition} onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }} onMouseLeave={scheduleClose}>{targets.length ? targets.map((target) => <button key={target.id || "ungrouped"} onClick={() => onMove(target.id)}>{target.name}</button>) : <span>没有其他分类</span>}</div>, document.body)}
  </>;
}
