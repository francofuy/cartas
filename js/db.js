// Almacenamiento local de tu letra (IndexedDB) + exportar/importar a archivo
import { base64ToBytes, bytesToBase64 } from './util.js';

const DB_NAME = 'puno-y-letra';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('glyphs')) {
        const s = db.createObjectStore('glyphs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('char', 'char');
        s.createIndex('source', 'source');
      }
      // cartas de referencia (archivero)
      if (!db.objectStoreNames.contains('refs')) db.createObjectStore('refs', { keyPath: 'id' });
      // imágenes de fondo de las hojas (galería, internet o subidas)
      if (!db.objectStoreNames.contains('papers')) db.createObjectStore('papers', { keyPath: 'id' });
      // cartas cerradas y selladas (buzón): se imprimen una sola vez
      if (!db.objectStoreNames.contains('letters')) db.createObjectStore('letters', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function allGlyphs() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('glyphs').objectStore('glyphs').getAll();
    r.onsuccess = () => resolve(r.result.map(fromRecord));
    r.onerror = () => reject(r.error);
  });
}

function toRecord(g) {
  return { char: g.char, w: g.w, h: g.h, pxmm: g.pxmm, base: g.base, alpha: g.alpha.buffer.slice(g.alpha.byteOffset, g.alpha.byteOffset + g.alpha.byteLength), source: g.source || 'x', page: g.page ?? -1 };
}
function fromRecord(r) {
  return { id: 'm' + r.id, dbId: r.id, char: r.char, w: r.w, h: r.h, pxmm: r.pxmm, base: r.base, alpha: new Uint8Array(r.alpha), source: r.source, page: r.page };
}

export async function addGlyphs(list) {
  await tx('glyphs', 'readwrite', (s) => { for (const g of list) s.add(toRecord(g)); });
}
export async function deleteGlyph(dbId) {
  await tx('glyphs', 'readwrite', (s) => { s.delete(dbId); });
}
export async function deleteGlyphsByChar(ch) {
  const list = await allGlyphs();
  await tx('glyphs', 'readwrite', (s) => { for (const g of list) if (g.char === ch) s.delete(g.dbId); });
}
export async function clearGlyphs() {
  await tx('glyphs', 'readwrite', (s) => { s.clear(); });
}

/* ---------- exportar / importar ---------- */
export async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return bytes;
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
export async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/* ---------- cartas de referencia (archivero) ---------- */
export async function allRefs() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('refs').objectStore('refs').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putRef(ref) { await tx('refs', 'readwrite', (s) => { s.put(ref); }); }
export async function deleteRef(id) { await tx('refs', 'readwrite', (s) => { s.delete(id); }); }
export async function clearRefs() { await tx('refs', 'readwrite', (s) => { s.clear(); }); }


/* ---------- imágenes de fondo de las hojas ---------- */
export async function putPaperImage(rec) { await tx('papers', 'readwrite', (s) => { s.put(rec); }); }
export async function deletePaperImage(id) { await tx('papers', 'readwrite', (s) => { s.delete(id); }); }
export async function getPaperImage(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('papers').objectStore('papers').get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
export async function allPaperImages() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('papers').objectStore('papers').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/* ---------- cartas cerradas (buzón) ---------- */
export async function putLetter(rec) { await tx('letters', 'readwrite', (s) => { s.put(rec); }); }
export async function deleteLetter(id) { await tx('letters', 'readwrite', (s) => { s.delete(id); }); }
export async function allLetters() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('letters').objectStore('letters').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
