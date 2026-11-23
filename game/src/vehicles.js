// Cars: a procedural box-built car factory, the traffic that drives the road
// grid, and the arcade driving model the player and the police both use.
import * as THREE from 'three';
import { makeRng, clamp, angleDelta } from './random.js';
import { ROAD_COORDS } from './city.js';

const PAINT_JOBS = [0xc23a2e, 0x2e6ac2, 0x3a9e5a, 0xd8d8d8, 0x222226, 0xe8b83a, 0x7a4ac2, 0x4ac2b8, 0x8a8a8a];
const TAXI_YELLOW = 0xf2c230;

// A car built from boxes: body, glass cabin, four spinning wheels, lights.
// `kind` adds the extras: a taxi sign, a police light bar, a sports spoiler.
export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18222e, shininess: 120 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  g.add(cabin);

  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    g.add(wheel);
    wheels.push(wheel);
  }

  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), headlightMat);
    lamp.position.set(x, 0.62, 2.22);
    g.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.1), tailMat);
    tail.position.set(x, 0.62, -2.22);
    g.add(tail);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14e }),
    );
    sign.position.set(0, 1.5, -0.25);
    g.add(sign);
  }
  if (kind === 'police') {
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    blue.position.set(0, 1.45, -0.25);
    g.add(blue);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    red.position.set(0.55, 1.45, -0.25);
    g.add(red);
    // White doors read as a patrol car at a glance.
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.3, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    doors.position.set(0, 0.7, 0);
    g.add(doors);
  }
  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), bodyMat);
    spoiler.position.set(0, 1.05, -2.1);
    g.add(spoiler);
  }

  g.userData.wheels = wheels;
  return g;
}

// A drivable car: position, heading, speed and the arcade physics step.
// The same class drives the player, the traffic and the police.
export class Car {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = opts?.maxSpeed ?? 34;
    this.accel = opts?.accel ?? 16;
    this.kind = opts?.kind ?? 'sedan';
    this.stolen = false;
    this.health = 100;
    this.radius = 2.1;
  }

  // throttle -1..1, steer -1..1, handbrake bool. Returns the distance moved.
  drive(throttle, steerInput, handbrake, dt) {
    const targetSteer = clamp(steerInput, -1, 1) * 0.62;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      // Hard brake while rolling forward, gentle reverse from a stop.
      this.speed += (this.speed > 0.5 ? -26 : -8) * dt;
    }
    // Drag and rolling resistance; the handbrake bites much harder.
    this.speed -= this.speed * (handbrake ? 1.6 : 0.35) * dt;
    this.speed = clamp(this.speed, -10, this.maxSpeed);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const turnRate = this.steer * (this.speed / 8) * (handbrake ? 1.5 : 1);
    this.heading += turnRate * dt * (this.speed < 0 ? -1 : 1);
    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = Math.cos(this.heading) * this.speed * dt;
    this.pos.x += dx;
    this.pos.z += dz;
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    return Math.hypot(dx, dz);
  }
}

// Traffic: cars that follow the road grid, turning at intersections and
// wrapping around the far edge so the streets never run dry.
export class Traffic {
  constructor(scene, seed, count) {
    this.rng = makeRng(seed + 77);
    this.cars = [];
    this.scene = scene;
    for (let i = 0; i < count; i++) this.spawnOne(true);
  }

  spawnOne(anywhere) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const road = rng.pick(ROAD_COORDS);
    const lane = rng.chance(0.5) ? 3.6 : -3.6;
    const along = anywhere ? rng.range(-240, 240) : rng.pick([-250, 250]);
    const dir = rng.chance(0.5) ? 1 : -1;
    const kind = rng.chance(0.12) ? 'taxi' : 'sedan';
    const color = kind === 'taxi' ? TAXI_YELLOW : rng.pick(PAINT_JOBS);
    const mesh = makeCarMesh(color, kind);
    const car = new Car(mesh, { kind, maxSpeed: rng.range(9, 14) });
    car.traffic = { vertical, road, lane, dir, speed: car.maxSpeed };
    car.pos.set(vertical ? road + lane : along, 0, vertical ? along : road + lane);
    car.heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  // Parked cars the player can steal, lined up along the road edges.
  spawnParked(scene, count, rng) {
    const parked = [];
    for (let i = 0; i < count; i++) {
      const vertical = rng.chance(0.5);
      const road = rng.pick(ROAD_COORDS);
      const along = rng.range(-220, 220);
      const kind = rng.chance(0.15) ? 'sports' : 'sedan';
      const mesh = makeCarMesh(rng.pick(PAINT_JOBS), kind);
      const car = new Car(mesh, { kind, maxSpeed: kind === 'sports' ? 42 : 34 });
      car.parked = true;
      car.pos.set(vertical ? road + 6.2 : along, 0, vertical ? along : road + 6.2);
      car.heading = vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      scene.add(mesh);
      parked.push(car);
    }
    return parked;
  }

  step(dt, playerPos) {
    for (const car of this.cars) {
      if (car.playerDriven) continue; // the player is driving this one now
      const t = car.traffic;
      const stepLen = t.speed * dt;
      if (t.vertical) car.pos.z += t.dir * stepLen;
      else car.pos.x += t.dir * stepLen;
      // At an intersection, sometimes turn onto the cross street.
      const along = t.vertical ? car.pos.z : car.pos.x;
      const nearest = ROAD_COORDS.reduce(
        (a, b) => (Math.abs(b - along) < Math.abs(a - along) ? b : a),
        ROAD_COORDS[0],
      );
      if (Math.abs(along - nearest) < 0.6 && this.rng.chance(0.06)) {
        t.vertical = !t.vertical;
        t.road = nearest;
        t.dir = this.rng.chance(0.5) ? 1 : -1;
        t.lane = this.rng.chance(0.5) ? 3.6 : -3.6;
      }
      // Wrap around the far edge so traffic never runs out.
      if (t.vertical && Math.abs(car.pos.z) > 255) car.pos.z = -Math.sign(car.pos.z) * 255;
      if (!t.vertical && Math.abs(car.pos.x) > 255) car.pos.x = -Math.sign(car.pos.x) * 255;
      // Hold the lane line.
      if (t.vertical) car.pos.x = t.road + t.lane;
      else car.pos.z = t.road + t.lane;
      car.heading = t.vertical
        ? (t.dir > 0 ? 0 : Math.PI)
        : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      const spin = (t.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
      // Don't run the player over: brake when close ahead, ease back after.
      if (playerPos) {
        const d = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
        if (d < 12) t.speed = Math.max(2, t.speed - 20 * dt);
        else t.speed = Math.min(car.maxSpeed, t.speed + 8 * dt);
      }
    }
  }
}

// Steer a chasing car toward a target point (the police AI). Returns the
// distance to the target, so callers can decide when a ram or a bust lands.
export function chaseSteer(car, targetX, targetZ, dt, topSpeed) {
  const dx = targetX - car.pos.x;
  const dz = targetZ - car.pos.z;
  const want = Math.atan2(dx, dz);
  const delta = angleDelta(car.heading, want);
  const steer = clamp(delta * 1.8, -1, 1);
  const dist = Math.hypot(dx, dz);
  const throttle = dist > 6 ? 1 : 0.3;
  car.maxSpeed = topSpeed;
  car.drive(throttle, steer, false, dt);
  return dist;
}
