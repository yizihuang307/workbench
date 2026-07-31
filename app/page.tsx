"use client";

import { useMemo, useState } from "react";

type Task = { id: number; label: string; note?: string; done?: boolean; legacy?: boolean };
type Group = "today" | "week" | "later";

const directions = [
  { id: "minimal", no: "01", name: "温和极简", note: "排版与留白" },
  { id: "journal", no: "02", name: "Bento 手账", note: "拼贴与个人感" },
  { id: "precision", no: "03", name: "精密工具", note: "密度与效率" },
  { id: "blend", no: "04", name: "推荐组合", note: "轻盈且易落地" },
] as const;

const initialTasks: Record<Group, Task[]> = {
  today: [
    { id: 1, label: "整理周会要点", note: "10:00", done: true },
    { id: 2, label: "确认新版工作台的信息架构", legacy: true },
    { id: 3, label: "回复设计评审意见", note: "今天 17:00" },
    { id: 4, label: "准备明天的访谈提纲" },
  ],
  week: [
    { id: 5, label: "完成首页低保真原型", note: "周四" },
    { id: 6, label: "梳理用户反馈清单", note: "周五" },
  ],
  later: [
    { id: 7, label: "整理个人常用工具入口" },
    { id: 8, label: "补充会议纪要模板" },
  ],
};

export default function Home() {
  const [direction, setDirection] = useState<(typeof directions)[number]["id"]>("minimal");
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [mood, setMood] = useState(3);

  const visibleToday = useMemo(
    () => (hideDone ? tasks.today.filter((task) => !task.done) : tasks.today),
    [hideDone, tasks.today],
  );

  function toggle(group: Group, id: number) {
    setTasks((current) => ({
      ...current,
      [group]: current[group].map((task) => task.id === id ? { ...task, done: !task.done } : task),
    }));
  }

  function addTask() {
    const label = draft.trim();
    if (!label) return;
    setTasks((current) => ({ ...current, today: [...current.today, { id: Date.now(), label }] }));
    setDraft("");
  }

  const shared = { tasks, visibleToday, draft, setDraft, addTask, toggle, hideDone, setHideDone, mood, setMood };

  return (
    <main className={`site direction-${direction}`}>
      <DirectionRail direction={direction} setDirection={setDirection} />
      {direction === "minimal" && <MinimalView {...shared} />}
      {direction === "journal" && <JournalView {...shared} />}
      {direction === "precision" && <PrecisionView {...shared} />}
      {direction === "blend" && <BlendView {...shared} />}
      <MobileDirectionBar direction={direction} setDirection={setDirection} />
    </main>
  );
}

type SharedProps = {
  tasks: Record<Group, Task[]>;
  visibleToday: Task[];
  draft: string;
  setDraft: (value: string) => void;
  addTask: () => void;
  toggle: (group: Group, id: number) => void;
  hideDone: boolean;
  setHideDone: (value: boolean) => void;
  mood: number;
  setMood: (value: number) => void;
};

function DirectionRail({ direction, setDirection }: {
  direction: string;
  setDirection: (value: (typeof directions)[number]["id"]) => void;
}) {
  return (
    <aside className="direction-rail">
      <p className="rail-kicker">视觉方向</p>
      {directions.map((item) => (
        <button key={item.id} className={direction === item.id ? "active" : ""} onClick={() => setDirection(item.id)}>
          <span>{item.no}</span>
          <strong>{item.name}</strong>
          <small>{item.note}</small>
        </button>
      ))}
      <p className="rail-tip">内容相同<br />只比较设计</p>
    </aside>
  );
}

function MobileDirectionBar({ direction, setDirection }: {
  direction: string;
  setDirection: (value: (typeof directions)[number]["id"]) => void;
}) {
  return <div className="mobile-directions">{directions.map((item) => (
    <button key={item.id} className={direction === item.id ? "active" : ""} onClick={() => setDirection(item.id)}>
      <b>{item.no}</b>{item.name}
    </button>
  ))}</div>;
}

function Mood({ value, onChange, compact = false }: { value: number; onChange: (v: number) => void; compact?: boolean }) {
  return <div className={`moods ${compact ? "compact" : ""}`}>
    {["☹", "◔", "•‿•", "◡̈", "✦"].map((face, index) => (
      <button key={face} className={value === index ? "active" : ""} onClick={() => onChange(index)} aria-label={`心情 ${index + 1}`}>{face}</button>
    ))}
  </div>;
}

function CheckTask({ task, onToggle, dense = false }: { task: Task; onToggle: () => void; dense?: boolean }) {
  return (
    <label className={`check-task ${task.done ? "done" : ""} ${dense ? "dense" : ""}`}>
      <input type="checkbox" checked={Boolean(task.done)} onChange={onToggle} />
      <span className="check-box">✓</span>
      <span className="check-label">{task.label}</span>
      {task.legacy && <em>昨日遗留</em>}
      {task.note && <small>{task.note}</small>}
      <span className="grip">⠿</span>
    </label>
  );
}

