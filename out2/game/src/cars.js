// Cars: how they look, how the player drives one, and how traffic behaves.
// A car is a group of boxes (body, cabin, wheels, lights) so the whole fleet
// shares a handful of geometries. Driving is arcade: speed, a steering rate
// that falls off as the car goes faster, and circle push-out against buildings
// and other cars. Traffic follows rectangular loops along the street grid and
// slows for the car ahead.
import * as THREE from 'three';
import { collideCircle, clampToCity } from './city.js';

const PALETTE = [0xc0392b, 0x2e6db4, 0x27ae60, 0xe67e22, 0x8e44ad, 0x16a085, 0xd4c61a, 0x95a5a6, 0x1c1c22, 0xf2ede2];
const KINDS = {
  sedan: { len: 4.4, wid: 2.0, top: 0.75, cab: 2.2, max: 36 },
  sport: { len: 4.3, wid: 2.0, top: 0.62, cab: 1.9, max: 46 },
  taxi: { len: 4.4, wid: 2.0, top: 0.75, cab: 2.2, max: 34 },
  truck: { len: 5.6, wid: 2.2, top: 1.0, cab: 1.4, max: 28 },
  police: { len: 4.5, wid: 2.0, top: 0.75, cab: 2.2, max: 42 },
};

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const shadowGeo = new THREE.CircleGeometry(1, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 });

export function buildCarMesh(kind, color) {
  const spec = KINDS[kind] || KINDS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d2c3d });

  const body = new THREE.Mesh(bodyGeo, paint);
  body.scale.set(spec.wid, spec.top, spec.len);
  body.position.y = 0.42 + spec.top / 2;
  group.add(body);
  const cabin = new THREE.Mesh(bodyGeo, glass);
  cabin.scale.set(spec.wid * 0.86, 0.62, spec.cab);
  cabin.position.set(0, 0.42 + spec.top + 0.28, kind === 'truck' ? 1.4 : -0.25);
  group.add(cabin);
  if (kind === 'truck') {
    const cargo = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x7a7f85 }));
    cargo.scale.set(spec.wid * 0.94, 1.1, 2.6);
    cargo.position.set(0, 1.05, -1.2);
    group.add(cargo);
  }
  if (kind === 'sport') {
    const wing = new THREE.Mesh(bodyGeo, dark);
    wing.scale.set(spec.wid * 0.9, 0.08, 0.5);
    wing.position.set(0, 1.15, -spec.len / 2 + 0.25);
    group.add(wing);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xf7d117, emissive: 0x554400 }));
    sign.scale.set(0.9, 0.22, 0.5);
    sign.position.set(0, 0.42 + spec.top + 0.62, -0.25);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.scale.set(1.1, 0.18, 0.4);
    bar.position.set(0, 0.42 + spec.top + 0.62, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 }));
    red.scale.set(0.5, 0.2, 0.42);
    red.position.set(-0.28, 0.42 + spec.top + 0.72, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x000088 }));
    blue.scale.set(0.5, 0.2, 0.42);
    blue.position.set(0.28, 0.42 + spec.top + 0.72, -0.25);
    group.add(blue);
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x777744 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x550000 });
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(bodyGeo, lampMat);
    head.scale.set(0.34, 0.16, 0.1);
    head.position.set(s * (spec.wid / 2 - 0.3), 0.62, spec.len / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(bodyGeo, tailMat);
    tail.scale.set(0.34, 0.16, 0.1);
    tail.position.set(s * (spec.wid / 2 - 0.3), 0.62, -spec.len / 2 - 0.02);
    group.add(tail);
  }
  const wheels = [];
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (spec.wid / 2 - 0.05), 0.36, sz * (spec.len / 2 - 0.75));
    group.add(wheel);
    wheels.push(wheel);
  }
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(spec.wid * 0.9, spec.len * 0.62, 1);
  shadow.position.y = 0.02;
  group.add(shadow);
  group.userData = { wheels, kind, spec };
  return group;
}

export function makeCar(G, kind, color, x, z, heading) {
  const mesh = buildCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh, kind, color,
    pos: mesh.position,
    heading,
    speed: 0,
    maxSpeed: (KINDS[kind] || KINDS.sedan).max,
    loop: null,
    wp: 0,
    targetSpeed: 0,
    driven: false,
    parked: false,
    wheelSpin: 0,
  };
  return car;
}

export function spawnTraffic(G, count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const loop = G.city.loops[i % G.city.loops.length];
    const wp = G.rng.int(0, loop.length - 1);
    const [x, z] = loop[wp];
    const kind = G.rng.pick(['sedan', 'sedan', 'taxi', 'sport', 'truck']);
    const color = kind === 'taxi' ? 0xf7d117 : PALETTE[G.rng.int(0, PALETTE.length - 1)];
    const car = makeCar(G, kind, color, x + G.rng.range(-3, 3), z + G.rng.range(-3, 3), 0);
    car.loop = loop;
    car.wp = (wp + 1) % loop.length;
    car.targetSpeed = G.rng.range(8, 13);
    car.speed = car.targetSpeed;
    list.push(car);
  }
  return list;
}

