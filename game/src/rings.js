// rings.js — the circuit: eight glowing gates hung in the sky around the
// valley, flown in order, then home to the runway.
//
// A ring is scored when the aeroplane crosses its plane inside the hoop.
// Only the next ring burns amber and carries a light pillar to the ground;
// cleared rings turn green, the rest wait in pale blue.

const THREE = window.THREE;

export const RING_RADIUS = 14;
export const RING_POINTS = 250;

// The course, flown from the northbound takeoff: out over the lake, around
// the south rim, and back down the western side. y is altitude in metres.
const COURSE = [
  { x: 0, y: 74, z: -720 },
  { x: 430, y: 98, z: -1080 },
  { x: 900, y: 122, z: -760 },
  { x: 1080, y: 92, z: 60 },
  { x: 640, y: 128, z: 640 },
  { x: 0, y: 148, z: 980 },
  { x: -620, y: 112, z: 640 },
  { x: -540, y: 84, z: -260 },
];

const MAT_NEXT = new THREE.MeshBasicMaterial({ color: 0xffb52e });
const MAT_WAIT = new THREE.MeshBasicMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.75 });
const MAT_DONE = new THREE.MeshBasicMaterial({ color: 0x51e07a, transparent: true, opacity: 0.6 });

export class RingCourse {
  constructor(scene) {
    this.rings = [];
    this.nextIndex = 0;
    const torusGeo = new THREE.TorusGeometry(RING_RADIUS, 0.75, 10, 42);

    COURSE.forEach((point, i) => {
      const mesh = new THREE.Mesh(torusGeo, MAT_WAIT.clone());
      mesh.position.set(point.x, point.y, point.z);
      // Face the hoop along the line of flight: from the previous gate
      // (or the runway for the first) toward the next one.
      const prev = i === 0 ? { x: 0, y: 20, z: 300 } : COURSE[i - 1];
      const next = i === COURSE.length - 1 ? { x: 0, y: 20, z: 0 } : COURSE[i + 1];
      const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
      mesh.lookAt(point.x + dir.x, point.y, point.z + dir.z);
      scene.add(mesh);

      // A soft pillar of light under the active ring so it can be found
      // from anywhere in the valley.
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, point.y, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide })
      );
      pillar.position.set(point.x, point.y / 2, point.z);
      pillar.visible = false;
      scene.add(pillar);

      this.rings.push({
        mesh,
        pillar,
        centre: new THREE.Vector3(point.x, point.y, point.z),
        normal: dir.clone(),
        passed: false,
      });
    });
    this.refreshMaterials(0);
  }

  get total() { return this.rings.length; }
  get cleared() { return this.nextIndex; }
  get allCleared() { return this.nextIndex >= this.rings.length; }

  get nextRing() {
    return this.allCleared ? null : this.rings[this.nextIndex];
  }

  refreshMaterials(time) {
    this.rings.forEach((ring, i) => {
      if (ring.passed) {
        ring.mesh.material = MAT_DONE;
        ring.pillar.visible = false;
      } else if (i === this.nextIndex) {
        ring.mesh.material = MAT_NEXT;
        const pulse = 1 + Math.sin(time * 3.2) * 0.045;
        ring.mesh.scale.set(pulse, pulse, 1);
        ring.pillar.visible = true;
      } else {
        ring.mesh.material = MAT_WAIT;
        ring.mesh.scale.set(1, 1, 1);
        ring.pillar.visible = false;
      }
    });
  }

  // checkPass(prevPos, pos) — call each frame with the aeroplane's movement;
  // returns true on the frame the active ring is threaded.
  checkPass(prevPos, pos) {
    const ring = this.nextRing;
    if (!ring) return false;
    const before = prevPos.clone().sub(ring.centre).dot(ring.normal);
    const after = pos.clone().sub(ring.centre).dot(ring.normal);
    if (before === 0 || before * after > 0) return false; // never crossed the plane
    const t = before / (before - after);
    const crossing = prevPos.clone().lerp(pos, t);
    const radial = crossing.sub(ring.centre).length();
    if (radial > RING_RADIUS * 0.98) return false;
    ring.passed = true;
    this.nextIndex++;
    return true;
  }

  reset() {
    this.nextIndex = 0;
    for (const ring of this.rings) ring.passed = false;
    this.refreshMaterials(0);
  }
}
