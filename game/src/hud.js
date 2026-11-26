// hud.js — every instrument the pilot reads: the DOM clusters (airspeed,
// altitude, vertical speed, score, clock, rings), the compass tape, the
// throttle and fuel bars, the objective diamond that tracks the next ring or
// the runway, centre messages, warnings, and the canvas attitude indicator.

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'hud-speed', 'hud-altitude', 'hud-vspeed', 'hud-heading', 'hud-score',
      'hud-time', 'hud-rings', 'compass-tape', 'throttle-fill', 'fuel-fill',
      'hud-throttle-pct', 'hud-fuel-pct', 'objective-marker', 'objective-dist',
      'message-centre', 'message-main', 'message-sub', 'warning-line',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.attitude = document.getElementById('attitude-canvas').getContext('2d');
    this.messageTimer = 0;
    this._lastText = {};
  }

  _set(id, text) {
    if (this._lastText[id] !== text) {
      this._lastText[id] = text;
      this.el[id].textContent = text;
    }
  }

  showMessage(main, sub = '', seconds = 2.2) {
    this.el['message-main'].textContent = main;
    this.el['message-sub'].textContent = sub;
    this.el['message-centre'].style.opacity = '1';
    this.messageTimer = seconds;
  }

  // update(dt, flight, mission, objectiveScreen) — flight is the FlightModel,
  // mission = { score, elapsed, ringsCleared, ringsTotal }, objectiveScreen =
  // { x, y, visible, label } in CSS pixels for the objective diamond.
  update(dt, flight, mission, objectiveScreen) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el['message-centre'].style.opacity = '0';
    }

    this._set('hud-speed', String(Math.round(flight.speed * 1.944)));
    this._set('hud-altitude', String(Math.max(0, Math.round(flight.position.y * 3.281))));
    const fpm = Math.round(flight.verticalSpeed * 196.85 / 10) * 10;
    this._set('hud-vspeed', (fpm > 0 ? '+' : '') + fpm);
    this._set('hud-heading', String(Math.round(flight.headingDeg)).padStart(3, '0'));
    this._set('hud-score', String(mission.score));
    this._set('hud-time', fmtTime(mission.elapsed));
    this._set('hud-rings', `${mission.ringsCleared}/${mission.ringsTotal}`);

    // Compass tape: a sliding window over a repeating strip of points.
    const deg = flight.headingDeg;
    const strip = [];
    for (let d = -60; d <= 60; d += 15) {
      const a = ((Math.round((deg + d) / 15) * 15) % 360 + 360) % 360;
      if (a % 90 === 0) strip.push(COMPASS_POINTS[a / 45]);
      else if (a % 30 === 0) strip.push(String(a / 10));
      else strip.push('·');
    }
    this._set('compass-tape', strip.join('  '));

    const throttlePct = Math.round(flight.throttle * 100);
    this.el['throttle-fill'].style.width = throttlePct + '%';
    this._set('hud-throttle-pct', throttlePct + '%');
    const fuelPct = Math.max(0, Math.round(flight.fuel));
    this.el['fuel-fill'].style.width = fuelPct + '%';
    this.el['fuel-fill'].classList.toggle('low', fuelPct <= 25);
    this._set('hud-fuel-pct', fuelPct + '%');

    // Warnings, in the order a pilot would want them.
    let warning = '';
    if (flight.engineOut) warning = 'FUEL STARVATION — ENGINE OUT';
    else if (flight.stalled) warning = 'STALL';
    else if (flight.fuel <= 25 && !flight.onGround) warning = 'LOW FUEL';
    const warnEl = this.el['warning-line'];
    if (warning) {
      warnEl.textContent = warning;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }

    // Objective diamond.
    const marker = this.el['objective-marker'];
    if (objectiveScreen && objectiveScreen.visible) {
      marker.style.display = 'block';
      marker.style.left = objectiveScreen.x + 'px';
      marker.style.top = objectiveScreen.y + 'px';
      this._set('objective-dist', objectiveScreen.label);
    } else {
      marker.style.display = 'none';
    }

    this.drawAttitude(flight);
  }

  // The artificial horizon: sky and ground halves that roll and slide with
  // the aeroplane, a fixed aeroplane symbol in the middle, pitch rungs.
  drawAttitude(flight) {
    const g = this.attitude;
    const W = 132, H = 132, cx = W / 2, cy = H / 2;
    const roll = flight.roll;
    const pitchPx = THREE.MathUtils.clamp(flight.pitch, -0.6, 0.5) * 90;
    g.save();
    g.beginPath();
    g.arc(cx, cy, 62, 0, Math.PI * 2);
    g.clip();
    g.translate(cx, cy);
    g.rotate(-roll);
    g.translate(0, pitchPx);
    g.fillStyle = '#3f8fd2';
    g.fillRect(-100, -200, 200, 200);
    g.fillStyle = '#7a5c38';
    g.fillRect(-100, 0, 200, 200);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-100, 0); g.lineTo(100, 0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.5;
    for (const p of [-40, -20, 20, 40]) {
      const w = p % 40 === 0 ? 18 : 10;
      g.beginPath(); g.moveTo(-w, p); g.lineTo(w, p); g.stroke();
    }
    g.restore();
    // Fixed symbol and bezel.
    g.strokeStyle = '#ffd75e';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 34, cy); g.lineTo(cx - 10, cy); g.lineTo(cx - 10, cy + 7);
    g.moveTo(cx + 34, cy); g.lineTo(cx + 10, cy); g.lineTo(cx + 10, cy + 7);
    g.stroke();
    g.fillStyle = '#ffd75e';
    g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(160,220,250,0.6)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 63, 0, Math.PI * 2); g.stroke();
  }
}
