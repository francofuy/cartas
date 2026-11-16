// Sonido de la lapicera: se sintetiza con Web Audio (ruido filtrado), sin archivos de audio.
// Cada instrumento suena distinto y cada trazo es distinto de los demás (tramo de ruido, filtro y fuerza al azar).
// Todo es muy suave a propósito. Se puede silenciar y regular el volumen.

const rnd = (a, b) => a + Math.random() * (b - a);

// carácter de cada instrumento (frecuencias en Hz, ganancias de 0 a 1)
const VOICES = {
  ballpoint: { noise: 'white', type: 'bandpass', f: [2200, 4300], q: 0.9, peak: 0.30, bumps: 3, grain: 0, attack: 0.008, release: 0.04, tick: 0.07, rate: [0.94, 1.1] },
  pencil: { noise: 'white', type: 'bandpass', f: [2800, 5600], q: 0.6, peak: 0.36, bumps: 2, grain: 0.55, attack: 0.006, release: 0.035, tick: 0.04, rate: [0.9, 1.15] },
  fountain: { noise: 'pink', type: 'bandpass', f: [1500, 2600], q: 0.7, peak: 0.22, bumps: 2, grain: 0.08, attack: 0.028, release: 0.07, tick: 0.03, rate: [0.9, 1.05] },
  marker: { noise: 'pink', type: 'bandpass', f: [1200, 2200], q: 0.8, peak: 0.30, bumps: 2, grain: 0.12, attack: 0.02, release: 0.06, tick: 0.05, rate: [0.88, 1.0], squeak: 0.35 },
};

export class PenSound {
  // opciones: { ctx } para usar un contexto ya armado (pruebas fuera de línea)
  constructor(opts = {}) {
    this.ext = opts.ctx || null;
    this.ctx = this.ext;
    this.enabled = true;
    this.volume = 0.5;
    this.bufs = null;
    if (this.ctx) this.build();
  }

  configure({ enabled, volume }) {
    if (enabled != null) this.enabled = !!enabled;
    if (volume != null) { this.volume = Math.max(0, Math.min(1, volume)); if (this.master) this.master.gain.value = this.level(); }
  }
  level() { return this.volume * this.volume * 0.9; } // curva suave: el volumen bajo es bien bajo

  // los navegadores solo dejan sonar después de un gesto del usuario
  unlock() {
    if (!this.ctx && !this.ext) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch { return false; }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.();
    return true;
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.level();
    const comp = c.createDynamicsCompressor(); // evita que se sume y distorsione cuando se solapan trazos
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    this.master.connect(comp); comp.connect(c.destination);
    // dos tiras largas de ruido (blanco y rosa); cada trazo usa un pedacito distinto
    const len = Math.floor(c.sampleRate * 6);
    const white = c.createBuffer(1, len, c.sampleRate), pink = c.createBuffer(1, len, c.sampleRate);
    const w = white.getChannelData(0), p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x * 0.9;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    }
    this.bufs = { white, pink };
  }

  ok() { return this.enabled && this.volume > 0.001 && this.ctx && this.bufs && (this.ext || !document.hidden) && this.ctx.state !== 'closed'; }

  // un trazo (una letra) que dura `dur` segundos
  stroke(inst, ch, dur, when) {
    if (!this.ok()) return;
    const V = VOICES[inst] || VOICES.ballpoint, c = this.ctx, t0 = (when != null ? when : c.currentTime) + 0.005;
    const punct = /[.,;:!?¿¡'"-]/.test(ch);
    const len = Math.max(0.045, Math.min(0.9, punct ? rnd(0.04, 0.08) : dur * rnd(0.82, 1.0)));
    const strength = (punct ? 0.7 : 1) * (/[A-ZÁÉÍÓÚÑ]/.test(ch) ? 1.12 : 1) * rnd(0.75, 1.2);
    const peak = V.peak * strength;

    const src = c.createBufferSource();
    src.buffer = this.bufs[V.noise];
    src.playbackRate.value = rnd(V.rate[0], V.rate[1]);
    const offset = rnd(0, src.buffer.duration - len - 0.1);

    // el filtro se mueve un poco durante el trazo, como la mano
    const f = c.createBiquadFilter(); f.type = V.type;
    const f0 = rnd(V.f[0], V.f[1]); f.frequency.setValueAtTime(f0, t0); f.frequency.linearRampToValueAtTime(f0 * rnd(0.82, 1.22), t0 + len);
    f.Q.value = V.q * rnd(0.8, 1.25);

    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + V.attack);
    // la presión sube y baja durante el trazo
    for (let i = 1; i <= V.bumps; i++) env.gain.linearRampToValueAtTime(peak * rnd(0.55, 1.05), t0 + V.attack + ((len - V.attack) * i) / (V.bumps + 1));
    // el lápiz es áspero: la fuerza se entrecorta de a pedacitos
    if (V.grain) for (let tt = t0 + V.attack + 0.01; tt < t0 + len - 0.02; tt += rnd(0.012, 0.024)) env.gain.linearRampToValueAtTime(peak * rnd(1 - V.grain, 1.05), tt);
    env.gain.linearRampToValueAtTime(0.0001, t0 + len + V.release);

    src.connect(f); f.connect(env); env.connect(this.master);
    src.start(t0, offset, len + V.release + 0.02);

    // golpecito de la punta al apoyarse (bolígrafo, lápiz y pluma)
    if (V.tick && !punct) {
      const s2 = c.createBufferSource(); s2.buffer = this.bufs.pink;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(380, 620);
      const g = c.createGain(); g.gain.setValueAtTime(V.tick * rnd(0.6, 1.2), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028);
      s2.connect(lp); lp.connect(g); g.connect(this.master); s2.start(t0, rnd(0, 4), 0.04);
    }
    // el fibrón chilla de vez en cuando (muy bajito)
    if (V.squeak && Math.random() < V.squeak && !punct) {
      const o = c.createOscillator(); o.type = 'sine';
      const fr = rnd(780, 1250); o.frequency.setValueAtTime(fr, t0); o.frequency.linearRampToValueAtTime(fr * rnd(0.85, 1.2), t0 + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(rnd(0.012, 0.03), t0 + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + len + 0.02);
    }
  }

  // borrar: un frotado corto de ida y vuelta
  erase(n, when) {
    if (!this.ok()) return;
    const c = this.ctx, t0 = (when != null ? when : c.currentTime) + 0.005;
    const len = Math.min(0.55, 0.09 + 0.035 * Math.min(n || 1, 12));
    const src = c.createBufferSource(); src.buffer = this.bufs.white;
    const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = rnd(2200, 3400); hp.Q.value = 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
    const swings = Math.max(2, Math.round(len / 0.07));
    for (let i = 0; i < swings; i++) { const tt = t0 + (len * (i + 0.5)) / swings; g.gain.linearRampToValueAtTime(rnd(0.12, 0.22), tt); g.gain.linearRampToValueAtTime(0.05, tt + len / swings / 2); }
    g.gain.linearRampToValueAtTime(0.0001, t0 + len);
    src.connect(hp); hp.connect(g); g.connect(this.master); src.start(t0, rnd(0, 4.5), len + 0.02);
  }

  // una muestra para oír cómo suena (al tocar el volumen o cambiar de instrumento)
  preview(inst) {
    if (!this.unlock() || !this.ok()) return;
    const t = this.ctx.currentTime;
    'Hola'.split('').forEach((ch, i) => this.stroke(inst, ch, rnd(0.16, 0.26), t + i * 0.16));
  }
}
