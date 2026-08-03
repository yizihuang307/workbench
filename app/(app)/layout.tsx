"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { key: "today", href: "/today", label: "今日事", icon: "📅" },
  { key: "records", href: "/records", label: "随手记", icon: "📝" },
  { key: "links", href: "/links", label: "传送门", icon: "🔗" },
  { key: "resources", href: "/resources", label: "资料库", icon: "📚" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? null);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="workbench">
      <aside className="sidebar">
        <div className="brand">
          <span>W</span>
          <div>
            <strong>我的工作台</strong>
            <small>PERSONAL OS</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={pathname === item.href ? "active" : ""}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        {userEmail && (
          <div style={{ marginTop: "auto", padding: "12px 8px" }}>
            <small style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>
              {userEmail}
            </small>
            <button
              onClick={handleLogout}
              style={{
                display: "block",
                marginTop: 6,
                padding: "4px 8px",
                border: "1px solid rgba(255,255,255,.2)",
                borderRadius: 6,
                background: "transparent",
                color: "rgba(255,255,255,.6)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              退出
            </button>
          </div>
        )}
      </aside>
      <section className="content">{children}</section>
    </main>
  );
}