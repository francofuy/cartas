// Modo foco en 3D: la hoja es de papel de verdad, como en una máquina de escribir. La cámara no se mueve y la punta de la lapicera queda siempre en el
// mismo lugar de la pantalla: la hoja se desliza debajo (a los costados al escribir, hacia arriba en cada Enter), se curva y cae hacia atrás por su peso.
// La luz es una V con borde y núcleo, tal como quedó en el editor de luz. La hoja que se ve es la misma que se escribe (la textura es el lienzo del escritor).
// Al entrar, la hoja 3D arranca exactamente donde está la hoja normal (plana, parejo iluminada) y viaja hasta su lugar: la cámara se acerca y se inclina, la hoja se curva y
// la luz en V se enciende. Al salir hace el camino inverso hasta volver a la hoja normal.
// three.js se carga solo al entrar al modo foco (vendor/three.min.js) y queda guardado para usarlo sin conexión.
import { $ } from './util.js';
import { PW as W, PH as H } from './format.js';
import { drawPaper } from './paper.js';
import { classify } from './hojas.js';

// Valores elegidos en el editor de luz.
export const LOOK = {
  luz: { ax: 1, ay: -41, tilt: 0, open: 70, asym: 0, edge: 67, bow: 0, tip: 22, reach: 262, fade: 50, core: 30, coreSize: 45, inten: 80, temp: 2850, sat: 89, dist: 220, falloff: 10,
    halo: 49, haloOpen: 110, haloSoft: 80, amb: 22, ambTemp: 3300, dk: 82, glow: 10, vig: 49, grain: 7, flicker: 0, flickerSpeed: 3 },
  barra: { len: 236, thick: 5, z: 11, hw: 18, hh: 10, hd: 9, dark: 75, slit: 100, glow: 8, off: 0 }, // barra de metal negro con una aleta de donde sale la luz
  escena: { rad: 38, rig: 55, wrap: 210, elev: -10, zoom: 61, yaw: 14, camY: -8 }, // camY: a qué altura mira la cámara respecto de la punta (mm); más bajo = se ve más hoja por debajo
};
// Al saltar de renglón, la tinta espera este tiempo (s, incluye el salto de la barra) para que la barra enfoque la zona antes de empezar a escribir.
export const LINE_DELAY = 0.5;
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
  let gW = 0, gH = 0, mesh, barEnv = null, bumpTex = null, compiled = false, tn = null, offN = 0, dOffNow = 0, barLift = 0, barHoldX = 0;
  let renderer, scene, camera, group, geo, base, tex, spot, halo, amb, flat, host, glowEl, vigEl, dimEl, canvasEl;
  let u = 0, uTarget = 0, uDur = 1.3, onArrive = null, pose0 = { d: 300, tx: 0, ty: LOOK.escena.camY }, zoomNow = LOOK.escena.zoom / 100, zoomTarget = zoomNow;
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
  function deform(penY, e) {
    const pos = geo.attributes.position;
    for (let j = 0; j < NY; j++) rows[j].s = base[(j * NX) * 3 + 1] - penY;
    solveElastica(H / 2 - penY - S0);
    for (let j = 0; j < NY; j++) {
      const r = rows[j];
      if (r.s <= S0) { r.cy = r.s; r.cz = 0; r.th = 0; continue; }
      const u = Math.min(elN - 1e-6, r.s - S0), i = Math.floor(u), f = u - i;
      r.cy = S0 + elY[i] * (1 - f) + elY[i + 1] * f; r.cz = elZ[i] * (1 - f) + elZ[i + 1] * f; r.th = elTh[i] * (1 - f) + elTh[i + 1] * f;
    }
    for (let j = 0; j < NY; j++) { const r = rows[j]; for (let i = 0; i < NX; i++) { const idx = j * NX + i; pos.setXYZ(idx, base[idx * 3], penY + r.s + (r.cy - r.s) * e, r.cz * e); } }
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
  function applyLight(time, e) {
    const l = LOOK.luz, lt = smooth(0.2, 1, e) * (1 - 0.25 * liftE()), ay = l.ay + liftMM(), t = rad(l.tilt), dx = Math.sin(t), dy = Math.cos(t), hl = rad(l.open / 2 + l.asym / 2), hr = rad(l.open / 2 - l.asym / 2), s = 0.02 + 0.98 * Math.pow(l.edge / 100, 1.3);
    U.uLA.value[0].set(l.ax, ay, dx, dy); U.uLB.value[0].set(Math.max(hl, 0.02), Math.max(hr, 0.02), s, l.reach); U.uLC.value[0].set(l.tip, l.bow / 100, l.core / 100, l.coreSize); U.uLD.value[0].set(l.fade / 100, 1, 0, 0);
    const ho = rad(l.haloOpen / 2), hs = 0.25 + 0.75 * (l.haloSoft / 100);
    U.uLA.value[1].set(l.ax, ay, dx, dy); U.uLB.value[1].set(ho, ho, hs, l.reach * 1.5); U.uLC.value[1].set(l.tip * 2, 0, 0, 1); U.uLD.value[1].set(0.8, 1, 0, 0);
    const flick = 1 + (l.flicker / 100) * 0.2 * (Math.sin(time * l.flickerSpeed * 2.1) * 0.5 + Math.sin(time * l.flickerSpeed * 5.3 + 1.7) * 0.3 + Math.sin(time * l.flickerSpeed * 11.7) * 0.2);
    const d = Math.hypot(l.dist, 90), cut = 1100 - l.falloff * 7, dec = 1 + l.falloff / 100, att = Math.pow(Math.max(0.12, 1 - d / cut), dec), att0 = Math.pow(1 - 150 / cut, dec);
    const b = (l.inten / 100) * Math.pow(150 / d, 0.45) * 1.25 * att0 / att * flick, sat = l.sat / 100;
    spot.color.copy(toColor(kelvin(l.temp), sat)); spot.intensity = b * lt; spot.distance = cut; spot.decay = dec; spot.position.set(l.ax, ay, l.dist); spot.target.position.set(l.ax + dx * 100, ay + dy * 100, 0);
    halo.color.copy(toColor(kelvin(l.temp - 500), sat)); halo.intensity = b * lt * (l.halo / 100) * (1.1 - 0.8 * l.dk / 100); halo.position.copy(spot.position); halo.target.position.copy(spot.target.position);
    amb.color.copy(toColor(kelvin(l.ambTemp), 1)); amb.intensity = (l.amb / 100) * (1 - 0.9 * l.dk / 100) * Math.min(1.5, l.inten / 100) * lt * (1 + 1.6 * liftE()); flat.intensity = 1.75 * (1 - smooth(0.2, 1, e));
    vigEl.style.opacity = (((l.vig / 100) * (0.45 + 0.55 * l.dk / 100)) * e).toFixed(2); dimEl.style.opacity = e.toFixed(3); vigEl.style.setProperty('--vs', (0.6 + 0.4 * l.dk / 100).toFixed(2)); vigEl.style.setProperty('--grain', (l.grain / 100).toFixed(3));
    const v = new T.Vector3(0, -8, 0).project(camera), gc = kelvin(l.temp - 300).map((x) => Math.round(x * 255)).join(' ');
    glowEl.style.setProperty('--gc', gc); glowEl.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
    glowEl.style.opacity = ((l.glow / 100) * (0.6 + 0.4 * Math.min(1, l.inten / 100)) * flick * e * (1 - liftE())).toFixed(2);
    updateBar(e, true, 1);
  }


  /* ---------- la barra de metal con la aleta por donde sale la luz ---------- */
  let barGroup, lampGroup, slitMat, glowSpr, barMats = [], slitY = 0, zc = 0;
  function buildBar(renderer) {
    const B = LOOK.barra;
    let envMap = null;
    try {
      const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256; const c = ec.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#565a66'); g.addColorStop(0.45, '#17181d'); g.addColorStop(1, '#08080b'); c.fillStyle = g; c.fillRect(0, 0, 512, 256);
      for (const [x, y, w, a] of [[70, 50, 110, 0.7], [340, 60, 130, 0.55], [210, 170, 170, 0.5], [470, 150, 90, 0.35]]) { const r = c.createRadialGradient(x, y, 2, x, y, w); r.addColorStop(0, `rgba(255,228,184,${a})`); r.addColorStop(1, 'rgba(255,228,184,0)'); c.fillStyle = r; c.fillRect(x - w, y - w, w * 2, w * 2); }
      const et = new T.CanvasTexture(ec); et.mapping = T.EquirectangularReflectionMapping; et.encoding = T.sRGBEncoding;
      envMap = new T.PMREMGenerator(renderer).fromEquirectangular(et).texture;
    } catch { envMap = null; }
    barEnv = envMap;
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 256; { const c = sc.getContext('2d'); c.fillStyle = '#808080'; c.fillRect(0, 0, 64, 256); for (let i = 0; i < 90; i++) { const v = 90 + Math.random() * 90; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(Math.random() * 64, 0, 0.6 + Math.random() * 1.2, 256); } }
    const brushed = new T.CanvasTexture(sc); brushed.wrapS = brushed.wrapT = T.RepeatWrapping;
    const d = B.dark / 100;
    const mk = () => { const m = new T.MeshStandardMaterial({ color: new T.Color(0x34353c).multiplyScalar(1 - 0.55 * d), metalness: 0.9, roughness: 0.4, envMap, envMapIntensity: 1.8 * (1 - 0.88 * d), bumpMap: brushed, bumpScale: 0.12 }); patchMat(m); barMats.push(m); return m; };
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128; { const c = glowC.getContext('2d'), g = c.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
    const shC = document.createElement('canvas'); shC.width = 8; shC.height = 64; { const c = shC.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 8, 64); }
    barGroup = new T.Group(); lampGroup = new T.Group(); scene.add(barGroup, lampGroup);
    zc = Math.max(B.z, B.hd / 2 + 1.5);
    const rod = new T.Mesh(new T.CylinderGeometry(B.thick / 2, B.thick / 2, B.len, 40), mk()); rod.rotation.z = Math.PI / 2; barGroup.add(rod);
    for (const sx of [-1, 1]) {
      const post = new T.Mesh(new T.BoxGeometry(7, B.thick + 8, zc + 2), mk()); post.position.set(sx * (B.len / 2 - 3), 0, -zc / 2 + 1); barGroup.add(post);
      const cap = new T.Mesh(new T.CylinderGeometry(B.thick / 2 + 1.2, B.thick / 2 + 1.2, 3, 32), mk()); cap.rotation.z = Math.PI / 2; cap.position.set(sx * (B.len / 2 + 1.5), 0, 0); barGroup.add(cap);
    }
    // aleta: una chapa finita con un labio hacia adelante, arriba, donde está la ranura
    const hh = B.hh / 2, hd = B.hd / 2, t = 1.3, lip = 2.4, sh = new T.Shape();
    [[-t, -hh], [t, -hh], [t, hh - lip], [hd, hh - lip], [hd, hh], [-t, hh]].forEach((q, i) => (i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1]))); sh.closePath();
    const eg = new T.ExtrudeGeometry(sh, { depth: B.hw, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3, curveSegments: 8 }); eg.translate(0, 0, -B.hw / 2); eg.rotateY(-Math.PI / 2);
    lampGroup.add(new T.Mesh(eg, mk()));
    slitMat = new T.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }); barMats.push(slitMat);
    const slit = new T.Mesh(new T.PlaneGeometry(B.hw * 0.82, Math.min(1.5, lip * 0.62)), slitMat); slit.position.set(0, hh - lip / 2, hd + 0.8); lampGroup.add(slit);
    slitY = hh - lip / 2;
    glowSpr = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(glowC), color: 0xffd9a0, blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
    glowSpr.position.set(0, slitY + 1.5, hd + 3.5); glowSpr.scale.set(16 + B.hw * 0.8, 16 + B.hw * 0.8, 1); lampGroup.add(glowSpr);
    const shadow = new T.Mesh(new T.PlaneGeometry(B.len, B.thick + 26), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shC), transparent: true, opacity: 0.55, depthWrite: false })); shadow.position.set(0, 0, -zc + 0.25); barGroup.add(shadow); barMats.push(shadow.material);
    barGroup.traverse((o) => { if (o.material) o.material.userData.o = o.material.opacity; }); lampGroup.traverse((o) => { if (o.material) o.material.userData.o = o.material.opacity; });
  }
  const liftE = () => barLift * barLift * (3 - 2 * barLift);
  // cuánto sube la barra (mm): hasta quedar por encima del borde de arriba de la hoja; la luz sube con ella
  const liftMM = () => liftE() * Math.max(0, group.position.y + H / 2 + 20 - (LOOK.luz.ay - LOOK.barra.off - slitY));
  function updateBar(e, on, flick) {
    const B = LOOK.barra, l = LOOK.luz, y = l.ay - B.off - slitY, vis = smooth(0.5, 1, e);
    barGroup.visible = lampGroup.visible = vis > 0;
    // al pasar una hoja la barra se aparta: sube por encima del borde de arriba de la hoja y vuelve cuando la hoja ya cayó
    const yy = y + liftMM();
    barGroup.position.set(group.position.x + (barHoldX - group.position.x) * liftE(), yy, zc); lampGroup.position.set(l.ax, yy, zc);
    const k = kelvin(Math.max(2200, l.temp + 500)), lit = (on ? B.slit / 100 : 0.04) * flick;
    slitMat.color.setRGB(Math.min(1, k[0] * lit + 0.1 * lit), Math.min(1, k[1] * lit + 0.08 * lit), Math.min(1, k[2] * lit));
    glowSpr.material.color.setRGB(k[0], k[1] * 0.92, k[2] * 0.8); glowSpr.material.opacity = on ? (B.glow / 100) * Math.min(1, 0.4 + B.slit / 160) * vis : 0;
    for (const m of barMats) { if (m === glowSpr.material || m === slitMat) continue; m.transparent = vis < 1 || m.userData.o < 1; m.opacity = (m.userData.o ?? 1) * vis; }
    slitMat.transparent = vis < 1; slitMat.opacity = vis;
  }


  /* ---------- el espiral del cuaderno, en 3D: aros de metal que siguen la hoja, agujeros y sombra de contacto ---------- */
  let ringMeshes = [], holeMeshes = [], aoMesh = null, ringMat = null, holeMat = null, aoMat = null, ringN = 0;
  function buildRings() {
    for (const m of [...ringMeshes, ...holeMeshes]) group.remove(m); if (aoMesh) group.remove(aoMesh);
    ringMeshes = []; holeMeshes = []; ringN = Math.max(8, Math.round(H / 11));
    const g = new T.TorusGeometry(4.3, 0.62, 10, 30); g.rotateX(Math.PI / 2); // un aro del espiral: queda en el plano de la hoja que pasa por el borde
    ringMat = new T.MeshStandardMaterial({ color: 0xb4b7c2, metalness: 0.95, roughness: 0.3, envMap: barEnv, envMapIntensity: 0.9 }); patchMat(ringMat);
    holeMat = new T.MeshBasicMaterial({ color: 0x0f0f14, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const hg = new T.CircleGeometry(1.5, 16);
    for (let i = 0; i < ringN; i++) {
      const r = new T.Mesh(g, ringMat); r.castShadow = true; r.receiveShadow = true; group.add(r); ringMeshes.push(r);
      const hl = new T.Mesh(hg, holeMat); group.add(hl); holeMeshes.push(hl);
    }
    // sombra de contacto del espiral sobre la hoja (más oscura pegada al borde)
    const c = document.createElement('canvas'); c.width = 128; c.height = 4; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.03, 'rgba(0,0,0,.35)'); gr.addColorStop(0.09, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 4);
    aoTex = new T.CanvasTexture(c); aoTex.wrapS = T.RepeatWrapping;
    aoMat = new T.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    aoMesh = new T.Mesh(geo, aoMat); aoMesh.renderOrder = 1; group.add(aoMesh);
  }
  let aoTex = null;
  function placeRings(penY, e, side) {
    if (!ringMeshes.length) return;
    const sgn = side === 'back' ? 1 : -1, ex = sgn * W / 2, inn = -sgn, vis = 1; // el espiral ya está desde el primer cuadro: coincide con el de la hoja normal
    const lerp = (a, b, t) => a + (b - a) * t;
    for (let i = 0; i < ringN; i++) {
      const jf = ((i + 0.5) / ringN) * (NY - 1), j0 = Math.floor(jf), f = jf - j0, a = rows[j0], b = rows[Math.min(NY - 1, j0 + 1)];
      const cy = lerp(a.cy, b.cy, f), cz = lerp(a.cz, b.cz, f), th = lerp(a.th, b.th, f), sn = Math.sin(th), cs = Math.cos(th);
      const r = ringMeshes[i]; r.position.set(ex + inn * 2.1, penY + cy, cz); r.rotation.set(th, 0, 0);
      const hl = holeMeshes[i]; hl.position.set(ex + inn * 5.8, penY + cy - sn * 0.06, cz + cs * 0.06); hl.rotation.set(th, 0, 0);
    }
    ringMat.transparent = vis < 1; ringMat.opacity = vis; holeMat.opacity = 0.85 * vis; aoMat.opacity = 0.9 * vis;
    aoTex.repeat.x = sgn > 0 ? -1 : 1; aoTex.offset.x = sgn > 0 ? 1 : 0; // la sombra de contacto va del lado del espiral
    for (const m of ringMeshes) m.visible = vis > 0; for (const m of holeMeshes) m.visible = vis > 0; aoMesh.visible = vis > 0;
  }

  /* ---------- armado de la escena ---------- */
  async function init() {
    await loadThree(); T = window.THREE;
    host = $('#focus3d'); glowEl = $('.f3-glow', host); vigEl = $('.f3-vig', host); dimEl = $('.f3-dim', host);
    const canvas = canvasEl = $('canvas', host);
    NY = matchMedia('(pointer: coarse)').matches ? 300 : 480; for (let j = 0; j < NY; j++) rows.push({ s: 0, cy: 0, cz: 0, th: 0 });
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    scene = new T.Scene(); camera = new T.PerspectiveCamera(32, 16 / 9, 10, 2000);
    geo = new T.PlaneGeometry(W, H, NX - 1, NY - 1); base = geo.attributes.position.array.slice(); gW = W; gH = H;
    tex = new T.CanvasTexture(h.writer().cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 724; const bx = bc.getContext('2d'), bimg = bx.createImageData(512, 724);
    for (let i = 0; i < bimg.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 40; bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v; bimg.data[i + 3] = 255; } bx.putImageData(bimg, 0, 0);
    const mat = new T.MeshStandardMaterial({ map: tex, bumpMap: (bumpTex = new T.CanvasTexture(bc)), bumpScale: 0.12, roughness: 0.92, metalness: 0, side: T.DoubleSide });
    Object.assign(U, { uLA: { value: [new T.Vector4(), new T.Vector4()] }, uLB: { value: [new T.Vector4(), new T.Vector4()] }, uLC: { value: [new T.Vector4(), new T.Vector4()] }, uLD: { value: [new T.Vector4(), new T.Vector4()] }, uCore: { value: new T.Vector2(0, -8) } });
    patchMat(mat);
    mesh = new T.Mesh(geo, mat); group = new T.Group(); group.add(mesh); scene.add(group);
    amb = new T.AmbientLight(0xffdcb8, 0.1); scene.add(amb);
    spot = new T.SpotLight(0xffcf98, 1, 430, 1.5, 0.15, 2); scene.add(spot, spot.target);
    halo = new T.SpotLight(0xffa862, 0.4, 760, 1.5, 0.15, 1.4); scene.add(halo, halo.target);
    flat = new T.HemisphereLight(0xfff8ec, 0xa8a8b4, 1.75); scene.add(flat); // luz pareja del arranque: la hoja se ve como la hoja normal
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    spot.castShadow = true; spot.angle = 1.1; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 40; spot.shadow.camera.far = 700; spot.shadow.bias = -0.0008; spot.shadow.radius = 3;
    mesh.receiveShadow = true;
    buildBar(renderer); buildRings();
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); $('#cap')?.focus({ preventScroll: true }); });
    addEventListener('resize', () => { if (running) resize(); });
    ready = true;
  }
  function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
  const fovT = () => Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  // distancia final de la cámara (según el zoom elegido y la forma de la pantalla)
  function endDist() { const asp = innerWidth / innerHeight, extent = asp < 1.1 ? (210 * 0.95 / asp) * (zoomNow / 0.61) : 297 * 1.08 * zoomNow; /* medidas de A4: una hoja A5 se ve más chica, como es */ return (extent * 0.5) / fovT(); }
  // pose de partida/llegada: la hoja plana ocupa exactamente el rectángulo de la hoja normal (px de pantalla)
  function setPose0(rect) {
    const ppm = rect.width / W;
    pose0 = { d: (innerHeight / 2) / (fovT() * ppm), tx: (innerWidth / 2 - (rect.left + rect.width / 2)) / ppm, ty: (rect.top + rect.height / 2 - innerHeight / 2) / ppm };
  }
  const clipOf = (r) => `inset(${Math.max(0, r.top)}px ${Math.max(0, innerWidth - r.right)}px ${Math.max(0, innerHeight - r.bottom)}px ${Math.max(0, r.left)}px)`;
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- cuadro a cuadro ---------- */
  const pen = { x: 0, y: 0 }; let first = true, prevX = 0, last = 0, lastTy = 0, ret = null;
  function frame(now) {
    raf = 0; if (!running) return;
    const w = h.writer(), c = w._pen, reduce = !h.animOn(), dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    if (c && c.page === w.page) {
      if (first) { pen.x = c.x; pen.y = c.y; lastTy = c.y; first = false; prevX = pen.x; }
      else {
        // al saltar de renglón la hoja se corre de golpe, como el carro de una máquina de escribir: rápido y con un pequeño rebote al frenar
        if (Math.abs(c.y - lastTy) > 2.5) ret = reduce ? null : { t: 0, x0: pen.x, y0: pen.y };
        lastTy = c.y;
        if (ret) { ret.t += dt / 0.13; const uu = Math.min(1, ret.t), v = uu - 1, k2 = 1 + 2.4 * v * v * v + 1.4 * v * v; pen.x = ret.x0 + (c.x - ret.x0) * k2; pen.y = ret.y0 + (c.y - ret.y0) * k2; if (uu >= 1) ret = null; }
        else { const k = reduce ? 1 : 1 - Math.pow(tn ? 0.04 : 0.0009, dt); pen.x += (c.x - pen.x) * k; pen.y += (c.y - pen.y) * k; }
      }
    }
    last = now;
    const wl = w.layout, ff = wl && wl.faces[w.page], side = ff ? ff.side : 'front', targetOff = side === 'back' ? -W : 0;
    // las páginas del cuaderno abierto: el frente está a la derecha del espiral y el dorso a la izquierda; la cámara se corre de una a otra con suavidad
    offN += (targetOff - offN) * (reduce ? 1 : 1 - Math.pow(tn ? 0.04 : 0.0009, dt)); const dOff = targetOff - offN; dOffNow = dOff;
    // avance de la transición de entrada/salida
    if (u !== uTarget) { u = reduce ? uTarget : (uTarget > u ? Math.min(uTarget, u + dt / uDur) : Math.max(uTarget, u - dt / uDur)); if (u === uTarget && onArrive) { const f = onArrive; onArrive = null; f(); } }
    zoomNow += (zoomTarget - zoomNow) * (reduce ? 1 : 1 - Math.pow(0.002, dt));
    const e = ease(u);
    if (texDirty) { tex.needsUpdate = true; texDirty = false; }
    const lx = pen.x - W / 2, ly = H / 2 - pen.y;
    deform(ly, e);
    placeRings(ly, e, side);
    const yaw = -(lx / (W / 2)) * 0.16 * P.yaw * e, roll = T.MathUtils.clamp((pen.x - prevX) * -0.0009 * 5.1, -0.05, 0.05) * P.yaw * 6 * e; prevX = pen.x;
    group.rotation.set(0, yaw, roll);
    group.position.set(lx, ly, 0).applyEuler(group.rotation).negate().multiplyScalar(e); // la punta queda siempre en el origen
    group.position.x += dOff * e;
    { const want = tn && tn.leaf && tn.t < 0.97 ? 1 : 0; if (want && barLift === 0) barHoldX = group.position.x; barLift = want ? Math.min(1, barLift + dt / 0.3) : Math.max(0, barLift - dt / 0.38); }
    if (tn) stepTurn(dt, dOff);
    const dEnd = endDist(), d = Math.exp(lerp(Math.log(pose0.d), Math.log(dEnd), e)), el = lerp(0, T.MathUtils.degToRad(P.elev), e), tx = lerp(pose0.tx, 0, e), ty = lerp(pose0.ty, LOOK.escena.camY, e);
    camera.position.set(tx, ty + d * Math.sin(el), d * Math.cos(el)); camera.lookAt(tx, ty, 0); camera.updateMatrixWorld();
    applyLight(now / 1000, e);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }


  /* ---------- pasar las hojas en 3D, alrededor del espiral (mismo movimiento que en la vista normal, ver js/hojas.js) ---------- */
  const TEXPPM = 1100 / 210;
  const faceCanvas = (idx) => { const c = document.createElement('canvas'); h.writer().renderPageTo(c, idx, TEXPPM); return c; };
  const blankCanvas = () => { const c = document.createElement('canvas'); c.width = Math.round(W * TEXPPM); c.height = Math.round(H * TEXPPM); drawPaper(c.getContext('2d'), TEXPPM, h.S().paper); return c; };
  const flipped = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; };
  function matFor(canvas) {
    const t = new T.CanvasTexture(canvas); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const m = new T.MeshStandardMaterial({ map: t, bumpMap: bumpTex, bumpScale: 0.12, roughness: 0.92, metalness: 0, side: T.DoubleSide }); patchMat(m); return m;
  }
  async function turn(src, dst, change) {
    const kind = classify(src, dst), reduce = !h.animOn();
    if (!kind || !running || tn || reduce || u < 1) { change(); return; }
    const w = h.writer(), L = w.layout, blank = blankCanvas();
    const cv = (s, side) => { const idx = s >= 0 ? L.sheets[s]?.[side] : null; return idx != null ? faceCanvas(idx) : blank; };
    const s = src.sheet, t = dst.sheet, pages = []; let leaf = null;
    // qué se ve (misma idea que en la vista normal): la hoja que gira, la que queda debajo y la de la izquierda
    if (kind === 'A') { pages.push([-W, cv(s - 1, 'back')], [0, cv(s + 1, 'front')]); leaf = { f: cv(s, 'front'), b: cv(s, 'back'), a0: 0, a1: -180 }; }
    else if (kind === 'A-') { pages.push([-W, cv(s - 1, 'back')], [0, cv(s + 1, 'front')]); leaf = { f: cv(s, 'front'), b: cv(s, 'back'), a0: -180, a1: 0 }; }
    else if (kind === 'B') { pages.push([-W, cv(s, 'back')], [0, cv(s + 1, 'front')]); }
    else if (kind === 'B-') { pages.push([-W, cv(t, 'back')], [0, cv(s, 'front')]); }
    else if (kind === 'C') { pages.push([-W, cv(s - 1, 'back')], [0, cv(t, 'front')]); leaf = { f: cv(s, 'front'), b: cv(s, 'back'), a0: 0, a1: -180 }; }
    else { pages.push([-W, cv(t - 1, 'back')], [0, cv(s, 'front')]); leaf = { f: cv(t, 'front'), b: cv(t, 'back'), a0: -180, a1: 0 }; }
    const props = [], mats = [];
    for (const [off, c] of pages) { const m = matFor(c); mats.push(m); const root = new T.Object3D(), me = new T.Mesh(geo, m); me.position.z = -0.5; root.add(me); scene.add(root); props.push({ root, off }); }
    let L2 = null;
    if (leaf) {
      const mF = matFor(leaf.f), mB = matFor(flipped(leaf.b)); mats.push(mF, mB);
      const root = new T.Object3D(), pivot = new T.Object3D(), me = new T.Mesh(geo, mF); pivot.position.x = -W / 2; me.position.x = W / 2; pivot.add(me); root.add(pivot); scene.add(root);
      props.push({ root, off: 0 }); L2 = { pivot, me, mF, mB, a0: leaf.a0, a1: leaf.a1 };
    }
    mesh.visible = false; if (aoMesh) aoMesh.visible = false;
    h.sound?.fold?.();
    if (!leaf) change(); // sin hoja que cruce: se cambia de cara ya (la hoja de verdad queda escondida hasta que termine el giro)
    await new Promise((res) => { tn = { props, mats, leaf: L2, t: 0, dur: leaf ? 0.9 : 0.62, res, age: 0, change, wait: !!leaf }; });
  }
  const tEase = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function stepTurn(dt, dOff) {
    tn.age += dt;
    // con hoja que cruza: primero la barra se aparta (la hoja y la cámara esperan quietas) y recién ahí cambia la cara y empieza el giro
    if (tn.wait) { if (liftE() >= 0.93 || tn.age > 1) { tn.wait = false; tn.change(); } }
    else tn.t = Math.min(1, tn.t + dt / tn.dur);
    const base = group.position.x - dOff * 1;
    for (const p of tn.props) { p.root.position.set(base + (p.off - offN) , group.position.y, group.position.z); p.root.rotation.copy(group.rotation); }
    if (tn.leaf) {
      const lf = tn.leaf, k = tEase(tn.t), a = lf.a0 + (lf.a1 - lf.a0) * k;
      lf.pivot.rotation.y = a * Math.PI / 180; lf.me.position.z = 0.25 + 7 * Math.sin(Math.PI * k); // se levanta un poco al cruzar el espiral
      lf.me.material = Math.abs(a) > 90 ? lf.mB : lf.mF; // pasados los 90° se ve el dorso (la imagen ya está espejada para que se lea bien)
    }
    // termina cuando el giro acabó y la cámara ya llegó a la nueva página (o si tarda demasiado)
    if ((tn.t >= 1 && Math.abs(dOff) < 0.8 && barLift < 0.03) || tn.age > 4) {
      const done = tn.res; mesh.visible = true; if (aoMesh) aoMesh.visible = true;
      for (const p of tn.props) scene.remove(p.root);
      for (const m of tn.mats) { if (m.map) m.map.dispose(); m.dispose(); }
      tn = null; done();
    }
  }

  return {
    ready: () => ready,
    // prepara todo antes (three.js, shaders, texturas) para que al entrar al foco no haya que esperar
    async prepare() {
      if (!ready) await init();
      if (!compiled) { try { renderer.compile(scene, camera); renderer.initTexture(tex); renderer.initTexture(bumpTex); } catch { /* sigue */ } compiled = true; }
    },
    // arranca desde la hoja normal (rect = su rectángulo en pantalla; clip = la zona visible de la hoja)
    async start({ rect, clip, dur } = {}) {
      await this.prepare();
      if (gW !== W || gH !== H) { geo.dispose(); geo = new T.PlaneGeometry(W, H, NX - 1, NY - 1); base = geo.attributes.position.array.slice(); gW = W; gH = H; mesh.geometry = geo; elKey = ''; buildRings(); } // la hoja cambió de tamaño (A4 / A5)
      running = true; first = true; ret = null; tn = null; barLift = 0; mesh.visible = true; texDirty = true; last = performance.now(); u = 0; uTarget = 1; uDur = dur || 1.3; onArrive = null;
      { const fw = h.writer().layout?.faces[h.writer().page]; offN = fw && fw.side === 'back' ? -W : 0; }
      zoomNow = zoomTarget = LOOK.escena.zoom / 100 * (h.viewFactor?.() || 1);
      host.hidden = false; resize(); setPose0(rect || { left: innerWidth * 0.2, top: 0, width: innerWidth * 0.6, height: innerWidth * 0.6 * H / W });
      if (clip) { canvasEl.style.transition = 'none'; canvasEl.style.clipPath = clipOf(clip); void canvasEl.offsetWidth; canvasEl.style.transition = `clip-path ${uDur}s cubic-bezier(.45,0,.2,1)`; }
      h.writer().onDraw = () => { texDirty = true; };
      // el primer cuadro se dibuja ANTES de mostrar el lienzo: no queda un instante con la hoja normal sola
      host.style.transition = 'none'; frame(performance.now());
      host.classList.add('on');
      if (clip) requestAnimationFrame(() => { canvasEl.style.clipPath = 'inset(0px)'; });
    },
    // vuelve a la hoja normal (rect/clip = donde quedará) y recién entonces se apaga
    stop({ rect, clip, dur, beforeHide } = {}) {
      return new Promise((done) => {
        if (!running) { done(); return; }
        if (rect) setPose0(rect);
        uDur = dur || 1.0; uTarget = 0;
        if (clip) { canvasEl.style.transition = `clip-path ${uDur}s cubic-bezier(.45,0,.2,1)`; canvasEl.style.clipPath = clipOf(clip); }
        const fin = async () => {
          running = false; cancelAnimationFrame(raf); raf = 0; const w = h.writer(); if (w) w.onDraw = null;
          if (tn) { if (tn.wait) tn.change(); mesh.visible = true; if (aoMesh) aoMesh.visible = true; for (const p of tn.props) scene.remove(p.root); const r = tn.res; tn = null; r(); }
          try { await beforeHide?.(); } catch { /* sigue */ } // la hoja normal vuelve a estar debajo antes de apagar la 3D
          host.classList.remove('on'); host.hidden = true; done();
        };
        onArrive = fin; if (u === 0) { onArrive = null; fin(); }
      });
    },
    turn, isTurning: () => !!tn,
    setView(f) { zoomTarget = LOOK.escena.zoom / 100 * f; }, // 1 = ancho, >1 = más lejos, <1 = más cerca
    isRunning: () => running,
  };
}
