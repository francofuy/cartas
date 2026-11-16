// Búsqueda de hojas (imágenes) en internet. Todo se pide desde tu navegador: no hay servidor intermedio.
// Openverse y Wikimedia Commons no piden clave; Unsplash, Pexels y Pixabay sí (gratuita, la sacás vos).

export const PROVIDERS = {
  openverse: { label: 'Openverse', key: false, note: 'Imágenes con licencias libres. No necesita clave.' },
  wikimedia: { label: 'Wikimedia', key: false, note: 'Wikimedia Commons: imágenes libres. No necesita clave.' },
  unsplash: { label: 'Unsplash', key: true, url: 'https://unsplash.com/developers', note: 'Fotos de Unsplash. Pide una clave gratuita («Access Key»).' },
  pexels: { label: 'Pexels', key: true, url: 'https://www.pexels.com/api/', note: 'Fotos de Pexels. Pide una clave gratuita.' },
  pixabay: { label: 'Pixabay', key: true, url: 'https://pixabay.com/api/docs/', note: 'Imágenes de Pixabay. Pide una clave gratuita.' },
};
export const PER_PAGE = 24;

const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();

async function getJSON(url, headers) {
  let res;
  try { res = await fetch(url, headers ? { headers } : undefined); } catch { throw new Error('No pude conectarme. Revisá tu conexión (o si el servicio está bloqueado en esta red).'); }
  if (res.status === 401 || res.status === 403) throw new Error('La clave no es válida o no tiene permiso. Revisala en ajustes.');
  if (res.status === 429) throw new Error('El servicio pide esperar un rato antes de buscar de nuevo (demasiados pedidos).');
  if (!res.ok) throw new Error(`El servicio respondió con un error (${res.status}).`);
  return res.json();
}

// Devuelve { items: [{ id, thumb, full, title, author, license, link, source }], more }
export async function search(provider, q, page, keys) {
  q = q.trim();
  if (!q) return { items: [], more: false };
  const P = PROVIDERS[provider];
  const key = (keys || {})[provider];
  if (P.key && !key) throw new Error('Falta la clave de ' + P.label + '.');
  const enc = encodeURIComponent(q);

  if (provider === 'openverse') {
    const d = await getJSON(`https://api.openverse.org/v1/images/?q=${enc}&page=${page}&page_size=${PER_PAGE}&mature=false`);
    return {
      items: (d.results || []).map((r) => ({
        id: 'ov-' + r.id, thumb: r.thumbnail || r.url, full: r.url, fallback: r.thumbnail,
        title: strip(r.title) || 'Sin título', author: strip(r.creator), license: (r.license ? 'CC ' + r.license.toUpperCase() + (r.license_version ? ' ' + r.license_version : '') : ''),
        link: r.foreign_landing_url, source: 'Openverse',
      })),
      more: page < (d.page_count || 1),
    };
  }
  if (provider === 'wikimedia') {
    const off = (page - 1) * PER_PAGE;
    const d = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrlimit=${PER_PAGE}&gsroffset=${off}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=420`);
    const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    return {
      items: pages.filter((p) => p.imageinfo && p.imageinfo[0] && p.imageinfo[0].thumburl).map((p) => {
        const ii = p.imageinfo[0], md = ii.extmetadata || {};
        const full = ii.thumburl.replace(/\/\d+px-/, '/1600px-');
        return {
          id: 'wm-' + p.pageid, thumb: ii.thumburl, full: ii.width > 1600 ? full : ii.url, fallback: ii.thumburl,
          title: strip(p.title).replace(/^File:/, '').replace(/\.\w+$/, ''), author: strip(md.Artist && md.Artist.value),
          license: strip(md.LicenseShortName && md.LicenseShortName.value), link: ii.descriptionurl, source: 'Wikimedia Commons',
        };
      }),
      more: !!d.continue,
    };
  }
  if (provider === 'unsplash') {
    const d = await getJSON(`https://api.unsplash.com/search/photos?query=${enc}&page=${page}&per_page=${PER_PAGE}`, { Authorization: 'Client-ID ' + key });
    return {
      items: (d.results || []).map((r) => ({
        id: 'us-' + r.id, thumb: r.urls.small, full: r.urls.regular, fallback: r.urls.small,
        title: strip(r.description || r.alt_description) || 'Foto de Unsplash', author: strip(r.user && r.user.name), license: 'Licencia Unsplash',
        link: r.links && r.links.html, source: 'Unsplash',
      })),
      more: page < (d.total_pages || 1),
    };
  }
  if (provider === 'pexels') {
    const d = await getJSON(`https://api.pexels.com/v1/search?query=${enc}&page=${page}&per_page=${PER_PAGE}`, { Authorization: key });
    return {
      items: (d.photos || []).map((r) => ({
        id: 'px-' + r.id, thumb: r.src.medium, full: r.src.large, fallback: r.src.medium,
        title: strip(r.alt) || 'Foto de Pexels', author: strip(r.photographer), license: 'Licencia Pexels', link: r.url, source: 'Pexels',
      })),
      more: !!d.next_page,
    };
  }
  // pixabay
  const d = await getJSON(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${enc}&image_type=photo&safesearch=true&page=${page}&per_page=${PER_PAGE}`);
  return {
    items: (d.hits || []).map((r) => ({
      id: 'pb-' + r.id, thumb: r.webformatURL, full: r.largeImageURL, fallback: r.webformatURL,
      title: strip((r.tags || '').split(',')[0]) || 'Imagen de Pixabay', author: strip(r.user), license: 'Licencia Pixabay', link: r.pageURL, source: 'Pixabay',
    })),
    more: page * PER_PAGE < (d.totalHits || 0),
  };
}

// Baja la imagen elegida y la deja en un tamaño razonable (máx. 1600 px de lado largo, JPEG).
// Si la versión grande no se puede leer desde el navegador (CORS), usa la reducida.
export async function downloadImage(item) {
  let blob = null, reduced = false;
  for (const [url, isFallback] of [[item.full, false], [item.fallback, true]]) {
    if (!url || (isFallback && url === item.full)) continue;
    try {
      const res = await fetch(url);
      if (res.ok) { blob = await res.blob(); reduced = isFallback; break; }
    } catch { /* se prueba la siguiente */ }
  }
  if (!blob) throw new Error('No pude bajar la imagen. Probá con otra.');
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  return { blob: out, reduced };
}
