// Solmara Bay: a procedural sun-soaked coastal city. Everything is built from
// boxes, cylinders and canvas textures at load time from one fixed seed, so
// the city is identical on every run. This module also hands the game its
// road grid, its building colliders and the named places the missions point
// at: Rico's garage, the bank, the hotel, the club, the safehouse, the tower,
// the pier and the beach.
import * as THREE from 'three';
import { makeRng, clamp } from './random.js';

export const PITCH = 72; // block + road, centre to centre
export const ROAD_W = 16;
export const BLOCK = PITCH - ROAD_W;
export const ROAD_COORDS = [-216, -144, -72, 0, 72, 144, 216];
export const CITY_EDGE = 232; // half-width of the built-up area
export const BEACH_X = 252; // sand starts here
export const WATER_X = 316; // the sea starts here

const FACADE_COLORS = [0xd8c9a8, 0xc9b8a0, 0xb8c4c9, 0xd9a08a, 0xa8b8a0, 0xc9a8b8, 0xe0d0b0, 0x9fb8c9];

// A small canvas turned into a texture, for facades, signs and road paint.
function paintTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function facadeTexture(rng, baseColor, floors, columns) {
  return paintTexture(256, 256, (g, w, h) => {
    g.fillStyle = baseColor;
    g.fillRect(0, 0, w, h);
    // A soft vertical gradient so flat faces read as concrete, not paper.
    const shade = g.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.18)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    const cellW = w / columns;
    const cellH = h / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < columns; c++) {
        const lit = rng.chance(0.28);
        g.fillStyle = lit ? '#ffd98a' : 'rgba(20,30,50,0.85)';
        g.fillRect(c * cellW + cellW * 0.22, f * cellH + cellH * 0.28, cellW * 0.56, cellH * 0.5);
      }
    }
    // A darker strip along the top reads as a parapet shadow.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 8);
  });
}

function signTexture(text, bg, fg, sub) {
  return paintTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = 'bold 64px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) {
      g.font = '28px Trebuchet MS, sans-serif';
      g.fillText(sub, w / 2, h - 30);
    }
  });
}

