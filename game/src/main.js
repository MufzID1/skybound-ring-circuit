// main.js — SKYBOUND: Ring Circuit. Boot, the mission state machine, the
// cameras and the frame loop. The world, aeroplane, course, instruments and
// sound each live in their own module; this file conducts them.
//
// Mission: take off from the valley runway, thread the eight sky rings in
// order, then land back on the runway. Rings pay 250 each, a smooth landing
// 500 (a firm one 250), and a time bonus melts away at 2 points a second.

import { buildTerrain, terrainHeight, isOnRunway, LAKE } from './terrain.js';
import { buildSky } from './sky.js';
import { buildAircraftModel, FlightModel } from './aircraft.js';
import { RingCourse, RING_POINTS } from './rings.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { readShotPose, applyShotPose } from './shots.js';

const THREE = window.THREE;
const LANDING_BONUS_SMOOTH = 500;
const LANDING_BONUS_FIRM = 250;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0ec, 500, 3400);
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 9000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------- world
const shotPose = readShotPose();
const seed = shotPose ? shotPose.seed : 1;
const sky = buildSky(scene, () => Math.random());
buildTerrain(scene, seed);

const aircraftModel = buildAircraftModel();
scene.add(aircraftModel.group);
const flight = new FlightModel();
const rings = new RingCourse(scene);
const input = new Input();
const hud = new Hud();
const audio = new GameAudio();
input.onFirstGesture = () => audio.start();

// ----------------------------------------------------------------- mission
const mission = { score: 0, elapsed: 0, ringsCleared: 0, ringsTotal: rings.total };
let state = 'title'; // title | flying | paused | crashed | complete | shot
let cameraMode = 'chase';
let finalBreakdown = null;
let pendingTouchdown = null; // the last touchdown, graded when she rolls to a stop

const overlays = {
  title: document.getElementById('title-overlay'),
  crash: document.getElementById('crash-overlay'),
  complete: document.getElementById('complete-overlay'),
};

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function startFlight() {
  flight.reset();
  rings.reset();
  mission.score = 0;
  mission.elapsed = 0;
  mission.ringsCleared = 0;
  finalBreakdown = null;
  pendingTouchdown = null;
  state = 'flying';
  showOverlay(null);
  hud.showMessage('TAKE OFF', 'Full throttle — rotate at 60 knots', 2.6);
}

function crash(reason) {
  state = 'crashed';
  audio.crashCrunch();
  document.getElementById('crash-reason').textContent = reason;
  document.getElementById('crash-detail').textContent =
    `Score ${mission.score} · ${mission.ringsCleared}/${mission.ringsTotal} rings · ${Math.floor(mission.elapsed)} seconds flown.`;
  showOverlay('crash');
}

function completeMission(touchdown) {
  const landing = touchdown.firm ? LANDING_BONUS_FIRM : LANDING_BONUS_SMOOTH;
  const timeBonus = Math.max(0, 600 - Math.floor(mission.elapsed) * 2);
  finalBreakdown = {
    rings: mission.ringsCleared * RING_POINTS,
    landing,
    time: timeBonus,
    total: mission.score + landing + timeBonus,
  };
  mission.score = finalBreakdown.total;
  state = 'complete';
  document.getElementById('final-rings').textContent = finalBreakdown.rings;
  document.getElementById('final-landing').textContent = landing + (touchdown.firm ? ' (firm)' : ' (smooth)');
  document.getElementById('final-time').textContent = timeBonus;
  document.getElementById('final-score').textContent = finalBreakdown.total;
  showOverlay('complete');
}

document.getElementById('fly-button').addEventListener('click', () => { audio.start(); startFlight(); });
document.getElementById('crash-retry-button').addEventListener('click', () => { audio.start(); startFlight(); });
document.getElementById('complete-retry-button').addEventListener('click', () => { audio.start(); startFlight(); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state !== 'flying') { audio.start(); startFlight(); }
  if (e.code === 'KeyR') startFlight();
  if (e.code === 'KeyC' && state !== 'shot') cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (e.code === 'KeyM') hud.showMessage(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', '', 1.1);
  if (e.code === 'KeyP') {
    if (state === 'flying') { state = 'paused'; hud.showMessage('PAUSED', 'P to resume', 9999); }
    else if (state === 'paused') { state = 'flying'; hud.showMessage('RESUMED', '', 0.8); }
  }
});

// ----------------------------------------------------------------- cameras
const chasePos = new THREE.Vector3(0, 6, 290);
const lookTarget = new THREE.Vector3();
const headingFrame = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

