// People: pedestrians who wander the sidewalks and flee from trouble, and the
// armed thugs the missions throw at the player. Everyone is built from the same
// little figure (legs, jacket, head) so a crowd stays cheap, and a hit ped or a
// dead thug simply tips over. Thugs shoot back with visible tracers.
import * as THREE from 'three';
import { collideCircle, clampToCity } from './city.js';

const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0];
const JACKETS = [0x3a6ea8, 0xa83a3a, 0x3a8a4a, 0xd4a017, 0x7a4a8a, 0xdddddd, 0x222222];

const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);
const bodyGeo = new THREE.BoxGeometry(0.56, 0.68, 0.32);
const headGeo = new THREE.SphereGeometry(0.21, 10, 8);
const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
const shadowGeo = new THREE.CircleGeometry(0.5, 14);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });

export function buildFigure(jacket, skin) {
  const g = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: jacket });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.14, 0.28, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.28, 0);
  const body = new THREE.Mesh(bodyGeo, jacketMat);
  body.position.y = 0.92;
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.5;
  const armL = new THREE.Mesh(armGeo, jacketMat);
  armL.position.set(-0.36, 0.95, 0);
  const armR = new THREE.Mesh(armGeo, jacketMat);
  armR.position.set(0.36, 0.95, 0);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(legL, legR, body, head, armL, armR, shadow);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function spawnPeds(G, count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const x = G.rng.range(-180, 180);
    const z = G.rng.range(-180, 170);
    const mesh = buildFigure(JACKETS[G.rng.int(0, JACKETS.length - 1)], SKINS[G.rng.int(0, SKINS.length - 1)]);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    list.push({
      mesh,
      pos: mesh.position,
      heading: G.rng.range(0, Math.PI * 2),
      speed: G.rng.range(1.1, 1.9),
      target: { x: G.rng.range(-180, 180), z: G.rng.range(-180, 170) },
      walkPhase: G.rng.range(0, 6),
      down: 0,
      flee: 0,
    });
  }
  return list;
}

function pickTarget(ped, G) {
  ped.target = { x: G.rng.range(-180, 180), z: G.rng.range(-180, 170) };
}

export function updatePeds(G, dt) {
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  const danger = G.player.car ? G.player.car.speed : 0;
  for (const ped of G.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      ped.mesh.rotation.z = ped.down > 0 ? Math.PI / 2 - 0.15 : 0;
      if (ped.down <= 0) {
        ped.mesh.rotation.z = 0;
        ped.flee = 3;
      }
      continue;
    }
    const dxp = ped.pos.x - px;
    const dzp = ped.pos.z - pz;
    const dp = Math.hypot(dxp, dzp);
    let speed = ped.speed;
    let tx = ped.target.x;
    let tz = ped.target.z;
    if (ped.flee > 0) {
      ped.flee -= dt;
      tx = ped.pos.x + dxp;
      tz = ped.pos.z + dzp;
      speed = 4.6;
    } else if (dp < 9 && (danger > 5 || G.gunshotTimer > 0)) {
      ped.flee = 2.5;
    }
    const dx = tx - ped.pos.x;
    const dz = tz - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      if (ped.flee <= 0) pickTarget(ped, G);
    } else {
      const want = Math.atan2(dx, dz);
      let diff = want - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      ped.walkPhase += dt * speed * 4.5;
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.55;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      ped.mesh.userData.armL.rotation.x = -swing * 0.7;
      ped.mesh.userData.armR.rotation.x = swing * 0.7;
      clampToCity(ped.pos);
      collideCircle(ped.pos, 0.5, G.city.colliders);
    }
    // Run over by the player's car: knocked down, and the law notices.
    if (G.player.car && Math.abs(G.player.car.speed) > 4 && dp < 1.9) {
      ped.down = 6;
      ped.mesh.rotation.z = Math.PI / 2 - 0.15;
      G.sound.thud();
      G.wanted = Math.min(5, G.wanted + 1);
      G.hud.flash('Pedestrian down — the cops saw that!');
      for (const p of G.peds) {
        if (Math.hypot(p.pos.x - ped.pos.x, p.pos.z - ped.pos.z) < 18) p.flee = 3;
      }
    }
  }
}

// --- Thugs -----------------------------------------------------------------

export function spawnThug(G, x, z) {
  const mesh = buildFigure(0x6e1f1f, SKINS[G.rng.int(0, SKINS.length - 1)]);
  mesh.position.set(x, 0, z);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.36, 1.0, 0.35);
  mesh.add(gun);
  G.scene.add(mesh);
  const thug = {
    mesh,
    pos: mesh.position,
    heading: G.rng.range(0, Math.PI * 2),
    health: 30,
    shootCd: G.rng.range(0.5, 1.5),
    down: false,
    paid: false,
  };
  G.thugs.push(thug);
  return thug;
}

let tracerPool = null;
export function updateThugs(G, dt) {
  if (!tracerPool) {
    tracerPool = [];
    for (let i = 0; i < 6; i += 1) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      G.scene.add(line);
      tracerPool.push({ line, life: 0 });
    }
  }
  for (const t of tracerPool) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life * 6);
    }
  }
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  for (const thug of G.thugs) {
    if (thug.down) continue;
    const dx = px - thug.pos.x;
    const dz = pz - thug.pos.z;
    const d = Math.hypot(dx, dz);
    thug.heading = Math.atan2(dx, dz);
    thug.mesh.rotation.y = thug.heading;
    thug.shootCd -= dt;
    if (d < 42 && thug.shootCd <= 0 && G.player.alive) {
      thug.shootCd = G.rng.range(0.9, 1.7);
      G.sound.gunshot();
      G.gunshotTimer = 1.2;
      const miss = d > 18 ? 0.75 : 0.45;
      if (G.rng.chance(1 - miss)) {
        const dmg = G.rng.range(6, 11);
        G.player.health -= dmg;
        G.hud.flash(`Hit! -${Math.round(dmg)} health`);
        G.hud.damageVignette();
      }
      const tracer = tracerPool.find((t) => t.life <= 0);
      if (tracer) {
        const pos = tracer.line.geometry.attributes.position;
        pos.setXYZ(0, thug.pos.x + Math.sin(thug.heading) * 0.4, 1.15, thug.pos.z + Math.cos(thug.heading) * 0.4);
        pos.setXYZ(1, px + G.rng.range(-1.5, 1.5), 1.2, pz + G.rng.range(-1.5, 1.5));
        pos.needsUpdate = true;
        tracer.life = 0.16;
        tracer.line.material.opacity = 0.9;
      }
    }
  }
}

// The player's shot: a hitscan from the camera's aim. Returns the thug hit.
export function playerShoot(G) {
  if (!G.player.alive || G.player.car) return null;
  const dirX = Math.sin(G.player.aimHeading);
  const dirZ = Math.cos(G.player.aimHeading);
  let best = null;
  let bestD = 46;
  for (const thug of G.thugs) {
    if (thug.down) continue;
    const dx = thug.pos.x - G.player.pos.x;
    const dz = thug.pos.z - G.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const along = dx * dirX + dz * dirZ;
    if (along < 0) continue;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (side < 1.1 + d * 0.03) {
      best = thug;
      bestD = d;
    }
  }
  G.sound.gunshot();
  G.gunshotTimer = 1.2;
  if (best) {
    best.health -= 12;
    if (best.health <= 0 && !best.down) {
      best.down = true;
      best.mesh.rotation.z = Math.PI / 2 - 0.12;
      best.mesh.position.y = 0.25;
      G.cash += 120;
      G.hud.flash('Thug down — +$120');
      G.sound.cash();
    }
  }
  return best;
}
