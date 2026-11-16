// Modo foco en 3D: la hoja es de papel de verdad, como en una máquina de escribir. La cámara no se mueve y la punta de la lapicera queda siempre en el
// mismo lugar de la pantalla: la hoja se desliza debajo (a los costados al escribir, hacia arriba en cada Enter), se curva y cae hacia atrás por su peso.
// La luz es una V con borde y núcleo, tal como quedó en el editor de luz. La hoja que se ve es la misma que se escribe (la textura es el lienzo del escritor).
// three.js se carga solo al entrar al modo foco (vendor/three.min.js) y queda guardado para usarlo sin conexión.
import { $ } from './util.js';
import { PAGE_W as W, PAGE_H as H } from './template.js';

// Valores elegidos en el editor de luz.
export const LOOK = {
  luz: { ax: 1, ay: -41, tilt: 0, open: 70, asym: 0, edge: 67, bow: 0, tip: 50, reach: 262, fade: 50, core: 30, coreSize: 45, inten: 80, temp: 2850, sat: 89, dist: 220, falloff: 10,
    halo: 49, haloOpen: 110, haloSoft: 80, amb: 22, ambTemp: 3300, dk: 82, glow: 10, vig: 49, grain: 7, flicker: 0, flickerSpeed: 3 },
  escena: { rad: 38, rig: 55, wrap: 210, elev: -10, zoom: 61, yaw: 14 },
};
export const TEX_W_PX = 1400; // ancho de la textura de la hoja (píxeles): suficiente para leer la letra sin gastar de más

export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

function loadThree() {
  if (window.THREE) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/three.min.js'; s.onload = () => (window.THREE ? res() : rej(new Error('three'))); s.onerror = () => rej(new Error('three'));
    document.head.append(s);
  });
}

const FRAG_HEAD = `varying vec3 vWP;
uniform vec4 uLA[2]; uniform vec4 uLB[2]; uniform vec4 uLC[2]; uniform vec4 uLD[2]; uniform vec2 uCore;
float lightMask( int i ) {
  vec4 A = uLA[i]; vec4 B = uLB[i]; vec4 C = uLC[i]; vec4 D = uLD[i];
  vec2 p = vWP.xy - A.xy; vec2 d = A.zw;
  float r = length( p );
  float a = atan( d.x * p.y - d.y * p.x, dot( d, p ) );
  float hh = a > 0.0 ? B.x : B.y;
  float eff = max( hh * ( 1.0 + C.y * clamp( r / B.w, 0.0, 1.5 ) ), 0.01 );
  float s = B.z;
  float ang = 1.0 - smoothstep( eff * ( 1.0 - s ), eff * ( 1.0 + s * 0.8 ), abs( a ) );
  float prof = 1.0 - 0.28 * pow( clamp( abs( a ) / eff, 0.0, 1.0 ), 2.0 );
  float tipR = smoothstep( 0.0, max( C.x, 1.0 ), r );
  float fadeR = 1.0 - smoothstep( B.w * ( 1.0 - D.x ), B.w, r );
  float core = C.z * exp( -pow( length( vWP.xy - uCore ) / max( C.w, 1.0 ), 2.0 ) );
  return D.y * ang * prof * tipR * fadeR * ( 1.0 + core );
}
`;