export function spawnParked(G, count) {
  // Parked cars sit on the roads, at intersection corners, and only where the
  // city's buildings leave room: each candidate is probed against the
  // colliders, so a parked car is always reachable on foot in every seed.
  // One is guaranteed near the player's start, so the first job can begin.
  const streets = [];
  for (let v = -176; v <= 176; v += 44) streets.push(v);
  const candidates = [];
  for (const sx of streets) {
    for (const sz of streets) {
      candidates.push([sx + 4.5, sz + 4.5]);
      candidates.push([sx - 4.5, sz - 4.5]);
    }
  }
  const clear = ([x, z]) => !collideCircle({ x, z }, 3.4, G.city.colliders);
  const list = [];
  const addCar = ([x, z]) => {
    const kind = G.rng.pick(['sedan', 'sport', 'sedan', 'taxi']);
    const color = kind === 'taxi' ? 0xf7d117 : PALETTE[G.rng.int(0, PALETTE.length - 1)];
    const car = makeCar(G, kind, color, x, z, G.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    car.parked = true;
    list.push(car);
  };
  let nearest = null;
  let nearestD = Infinity;
  for (const c of candidates) {
    if (!clear(c)) continue;
    const d = Math.hypot(c[0] - G.city.spots.start.x, c[1] - G.city.spots.start.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = c;
    }
  }
  if (nearest) addCar(nearest);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(G.rng.next() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const c of candidates) {
    if (list.length >= count) break;
    if (nearest && c[0] === nearest[0] && c[1] === nearest[1]) continue;
    if (!clear(c)) continue;
    addCar(c);
  }
  return list;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    if (car.driven) continue;
    const [tx, tz] = car.loop[car.wp];
    const dx = tx - car.pos.x;
    const dz = tz - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) {
      car.wp = (car.wp + 1) % car.loop.length;
      continue;
    }
    const want = Math.atan2(dx, dz);
    const turn = Math.abs(((want - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    let target = car.targetSpeed;
    if (turn > 0.9) target = Math.min(target, 5);
    // Slow for the car ahead.
    for (const other of G.traffic) {
      if (other === car || other.driven) continue;
      const ox = other.pos.x - car.pos.x;
      const oz = other.pos.z - car.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 11 && od > 0.01) {
        const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / od;
        if (ahead > 0.6) target = Math.min(target, other.speed * 0.75);
      }
    }
    car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
    car.heading = angleLerp(car.heading, want, dt * 2.4);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    syncMesh(car, dt);
  }
}

export function updatePlayerDrive(G, dt) {
  const car = G.player.car;
  // The screenshot autopilot steers through this override; a human player
  // drives through the keys. Both speak the same { fwd, turn } shape.
  const drive = G.driveOverride || G.keys.drive();
  const maxSpeed = car.maxSpeed;
  if (drive.fwd > 0) car.speed += 16 * dt;
  else if (drive.fwd < 0) car.speed += (car.speed > 0.5 ? -26 : -10) * dt;
  else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 7 * dt);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed -= car.speed * 0.35 * dt;
  car.speed = Math.max(-11, Math.min(maxSpeed, car.speed));
  const quick = 1 - Math.min(1, Math.abs(car.speed) / maxSpeed) * 0.55;
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += drive.turn * 2.1 * quick * dt * dir * Math.min(1, Math.abs(car.speed) / 5 + 0.25);
  const beforeX = car.pos.x;
  const beforeZ = car.pos.z;
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  clampToCity(car.pos);
  if (collideCircle(car.pos, 2.1, G.city.colliders)) {
    if (Math.abs(car.speed) > 6) {
      G.sound.thud();
      G.hud.flash('Ouch — the paint job!');
    }
    car.speed *= 0.4;
  }
  // Shove traffic and parked cars instead of passing through them. The speed
  // penalty and the thud fire once per crash (a short cooldown), not every
  // frame of the contact — otherwise pushing a car ahead grinds you to a halt.
  car.crashCd = Math.max(0, (car.crashCd || 0) - dt);
  for (const other of [...G.traffic, ...G.parked]) {
    if (other === car || other.driven) continue;
    const dx = other.pos.x - car.pos.x;
    const dz = other.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / d;
      other.pos.x += dx * push * 0.6;
      other.pos.z += dz * push * 0.6;
      car.pos.x -= dx * push * 0.4;
      car.pos.z -= dz * push * 0.4;
      if (car.crashCd <= 0) {
        car.crashCd = 0.6;
        if (Math.abs(car.speed) > 8) {
          car.speed *= 0.6;
          G.sound.thud();
          if (!other.parked) G.wanted = Math.min(5, G.wanted + 1);
        }
      }
      syncMesh(other, 0);
    }
  }
  syncMesh(car, dt);
  G.sound.engine(Math.abs(car.speed) / maxSpeed, true);
}

function syncMesh(car, dt) {
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.4;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
}

export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of [...G.traffic, ...G.parked]) {
    if (car.driven) continue;
    const d = Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