function roadTexture(rng) {
  return paintTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#2e2e33';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 200; i++) {
      g.fillRect(rng.range(0, w), rng.range(0, h), 2, 2);
    }
    // Centre dashes and edge lines.
    g.fillStyle = '#e8c84a';
    g.fillRect(w / 2 - 3, 0, 3, 40);
    g.fillRect(w / 2 - 3, 128, 3, 40);
    g.fillStyle = '#d8d8d8';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const landmarks = {};
  const group = new THREE.Group();
  scene.add(group);

  // ---- golden-hour sky, sun and fog over the bay ----
  scene.background = new THREE.Color(0xffb36b);
  scene.fog = new THREE.Fog(0xf7a55c, 180, 620);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(-180, 140, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x3a4a5a, 1.1));

  // ---- ground: grass inland, sand at the beach, sea beyond ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x6f7f56 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 900),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 40, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 900),
    new THREE.MeshLambertMaterial({ color: 0x2a7a9e }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WATER_X + 200, 0.0, 0);
  group.add(sea);
  // A second, translucent sea plane gives the water a shifting shimmer.
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 900),
    new THREE.MeshLambertMaterial({ color: 0x3a8ab0, transparent: true, opacity: 0.35 }),
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(WATER_X + 200, 0.06, 0);
  group.add(shimmer);

  // ---- the road grid: seven avenues each way, dashed and edged ----
  const roadTex = roadTexture(rng);
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  for (const c of ROAD_COORDS) {
    for (const vertical of [true, false]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, 14);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W, 560),
        new THREE.MeshLambertMaterial({ map: tex }),
      );
      road.geometry.rotateX(-Math.PI / 2);
      road.rotation.y = vertical ? 0 : Math.PI / 2;
      road.position.set(vertical ? c : 0, 0.01, vertical ? 0 : c);
      road.receiveShadow = true;
      group.add(road);
    }
  }

  // ---- buildings: one named place per district, the rest procedural ----
  const facadeCache = new Map();
  function facade(base, floors, cols) {
    const key = base + '|' + floors + '|' + cols;
    if (!facadeCache.has(key)) facadeCache.set(key, facadeTexture(rng, base, floors, cols));
    return facadeCache.get(key);
  }

  const namedPlaces = [
    { key: 'garage', name: "RICO'S GARAGE", sub: 'repairs · chop shop', x: -180, z: 180, w: 34, d: 24, h: 10, color: '#c94f2e', bg: '#2e1a12', fg: '#ffb14e' },
    { key: 'bank', name: 'SOLMARA BANK', sub: 'est. 1962', x: 36, z: -36, w: 30, d: 26, h: 34, color: '#d8c9a8', bg: '#1a2a3a', fg: '#e8d8a0' },
    { key: 'hotel', name: 'HOTEL MIRAMAR', sub: 'beachfront suites', x: 180, z: -108, w: 30, d: 24, h: 44, color: '#e8d8c0', bg: '#0e3a4a', fg: '#ffd98a' },
    { key: 'club', name: 'CLUB VEGA', sub: 'open til dawn', x: -36, z: 108, w: 28, d: 22, h: 16, color: '#3a1a4a', bg: '#1a0a2e', fg: '#ff5ad0' },
    { key: 'safehouse', name: 'SAFEHOUSE', sub: "Mara's place", x: -180, z: -108, w: 26, d: 20, h: 22, color: '#a8b8a0', bg: '#24301e', fg: '#c8ffb0' },
    { key: 'tower', name: 'SOLMARA TOWER', sub: '', x: 36, z: 36, w: 34, d: 34, h: 96, color: '#b8c4d8', bg: '#101820', fg: '#ffd23e' },
  ];

  function addBuilding(x, z, w, d, h, colorHex, place) {
    const floors = Math.max(2, Math.round(h / 4.5));
    const cols = Math.max(3, Math.round(w / 6));
    const face = new THREE.MeshLambertMaterial({ map: facade(colorHex, floors, cols) });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [face, face, roofMat, roofMat, face, face],
    );
    mesh.position.set(x, h / 2 + 0.15, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A rooftop plant box so the skyline is not all flat slabs.
    const roofBox = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.3, 2, d * 0.3),
      new THREE.MeshLambertMaterial({ color: 0x555550 }),
    );
    roofBox.position.set(x + w * 0.2, h + 1.15, z);
    group.add(roofBox);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (place) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(30, w + 6), 7.5),
        new THREE.MeshBasicMaterial({ map: signTexture(place.name, place.bg, place.fg, place.sub) }),
      );
      sign.position.set(x, Math.min(h - 2, 12), z + d / 2 + 0.15);
      group.add(sign);
      landmarks[place.key] = { x, z, h };
    }
    return mesh;
  }

  const blockMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const downtown = (x, z) => Math.max(0, 1 - Math.hypot(x, z) / 260);
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const cx = -180 + bx * PITCH;
      const cz = -180 + bz * PITCH;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 4, 0.3, BLOCK + 4), blockMat);
      slab.position.set(cx, 0, cz);
      slab.receiveShadow = true;
      group.add(slab);
      const here = namedPlaces.filter((n) => Math.abs(n.x - cx) < PITCH / 2 && Math.abs(n.z - cz) < PITCH / 2);
      if (here.length > 0) {
        for (const place of here) addBuilding(place.x, place.z, place.w, place.d, place.h, place.color, place);
        continue;
      }
      // Ordinary blocks: one to three buildings around a small courtyard.
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const ox = (i % 2 === 0 ? -1 : 1) * rng.range(4, 12);
        const oz = (i < 2 ? -1 : 1) * rng.range(4, 12);
        const h = Math.round((10 + downtown(cx, cz) * 46 + rng.range(0, 14)) / 2) * 2;
        const color = '#' + new THREE.Color(rng.pick(FACADE_COLORS)).getHexString();
        addBuilding(cx + ox, cz + oz, w, d, clamp(h, 10, 68), color, null);
      }
    }
  }

  // ---- palms along the beach and the main avenue ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8a4a });
  function palm(x, z, s) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    tree.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 4.5 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6 * s, 7 * s, Math.sin(a) * 1.6 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true;
      tree.add(leaf);
    }
    tree.position.set(x, 0, z);
    group.add(tree);
  }
  for (let z = -260; z <= 260; z += 26) {
    palm(BEACH_X + 8 + rng.range(-3, 3), z + rng.range(-6, 6), rng.range(0.9, 1.3));
    if (rng.chance(0.5)) palm(BEACH_X + 22, z + 12, rng.range(0.8, 1.1));
  }
  for (let x = -200; x <= 200; x += 36) {
    if (rng.chance(0.6)) palm(x, -8.5, 1);
    if (rng.chance(0.6)) palm(x + 18, 8.5, 1);
  }

  // ---- streetlights along every avenue ----
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (const c of ROAD_COORDS) {
    for (let t = -240; t <= 240; t += 48) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), poleMat);
      pole.position.set(c + 9, 3.5, t);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bulbMat);
      bulb.position.set(c + 9, 7.1, t);
      group.add(bulb);
    }
  }

  // ---- the pier, jutting into the sea at z = 0 ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 22), pierMat);
  pier.position.set(WATER_X + 34, 1.2, 0);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), pierMat);
    post.position.set(WATER_X + 6 + i * 16, 0, i % 2 === 0 ? -10 : 10);
    group.add(post);
  }
  landmarks.pier = { x: WATER_X + 14, z: 0, h: 4 };
  landmarks.beach = { x: BEACH_X + 20, z: 60, h: 2 };

  // ---- clouds: soft white blobs drifting high above the bay ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(8, 18), 8, 6), cloudMat);
      puff.position.set(j * rng.range(8, 14) - 20, rng.range(-2, 2), rng.range(-6, 6));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-320, 320), rng.range(90, 130), rng.range(-320, 320));
    group.add(cloud);
  }

  return { group, colliders, landmarks, rng };
}

// Is a point inside any building? Used when spawning cars and stashes.
export function hitsBuilding(colliders, x, z, r) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
  }
  return null;
}

// Push a circle at (pos.x, pos.z) with radius r out of every building it
// overlaps, along the smallest push. Returns the collider hit, or null.
export function resolveBuildingCollision(colliders, pos, r) {
  for (const c of colliders) {
    if (pos.x + r <= c.minX || pos.x - r >= c.maxX || pos.z + r <= c.minZ || pos.z - r >= c.maxZ) {
      continue;
    }
    const pushLeft = pos.x + r - c.minX;
    const pushRight = c.maxX - (pos.x - r);
    const pushUp = pos.z + r - c.minZ;
    const pushDown = c.maxZ - (pos.z - r);
    const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (smallest === pushLeft) pos.x = c.minX - r;
    else if (smallest === pushRight) pos.x = c.maxX + r;
    else if (smallest === pushUp) pos.z = c.minZ - r;
    else pos.z = c.maxZ + r;
    return c;
  }
  return null;
}
