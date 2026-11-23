// All sound is synthesised with Web Audio: no audio files, no network. The
// engine is a pair of detuned oscillators whose pitch follows the car's speed,
// the siren is a two-tone loop, gunfire and pickups are short noise bursts and
// blips, and the radio is a slow chord arpeggio. Nothing starts until the
// player presses a key or clicks, so browsers never block it.
export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let radioTimer = null;
  let radioOn = false;
  const CHORDS = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
    [164.81, 220.0, 261.63],
  ];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    unlock() {
      ensure();
    },
    // speed01: 0 parked, 1 flat out. Call every frame while driving.
    engine(speed01, on) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 165, t, 0.06);
      engineOsc2.frequency.setTargetAtTime(26 + speed01 * 82, t, 0.06);
    },
    siren(on) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      if (on) {
        sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
        const now = ctx.currentTime;
        sirenOsc.frequency.cancelScheduledValues(now);
        sirenOsc.frequency.setValueAtTime(720, now);
        sirenOsc.frequency.linearRampToValueAtTime(960, now + 0.4);
        sirenOsc.frequency.linearRampToValueAtTime(720, now + 0.8);
      } else {
        sirenGain.gain.setTargetAtTime(0, t, 0.1);
      }
    },
    // The siren wail steps between its two tones; call once a second while wanted.
    sirenStep(high) {
      if (!ensure() || !sirenOsc) return;
      sirenOsc.frequency.setTargetAtTime(high ? 960 : 720, ctx.currentTime, 0.05);
    },
    gunshot() {
      noise(0.14, 0.5, 900);
      blip(160, 0.1, 'square', 0.25, 60);
    },
    thud() {
      noise(0.12, 0.35, 300);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.22, 1320);
    },
    cash() {
      blip(660, 0.1, 'triangle', 0.2);
      setTimeout(() => blip(990, 0.16, 'triangle', 0.2), 90);
    },
    missionDone() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110);
      });
    },
    busted() {
      [392, 311, 233].forEach((f, i) => {
        setTimeout(() => blip(f, 0.3, 'sawtooth', 0.16), i * 160);
      });
    },
    radio(on) {
      if (on === radioOn) return;
      radioOn = on;
      if (!on) {
        if (radioTimer) clearInterval(radioTimer);
        radioTimer = null;
        return;
      }
      if (!ensure()) return;
      let chord = 0;
      let note = 0;
      radioTimer = setInterval(() => {
        if (!radioOn || !ctx) return;
        const tones = CHORDS[chord % CHORDS.length];
        blip(tones[note % tones.length] * 2, 0.5, 'sine', 0.05);
        note += 1;
        if (note % 8 === 0) chord += 1;
      }, 240);
    },
  };
}
