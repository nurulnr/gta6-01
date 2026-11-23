// Pedestrians: ordinary Solmara residents strolling the sidewalks. They walk a
// road edge, turn at intersections, and run away screaming (well: running) when
// a car bears down on them or a punch lands nearby. Punching one is a crime.
import * as THREE from 'three';
import { makeRng } from './random.js';
import { makePedMesh } from './player.js';
import { ROAD_COORDS } from './city.js';

const SKINS = [0xc98a5a, 0x8a5a3a, 0xe8b88a, 0x6a4a2a];
const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad88a, 0xd8b84a, 0x9a4ad8, 0xd87a4a, 0x4ad8d8, 0xe8e8e8];

export class Pedestrians {
  constructor(scene, seed, count) {
    this.rng = makeRng(seed + 31);
    this.list = [];
    this.scene = scene;
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  spawnOne(x, z) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const road = rng.pick(ROAD_COORDS);
    const side = rng.chance(0.5) ? 10.5 : -10.5;
    const along = rng.range(-240, 240);
    const mesh = makePedMesh(rng.pick(SHIRTS), rng.pick(SKINS));
    const ped = {
      mesh,
      pos: mesh.position,
      heading: 0,
      speed: rng.range(1.1, 1.9),
      vertical, road, side,
      dir: rng.chance(0.5) ? 1 : -1,
      state: 'walk', // walk | flee | down
      timer: 0,
      walkPhase: rng.range(0, 6),
    };
    ped.pos.set(x ?? (vertical ? road + side : along), 0, z ?? (vertical ? along : road + side));
    ped.heading = vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    mesh.position.copy(ped.pos);
    mesh.rotation.y = ped.heading;
    this.scene.add(mesh);
    this.list.push(ped);
    return ped;
  }

  step(dt, playerPos, playerSpeed) {
    for (const ped of this.list) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          // gets up, dusts off, walks away
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      // flee from a fast car or a nearby brawl
      const dPlayer = playerPos ? Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z) : 99;
      if (ped.state === 'walk' && dPlayer < 6 && playerSpeed > 8) {
        ped.state = 'flee'; ped.timer = 2.5;
      }
      const speed = ped.state === 'flee' ? 5.5 : ped.speed;
      if (ped.state === 'flee') {
        ped.timer -= dt;
        if (ped.timer <= 0) ped.state = 'walk';
        // run away from the player
        const away = Math.atan2(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        ped.heading = away;
        ped.pos.x += Math.sin(away) * speed * dt;
        ped.pos.z += Math.cos(away) * speed * dt;
      } else {
        if (ped.vertical) ped.pos.z += ped.dir * speed * dt;
        else ped.pos.x += ped.dir * speed * dt;
        const along = ped.vertical ? ped.pos.z : ped.pos.x;
        if (Math.abs(along) > 248) { ped.dir *= -1; }
        ped.heading = ped.vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        // small chance to turn onto a cross street at an intersection
        const nearest = ROAD_COORDS.reduce((a, b) => Math.abs(b - along) < Math.abs(a - along) ? b : a, ROAD_COORDS[0]);
        if (Math.abs(along - nearest) < 0.5 && this.rng.chance(0.015)) {
          ped.vertical = !ped.vertical;
          ped.road = nearest;
          ped.side = this.rng.chance(0.5) ? 10.5 : -10.5;
          if (ped.vertical) ped.pos.x = ped.road + ped.side;
          else ped.pos.z = ped.road + ped.side;
        }
      }
      ped.walkPhase += speed * dt * 3.2;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      const u = ped.mesh.userData;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  // A punch at (x, z): the nearest ped within reach goes down. Returns the ped or null.
  punchAt(x, z, reach) {
    let best = null, bestD = reach;
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < bestD) { best = ped; bestD = d; }
    }
    if (best) {
      best.state = 'down';
      best.timer = 6;
      best.mesh.rotation.x = -Math.PI / 2;
      best.mesh.position.y = 0.3;
    }
    return best;
  }

  // How many peds are down inside a radius (mission 4 counts these).
  downCountNear(x, z, radius) {
    let n = 0;
    for (const ped of this.list) {
      if (ped.state === 'down' && Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) n++;
    }
    return n;
  }
}