function updateCamera(dt, time) {
  const plane = aircraftModel.group;
  if (state === 'title') {
    // A slow admiring orbit of the parked aeroplane.
    const a = time * 0.11;
    camera.position.set(flight.position.x + Math.sin(a) * 17, 4.6, flight.position.z + Math.cos(a) * 17);
    camera.lookAt(flight.position.x, 2, flight.position.z);
    aircraftModel.cockpit.visible = false;
    return;
  }
  if (cameraMode === 'cockpit') {
    aircraftModel.cockpit.visible = true;
    const head = plane.localToWorld(new THREE.Vector3(0, 0.82, -0.45));
    const ahead = plane.localToWorld(new THREE.Vector3(0, 0.55, -40));
    camera.position.copy(head);
    camera.lookAt(ahead);
    return;
  }
  aircraftModel.cockpit.visible = false;
  headingFrame.setFromAxisAngle(yAxis, -flight.heading);
  const offset = new THREE.Vector3(0, 3.4, 12.5).applyQuaternion(headingFrame);
  const desired = flight.position.clone().add(offset);
  const blend = state === 'shot' ? 1 : 1 - Math.exp(-dt * 4.2);
  chasePos.lerp(desired, blend);
  camera.position.copy(chasePos);
  lookTarget.copy(flight.position).addScaledVector(flight.forward, 16);
  lookTarget.y += 1.2;
  camera.lookAt(lookTarget);
}

// ------------------------------------------------------- objective marker
const projected = new THREE.Vector3();
function objectiveScreenPos() {
  const target = rings.allCleared
    ? new THREE.Vector3(0, 3, 40)
    : rings.nextRing.centre;
  const dist = flight.position.distanceTo(target);
  projected.copy(target).project(camera);
  if (projected.z > 1 || projected.z < -1) return { visible: false };
  return {
    visible: true,
    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
    label: `${Math.round(dist)} m`,
  };
}

// -------------------------------------------------------------------- loop
const ground = {
  heightAt: (x, z) => terrainHeight(x, z),
  onRunway: (x, z) => isOnRunway(x, z),
  inLake: (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius,
  waterY: LAKE.waterY,
};

const clock = new THREE.Clock();
const prevPos = new THREE.Vector3();
let shotFrames = 0;

if (shotPose) {
  state = 'shot';
  showOverlay(null);
  const breakdown = applyShotPose(shotPose.name, {
    flight,
    rings,
    mission,
    setCamera: (mode) => { cameraMode = mode; },
  });
  if (breakdown) {
    document.getElementById('final-rings').textContent = breakdown.rings;
    document.getElementById('final-landing').textContent = breakdown.landing + ' (smooth)';
    document.getElementById('final-time').textContent = breakdown.time;
    document.getElementById('final-score').textContent = breakdown.total;
    showOverlay('complete');
  }
  flight.applyToObject(aircraftModel.group);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (state === 'flying') {
    mission.elapsed += dt;
    prevPos.copy(flight.position);
    const events = flight.update(dt, input, ground);

    if (events.tookOff) {
      pendingTouchdown = null;
      hud.showMessage('AIRBORNE', 'Follow the amber ring', 2.0);
    }

    if (rings.checkPass(prevPos, flight.position)) {
      mission.ringsCleared = rings.cleared;
      mission.score += RING_POINTS;
      audio.ringChime();
      if (rings.allCleared) hud.showMessage('ALL RINGS CLEAR', 'Bring her home — land on the runway', 3.2);
      else hud.showMessage(`RING ${mission.ringsCleared} CLEAR`, `+${RING_POINTS} · ${rings.total - mission.ringsCleared} to go`, 1.8);
    }

    if (events.touchdown) {
      audio.touchdownThud(events.touchdown.firm);
      if (events.crashed) {
        crash(events.crashed);
      } else if (rings.allCleared) {
        // The mission ends when she rolls to a stop on the strip, graded
        // by the touchdown that brought her in.
        pendingTouchdown = events.touchdown;
        hud.showMessage(events.touchdown.firm ? 'FIRM ARRIVAL' : 'TOUCHDOWN', 'Roll to a stop to complete the mission', 2.2);
      } else {
        hud.showMessage(events.touchdown.firm ? 'FIRM ARRIVAL' : 'TOUCHDOWN', 'Rings remain — throttle up and go around', 2.2);
      }
    } else if (events.crashed) {
      crash(events.crashed);
    }

    if (pendingTouchdown && flight.onGround && flight.speed < 5) {
      const touchdown = pendingTouchdown;
      pendingTouchdown = null;
      completeMission(touchdown);
    }

    // Spinning prop and its blur disc follow the engine.
    aircraftModel.propeller.rotation.z -= dt * (5 + flight.throttle * 85 + flight.speed * 0.35);
    const disc = aircraftModel.propeller.getObjectByName('prop-blur-disc');
    if (disc) disc.material.opacity = THREE.MathUtils.clamp(flight.throttle * 0.16 + flight.speed * 0.001, 0, 0.2);

    sky.update(dt);
    audio.update(flight);
  }

  if (state === 'shot') {
    aircraftModel.propeller.rotation.z -= 0.35;
    const disc = aircraftModel.propeller.getObjectByName('prop-blur-disc');
    if (disc) disc.material.opacity = flight.throttle > 0.1 ? 0.16 : 0.0;
    if (++shotFrames === 4) window.__shotReady = true;
  }

  flight.applyToObject(aircraftModel.group);
  rings.refreshMaterials(time);
  updateCamera(dt, time);
  hud.update(dt, flight, mission, state === 'flying' || state === 'shot' ? objectiveScreenPos() : null);
  renderer.render(scene, camera);
}

showOverlay('title');
if (shotPose) showOverlay(shotPose.name === 'complete' ? 'complete' : null);
frame();
