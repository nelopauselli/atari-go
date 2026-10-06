// Sonidos de partida: grabaciones reales (CC0, ver /sounds/CREDITS.md) reproducidas con Web Audio API.
// Si las piedras todavía no cargaron o fallaron, se usa un "clack" sintetizado.
const range = (n, name) => Array.from({ length: n }, (_, i) => `/sounds/${name}-${i + 1}.mp3`);

// gain: volumen relativo de cada sonido (las capturas y el tic suenan más fuertes que la piedra).
const SAMPLES = {
  stone: { urls: range(12, 'stone'), gain: 1 },
  capture: { urls: range(2, 'capture'), gain: 0.5 },
  tick: { urls: ['/sounds/tick.mp3'], gain: 0.4 },
};

let ctx = null;
const buffers = {}; // nombre -> AudioBuffer[]
const lastIndex = {};
let loading = null;

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Precarga las grabaciones. Decodifica con un OfflineAudioContext para no crear el
 * AudioContext antes de una interacción del usuario (los AudioBuffer sirven en cualquier contexto).
 */
export function preloadSounds() {
  if (!loading) {
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return Promise.resolve();
    const decoder = new OfflineCtx(1, 1, 44100);
    loading = Promise.all(Object.entries(SAMPLES).map(async ([name, { urls }]) => {
      buffers[name] = await Promise.all(urls.map(async (url) => {
        const res = await fetch(url);
        return decoder.decodeAudioData(await res.arrayBuffer());
      }));
    })).catch(() => { loading = null; });
  }
  return loading;
}

/** Reproduce una variante al azar (sin repetir la anterior). Devuelve false si todavía no cargó. */
function playSample(name, { delay = 0, detune = 0.03 } = {}) {
  const ac = getContext();
  if (!ac) return true;
  const list = buffers[name];
  if (!list || !list.length) {
    preloadSounds();
    return false;
  }
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastIndex[name]) i = (i + 1) % list.length;
  lastIndex[name] = i;
  const src = ac.createBufferSource();
  src.buffer = list[i];
  src.playbackRate.value = 1 - detune + Math.random() * detune * 2;
  const gain = ac.createGain();
  gain.gain.value = SAMPLES[name].gain;
  src.connect(gain).connect(ac.destination);
  src.start(ac.currentTime + delay);
  return true;
}

export function playStone() {
  if (!playSample('stone')) {
    const ac = getContext();
    if (ac) playSynthStone(ac);
  }
}

/** Piedras capturadas: se demora un poco para que suene después del golpe de la piedra. */
export function playCapture() {
  playSample('capture', { delay: 0.12 });
}

/** Tic de tiempo por agotarse. */
export function playTick() {
  playSample('tick', { detune: 0 });
}

// "Clack" corto: ráfaga de ruido filtrada + un golpe tonal grave, ambos con caída rápida.
function playSynthStone(ac) {
  const now = ac.currentTime;

  const length = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.2;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.6, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  noise.connect(filter).connect(noiseGain).connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.35, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  osc.connect(oscGain).connect(ac.destination);

  noise.start(now);
  osc.start(now);
  noise.stop(now + 0.09);
  osc.stop(now + 0.08);
}
