// Sonido de piedra sintetizado con Web Audio API (sin archivos de audio).
let ctx = null;

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// "Clack" corto: ráfaga de ruido filtrada + un golpe tonal grave, ambos con caída rápida.
export function playStone() {
  const ac = getContext();
  if (!ac) return;
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
