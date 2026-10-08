/**
 * Authoritative Web Audio Sound Synthesizer for Green Farm.
 * 
 * Generates tactile, organic, responsive sound effects procedurally using Web Audio API.
 * Requires zero external audio asset loading, runs offline, and has zero network latency.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  constructor() {
    // Lazily initialized on first user gesture to comply with browser autoplay policies
  }

  private initContext(): void {
    if (this.ctx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.3, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {
      // AudioContext not supported or permission denied
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.3, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public get muted(): boolean {
    return this.isMuted;
  }

  /**
   * Soft wooden click for UI buttons and inventory slot selection.
   */
  public playClick(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.04);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  /**
   * Earthy crunchy rustle for soil tilling.
   */
  public playTill(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(70, t + 0.09);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /**
   * Cheerful pop for seed sowing.
   */
  public playSow(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(680, t + 0.06);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * Gentle splash chime for watering crops.
   */
  public playWater(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(350, t + 0.12);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Harmonious major triad chime on crop harvest or quest completion.
   */
  public playHarvest(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = t + i * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  /**
   * Shimmering coin sound on market purchase or shipping bin settlement.
   */
  public playCoin(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const notes = [987.77, 1318.51]; // B5, E6

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = t + i * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(start);
      osc.stop(start + 0.18);
    });
  }

  /**
   * Peaceful bedtime lullaby chime.
   */
  public playSleep(): void {
    this.initContext();
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime;
    const notes = [440.0, 392.0, 329.63, 261.63]; // A4, G4, E4, C4

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = t + i * 0.14;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(start);
      osc.stop(start + 0.4);
    });
  }
}

// Global audio singleton for client presentation
export const audioManager = new AudioSystem();
