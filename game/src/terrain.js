// terrain.js — the valley: a procedural heightfield, the runway cut through
// it, a lake, trees and the airfield buildings.
//
// terrainHeight(x, z) is a pure function: the ground mesh is displaced by it
// and the flight model collides with it, so the terrain the pilot sees is
// exactly the terrain the pilot can hit. The runway corridor is flattened to
// y = 0 by the same function, which is what makes landings line up.

const THREE = window.THREE;

export const WORLD_SIZE = 4400;
export const RUNWAY = { width: 30, zMin: -330, zMax: 330, topY: 0.15 };
export const LAKE = { x: 980, z: -520, radius: 310, waterY: 2.0 };

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Deterministic PRNG so the valley is the same on every visit (and in every
// screenshot): mulberry32.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function terrainHeight(x, z) {
  // Rolling hills from layered sine waves — cheap, smooth, no noise texture.
  let h = 20
    + 26 * Math.sin(x * 0.004 + 1.7) * Math.cos(z * 0.0035 - 0.6)
    + 14 * Math.sin(x * 0.011 - 0.4) * Math.sin(z * 0.009 + 2.1)
    + 6 * Math.sin(x * 0.033 + 0.8) * Math.cos(z * 0.029 + 1.3);

  // Keep the middle of the valley gentle; the wild country is out by the rim.
  const distCentre = Math.hypot(x, z);
  h *= 0.3 + 0.7 * smoothstep(150, 950, distCentre);

  // Mountain rim closing the valley in.
  const rimBand = Math.max(Math.abs(x), Math.abs(z));
  const rim = smoothstep(1480, 2080, rimBand);
  h += rim * (170 + 60 * Math.sin(x * 0.006 - 1.1) * Math.cos(z * 0.005 + 0.4));

  // The lake basin: a smooth bowl blended right down below the water line,
  // applied after the rim so nothing can raise the lakebed again.
  const dLake = Math.hypot(x - LAKE.x, z - LAKE.z);
  const basin = 1 - smoothstep(LAKE.radius * 0.55, LAKE.radius, dLake);
  h = h * (1 - basin) + -7 * basin;

  // The runway corridor: flatten to zero along the strip the runway sits on.
  const acrossStrip = smoothstep(60, 300, Math.abs(x));
  const alongStrip = smoothstep(640, 1000, Math.abs(z));
  const corridor = (1 - acrossStrip) * (1 - alongStrip);
  h *= 1 - corridor * 0.985;

  // The strip's own footprint is dead flat, so the asphalt never clips
  // through a bump the flattening left behind.
  const core = (1 - smoothstep(30, 64, Math.abs(x))) * (1 - smoothstep(680, 780, Math.abs(z)));
  h *= 1 - core * 0.98;

  return h;
}

export function isOnRunway(x, z) {
  return Math.abs(x) <= RUNWAY.width / 2 && z >= RUNWAY.zMin && z <= RUNWAY.zMax;
}