function AddTask({ draft, setDraft, addTask, placeholder = "添加今天要做的事" }: Pick<SharedProps, "draft" | "setDraft" | "addTask"> & { placeholder?: string }) {
  return <div className="add-task">
    <button onClick={addTask} aria-label="添加任务">＋</button>
    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder={placeholder} />
    <kbd>↵</kbd>
  </div>;
}

function MinimalView(p: SharedProps) {
  return <section className="minimal-view">
    <header className="minimal-top">
      <span className="wordmark">我的工作台</span>
      <nav><b>安排</b><span>记录</span><span>信息</span><span>心情</span></nav>
      <button className="text-button">＋ 快速记录</button>
    </header>
    <div className="minimal-body">
      <div className="minimal-heading">
        <p>7月31日 · 星期五</p>
        <h1>今天，先做好眼前的事。</h1>
        <span>还有 {p.tasks.today.filter((t) => !t.done).length} 项安排</span>
      </div>
      <div className="minimal-columns">
        <section className="minimal-main">
          <div className="plain-title"><h2>今日安排</h2><label><input type="checkbox" checked={p.hideDone} onChange={(e) => p.setHideDone(e.target.checked)} /> 隐藏已完成</label></div>
          <AddTask {...p} />
          <div className="plain-list">{p.visibleToday.map((task) => <CheckTask key={task.id} task={task} onToggle={() => p.toggle("today", task.id)} />)}</div>
        </section>
        <aside className="minimal-side">
          <PlainGroup title="本周安排" tasks={p.tasks.week} group="week" toggle={p.toggle} />
          <PlainGroup title="后续安排" tasks={p.tasks.later} group="later" toggle={p.toggle} />
          <div className="minimal-mood"><span>此刻感觉</span><Mood value={p.mood} onChange={p.setMood} compact /></div>
        </aside>
      </div>
    </div>
  </section>;
}

function PlainGroup({ title, tasks, group, toggle }: { title: string; tasks: Task[]; group: Group; toggle: SharedProps["toggle"] }) {
  return <section className="plain-group"><div><h3>{title}</h3><button>＋</button></div>{tasks.map((task) => <CheckTask dense key={task.id} task={task} onToggle={() => toggle(group, task.id)} />)}</section>;
}

function JournalView(p: SharedProps) {
  return <section className="journal-view">
    <header className="journal-top"><div><i>我的</i><strong>工作台</strong></div><nav><b>安排</b><span>记录</span><span>信息</span><span>心情</span></nav><button>快速记录 ↗</button></header>
    <div className="journal-board">
      <div className="journal-greeting"><span>FRI · 07/31</span><h1>早上好，菠菜！</h1><p>今日份清单已经摆好啦。</p></div>
      <section className="paper today-paper">
        <div className="tape" /><div className="paper-title"><span>01</span><h2>今日安排</h2><label><input type="checkbox" checked={p.hideDone} onChange={(e) => p.setHideDone(e.target.checked)} /> 收起完成项</label></div>
        <AddTask {...p} placeholder="写下一件要做的小事…" />
        {p.visibleToday.map((task) => <CheckTask key={task.id} task={task} onToggle={() => p.toggle("today", task.id)} />)}
      </section>
      <section className="paper week-paper"><div className="pin" /><div className="paper-title"><span>02</span><h2>本周安排</h2></div>{p.tasks.week.map((task) => <CheckTask dense key={task.id} task={task} onToggle={() => p.toggle("week", task.id)} />)}</section>
      <section className="paper later-paper"><div className="paper-title"><span>03</span><h2>后续安排</h2></div>{p.tasks.later.map((task) => <CheckTask dense key={task.id} task={task} onToggle={() => p.toggle("later", task.id)} />)}</section>
      <section className="mood-note"><strong>今天的心情天气</strong><Mood value={p.mood} onChange={p.setMood} /><small>点一个最像此刻的表情</small></section>
      <button className="record-note"><b>✎</b><span>记下一闪而过的想法<small>随手记 · 会议纪要</small></span><i>→</i></button>
    </div>
  </section>;
}

