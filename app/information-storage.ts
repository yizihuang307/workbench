import { INFO_KEY, parseInfoStore, type InfoStore } from "./information";

const DB_NAME = "personal-workbench";
const STORE_NAME = "information";
const CURRENT_KEY = "current";
export const INFO_SYNC_KEY = "workbench.information.sync.v1";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadInfoStore() {
  const db = await database();
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!value) return null;
  return parseInfoStore(JSON.stringify(value));
}

export async function saveInfoStore(store: InfoStore) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(store, CURRENT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

export async function migrateLegacyInfoStore() {
  const existing = await loadInfoStore();
  if (existing) return existing;
  const raw = localStorage.getItem(INFO_KEY);
  const legacy = raw ? parseInfoStore(raw) : null;
  if (legacy) await saveInfoStore(legacy);
  localStorage.removeItem(INFO_KEY);
  return legacy;
}
