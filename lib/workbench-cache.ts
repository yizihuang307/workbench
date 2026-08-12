const CACHE_PREFIX = "workbench:schedule:v1:";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

export function readScheduleCache<T>(userId: string): T | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (
      typeof cached.savedAt !== "number"
      || Date.now() - cached.savedAt > MAX_CACHE_AGE
      || cached.value === undefined
    ) {
      window.localStorage.removeItem(cacheKey(userId));
      return null;
    }
    return cached.value;
  } catch {
    return null;
  }
}

export function writeScheduleCache<T>(userId: string, value: T) {
  try {
    const cached: CacheEnvelope<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(cached));
  } catch {
    // 缓存写入失败不应影响云端保存。
  }
}

export function clearScheduleCache(userId: string) {
  try {
    window.localStorage.removeItem(cacheKey(userId));
  } catch {
    // 隐私模式等环境可能禁用本地存储。
  }
}
