"use client";

import { useEffect, useState } from "react";

/**
 * FaviconImage：带 localStorage 持久化缓存的 favicon 组件
 *
 * 工作原理：
 * 1. 优先从 localStorage 读取已缓存的 data URL（即时显示，无需网络请求）
 * 2. 缓存未命中时，通过 /api/favicon 代理获取（绕过国内对 Google 的访问限制）
 * 3. 获取成功后，将图片转为 data URL 存入 localStorage，下次打开即时显示
 * 4. 加载中或失败时显示首字母兜底
 */

const CACHE_PREFIX = "favicon:";
const CACHE_VERSION = "v1:";
const MAX_CACHE_ENTRIES = 200; // 最多缓存 200 个 favicon

type FaviconImageProps = {
  domain: string;
  letter: string;
};

/** 清理过期的 favicon 缓存，防止 localStorage 溢出 */
function cleanUpFaviconCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX + CACHE_VERSION)) keys.push(key);
    }
    // 超过上限时删除最早的条目
    if (keys.length > MAX_CACHE_ENTRIES) {
      const toRemove = keys.length - Math.floor(MAX_CACHE_ENTRIES * 0.7);
      for (let i = 0; i < toRemove; i++) localStorage.removeItem(keys[i]);
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
}

export default function FaviconImage({ domain, letter }: FaviconImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = CACHE_PREFIX + CACHE_VERSION + domain;

    // 1. 优先从 localStorage 读取缓存的 data URL
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setSrc(cached);
        return;
      }
    } catch {
      // localStorage 不可用时继续走网络获取
    }

    // 2. 通过代理 API 获取 favicon
    fetch(`/api/favicon?domain=${encodeURIComponent(domain)}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.blob();
      })
      .then((blob) => {
        if (cancelled || !blob || blob.size === 0) return;

        // 3. 转为 data URL 用于显示和缓存
        const reader = new FileReader();
        reader.onload = () => {
          if (cancelled) return;
          const dataUrl = reader.result as string;
          setSrc(dataUrl);

          // 4. 存入 localStorage 实现持久化
          try {
            localStorage.setItem(cacheKey, dataUrl);
          } catch {
            // 可能是 localStorage 满了，清理后重试
            cleanUpFaviconCache();
            try {
              localStorage.setItem(cacheKey, dataUrl);
            } catch {
              // 清理后仍然满，放弃缓存
            }
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        // 网络错误等，保持首字母兜底
      });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  return (
    <>
      <i aria-hidden>{letter}</i>
      {src && <img src={src} alt="" onError={() => setSrc(null)} />}
    </>
  );
}
