"use client";

import { useEffect, useRef, useState } from "react";

const CATS = [
  { name: "爱心猫", path: "/cats/love.json" },
  { name: "大笑猫", path: "/cats/laugh.json" },
  { name: "哭泣猫", path: "/cats/cry.json" },
] as const;

export default function SidebarCat() {
  const [catIndex, setCatIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const cat = CATS[catIndex];

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    let cancelled = false;
    let destroyAnimation: (() => void) | undefined;

    void import("lottie-web").then(({ default: lottie }) => {
      if (cancelled) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animation = lottie.loadAnimation({
        container: node,
        renderer: "svg",
        loop: !reduceMotion,
        autoplay: !reduceMotion,
        path: cat.path,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      if (reduceMotion) {
        animation.addEventListener("DOMLoaded", () => animation.goToAndStop(0, true));
      }
      destroyAnimation = () => animation.destroy();
    }).catch(() => {
      node.dataset.failed = "true";
    });

    return () => {
      cancelled = true;
      destroyAnimation?.();
      node.replaceChildren();
      delete node.dataset.failed;
    };
  }, [cat.path]);

  return (
    <button
      className="sidebar-cat"
      type="button"
      onClick={() => setCatIndex((current) => (current + 1) % CATS.length)}
      aria-label={`切换猫猫动效，当前为${cat.name}`}
      title={`点击切换猫猫 · 当前${cat.name}`}
    >
      <span className="sidebar-cat-stage" ref={container} aria-hidden />
    </button>
  );
}
