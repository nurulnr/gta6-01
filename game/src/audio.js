// All sound is synthesised with the Web Audio API: no audio files are shipped,
// so the game stays offline and self-contained. The engine hum, sirens, punches
// and the sunset radio loop are all small oscillators and noise buffers.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture at least once; browsers block audio before it.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.startEngine();
      this.startMusic();
    } catch { /* sound stays off; the game plays fine without it */ }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.ctx.suspend();
    if (!muted && this.ctx) this.ctx.resume();
  }

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
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.value = vol || 0.2;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t);
    } catch { /* ignore */ }
  }

  startEngine() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.engineOsc = osc; this.engineGain = gain;
  }

  // speed01: 0 idle .. 1 flat out. Called every frame while driving.
  engine(speed01, on) {
    if (!this.engineOsc) return;
    const target = on && !this.muted ? 0.05 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 720;
      gain.gain.value = this.muted ? 0 : 0.035;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(); lfo.start();
      this.sirenOsc = osc; this.sirenGain = gain; this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null; this.sirenGain = null;
    }
  }

  punch() { this.noise(0.12, 0.35, 700); this.tone(90, 0.12, 'sine', 0.3, 45); }
  crash() { this.noise(0.3, 0.4, 900); this.tone(70, 0.25, 'square', 0.12, 40); }
  pickup() { this.tone(880, 0.1, 'sine', 0.2); setTimeout(() => this.tone(1320, 0.16, 'sine', 0.2), 90); }
  honk() { this.tone(370, 0.22, 'square', 0.08); }
  busted() { this.tone(220, 0.5, 'sawtooth', 0.18, 110); }
  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 110));
  }
  click() { this.tone(1200, 0.05, 'square', 0.08); }

  // A lazy sunset-radio loop: a warm pad chord that changes every bar and a
  // soft bass line, scheduled a bar ahead so it never stutters.
  startMusic() {
    const chords = [
      [220, 277, 330], [174, 220, 261], [196, 246, 293], [164, 207, 246],
    ];
    const bass = [110, 87, 98, 82];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = this.musicStep % 4;
      const t = this.ctx.currentTime + 0.05;
      chords[bar].forEach((f) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.035, t + 0.4);
        gain.gain.linearRampToValueAtTime(0.0001, t + 1.9);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 2);
      });
      const b = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      b.type = 'sine'; b.frequency.value = bass[bar];
      bg.gain.setValueAtTime(0.05, t);
      bg.gain.linearRampToValueAtTime(0.0001, t + 1.8);
      b.connect(bg).connect(this.ctx.destination);
      b.start(t); b.stop(t + 1.9);
      this.musicStep += 1;
    }, 2000);
  }
}
