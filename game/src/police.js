// The wanted system: stars 0-5, heat that rises with crimes and cools off when
// the player stays clean, and the Solmara PD cars that chase, ram and bust.
import * as THREE from 'three';
import { makeCarMesh, Car, chaseSteer } from './vehicles.js';
import { resolveBuildingCollision } from './city.js';
import { clamp } from './random.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.stars = 0;
    this.heat = 0;            // 0..100, drives the star level
    this.cleanTimer = 0;      // seconds since the last crime
    this.cars = [];
    this.bustTimer = 0;       // how long a cop has been touching the player on foot
    this.sirenOn = false;
  }

  addHeat(amount, reason) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.cleanTimer = 0;
    const want = this.heat < 12 ? 0 : this.heat < 28 ? 1 : this.heat < 45 ? 2 : this.heat < 62 ? 3 : this.heat < 82 ? 4 : 5;
    if (want > this.stars) return { rose: true, stars: want, reason };
    this.stars = want;
    return { rose: false, stars: want, reason };
  }

  setStars(n) {
    this.stars = clamp(n, 0, 5);
    this.heat = [0, 15, 32, 50, 68, 88][this.stars];
  }

  wantedCars() {
    return [0, 1, 2, 3, 4, 6][this.stars];
  }

  step(dt, player, onBusted, onRam) {
    // cool off when clean: 20 clean seconds drops a star
    this.cleanTimer += dt;
    if (this.cleanTimer > 6 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * (this.stars >= 3 ? 1.2 : 2.2));
      this.stars = this.heat < 12 ? 0 : this.heat < 28 ? 1 : this.heat < 45 ? 2 : this.heat < 62 ? 3 : this.heat < 82 ? 4 : 5;
    }
    // spawn / despawn pursuit cars to match the wanted level
    const want = this.wantedCars();
    while (this.cars.length < want) this.spawnCar(player);
    while (this.cars.length > want) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
    const target = player.onFoot ? player.pos : player.car.pos;
    let anyNear = false;
    for (const car of this.cars) {
      const dist = chaseSteer(car, target.x, target.z, dt, 26 + this.stars * 2.5);
      resolveBuildingCollision(this.colliders, car.pos, car.radius);
      if (dist < 30) anyNear = true;
      // ramming the player's car hurts
      if (!player.onFoot && dist < 3.4) {
        if (onRam) onRam(car);
        // bounce the police car off a little so it does not stick
        car.pos.x += Math.sin(car.heading + Math.PI) * 2;
        car.pos.z += Math.cos(car.heading + Math.PI) * 2;
      }
      // a cop touching the player on foot starts the bust
      if (player.onFoot && dist < 2.2) {
        this.bustTimer += dt;
        if (this.bustTimer > 1.4 && onBusted) { this.bustTimer = 0; onBusted(); }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
    }
    this.sirenOn = this.cars.length > 0 && anyNear;
    return this.sirenOn;
  }

  spawnCar(player) {
    const mesh = makeCarMesh(0x111114, 'police');
    // white doors: a second, slightly wider white box mid-body
    const car = new Car(mesh, { kind: 'police', maxSpeed: 30 });
    const a = Math.random() * Math.PI * 2;
    const tx = player.onFoot ? player.pos.x : player.car.pos.x;
    const tz = player.onFoot ? player.pos.z : player.car.pos.z;
    car.pos.set(tx + Math.sin(a) * 55, 0, tz + Math.cos(a) * 55);
    resolveBuildingCollision(this.colliders, car.pos, car.radius);
    car.heading = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  clear() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
    this.stars = 0;
    this.heat = 0;
    this.bustTimer = 0;
  }
}
