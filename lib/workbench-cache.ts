// schedule 缓存：单独缓存今日事部分，兼容旧版本。
const CACHE_PREFIX = "workbench:schedule:v1:";
// workbench 缓存：完整工作台快照（今日事 + 随手记 + 传送门 + 资料库）。
const STATE_PREFIX = "workbench:state:v1:";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

function cacheKey(prefix: string, userId: string) {
  return `${prefix}${userId}`;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (
      typeof cached.savedAt !== "number"
      || Date.now() - cached.savedAt > MAX_CACHE_AGE
      || cached.value === undefined
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return cached.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    const cached: CacheEnvelope<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // 缓存写入失败不应影响云端保存。
  }
}

export function readScheduleCache<T>(userId: string): T | null {
  return readCache(cacheKey(CACHE_PREFIX, userId));
}

export function writeScheduleCache<T>(userId: string, value: T) {
  writeCache(cacheKey(CACHE_PREFIX, userId), value);
}

export function clearScheduleCache(userId: string) {
  try {
    window.localStorage.removeItem(cacheKey(CACHE_PREFIX, userId));
  } catch {
    // 隐私模式等环境可能禁用本地存储。
  }
}

// ---- 完整工作台快照缓存（覆盖所有页面） ----

export function readWorkbenchStateCache<T>(userId: string): T | null {
  return readCache(cacheKey(STATE_PREFIX, userId));
}

export function writeWorkbenchStateCache<T>(userId: string, value: T) {
  writeCache(cacheKey(STATE_PREFIX, userId), value);
}

export function clearWorkbenchStateCache(userId: string) {
  try {
    window.localStorage.removeItem(cacheKey(STATE_PREFIX, userId));
  } catch {
    // 隐私模式等环境可能禁用本地存储。
  }
}
