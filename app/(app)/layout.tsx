"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { key: "today", href: "/today", label: "今日事", icon: "\u{1F4C5}" },
  { key: "records", href: "/records", label: "随手记", icon: "\u{1F4DD}" },
  { key: "links", href: "/links", label: "传送门", icon: "\u{1F517}" },
  { key: "resources", href: "/resources", label: "资料库", icon: "\u{1F4DA}" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function closeByKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeByKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeByKey);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="workbench">
      <aside className="sidebar">
        <div className="brand" ref={menuRef}>
          <button
            className="brand-button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label="用户菜单"
          >
            <span>W</span>
            <div>
              <strong>我的工作台</strong>
              <small>PERSONAL OS</small>
            </div>
            <span className="brand-chevron" aria-hidden>{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen && (
            <div className="brand-dropdown" role="menu">
              {userEmail && (
                <div className="brand-dropdown-user">{userEmail}</div>
              )}
              <button className="brand-dropdown-item" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          )}
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
      </aside>
      <section className="content">{children}</section>
    </main>
  );
}
