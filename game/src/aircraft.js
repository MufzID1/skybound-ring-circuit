// aircraft.js — the aeroplane: a stylised high-wing prop plane built from
// Three.js primitives, and the flight model that flies it.
//
// The model is an honest arcade flight model, not a toy: climbs cost speed,
// dives buy it back, wings stall below the stall speed and drop the nose,
// banked wings turn the plane, and fuel burns faster the harder you push the
// throttle. Touchdowns are graded — grease it, thump it, or bend it.

const THREE = window.THREE;

export const GEAR_HEIGHT = 1.15;
const STALL_SPEED = 26;        // m/s, below this the wing gives up
const ROTATE_SPEED = 30;       // m/s, where she will fly off the ground
const MAX_SPEED = 92;

const BODY = new THREE.MeshPhongMaterial({ color: 0xe9e2d2, shininess: 24 });
const ACCENT = new THREE.MeshPhongMaterial({ color: 0xc23a2a, shininess: 30 });
const DARK = new THREE.MeshPhongMaterial({ color: 0x2c3136, shininess: 12 });
const GLASS = new THREE.MeshPhongMaterial({ color: 0x8fd0e8, shininess: 130, transparent: true, opacity: 0.6 });

function box(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// buildAircraftModel() — the plane, nose toward -Z, ground contact at
// y = -GEAR_HEIGHT. Returns { group, propeller, cockpit } where cockpit is
// the in-view panel shown only from the pilot's seat.
export function buildAircraftModel() {
  const plane = new THREE.Group();

  // Fuselage: a tapered tube from spinner to tail.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.58, 6.6, 10), BODY);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0.1, 0.4);
  plane.add(fuselage);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.58, 1.1, 10), ACCENT);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0.1, -2.9);
  plane.add(cowl);
  plane.add(box(0.9, 0.28, 4.6, ACCENT, 0, -0.28, 0.5)); // belly stripe

  // High wing with red tips, slight dihedral built from three panels.
  const wingCentre = box(3.4, 0.15, 1.5, BODY, 0, 0.78, -0.5);
  plane.add(wingCentre);
  for (const side of [-1, 1]) {
    const panel = box(3.3, 0.13, 1.42, BODY, side * 3.3, 0.92, -0.5);
    panel.rotation.z = side * 0.06;
    plane.add(panel);
    plane.add(box(0.5, 0.14, 1.42, ACCENT, side * 4.85, 1.0, -0.5));
    const strut = box(0.07, 1.05, 0.07, DARK, side * 1.5, 0.25, -0.5);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }

  // Tail feathers.
  plane.add(box(3.3, 0.12, 1.0, BODY, 0, 0.32, 3.35));
  const fin = box(0.13, 1.45, 1.15, ACCENT, 0, 0.85, 3.35);
  plane.add(fin);

  // Canopy glass.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), GLASS);
  canopy.scale.set(0.92, 0.78, 1.9);
  canopy.position.set(0, 0.52, -0.75);
  plane.add(canopy);

  // Landing gear: two mains and a tail wheel, with proper legs.
  for (const side of [-1, 1]) {
    const leg = box(0.09, 1.0, 0.09, DARK, side * 0.85, -0.62, -0.9);
    leg.rotation.z = side * 0.25;
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 10), DARK);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.98, -0.81, -0.9);
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), DARK);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.95, 3.3);
  plane.add(tailWheel);

  // Navigation lights: port red, starboard green, tail white.
  const lightGeo = new THREE.SphereGeometry(0.11, 6, 6);
  const port = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  port.position.set(-5.05, 1.0, -0.5);
  const starboard = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x35e065 }));
  starboard.position.set(5.05, 1.0, -0.5);
  const tail = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tail.position.set(0, 0.35, 3.9);
  plane.add(port, starboard, tail);

  // Propeller: two blades and a spinner, plus a blur disc that fades in
  // with rpm so a running engine reads as running in a still screenshot.
  const propeller = new THREE.Group();
  const blade = box(0.16, 2.7, 0.05, DARK, 0, 0, 0);
  propeller.add(blade);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 8), ACCENT);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.2;
  propeller.add(spinner);
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.38, 24),
    new THREE.MeshBasicMaterial({ color: 0xdadfe2, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
  );
  blurDisc.position.z = 0.04;
  blurDisc.name = 'prop-blur-disc';
  propeller.add(blurDisc);
  propeller.position.set(0, 0.1, -3.55);
  plane.add(propeller);

  // Cockpit dressing, visible only from the pilot's seat: glareshield,
  // panel with lit gauge faces, and the control yoke.
  const cockpit = new THREE.Group();
  const panel = box(1.5, 0.62, 0.1, DARK, 0, 0.28, -1.32);
  cockpit.add(panel);
  const gaugeMat = new THREE.MeshBasicMaterial({ color: 0xbfe6f5 });
  const gaugeDark = new THREE.MeshBasicMaterial({ color: 0x1c2b33 });
  for (const [gx, gy, r] of [[-0.45, 0.36, 0.13], [0, 0.36, 0.13], [0.45, 0.36, 0.13], [-0.22, 0.08, 0.1], [0.22, 0.08, 0.1]]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 16), gaugeMat);
    face.position.set(gx, gy, -1.375);
    cockpit.add(face);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 8), gaugeDark);
    hub.position.set(gx, gy, -1.378);
    cockpit.add(hub);
  }
  cockpit.add(box(1.7, 0.1, 0.5, DARK, 0, 0.62, -1.25)); // glareshield
  const yoke = box(0.5, 0.07, 0.07, DARK, 0, -0.02, -1.05);
  cockpit.add(yoke);
  cockpit.visible = false;
  plane.add(cockpit);

  return { group: plane, propeller, cockpit };
}

