// Coral Bay: a sun-soaked coastal city built fresh every run from one seed.
// A street grid (every 44 m), downtown towers near the middle, low blocks by the
// beach, a park to the east, a marina and a pier running out into the sea to the
// south. Buildings are boxes with painted window textures; palms, lamps and a
// big rooftop sign give it its look. The module returns the colliders (building
// footprints) and the map data the HUD's minimap and the traffic draw from.
import * as THREE from 'three';

const STREET_STEP = 44;
const STREET_HALF = 176;
const BEACH_Z = 196;
const SEA_Z = 232;
const ROAD_W = 13;

function windowTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const x = 10 + col * 19;
      const y = 12 + row * 20;
      g.fillStyle = rng.chance(lit) ? '#ffd98a' : '#20283a';
      g.fillRect(x, y, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3d4048';
  for (let i = 0; i < 300; i += 1) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#c9c9a8';
  g.fillRect(62, 8, 4, 40);
  g.fillRect(62, 72, 4, 40);
  g.fillStyle = '#e8e8e8';
  g.fillRect(4, 0, 3, 128);
  g.fillRect(121, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6b48';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = y % 32 === 0 ? '#7d5f3e' : '#937552';
    g.fillRect(0, y, 128, 14);
    g.fillStyle = '#5d4630';
    g.fillRect(0, y + 14, 128, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#10202e';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff5a7a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#ffd166';
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const mapBuildings = [];
  const mapRoads = [];
  const group = new THREE.Group();
  scene.add(group);

  // Golden-hour sky: a dome that grades from deep blue overhead to amber at
  // the horizon, plus a low sun disc in the west.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b4d80) },
      mid: { value: new THREE.Color(0xff9e57) },
      low: { value: new THREE.Color(0xffc98a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;'
      + ' void main(){ float h = normalize(vP).y;'
      + ' vec3 c = h > 0.10 ? mix(mid, top, smoothstep(0.10, 0.62, h)) : mix(low, mid, smoothstep(-0.06, 0.10, h));'
      + ' gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 28, 18), skyMat);
  group.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  sun.position.set(-620, 105, -260);
  sun.lookAt(0, 40, 0);
  group.add(sun);

  scene.fog = new THREE.Fog(0xf2a05c, 170, 640);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x54463a, 0.85);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffd2a0, 1.7);
  sunLight.position.set(-190, 110, 70);
  scene.add(sunLight);

  // Ground, beach and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x8f9a7a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -30);
  group.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 44),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, BEACH_Z + 20);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, SEA_Z + 150);
  group.add(sea);

  // Streets: a grid of asphalt strips with sidewalks.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const lines = [];
  for (let v = -STREET_HALF; v <= STREET_HALF; v += STREET_STEP) lines.push(v);
  for (const v of lines) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 560), roadMat.clone());
    ns.material.map = roadTex.clone();
    ns.material.map.repeat.set(1, 14);
    ns.material.map.needsUpdate = true;
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(v, 0.06, -30);
    group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(560, ROAD_W), roadMat.clone());
    ew.material.map = roadTex.clone();
    ew.material.map.repeat.set(14, 1);
    ew.material.map.needsUpdate = true;
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.06, v);
    group.add(ew);
    const walkN = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 6, 560), walkMat);
    walkN.rotation.x = -Math.PI / 2;
    walkN.position.set(v, 0.04, -30);
    group.add(walkN);
    const walkE = new THREE.Mesh(new THREE.PlaneGeometry(560, ROAD_W + 6), walkMat);
    walkE.rotation.x = -Math.PI / 2;
    walkE.position.set(0, 0.04, v);
    group.add(walkE);
    mapRoads.push({ x1: v, z1: -310, x2: v, z2: 250 });
    mapRoads.push({ x1: -280, z1: v, x2: 280, z2: v });
  }

  // Buildings, one block at a time. Downtown (near the centre) goes tall, the
  // beachfront stays low, the east side keeps a park, the west a marina yard.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const texA = windowTexture(rng, '#7a6a58', 0.45);
  const texB = windowTexture(rng, '#5d6f7d', 0.5);
  const texC = windowTexture(rng, '#8a7f72', 0.4);
  const glassTex = windowTexture(rng, '#2e4a66', 0.65);
  const mats = [texA, texB, texC].map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const glassMat = new THREE.MeshLambertMaterial({ map: glassTex });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const park = { x: 132, z: -44, w: 88, d: 88 };

  for (let bx = -STREET_HALF; bx < STREET_HALF; bx += STREET_STEP) {
    for (let bz = -STREET_HALF; bz < STREET_HALF; bz += STREET_STEP) {
      const cx = bx + STREET_STEP / 2;
      const cz = bz + STREET_STEP / 2;
      if (cz > 176) continue; // the beach strip stays open
      if (Math.abs(cx - park.x) < park.w / 2 + 4 && Math.abs(cz - park.z) < park.d / 2 + 4) continue;
      if (cx < -150 && cz > 88) continue; // marina yard
      const distCentre = Math.hypot(cx, cz);
      const tall = distCentre < 70;
      const count = rng.int(1, tall ? 2 : 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(13, 22);
        const d = rng.range(13, 22);
        const h = tall ? rng.range(34, 78) : rng.range(9, 24);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const x = cx + ox;
        const z = cz + oz;
        const mat = tall && rng.chance(0.6) ? glassMat : mats[rng.int(0, 2)];
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        group.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w * 0.55, 1.2, d * 0.55);
        roof.position.set(x, h + 0.6, z);
        group.add(roof);
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        mapBuildings.push({ x, z, w, d });
      }
    }
  }

  // The Meridian Tower, the city's tallest landmark, with a rooftop sign.
  const tower = new THREE.Mesh(boxGeo, glassMat);
  tower.scale.set(26, 110, 26);
  tower.position.set(-22, 55, -22);
  group.add(tower);
  const towerRoof = new THREE.Mesh(boxGeo, roofMat);
  towerRoof.scale.set(14, 2, 14);
  towerRoof.position.set(-22, 111, -22);
  group.add(towerRoof);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 10),
    new THREE.MeshBasicMaterial({ map: signTexture('CORAL BAY'), transparent: false }),
  );
  sign.position.set(-22, 100, -8.6);
  group.add(sign);
  colliders.push({ x: -22, z: -22, hw: 13.4, hd: 13.4 });
  mapBuildings.push({ x: -22, z: -22, w: 26, d: 26 });

  // The park: lawn, trees, benches.
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(park.w, park.d),
    new THREE.MeshLambertMaterial({ color: 0x6da054 }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(park.x, 0.05, park.z);
  group.add(lawn);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.4, 6);
  const leafGeo = new THREE.SphereGeometry(2.6, 8, 6);
  for (let i = 0; i < 14; i += 1) {
    const x = park.x + rng.range(-38, 38);
    const z = park.z + rng.range(-38, 38);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.7, z);
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.y = 0.8;
    leaf.position.set(x, 4.4, z);
    group.add(leaf);
  }

  // The pier: planks out into the sea, a lighthouse at its end, moored boats.
  const pier = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 72),
    new THREE.MeshLambertMaterial({ map: plankTexture() }),
  );
  pier.rotation.x = -Math.PI / 2;
  pier.position.set(44, 0.35, BEACH_Z + 52);
  group.add(pier);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7d5f3e });
  for (let s = -1; s <= 1; s += 2) {
    for (let z = BEACH_Z + 20; z <= BEACH_Z + 84; z += 12) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), pierMat);
      post.position.set(44 + s * 5.4, -0.5, z);
      group.add(post);
    }
  }
  const lightBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2 }));
  lightBase.position.set(44, 7, BEACH_Z + 84);
  group.add(lightBase);
  const lightTop = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0xffd166, emissive: 0xaa7711 }));
  lightTop.position.set(44, 15.5, BEACH_Z + 84);
  group.add(lightTop);
  colliders.push({ x: 44, z: BEACH_Z + 84, hw: 3.2, hd: 3.2 });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x3a6ea8 });
  [[24, 252, hullMat], [64, 246, hullMat2], [80, 258, hullMat]].forEach(([x, z, m]) => {
    const hull = new THREE.Mesh(boxGeo, m);
    hull.scale.set(4, 1.6, 10);
    hull.position.set(x, 0.6, z);
    hull.rotation.y = rng.range(-0.2, 0.2);
    group.add(hull);
    const cabin = new THREE.Mesh(boxGeo, roofMat);
    cabin.scale.set(2.4, 1.2, 3);
    cabin.position.set(x, 1.9, z);
    group.add(cabin);
  });

  // Palms along the beachfront and the main avenue.
  const palmTrunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 7, 6);
  const palmLeafGeo = new THREE.SphereGeometry(2.2, 7, 5);
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: 0x2f7d46 });
  for (let i = 0; i < 46; i += 1) {
    let x;
    let z;
    if (i < 26) {
      x = -250 + i * 20 + rng.range(-4, 4);
      z = BEACH_Z - 6 + rng.range(-2, 2);
    } else {
      x = rng.pick([-52, 52]) + rng.range(-3, 3);
      z = -170 + (i - 26) * 18 + rng.range(-3, 3);
    }
    const lean = rng.range(-0.12, 0.12);
    const trunk = new THREE.Mesh(palmTrunkGeo, trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = lean;
    group.add(trunk);
    const crown = new THREE.Mesh(palmLeafGeo, palmLeafMat);
    crown.scale.set(1.5, 0.55, 1.5);
    crown.position.set(x + lean * 12, 7.2, z);
    group.add(crown);
  }

  // Street lamps along the main avenue and the beach road.
  const lampPoleGeo = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampHeadGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x886611 });
  for (let z = -176; z <= 176; z += 44) {
    for (const x of [-10, 10]) {
      const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
      pole.position.set(x, 3.5, z);
      group.add(pole);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(x, 7.1, z);
      group.add(head);
    }
  }

  // Traffic loops: rectangles along the street grid the traffic cars follow.
  const loops = [
    [[-88, -88], [88, -88], [88, 88], [-88, 88]],
    [[-132, -44], [132, -44], [132, 132], [-132, 132]],
    [[-44, -132], [44, -132], [44, 44], [-44, 44]],
    [[-176, 0], [176, 0], [176, 176], [-176, 176]],
  ];

  return {
    group,
    colliders,
    mapBuildings,
    mapRoads,
    loops,
    beachZ: BEACH_Z,
    seaZ: SEA_Z,
    spots: {
      garage: { x: -66, z: 66 },
      bank: { x: 22, z: -22 },
      pier: { x: 44, z: BEACH_Z + 60 },
      safehouse: { x: -132, z: -132 },
      hotel: { x: 66, z: 154 },
      club: { x: 110, z: -66 },
      start: { x: 0, z: 120 },
    },
  };
}

// Push a circle (x, z, radius) out of every building footprint it overlaps.
// Returns true when a push happened.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const nx = Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
    const nz = Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        pos.x += radius;
      }
    }
  }
  return hit;
}

export function clampToCity(pos) {
  pos.x = Math.max(-272, Math.min(272, pos.x));
  pos.z = Math.max(-302, Math.min(246, pos.z));
}
