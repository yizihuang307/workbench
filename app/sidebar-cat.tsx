"use client";

import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";
import { CAT_ANIMATION_PATHS, FIREWORK_ANIMATION_PATH, loadAnimationData, loadLottie, preloadLottieAnimations } from "./lottie-assets";

const CATS = [
  { name: "爱心猫", path: CAT_ANIMATION_PATHS[0] },
  { name: "大笑猫", path: CAT_ANIMATION_PATHS[1] },
  { name: "哭泣猫", path: CAT_ANIMATION_PATHS[2] },
] as const;

export default function SidebarCat() {
  const [catIndex, setCatIndex] = useState(0);
  const activeIndex = useRef(0);
  const containers = useRef<Array<HTMLSpanElement | null>>([]);
  const animations = useRef<Array<AnimationItem | null>>([]);
  const cat = CATS[catIndex];

  useEffect(() => {
    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void preloadLottieAnimations([...CAT_ANIMATION_PATHS, FIREWORK_ANIMATION_PATH]);
    void Promise.all([
      loadLottie(),
      ...CAT_ANIMATION_PATHS.map((path) => loadAnimationData(path)),
    ]).then(([lottie, ...animationData]) => {
      if (cancelled) return;
      animationData.forEach((data, index) => {
        const container = containers.current[index];
        if (!container) return;
        const animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: !reduceMotion,
          autoplay: false,
          animationData: data,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animations.current[index] = animation;
        animation.addEventListener("DOMLoaded", () => {
          if (reduceMotion) animation.goToAndStop(0, true);
          else if (index === activeIndex.current) animation.goToAndPlay(0, true);
        });
      });
    }).catch(() => {
      containers.current.forEach((node) => {
        if (node) node.dataset.failed = "true";
      });
    });

    return () => {
      cancelled = true;
      animations.current.forEach((animation) => animation?.destroy());
      animations.current = [];
    };
  }, []);

  useEffect(() => {
    activeIndex.current = catIndex;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animations.current.forEach((animation, index) => {
      if (!animation) return;
      if (index === catIndex) animation.goToAndPlay(0, true);
      else animation.pause();
    });
  }, [catIndex]);

  return (
    <button
      className="sidebar-cat"
      type="button"
      onClick={() => setCatIndex((current) => (current + 1) % CATS.length)}
      aria-label={`切换猫猫动效，当前为${cat.name}`}
      title={`点击切换猫猫 · 当前${cat.name}`}
    >
      {CATS.map((item, index) => (
        <span
          className="sidebar-cat-stage"
          data-active={index === catIndex}
          key={item.path}
          ref={(node) => { containers.current[index] = node; }}
          aria-hidden
        />
      ))}
    </button>
  );
}
