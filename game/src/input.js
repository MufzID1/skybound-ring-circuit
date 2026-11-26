// input.js — keyboard and mouse, gathered into one state object the flight
// model reads each frame. Axes are -1..1; the mouse steers while its button
// is held, by how far the pointer sits from the centre of the screen.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseHeld = false;
    this.mouseNX = 0; // -1..1 across the screen
    this.mouseNY = 0; // -1..1 down the screen
    this.onFirstGesture = null;
    this._gestured = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this._gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('.overlay')) return;
      this.mouseHeld = true;
      this._gesture();
    });
    window.addEventListener('mouseup', () => { this.mouseHeld = false; });
    window.addEventListener('mousemove', (e) => {
      this.mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseHeld = false; });
  }

  _gesture() {
    if (!this._gestured) {
      this._gestured = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  get throttleUp() { return this.keys.has('KeyW') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get throttleDown() { return this.keys.has('KeyS') || this.keys.has('ControlLeft') || this.keys.has('ControlRight'); }

  // pitch: +1 pulls the nose up (Down arrow / S-position stick, like a real
  // yoke), -1 pushes it down. Mouse: pointer above centre pulls up.
  get pitch() {
    let v = 0;
    if (this.keys.has('ArrowDown')) v += 1;
    if (this.keys.has('ArrowUp')) v -= 1;
    if (this.mouseHeld) v += -this.mouseNY * 1.15;
    return Math.max(-1, Math.min(1, v));
  }

  // roll: +1 banks right. Arrows and the held mouse steer; A/D stay rudder.
  get roll() {
    let v = 0;
    if (this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('ArrowLeft')) v -= 1;
    if (this.mouseHeld) v += this.mouseNX * 1.2;
    return Math.max(-1, Math.min(1, v));
  }

  // rudder: +1 yaws left (A), -1 yaws right (D).
  get rudder() {
    let v = 0;
    if (this.keys.has('KeyA')) v += 1;
    if (this.keys.has('KeyD')) v -= 1;
    return v;
  }

  pressed(code) { return this.keys.has(code); }
}
