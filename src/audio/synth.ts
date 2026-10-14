/** Asset-free sound: everything is synthesised with Web Audio oscillators and noise. */
export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  private lastCreak = 0;

  /** Must be called from a user gesture handler (browsers block audio otherwise). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* audio is optional */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private get ready(): boolean { return !!this.ctx && !!this.master && !this.muted && this.ctx.state === 'running'; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ready) return;
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass: number, delay = 0): void {
    if (!this.ready || !this.noiseBuf) return;
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master!);
    s.start(t); s.stop(t + dur + 0.02);
  }

  click(): void { this.tone(520, 0.06, 'square', 0.12); }
  select(): void { this.tone(660, 0.07, 'triangle', 0.18); }
  place(): void { this.tone(300, 0.09, 'triangle', 0.25, 180); this.noise(0.05, 0.12, 1800); }
  error(): void { this.tone(160, 0.16, 'sawtooth', 0.18, 110); }
  remove(): void { this.tone(420, 0.1, 'triangle', 0.18, 200); }
  creak(intensity: number): void {
    const now = performance.now();
    if (now - this.lastCreak < 350) return;
    this.lastCreak = now;
    this.tone(90 + Math.random() * 60, 0.25, 'sawtooth', 0.04 + intensity * 0.08, 70 + Math.random() * 40);
  }
  snap(): void { this.noise(0.25, 0.5, 2500); this.tone(110, 0.3, 'sawtooth', 0.25, 50); }
  splash(): void { this.noise(0.6, 0.45, 900); }
  win(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.22, undefined, i * 0.11)); }
  fail(): void { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.14, undefined, i * 0.14)); }
  star(i: number): void { this.tone(700 + i * 160, 0.18, 'sine', 0.25); }
}