// FlightModel — all state in metres, metres/second and radians.
// heading: 0 = north (-Z), increasing clockwise. pitch > 0 = nose up.
// roll > 0 = banked right.
export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = 100;
    this.onGround = true;
    this.stalled = false;
    this.engineOut = false;
    this.verticalSpeed = 0; // m/s, for touchdown grading and the HUD
    this.reset();
  }

  reset() {
    this.position.set(0, GEAR_HEIGHT + 0.15, 268);
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = 100;
    this.onGround = true;
    this.stalled = false;
    this.engineOut = false;
    this.verticalSpeed = 0;
  }

  get forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      Math.sin(this.heading) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.heading) * cp
    );
  }

  get headingDeg() {
    return ((THREE.MathUtils.radToDeg(this.heading) % 360) + 360) % 360;
  }

  // update(dt, input, ground) — ground = { heightAt(x,z), onRunway(x,z),
  // waterY }. Returns an events object; landing/crash calls are the caller's.
  update(dt, input, ground) {
    const events = { tookOff: false, touchdown: null, crashed: null };
    const prevY = this.position.y;

    // --- throttle and fuel -------------------------------------------------
    if (input.throttleUp) this.throttle = Math.min(1, this.throttle + dt * 0.55);
    if (input.throttleDown) this.throttle = Math.max(0, this.throttle - dt * 0.7);
    if (this.fuel > 0) {
      // A full tank is roughly five minutes of mixed flying — enough for
      // the circuit with a reserve, tight enough that the gauge matters.
      this.fuel = Math.max(0, this.fuel - dt * (0.06 + this.throttle * 0.30));
    }
    this.engineOut = this.fuel <= 0;
    const power = this.engineOut ? 0 : this.throttle;

    // --- control response fades in with airspeed ---------------------------
    const authority = THREE.MathUtils.clamp(this.speed / 24, 0.25, 1);
    const pitchInput = input.pitch;   // -1 (push, nose down) .. 1 (pull, nose up)
    const rollInput = input.roll;     // -1 (left) .. 1 (right)

    if (!this.onGround) {
      this.pitch += pitchInput * 0.85 * authority * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.62, 0.5);
      // Gentle pitch stability toward a shallow cruise attitude.
      this.pitch += (0.03 - this.pitch) * 0.12 * dt;
    } else if (this.speed > ROTATE_SPEED && pitchInput > 0.25) {
      this.pitch += pitchInput * 0.7 * dt;
    } else {
      this.pitch = Math.max(0, this.pitch - dt * 1.2);
    }

    const targetRoll = rollInput * 0.95;
    const rollRate = this.onGround ? 0 : 2.1 * authority;
    this.roll += (targetRoll - this.roll) * Math.min(1, rollRate * dt * 2.2);
    if (!this.onGround) {
      // A banked wing turns the aeroplane; the rudder adds a little more.
      this.heading += Math.tan(THREE.MathUtils.clamp(this.roll, -1.1, 1.1)) * 9.8 / Math.max(this.speed, 18) * dt * 1.9;
      this.heading -= input.rudder * 0.3 * authority * dt;
    } else {
      // Ground steering with the rudder, stronger the faster she rolls.
      this.heading -= input.rudder * 0.5 * Math.min(1, this.speed / 18) * dt;
      this.roll *= 0.8;
    }

    // --- stall --------------------------------------------------------------
    this.stalled = !this.onGround && this.speed < STALL_SPEED;
    if (this.stalled) {
      this.pitch += (-0.34 - this.pitch) * 1.6 * dt; // the nose drops away
    }

    // --- speed: thrust, drag, and the hill you are climbing -----------------
    const thrust = power * 21;
    const drag = 0.011 * this.speed * this.speed + 0.6;
    const slopeCost = 9.8 * Math.sin(this.pitch) * (this.onGround ? 0 : 1);
    this.speed += (thrust - drag - slopeCost) * dt * (this.onGround ? 0.85 : 1);
    if (this.onGround && power === 0) this.speed = Math.max(0, this.speed - 4.5 * dt); // brakes & grass drag
    this.speed = THREE.MathUtils.clamp(this.speed, 0, MAX_SPEED);

    // --- move ---------------------------------------------------------------
    const fwd = this.forward;
    this.position.addScaledVector(fwd, this.speed * dt);
    if (this.stalled) {
      this.position.y -= 7.5 * dt; // the drop of a stalled wing
    } else if (!this.onGround) {
      // Below cruise speed the wing cannot quite hold her up: she mushes
      // downward, more the slower she flies. This is what settles her onto
      // the runway at the end of a flare instead of floating its length.
      const mush = THREE.MathUtils.clamp((44 - this.speed) * 0.055, 0, 2.2);
      this.position.y -= mush * dt;
    }
    this.verticalSpeed = dt > 0 ? (this.position.y - prevY) / dt : 0;

    // --- the ground ---------------------------------------------------------
    const groundY = ground.heightAt(this.position.x, this.position.z);
    const floorY = groundY + GEAR_HEIGHT;
    // Open water is checked on its own: the lakebed sits far below the
    // surface, so she ditches at the surface, not on the bottom.
    const ditched = !this.onGround
      && ground.inLake(this.position.x, this.position.z)
      && this.position.y <= ground.waterY + 0.7;
    if (ditched) {
      events.crashed = 'Ditched in the lake';
    } else if (this.position.y <= floorY) {
      const sink = -this.verticalSpeed;
      if (this.onGround) {
        this.position.y = floorY;
      } else if (ground.onRunway(this.position.x, this.position.z)) {
        this.position.y = floorY;
        this.onGround = true;
        this.pitch = 0;
        this.roll = 0;
        events.touchdown = { sink, speed: this.speed, firm: sink > 3.4 };
        if (sink > 6.5) events.crashed = 'Hard impact — the gear collapsed';
      } else {
        this.position.y = floorY;
        if (sink <= 2.6 && this.speed <= 40) {
          events.crashed = 'Put down off the runway — the valley floor is unforgiving';
        } else {
          events.crashed = 'Terrain strike';
        }
      }
    } else if (this.onGround) {
      // The wing has lifted her off the floor this frame — a real takeoff
      // only counts at flying speed with the nose up; a bump at taxi speed
      // just settles back onto the gear.
      if (this.speed > ROTATE_SPEED * 0.92 && this.pitch > 0.05) {
        this.onGround = false;
        events.tookOff = true;
      } else {
        this.position.y = floorY;
      }
    }

    // Keep the plane inside the valley rim.
    const lim = 2050;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -lim, lim);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -lim, lim);
    return events;
  }

  // applyToObject(group) — writes position and attitude into the 3D model.
  applyToObject(group) {
    group.position.copy(this.position);
    group.rotation.set(0, 0, 0);
    group.rotateY(-this.heading);
    group.rotateX(this.pitch);
    group.rotateZ(-this.roll);
  }
}
