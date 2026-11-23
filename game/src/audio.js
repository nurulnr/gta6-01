// Every sound in the game is synthesised live with the Web Audio API, so no
// audio files ship and the game stays offline and self-contained: the engine
// hum, the police siren, punches and crashes, and a lazy sunset-radio loop of
// warm chords and a bass line.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Call from a user gesture at least once; browsers keep audio locked until
  // then. Safe to call repeatedly — it only builds the graph the first time.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.buildEngineLoop();
      this.buildRadioLoop();
    } catch {
      // Sound stays off; the game plays fine without it.
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    if (muted) this.ctx.suspend();
    else this.ctx.resume();
  }

  // One short oscillator note, optionally sliding down to another pitch.
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol || 0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // A note that cannot play is not worth stopping the game over.
    }
  }

  // A burst of filtered noise: impacts, punches, crashes.
  noise(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = vol || 0.2;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff || 1200;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t);
    } catch {
      // As above: keep playing.
    }
  }

  buildEngineLoop() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    gain.gain.value = 0;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  // speed01 runs 0 (idle) to 1 (flat out). Called every frame while driving.
  engine(speed01, driving) {
    if (!this.engineOsc) return;
    const target = driving && !this.muted ? 0.05 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 720;
      gain.gain.value = this.muted ? 0 : 0.035;
      lfo.frequency.value = 0.55;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      lfo.start();
      this.sirenOsc = osc;
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenLfo.stop();
      } catch {
        // Already stopped.
      }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  punch() {
    this.noise(0.12, 0.35, 700);
    this.tone(90, 0.12, 'sine', 0.3, 45);
  }

  crash() {
    this.noise(0.3, 0.4, 900);
    this.tone(70, 0.25, 'square', 0.12, 40);
  }

  pickup() {
    this.tone(880, 0.1, 'sine', 0.2);
    setTimeout(() => this.tone(1320, 0.16, 'sine', 0.2), 90);
  }

  honk() {
    this.tone(370, 0.22, 'square', 0.08);
  }

  busted() {
    this.tone(220, 0.5, 'sawtooth', 0.18, 110);
  }

  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.22, 'triangle', 0.2), i * 110);
    });
  }

  click() {
    this.tone(1200, 0.05, 'square', 0.08);
  }

  // SOLMARA FM: a warm pad chord that changes every bar over a soft bass
  // line, scheduled a bar ahead so it never stutters.
  buildRadioLoop() {
    const chords = [
      [220, 277, 330],
      [174, 220, 261],
      [196, 246, 293],
      [164, 207, 246],
    ];
    const bassNotes = [110, 87, 98, 82];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = this.musicStep % 4;
      const t = this.ctx.currentTime + 0.05;
      for (const freq of chords[bar]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.035, t + 0.4);
        gain.gain.linearRampToValueAtTime(0.0001, t + 1.9);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 2);
      }
      const bass = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bass.type = 'sine';
      bass.frequency.value = bassNotes[bar];
      bassGain.gain.setValueAtTime(0.05, t);
      bassGain.gain.linearRampToValueAtTime(0.0001, t + 1.8);
      bass.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bass.start(t);
      bass.stop(t + 1.9);
      this.musicStep += 1;
    }, 2000);
  }
}