// h = { writer(), animOn() }
export function createFocus3D(h) {
  let T = null, ready = false, running = false, raf = 0, texDirty = true;
  let renderer, scene, camera, group, geo, base, tex, spot, halo, amb, host, glowEl, vigEl;
  const U = {}; const rows = []; const NX = 25; let NY = 480;
  const S0 = 16; // tramo plano de la hoja sobre la línea que se escribe
  const P = { rad: LOOK.escena.rad, rig: LOOK.escena.rig, wrap: LOOK.escena.wrap, elev: LOOK.escena.elev, zoom: LOOK.escena.zoom / 100, yaw: LOOK.escena.yaw / 100 };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rad = (d) => d * Math.PI / 180;

  /* ---------- física del papel: lámina elástica sujeta abajo; su peso la dobla hacia atrás ---------- */
  let elTh = new Float64Array(2), elKey = '', elN = 0;
  const elY = new Float64Array(H + 60), elZ = new Float64Array(H + 60), elZ1 = new Float64Array(H + 62);
  const kRoll = (s) => { const R = P.rad, TT = P.wrap * Math.PI / 180, L = Math.max(55 + 3.2 * R, TT * R / 0.65), k0 = TT / (0.65 * L), u = s / L; return k0 * smooth(0, 0.35, u) * (1 - smooth(0.65, 1, u)); };
  function solveElastica(Lfree) {
    const n = Math.max(1, Math.min(H + 50, Math.floor(Lfree))), lam3 = P.rig * P.rig * P.rig, key = P.rad + '|' + P.wrap + '|' + P.rig;
    if (elTh.length < n + 1) { const t = new Float64Array(n + 1); t.set(elTh); t.fill(elTh[elTh.length - 1], elTh.length); elTh = t; }
    const cold = key !== elKey; if (cold) { elKey = key; elTh.fill(0); }
    const iters = cold ? 140 : 8, al = cold ? 0.4 : 0.5;
    for (let it = 0; it < iters; it++) {
      elZ[0] = 0; for (let i = 1; i <= n; i++) elZ[i] = elZ[i - 1] + 0.5 * (Math.sin(elTh[i - 1]) + Math.sin(elTh[i]));
      elZ1[n + 1] = 0; for (let i = n; i >= 0; i--) elZ1[i] = elZ1[i + 1] + elZ[i];
      let acc = 0, pk = 0;
      for (let i = 0; i <= n; i++) {
        const kg = (elZ1[i] - elZ[i] * (Lfree - i)) / lam3, k = -kRoll(i) + Math.max(kg, -1 / 12);
        if (i > 0) acc += 0.5 * (pk + k); pk = k;
        elTh[i] = elTh[i] * (1 - al) + Math.max(-Math.PI * 1.02, acc) * al;
      }
    }
    elY[0] = 0; elZ[0] = 0;
    for (let i = 1; i <= n; i++) { elY[i] = elY[i - 1] + 0.5 * (Math.cos(elTh[i - 1]) + Math.cos(elTh[i])); elZ[i] = elZ[i - 1] + 0.5 * (Math.sin(elTh[i - 1]) + Math.sin(elTh[i])); }
    elN = n;
  }
  function deform(penY) {
    const pos = geo.attributes.position;
    for (let j = 0; j < NY; j++) rows[j].s = base[(j * NX) * 3 + 1] - penY;
    solveElastica(H / 2 - penY - S0);
    for (let j = 0; j < NY; j++) {
      const r = rows[j];
      if (r.s <= S0) { r.cy = r.s; r.cz = 0; r.th = 0; continue; }
      const u = Math.min(elN - 1e-6, r.s - S0), i = Math.floor(u), f = u - i;
      r.cy = S0 + elY[i] * (1 - f) + elY[i + 1] * f; r.cz = elZ[i] * (1 - f) + elZ[i + 1] * f; r.th = elTh[i] * (1 - f) + elTh[i + 1] * f;
    }
    for (let j = 0; j < NY; j++) { const r = rows[j]; for (let i = 0; i < NX; i++) { const idx = j * NX + i; pos.setXYZ(idx, base[idx * 3], penY + r.cy, r.cz); } }
    pos.needsUpdate = true; geo.computeVertexNormals();
  }

  /* ---------- luz: una V con borde, punta y núcleo (se calcula en el sombreado de cada punto de la hoja) ---------- */
  function patchMat(m) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <lights_fragment_begin>', T.ShaderChunk.lights_fragment_begin.replace('getSpotDirectLightIrradiance( spotLight, geometry, directLight );', 'getSpotDirectLightIrradiance( spotLight, geometry, directLight );\n\t\tdirectLight.color *= lightMask( UNROLLED_LOOP_INDEX );'));
    };
    m.customProgramCacheKey = () => 'pylFoco1'; m.needsUpdate = true;
  }
  const kelvin = (k) => { k = Math.min(Math.max(k, 1000), 12000) / 100; const c = (v) => Math.min(255, Math.max(0, v)) / 255;
    return [c(k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592)), c(k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492)), c(k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307)]; };
  const toColor = (rgb, sat) => new T.Color(1 + (rgb[0] - 1) * sat, 1 + (rgb[1] - 1) * sat, 1 + (rgb[2] - 1) * sat);
  function applyLight(time) {
    const l = LOOK.luz, t = rad(l.tilt), dx = Math.sin(t), dy = Math.cos(t), hl = rad(l.open / 2 + l.asym / 2), hr = rad(l.open / 2 - l.asym / 2), s = 0.02 + 0.98 * Math.pow(l.edge / 100, 1.3);
    U.uLA.value[0].set(l.ax, l.ay, dx, dy); U.uLB.value[0].set(Math.max(hl, 0.02), Math.max(hr, 0.02), s, l.reach); U.uLC.value[0].set(l.tip, l.bow / 100, l.core / 100, l.coreSize); U.uLD.value[0].set(l.fade / 100, 1, 0, 0);
    const ho = rad(l.haloOpen / 2), hs = 0.25 + 0.75 * (l.haloSoft / 100);
    U.uLA.value[1].set(l.ax, l.ay, dx, dy); U.uLB.value[1].set(ho, ho, hs, l.reach * 1.5); U.uLC.value[1].set(l.tip * 2, 0, 0, 1); U.uLD.value[1].set(0.8, 1, 0, 0);
    const flick = 1 + (l.flicker / 100) * 0.2 * (Math.sin(time * l.flickerSpeed * 2.1) * 0.5 + Math.sin(time * l.flickerSpeed * 5.3 + 1.7) * 0.3 + Math.sin(time * l.flickerSpeed * 11.7) * 0.2);
    const d = Math.hypot(l.dist, 90), cut = 1100 - l.falloff * 7, dec = 1 + l.falloff / 100, att = Math.pow(Math.max(0.12, 1 - d / cut), dec), att0 = Math.pow(1 - 150 / cut, dec);
    const b = (l.inten / 100) * Math.pow(150 / d, 0.45) * 1.25 * att0 / att * flick, sat = l.sat / 100;
    spot.color.copy(toColor(kelvin(l.temp), sat)); spot.intensity = b; spot.distance = cut; spot.decay = dec; spot.position.set(l.ax, l.ay, l.dist); spot.target.position.set(l.ax + dx * 100, l.ay + dy * 100, 0);
    halo.color.copy(toColor(kelvin(l.temp - 500), sat)); halo.intensity = b * (l.halo / 100) * (1.1 - 0.8 * l.dk / 100); halo.position.copy(spot.position); halo.target.position.copy(spot.target.position);
    amb.color.copy(toColor(kelvin(l.ambTemp), 1)); amb.intensity = (l.amb / 100) * (1 - 0.9 * l.dk / 100) * Math.min(1.5, l.inten / 100);
    vigEl.style.opacity = ((l.vig / 100) * (0.45 + 0.55 * l.dk / 100)).toFixed(2); vigEl.style.setProperty('--vs', (0.6 + 0.4 * l.dk / 100).toFixed(2)); vigEl.style.setProperty('--grain', (l.grain / 100).toFixed(3));
    const v = new T.Vector3(0, -8, 0).project(camera), gc = kelvin(l.temp - 300).map((x) => Math.round(x * 255)).join(' ');
    glowEl.style.setProperty('--gc', gc); glowEl.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
    glowEl.style.opacity = ((l.glow / 100) * (0.6 + 0.4 * Math.min(1, l.inten / 100)) * flick).toFixed(2);
  }

  /* ---------- armado de la escena ---------- */
  async function init() {
    await loadThree(); T = window.THREE;
    host = $('#focus3d'); glowEl = $('.f3-glow', host); vigEl = $('.f3-vig', host);
    const canvas = $('canvas', host);
    NY = matchMedia('(pointer: coarse)').matches ? 300 : 480; for (let j = 0; j < NY; j++) rows.push({ s: 0, cy: 0, cz: 0, th: 0 });
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x08080b); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    scene = new T.Scene(); camera = new T.PerspectiveCamera(32, 16 / 9, 10, 2000);
    geo = new T.PlaneGeometry(W, H, NX - 1, NY - 1); base = geo.attributes.position.array.slice();
    tex = new T.CanvasTexture(h.writer().cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 724; const bx = bc.getContext('2d'), bimg = bx.createImageData(512, 724);
    for (let i = 0; i < bimg.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 40; bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v; bimg.data[i + 3] = 255; } bx.putImageData(bimg, 0, 0);
    const mat = new T.MeshStandardMaterial({ map: tex, bumpMap: new T.CanvasTexture(bc), bumpScale: 0.12, roughness: 0.92, metalness: 0, side: T.DoubleSide });
    Object.assign(U, { uLA: { value: [new T.Vector4(), new T.Vector4()] }, uLB: { value: [new T.Vector4(), new T.Vector4()] }, uLC: { value: [new T.Vector4(), new T.Vector4()] }, uLD: { value: [new T.Vector4(), new T.Vector4()] }, uCore: { value: new T.Vector2(0, -8) } });
    patchMat(mat);
    group = new T.Group(); group.add(new T.Mesh(geo, mat)); scene.add(group);
    amb = new T.AmbientLight(0xffdcb8, 0.1); scene.add(amb);
    spot = new T.SpotLight(0xffcf98, 1, 430, 1.5, 0.15, 2); scene.add(spot, spot.target);
    halo = new T.SpotLight(0xffa862, 0.4, 760, 1.5, 0.15, 1.4); scene.add(halo, halo.target);
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); $('#cap')?.focus({ preventScroll: true }); });
    addEventListener('resize', () => { if (running) resize(); });
    ready = true;
  }
  function resize() {
    const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh;
    const asp = w / hh, extent = asp < 1.1 ? (W * 0.95 / asp) * (P.zoom / 0.61) : H * 1.08 * P.zoom; // alto visible en mm: en vertical se ajusta al ancho de la hoja
    const dist = (extent * 0.5) / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const e = T.MathUtils.degToRad(P.elev), ty = 45; camera.position.set(0, ty + dist * Math.sin(e), dist * Math.cos(e)); camera.lookAt(0, ty, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  /* ---------- cuadro a cuadro ---------- */
  const pen = { x: 0, y: 0 }; let first = true, prevX = 0, last = 0;
  function frame(now) {
    raf = 0; if (!running) return;
    const w = h.writer(), c = w._pen, reduce = !h.animOn();
    if (c && c.page === w.page) { if (first) { pen.x = c.x; pen.y = c.y; first = false; prevX = pen.x; } else { const k = reduce ? 1 : 1 - Math.pow(0.0009, Math.min(0.05, (now - last) / 1000)); pen.x += (c.x - pen.x) * k; pen.y += (c.y - pen.y) * k; } }
    last = now;
    if (texDirty) { tex.needsUpdate = true; texDirty = false; }
    const lx = pen.x - W / 2, ly = H / 2 - pen.y;
    deform(ly);
    const yaw = -(lx / (W / 2)) * 0.16 * P.yaw, roll = T.MathUtils.clamp((pen.x - prevX) * -0.0009 * 5.1, -0.05, 0.05) * P.yaw * 6; prevX = pen.x;
    group.rotation.set(0, yaw, roll);
    group.position.set(lx, ly, 0).applyEuler(group.rotation).negate(); // la punta queda siempre en el origen
    applyLight(now / 1000);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  return {
    ready: () => ready,
    async start() {
      if (!ready) await init();
      running = true; first = true; texDirty = true; last = performance.now();
      host.hidden = false; resize(); requestAnimationFrame(() => host.classList.add('on'));
      h.writer().onDraw = () => { texDirty = true; };
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false; cancelAnimationFrame(raf); raf = 0; const w = h.writer(); if (w) w.onDraw = null;
      host?.classList.remove('on'); setTimeout(() => { if (!running && host) host.hidden = true; }, 520);
    },
    isRunning: () => running,
  };
}
