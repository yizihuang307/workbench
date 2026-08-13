"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type WidgetTask = {
  id: string;
  title: string;
  is_completed: boolean;
  is_p0: boolean;
  is_overdue: boolean;
  version: number;
};

type ApiResponse<T> = {
  data?: T;
  error?: { message?: string };
};

type WidgetSession = {
  access_token: string;
  refresh_token: string;
};

function pendingSession(): WidgetSession | null {
  const injected = (window as Window & { __workbenchWidgetSession?: WidgetSession }).__workbenchWidgetSession;
  if (injected?.access_token && injected.refresh_token) return injected;
  return null;
}

export default function TodayWidgetPage() {
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState("");
  const [opacity, setOpacity] = useState(0.5);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const updatingRef = useRef<string | null>(null);
  updatingRef.current = updating;

  useEffect(() => {
    document.documentElement.classList.add("widget-shell");
    document.body.classList.add("widget-shell");
    const timer = window.setTimeout(() => {
      setDateLabel(new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date()));
    }, 0);
    const saved = Number(window.localStorage.getItem("workbench-widget-opacity-v2"));
    if (Number.isFinite(saved) && saved >= 0.35 && saved <= 1) setOpacity(saved);
    return () => {
      window.clearTimeout(timer);
      document.documentElement.classList.remove("widget-shell");
      document.body.classList.remove("widget-shell");
    };
  }, []);

  useEffect(() => {
    if (!opacityOpen) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".today-widget-opacity")) setOpacityOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [opacityOpen]);

  const applySession = useCallback(async () => {
    const session = pendingSession();
    if (!session) return;
    await createClient().auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }, []);

  const loadTasks = useCallback(async (silent = false) => {
    try {
      await applySession();
      const response = await fetch("/api/tasks?area=today", { cache: "no-store" });
      const body = await response.json() as ApiResponse<WidgetTask[]>;
      if (!response.ok || !body.data) throw new Error(body.error?.message || "加载今日安排失败");
      setTasks(body.data);
      setError("");
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "加载今日安排失败");
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadTasks(), 0);
    const refresh = () => {
      if (updatingRef.current) return;
      if (document.visibilityState === "visible") void loadTasks(true);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("workbench-widget-session", refresh);
    window.addEventListener("workbench-widget-refresh", refresh);
    const timer = window.setInterval(refresh, 8_000);
    return () => {
      window.clearTimeout(initialLoad);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("workbench-widget-session", refresh);
      window.removeEventListener("workbench-widget-refresh", refresh);
      window.clearInterval(timer);
    };
  }, [loadTasks]);

  async function toggleTask(task: WidgetTask) {
    const isCompleted = !task.is_completed;
    setUpdating(task.id);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, is_completed: isCompleted } : item));
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isCompleted, version: task.version }),
      });
      const body = await response.json() as ApiResponse<WidgetTask>;
      if (!response.ok || !body.data) throw new Error(body.error?.message || "更新失败");
      setTasks((current) => current.map((item) => item.id === task.id ? body.data! : item));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新失败，已重新加载");
      await loadTasks();
    } finally {
      setUpdating(null);
    }
  }

  function changeOpacity(value: number) {
    const next = Math.min(1, Math.max(0.35, value));
    setOpacity(next);
    window.localStorage.setItem("workbench-widget-opacity-v2", String(next));
  }

  function startWidgetDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, a, input, .today-widget-opacity-panel")) return;
    window.webkit?.messageHandlers?.widget?.postMessage("drag");
  }

  function quitWidget() {
    const handler = window.webkit?.messageHandlers?.widget;
    if (handler) {
      handler.postMessage("quit");
      return;
    }
    void fetch("http://127.0.0.1:17891/quit", { method: "POST" });
  }

  const completed = useMemo(() => tasks.filter((task) => task.is_completed).length, [tasks]);

  return <main className="today-widget" style={{ "--widget-bg-alpha": opacity } as React.CSSProperties}>
    <header className="today-widget-header" onPointerDown={startWidgetDrag}>
      <div>
        <p suppressHydrationWarning>{dateLabel}</p>
        <h1>今日安排</h1>
      </div>
      <div className="today-widget-actions">
        <div className="today-widget-opacity">
          <button onClick={() => setOpacityOpen((open) => !open)} aria-label="调整透明度" title="透明度" aria-expanded={opacityOpen} aria-controls="widget-opacity-panel">◐</button>
          {opacityOpen && <div className="today-widget-opacity-panel" id="widget-opacity-panel" onPointerDown={(event) => event.stopPropagation()}>
            <label>
              透明度
              <input type="range" min="0.35" max="1" step="0.05" value={opacity} onChange={(event) => changeOpacity(Number(event.target.value))} />
            </label>
          </div>}
        </div>
        <a href="/" target="_blank" rel="noreferrer" aria-label="打开完整工作台" title="打开完整工作台">↗</a>
        <button className="today-widget-quit" onClick={quitWidget} aria-label="退出便签" title="退出便签">×</button>
      </div>
    </header>

    <section className="today-widget-list" aria-label="今日任务">
      {loading && <div className="today-widget-state">正在加载…</div>}
      {!loading && !tasks.length && <div className="today-widget-state"><b>✓</b><span>今天还没有安排</span></div>}
      {tasks.map((task) => <label className={`today-widget-task${task.is_completed ? " done" : ""}`} key={task.id}>
        <input type="checkbox" checked={task.is_completed} disabled={updating === task.id} onChange={() => void toggleTask(task)} />
        <span>{task.title}</span>
        {task.is_p0 && <em>P0</em>}
        {task.is_overdue && !task.is_completed && <small>逾期</small>}
      </label>)}
    </section>

    <footer className="today-widget-footer">
      <span>{completed} / {tasks.length} 已完成</span>
      <i><b style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></i>
    </footer>
    {error && <div className="today-widget-error" role="status">{error}</div>}
  </main>;
}

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        widget?: { postMessage: (value: string) => void };
      };
    };
  }
}
