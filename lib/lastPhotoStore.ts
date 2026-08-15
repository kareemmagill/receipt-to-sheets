// Persists the single most recent captured photo (as a data URL) in
// IndexedDB so "Use Last Photo" survives a page reload/reopen -- a phone
// camera capture can be several MB as base64, too big to trust to
// localStorage's ~5MB-ish quota, so this uses IndexedDB instead. Best-effort
// only: every function here resolves/rejects quietly rather than throwing,
// since losing the last photo is an inconvenience, not a data-loss risk (the
// real save path in app/api/save/route.ts is unaffected either way).
const DB_NAME = "receipt-to-sheets";
const STORE_NAME = "photos";
const KEY = "last";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLastPhoto(dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(dataUrl, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLastPhoto(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
