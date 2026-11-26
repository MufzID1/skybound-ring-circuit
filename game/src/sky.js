// sky.js — the dome, the sun and the drifting cloud layer.
// A vertex-coloured gradient sphere (no shaders, no textures), a bright sun
// disc matched to the directional light, and low-poly cloud puffs that drift
// on the wind so the world never feels frozen.

const THREE = window.THREE;

function buildDome() {
  const geo = new THREE.SphereGeometry(3600, 24, 14);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const horizon = [0.83, 0.90, 0.96];
  const zenith = [0.25, 0.52, 0.82];
  const below = [0.62, 0.68, 0.72];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 3600;
    let c;
    if (y >= 0) {
      const t = Math.pow(Math.min(1, y * 1.6), 0.62);
      c = [
        horizon[0] + (zenith[0] - horizon[0]) * t,
        horizon[1] + (zenith[1] - horizon[1]) * t,
        horizon[2] + (zenith[2] - horizon[2]) * t,
      ];
    } else {
      c = below;
    }
    colours[i * 3] = c[0]; colours[i * 3 + 1] = c[1]; colours[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const dome = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  dome.renderOrder = -10;
  return dome;
}

function buildSun() {
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(130, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false })
  );
  sun.position.set(1500, 1750, -2600);
  sun.lookAt(0, 0, 0);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(240, 24),
    new THREE.MeshBasicMaterial({ color: 0xffeeb0, transparent: true, opacity: 0.35, fog: false })
  );
  glow.position.copy(sun.position).multiplyScalar(1.01);
  glow.lookAt(0, 0, 0);
  const group = new THREE.Group();
  group.add(glow);
  group.add(sun);
  return group;
}

function buildClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 22; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(puffGeo, mat);
      const s = 16 + rng() * 26;
      puff.scale.set(s, s * 0.36, s * 0.7);
      puff.position.set(j * s * 0.9 - puffs * s * 0.4, rng() * 5, rng() * 14 - 7);
      cloud.add(puff);
    }
    cloud.position.set((rng() * 2 - 1) * 2100, 300 + rng() * 190, (rng() * 2 - 1) * 2100);
    group.add(cloud);
  }
  return group;
}

// buildSky(scene, rng) — adds dome, sun, lights and clouds; returns an
// update(dt) that drifts the clouds.
export function buildSky(scene, rng) {
  scene.add(buildDome());
  scene.add(buildSun());

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x53683f, 0.75);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 0.95);
  sunLight.position.set(900, 1100, -1500);
  scene.add(sunLight);

  const clouds = buildClouds(rng);
  scene.add(clouds);

  return {
    update(dt) {
      clouds.position.x += dt * 3.2;
      if (clouds.position.x > 500) clouds.position.x = -500;
    },
  };
}
