// ═══ Синтезированные звуки (WebAudio, без файлов) ═══
class SoundFX {
  constructor() { this.enabled = true; this.ctx = null; this.master = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setEnabled(v) { this.enabled = v; if (v) this.unlock(); }

  _tone(freq, dur, { type = 'sine', gain = 0.25, at = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _thump(freq = 170, dur = 0.09, gain = 0.5) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 4;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    this._tone(freq, dur, { type: 'sine', gain: gain * 0.6 });
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'move': this._thump(190, 0.07, 0.45); break;
      case 'capture': this._thump(120, 0.12, 0.65); this._tone(95, 0.1, { gain: 0.2 }); break;
      case 'castle': this._thump(190, 0.06, 0.4); setTimeout(() => this._thump(190, 0.06, 0.4), 110); break;
      case 'check': this._tone(660, 0.09, { type: 'triangle', gain: 0.22 }); this._tone(880, 0.12, { type: 'triangle', gain: 0.22, at: 0.09 }); break;
      case 'promote': [523, 659, 784].forEach((f, i) => this._tone(f, 0.14, { type: 'triangle', gain: 0.2, at: i * 0.07 })); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', gain: 0.22, at: i * 0.12 })); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, { type: 'sine', gain: 0.2, at: i * 0.14 })); break;
      case 'draw': this._tone(440, 0.2, { gain: 0.18 }); this._tone(440, 0.25, { gain: 0.18, at: 0.22 }); break;
      case 'success': this._tone(660, 0.1, { type: 'triangle', gain: 0.22 }); this._tone(880, 0.16, { type: 'triangle', gain: 0.22, at: 0.08 }); break;
      case 'error': this._tone(150, 0.16, { type: 'square', gain: 0.1 }); break;
      case 'click': this._tone(1200, 0.03, { gain: 0.07 }); break;
    }
  }
}

export const sound = new SoundFX();