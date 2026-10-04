/* Outbox: a copy of every catch this phone sends, kept until the server has it.
   Firestore already queues offline writes, but if the server later refuses one (for example an account was paused),
   the catch would quietly disappear. With this copy the app can say so and offer to try again, so a fish and its
   photo are never lost silently. Stored in IndexedDB because photos are too big for localStorage. */
const DB = "lunker-outbox", STORE = "catches";
let dbp = null;

function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

/* entry: { id, uid, catchData, photo, spot, savedAt } */
export const outboxPut = entry => tx("readwrite", s => s.put(entry)).catch(e => console.warn("Outbox", e));
export const outboxRemove = id => tx("readwrite", s => s.delete(id)).catch(() => {});
export const outboxAll = () => tx("readonly", s => s.getAll()).catch(() => []);
