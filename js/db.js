// Almacenamiento local de tu letra (IndexedDB) + exportar/importar a archivo
import { base64ToBytes, bytesToBase64 } from './util.js';

const DB_NAME = 'puno-y-letra';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
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
async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return bytes;
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export async function exportHand() {
  const list = await allGlyphs();
  const data = {
    app: 'puno-y-letra', version: 1, exportedAt: new Date().toISOString(),
    glyphs: list.map((g) => ({ char: g.char, w: g.w, h: g.h, pxmm: g.pxmm, base: g.base, source: g.source, page: g.page, a: bytesToBase64(g.alpha) })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const gz = await gzip(bytes);
  return new Blob([gz], { type: 'application/octet-stream' });
}

export async function importHand(file, { replace = false } = {}) {
  const raw = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(await gunzip(raw));
  const data = JSON.parse(text);
  if (data.app !== 'puno-y-letra' || !Array.isArray(data.glyphs)) throw new Error('El archivo no parece ser de Puño y Letra.');
  if (replace) await clearGlyphs();
  const list = data.glyphs.map((g) => ({ char: g.char, w: g.w, h: g.h, pxmm: g.pxmm, base: g.base, source: g.source || 'import', page: g.page ?? -1, alpha: base64ToBytes(g.a) }));
  await addGlyphs(list);
  return list.length;
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

export async function exportRefs() {
  const data = { app: 'puno-y-letra', kind: 'refs', version: 1, exportedAt: new Date().toISOString(), refs: await allRefs() };
  return new Blob([await gzip(new TextEncoder().encode(JSON.stringify(data)))], { type: 'application/octet-stream' });
}
// Devuelve cuántas cartas se sumaron (las que ya existen con el mismo id se reemplazan)
export async function importRefs(file) {
  const raw = new Uint8Array(await file.arrayBuffer());
  const data = JSON.parse(new TextDecoder().decode(await gunzip(raw)));
  if (data.app !== 'puno-y-letra' || data.kind !== 'refs' || !Array.isArray(data.refs)) throw new Error('El archivo no parece ser un archivero de Puño y Letra.');
  await tx('refs', 'readwrite', (s) => { for (const r of data.refs) if (r && r.id && typeof r.text === 'string') s.put(r); });
  return data.refs.length;
}

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
