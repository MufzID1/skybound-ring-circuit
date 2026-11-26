// audio.js — a tiny procedural sound kit on WebAudio: an engine hum that
// follows the throttle, wind that follows the airspeed, a chime for a ring,
// a thud for a touchdown and a crunch for a crash. No audio files — every
// sound is synthesised, so the game stays fully self-contained.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
  }

  // start() must be called from a user gesture (click or keypress).
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // Engine: a sawtooth through a lowpass, gain and pitch set per frame.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();

    // Wind: looped white noise through a bandpass, gain set per frame.
    const len = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(windFilter).connect(this.windGain).connect(ctx.destination);
    noise.start();
  }

  // update(flight) — call once a frame with the FlightModel.
  update(flight) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const engineLevel = this.muted || flight.engineOut ? 0 : 0.015 + flight.throttle * 0.075;
    this.engineGain.gain.setTargetAtTime(engineLevel, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + flight.throttle * 68 + flight.speed * 0.22, t, 0.08);
    const windLevel = this.muted ? 0 : Math.min(0.14, flight.speed * flight.speed * 0.000016);
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.12);
  }

  _blip(freqA, freqB, when, dur, gainPeak, type = 'sine') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, when);
    osc.frequency.exponentialRampToValueAtTime(freqB, when + dur);
    gain.gain.setValueAtTime(gainPeak, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  ringChime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._blip(880, 880, t, 0.16, 0.16);
    this._blip(1318, 1318, t + 0.09, 0.24, 0.16);
  }

  touchdownThud(firm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._blip(120, 45, t, firm ? 0.3 : 0.18, firm ? 0.4 : 0.22, 'triangle');
  }

  crashCrunch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._blip(300, 40, t, 0.55, 0.5, 'sawtooth');
    this._blip(90, 30, t + 0.05, 0.6, 0.5, 'square');
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}