function PrecisionView(p: SharedProps) {
  return <section className="precision-view">
    <aside className="tool-sidebar">
      <div className="tool-brand"><span>W</span><strong>我的工作台</strong></div>
      <nav><button className="active">⌁ <span>安排</span><kbd>⌘1</kbd></button><button>▤ <span>记录</span><kbd>⌘2</kbd></button><button>◇ <span>信息</span></button><button>☺ <span>心情</span></button></nav>
      <div className="tool-bottom">⚙ 设置</div>
    </aside>
    <div className="tool-content">
      <header className="tool-top"><div className="crumb">我的工作台 <span>/</span> 安排</div><button>＋ 新建任务</button><button>快速记录</button><b>菠</b></header>
      <div className="tool-page">
        <div className="tool-heading"><div><h1>安排</h1><p>2026年7月31日，星期五</p></div><Mood value={p.mood} onChange={p.setMood} compact /></div>
        <div className="metric-row"><div><span>今日未完成</span><b>{p.tasks.today.filter((t) => !t.done).length}</b></div><div><span>本周待安排</span><b>{p.tasks.week.length}</b></div><div><span>后续事项</span><b>{p.tasks.later.length}</b></div></div>
        <section className="tool-panel">
          <div className="tool-panel-head"><h2>今日安排 <span>{p.tasks.today.length}</span></h2><label><input type="checkbox" checked={p.hideDone} onChange={(e) => p.setHideDone(e.target.checked)} /> 隐藏已完成</label><button>•••</button></div>
          <AddTask {...p} placeholder="快速添加任务，按 Enter 保存" />
          <div className="table-head"><span>任务</span><span>时间</span><span>状态</span><span /></div>
          {p.visibleToday.map((task) => <div className="table-row" key={task.id}><CheckTask task={task} onToggle={() => p.toggle("today", task.id)} /><span>{task.note || "—"}</span><span className={task.done ? "status done-status" : "status"}>{task.done ? "已完成" : "待办"}</span><button>•••</button></div>)}
        </section>
        <div className="tool-groups"><ToolGroup title="本周安排" tasks={p.tasks.week} group="week" toggle={p.toggle} /><ToolGroup title="后续安排" tasks={p.tasks.later} group="later" toggle={p.toggle} /></div>
      </div>
    </div>
  </section>;
}

function ToolGroup({ title, tasks, group, toggle }: { title: string; tasks: Task[]; group: Group; toggle: SharedProps["toggle"] }) {
  return <section className="tool-small"><header><h3>{title} <span>{tasks.length}</span></h3><button>＋</button></header>{tasks.map((task) => <CheckTask dense key={task.id} task={task} onToggle={() => toggle(group, task.id)} />)}</section>;
}

function BlendView(p: SharedProps) {
  return <section className="blend-view">
    <aside className="blend-side">
      <div className="blend-brand"><span>我</span><div><strong>我的工作台</strong><small>今天也慢慢来</small></div></div>
      <nav><button className="active">⌁ <span>安排</span></button><button>▤ <span>记录</span></button><button>◇ <span>信息</span></button><button>☺ <span>心情</span></button></nav>
      <div className="blend-record"><b>一闪而过的想法？</b><span>随手记 · 会议纪要</span><button>＋ 快速记录</button></div>
      <div className="blend-settings">⚙ 设置</div>
    </aside>
    <div className="blend-content">
      <header className="blend-top"><span>7月31日 · 星期五</span><button>＋ 快速记录</button><b>菠</b></header>
      <div className="blend-page">
        <div className="blend-heading"><div><p>早上好，菠菜</p><h1>今天想先完成哪一件？</h1><span>还有 {p.tasks.today.filter((t) => !t.done).length} 项安排，不用着急。</span></div><div><small>此刻感觉怎么样？</small><Mood value={p.mood} onChange={p.setMood} compact /></div></div>
        <div className="blend-grid">
          <section className="blend-today">
            <div className="blend-title"><div><i /><h2>今日安排</h2><span>{p.tasks.today.length}</span></div><label><input type="checkbox" checked={p.hideDone} onChange={(e) => p.setHideDone(e.target.checked)} /> 隐藏已完成</label></div>
            <AddTask {...p} />
            {p.visibleToday.map((task) => <CheckTask key={task.id} task={task} onToggle={() => p.toggle("today", task.id)} />)}
            <footer><span>{p.tasks.today.filter((t) => t.done).length} / {p.tasks.today.length} 已完成</span><i><b style={{ width: `${p.tasks.today.filter((t) => t.done).length / p.tasks.today.length * 100}%` }} /></i></footer>
          </section>
          <aside className="blend-stack"><BlendGroup title="本周安排" subtitle="接下来几天" tasks={p.tasks.week} group="week" toggle={p.toggle} tone="yellow" /><BlendGroup title="后续安排" subtitle="未来再处理" tasks={p.tasks.later} group="later" toggle={p.toggle} tone="sage" /></aside>
        </div>
      </div>
    </div>
  </section>;
}

function BlendGroup({ title, subtitle, tasks, group, toggle, tone }: { title: string; subtitle: string; tasks: Task[]; group: Group; toggle: SharedProps["toggle"]; tone: string }) {
  return <section className={`blend-group ${tone}`}><header><div><h3>{title} <span>{tasks.length}</span></h3><p>{subtitle}</p></div><button>＋</button></header>{tasks.map((task) => <CheckTask dense key={task.id} task={task} onToggle={() => toggle(group, task.id)} />)}<button className="all">查看全部 →</button></section>;
}
