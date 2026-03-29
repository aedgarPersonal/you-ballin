/**
 * Retro Sound Effects (Web Audio API)
 * ====================================
 * 8-bit style sound effects for UI interactions.
 * All sounds are generated programmatically — no audio files needed.
 */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency, duration, type = "square", volume = 0.08) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available — fail silently
  }
}

function playSequence(notes, volume = 0.08) {
  const ctx = getCtx();
  let time = ctx.currentTime;
  for (const [freq, dur, type] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
    time += dur * 0.8;
  }
}

/** Buzzer — game start / teams set */
export function playBuzzer() {
  playTone(220, 0.15, "square", 0.06);
  setTimeout(() => playTone(220, 0.4, "square", 0.06), 180);
}

/** Whistle — team assignments / game complete */
export function playWhistle() {
  playSequence([
    [880, 0.12, "sine"],
    [1200, 0.08, "sine"],
    [880, 0.25, "sine"],
  ], 0.06);
}

/** Crowd cheer — game completed / MVP announced */
export function playCrowdCheer() {
  // White noise burst simulating crowd
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {
    // fail silently
  }
}

/** Coin insert — login / register */
export function playCoinInsert() {
  playSequence([
    [988, 0.08, "square"],
    [1319, 0.15, "square"],
  ], 0.07);
}

/** Select blip — button hover / navigation */
export function playSelect() {
  playTone(660, 0.06, "square", 0.04);
}

/** Success jingle — vote cast / RSVP confirmed */
export function playSuccess() {
  playSequence([
    [523, 0.1, "square"],
    [659, 0.1, "square"],
    [784, 0.15, "square"],
  ], 0.06);
}

/** Error — failed action */
export function playError() {
  playSequence([
    [200, 0.15, "square"],
    [150, 0.25, "square"],
  ], 0.06);
}