// Slope of the heightfield at a point, from finite differences — used to
// colour rock on steep faces and to keep trees off the cliffs.
function slopeAt(x, z) {
  const e = 6;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

function vertexColour(x, z, h, slope, rng) {
  // One coherent low-poly palette: meadow, dry grass, rock, snow.
  let r, g, b;
  if (h < 7) { r = 0.36; g = 0.52; b = 0.26; }
  else if (h < 42) { r = 0.40; g = 0.60; b = 0.29; }
  else if (h < 88) { r = 0.52; g = 0.58; b = 0.32; }
  else if (h < 128) { r = 0.48; g = 0.46; b = 0.42; }
  else { r = 0.90; g = 0.93; b = 0.96; }
  if (slope > 0.55 && h < 128) { r = 0.46; g = 0.44; b = 0.41; } // exposed rock
  if (h < LAKE.waterY + 1.2) { r = 0.76; g = 0.70; b = 0.50; }     // lakeshore sand
  const jitter = 0.94 + rng() * 0.12;
  return [r * jitter, g * jitter, b * jitter];
}

function buildGroundMesh(rng) {
  const segments = 168;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const c = vertexColour(x, z, h, slopeAt(x, z), rng);
    colours[i * 3] = c[0]; colours[i * 3 + 1] = c[1]; colours[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'valley-ground';
  return mesh;
}

// The runway is drawn onto a canvas texture: asphalt, centreline dashes,
// threshold bars and edge lines — no image files, all procedural.
function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#33373c'; g.fillRect(0, 0, 128, 1024);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 380; i++) g.fillRect(Math.random() * 128, Math.random() * 1024, 2, 2);
  g.fillStyle = '#e8e8e2';
  g.fillRect(4, 0, 3, 1024); g.fillRect(121, 0, 3, 1024);           // edge lines
  for (let y = 60; y < 1024 - 60; y += 64) g.fillRect(61, y, 6, 34); // centreline
  for (const y0 of [0, 1024 - 46]) {                                 // thresholds
    for (let x = 14; x < 128 - 12; x += 18) g.fillRect(x, y0 + 4, 9, 38);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function buildRunway() {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.zMax - RUNWAY.zMin),
    new THREE.MeshLambertMaterial({ map: runwayTexture() })
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, RUNWAY.topY, (RUNWAY.zMin + RUNWAY.zMax) / 2);
  group.add(strip);

  // Edge lights: two rows of small amber lamps, lovely at a glance on final.
  const lampGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const count = 2 * 15;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);
  const m = new THREE.Matrix4();
  let idx = 0;
  for (let i = 0; i < 15; i++) {
    const z = RUNWAY.zMin + 12 + i * ((RUNWAY.zMax - RUNWAY.zMin - 24) / 14);
    for (const x of [-RUNWAY.width / 2 - 2.5, RUNWAY.width / 2 + 2.5]) {
      m.setPosition(x, 0.6, z);
      lamps.setMatrixAt(idx++, m);
    }
  }
  group.add(lamps);
  return group;
}

function buildWater() {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE.radius, 40),
    new THREE.MeshPhongMaterial({ color: 0x2e6f9e, transparent: true, opacity: 0.92, shininess: 140 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAKE.x, LAKE.waterY, LAKE.z);
  return water;
}

function buildTrees(rng) {
  const COUNT = 650;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5);
  const canopyGeo = new THREE.ConeGeometry(2.6, 7.5, 6);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), COUNT);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: 0x3f7031 }), COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const x = (rng() * 2 - 1) * 1900;
    const z = (rng() * 2 - 1) * 1900;
    const h = terrainHeight(x, z);
    if (h < LAKE.waterY + 1.5 || h > 95) continue;
    if (Math.abs(x) < 110 && Math.abs(z) < 760) continue;   // keep the airfield clear
    if (slopeAt(x, z) > 0.5) continue;
    const scale = 0.8 + rng() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.set(scale, scale, scale);
    p.set(x, h + 1.5 * scale, z);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);
    p.y = h + (3.2 + 3.4) * scale;
    m.compose(p, q, s);
    canopies.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed;
  return [trunks, canopies];
}

function buildAirfield(rng) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a4438 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 90 });

  // Two hangars east of the strip and a small tower west of it.
  for (const [x, z, w, d, hgt] of [[64, -190, 30, 20, 9], [64, -130, 24, 18, 8]]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), wallMat);
    hangar.position.set(x, terrainHeight(x, z) + hgt / 2, z);
    group.add(hangar);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.52, w * 0.52, d, 3, 1), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(x, terrainHeight(x, z) + hgt + 1.5, z);
    roof.scale.set(1, 1, 0.45);
    group.add(roof);
  }
  const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 17, 8), wallMat);
  towerBase.position.set(-58, terrainHeight(-58, -90) + 8.5, -90);
  group.add(towerBase);
  const towerCab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 3.6, 8), glassMat);
  towerCab.position.set(-58, terrainHeight(-58, -90) + 18.6, -90);
  group.add(towerCab);

  // A windsock by the threshold — a cone on a pole, pointing downwind.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), wallMat);
  pole.position.set(26, terrainHeight(26, -300) + 3.5, -300);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.6, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a2e })
  );
  sock.rotation.z = Math.PI / 2 - 0.18;
  sock.position.set(28.4, terrainHeight(26, -300) + 6.8, -300);
  group.add(sock);
  return group;
}

// buildTerrain(scene, seed) — adds ground, runway, water, trees, airfield.
export function buildTerrain(scene, seed) {
  const rng = makeRng(seed * 7919 + 13);
  scene.add(buildGroundMesh(rng));
  scene.add(buildRunway());
  scene.add(buildWater());
  for (const mesh of buildTrees(rng)) scene.add(mesh);
  scene.add(buildAirfield(rng));
}
