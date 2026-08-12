"use client";

import { useEffect, useRef } from "react";
import { FIREWORK_ANIMATION_PATH, loadAnimationData, loadLottie } from "./lottie-assets";

type Props = {
  x: number;
  y: number;
  runId: number;
  onComplete: (runId: number) => void;
};

const EFFECT_SIZE = 260;

export default function TaskCompletionEffect({ x, y, runId, onComplete }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete(runId);
      return;
    }
    const complete = () => onComplete(runId);
    let cancelled = false;
    let fallback: number | undefined;
    let destroyAnimation: (() => void) | undefined;
    void Promise.all([
      loadLottie(),
      loadAnimationData(FIREWORK_ANIMATION_PATH),
    ]).then(([lottie, animationData]) => {
      if (cancelled) return;
      const animation = lottie.loadAnimation({
        container: node,
        renderer: "svg",
        loop: false,
        autoplay: true,
        animationData,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      animation.addEventListener("complete", complete);
      animation.addEventListener("data_failed", complete);
      fallback = window.setTimeout(complete, 3200);
      destroyAnimation = () => {
        animation.removeEventListener("complete", complete);
        animation.removeEventListener("data_failed", complete);
        animation.destroy();
      };
    }).catch(complete);
    return () => {
      cancelled = true;
      if (fallback !== undefined) window.clearTimeout(fallback);
      destroyAnimation?.();
    };
  }, [onComplete, runId]);

  return <div className="task-completion-effect" ref={container} style={{ left: x, top: y, width: EFFECT_SIZE, height: EFFECT_SIZE }} aria-hidden />;
}
