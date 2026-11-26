// shots.js — deterministic poses for the maker's screenshots.
//
// The game is photographed by loading it with ?shot=<name>&seed=1 (see
// shots.json). A pose freezes the simulation in a composed, representative
// moment — on the takeoff roll, diving at a ring, on final in the cockpit,
// parked after a completed mission — with the HUD live, and raises
// window.__shotReady once the posed frame is on screen.

export function readShotPose() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name) return null;
  return { name, seed: parseInt(params.get('seed') || '1', 10) || 1 };
}

// applyShotPose(name, view) — view = { flight, rings, mission, setCamera }.
// Returns a score breakdown for the "complete" pose, else null.
export function applyShotPose(name, view) {
  const { flight, rings, mission } = view;
  flight.reset();

  if (name === 'cover') {
    // Mid takeoff roll: fast, nose light, the first ring ahead over the nose.
    flight.position.set(0, 1.18, 60);
    flight.speed = 33;
    flight.throttle = 0.92;
    flight.pitch = 0.05;
    flight.onGround = true;
    mission.elapsed = 9;
    view.setCamera('chase');
  } else if (name === 'rings') {
    // Two rings down, banking toward the third over the lake shore.
    rings.nextIndex = 2;
    rings.rings[0].passed = true;
    rings.rings[1].passed = true;
    flight.position.set(760, 128, -880);
    flight.heading = 2.28;
    flight.pitch = -0.07;
    flight.roll = 0.34;
    flight.speed = 56;
    flight.throttle = 0.72;
    flight.onGround = false;
    mission.ringsCleared = 2;
    mission.score = 500;
    mission.elapsed = 74;
    view.setCamera('chase');
  } else if (name === 'cockpit') {
    // On final approach, runway filling the windscreen, gear down, slow.
    rings.nextIndex = 8;
    for (const ring of rings.rings) ring.passed = true;
    flight.position.set(5, 30, 655);
    flight.heading = 0.01;
    flight.pitch = -0.055;
    flight.speed = 33;
    flight.throttle = 0.34;
    flight.fuel = 41;
    flight.onGround = false;
    mission.ringsCleared = 8;
    mission.score = 2000;
    mission.elapsed = 168;
    view.setCamera('cockpit');
  } else if (name === 'complete') {
    // Parked on the runway after the mission, score card up.
    rings.nextIndex = 8;
    for (const ring of rings.rings) ring.passed = true;
    flight.position.set(2, 1.18, -60);
    flight.heading = 0.04;
    flight.speed = 0;
    flight.throttle = 0;
    flight.fuel = 38;
    flight.onGround = true;
    mission.ringsCleared = 8;
    mission.score = 2710;
    mission.elapsed = 187;
    view.setCamera('chase');
    return { rings: 2000, landing: 500, time: 210, total: 2710 };
  }
  rings.refreshMaterials(1.2);
  return null;
}
