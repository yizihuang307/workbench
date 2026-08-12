import type { AnimationData } from "lottie-web";

const animationCache = new Map<string, Promise<AnimationData>>();

export const CAT_ANIMATION_PATHS = [
  "/cats/love.json",
  "/cats/laugh.json",
  "/cats/cry.json",
] as const;

export const FIREWORK_ANIMATION_PATH = "/firework.json";

export function loadLottie() {
  return import("lottie-web").then(({ default: lottie }) => lottie);
}

export function loadAnimationData(path: string) {
  let request = animationCache.get(path);
  if (!request) {
    request = fetch(path).then((response) => {
      if (!response.ok) throw new Error(`动画资源加载失败：${path}`);
      return response.json() as Promise<AnimationData>;
    });
    animationCache.set(path, request);
    request.catch(() => animationCache.delete(path));
  }
  return request;
}

export function preloadLottieAnimations(paths: readonly string[]) {
  return Promise.allSettled([
    loadLottie(),
    ...paths.map((path) => loadAnimationData(path)),
  ]);
}
