// Almacén clave-valor en IndexedDB, compartido por la app y el service worker.
const NAME = "habits";
const STORE = "kv";
let opening = null;

function open() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const get = (key) => run("readonly", (s) => s.get(key));
export const set = (key, value) => run("readwrite", (s) => s.put(value, key));
export const del = (key) => run("readwrite", (s) => s.delete(key));

// Lee y escribe en la misma transacción: `fn` recibe el valor y devuelve el nuevo (undefined = no tocar).
export const update = (key, fn) =>
  run("readwrite", (s) => {
    const req = s.get(key);
    req.onsuccess = () => {
      const next = fn(req.result);
      if (next !== undefined) s.put(next, key);
    };
    return req;
  });
