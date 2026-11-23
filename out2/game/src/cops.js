// The law: a wanted level from 0 to 5 stars, police cruisers that spawn at the
// edge of the player's view and chase, and the bust that ends a run. Cops ram a
// fleeing car and corner a player on foot; lay low out of sight and the heat
// cools one star at a time.
import { makeCar } from './cars.js';
import { collideCircle, clampToCity } from './city.js';

export function spawnCop(G) {
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  // Spawn on a street roughly 55-75 m away, in the direction the player is not
  // looking, so the cruiser drives in instead of popping into view.
  const angle = G.player.heading + Math.PI + G.rng.range(-0.9, 0.9);
  let x = px + Math.sin(angle) * G.rng.range(55, 75);
  let z = pz + Math.cos(angle) * G.rng.range(55, 75);
  x = Math.max(-190, Math.min(190, x));
  z = Math.max(-190, Math.min(185, z));
  const car = makeCar(G, 'police', 0xf2f2f2, x, z, Math.atan2(px - x, pz - z));
  car.maxSpeed = 42;
  car.targetSpeed = 30;
  G.cops.push({ car, bustTimer: 0, stuck: 0 });
  return car;
}

export function desiredCops(wanted) {
  return Math.min(5, wanted + (wanted >= 3 ? 1 : 0));
}

export function updateCops(G, dt) {
  const want = desiredCops(G.wanted);
  while (G.cops.length < want) spawnCop(G);
  // Extra cruisers leave when the heat dies down.
  if (G.wanted === 0 && G.cops.length > 0) {
    for (const cop of G.cops) {
      const d = Math.hypot(cop.car.pos.x - G.player.pos.x, cop.car.pos.z - G.player.pos.z);
      if (d > 90) {
        G.scene.remove(cop.car.mesh);
        G.cops.splice(G.cops.indexOf(cop), 1);
      }
    }
  }
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  const playerSpeed = G.player.car ? Math.abs(G.player.car.speed) : 0;
  let nearest = Infinity;
  for (const cop of G.cops) {
    const car = cop.car;
    const dx = px - car.pos.x;
    const dz = pz - car.pos.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const targetSpeed = G.player.car
      ? Math.min(42, playerSpeed + 7)
      : Math.min(16, 8 + d * 0.12);
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
    car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    const ox = car.pos.x;
    const oz = car.pos.z;
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    clampToCity(car.pos);
    if (collideCircle(car.pos, 2.1, G.city.colliders)) {
      car.speed *= 0.5;
      // Stuck against a building: reverse out for a moment.
      cop.stuck += dt;
      if (cop.stuck > 1.2) {
        car.heading += Math.PI * 0.7;
        car.speed = -6;
        cop.stuck = 0;
      }
    } else {
      cop.stuck = 0;
    }
    // Ram the player's car: shove the two apart firmly, and only take speed
    // off once per hit (a short cooldown), or a cruiser glued to the bumper
    // grinds the player to a stop while the two cars overlap.
    if (G.player.car && d < 4.6) {
      const overlap = 4.6 - d;
      const nx = dx / Math.max(0.1, d);
      const nz = dz / Math.max(0.1, d);
      G.player.car.pos.x += nx * overlap * 0.55;
      G.player.car.pos.z += nz * overlap * 0.55;
      car.pos.x -= nx * overlap * 0.45;
      car.pos.z -= nz * overlap * 0.45;
      cop.ramCd = Math.max(0, (cop.ramCd || 0) - dt);
      if (cop.ramCd <= 0) {
        cop.ramCd = 0.8;
        G.player.car.speed *= 0.78;
        car.speed *= 0.85;
        if (Math.abs(G.player.car.speed) > 6) G.sound.thud();
      }
    } else {
      cop.ramCd = Math.max(0, (cop.ramCd || 0) - dt);
    }
    // On foot, a cruiser that reaches the player starts the bust.
    if (!G.player.car && d < 3.6) {
      cop.bustTimer += dt;
    } else if (!G.player.car && d < 7 && playerSpeed < 0.5) {
      cop.bustTimer += dt * 0.4;
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
    }
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
    car.wheelSpin = (car.wheelSpin || 0) + car.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  }
  // Heat cools when no cruiser can see the player.
  if (G.wanted > 0) {
    if (nearest > 60) G.calmTimer += dt;
    else G.calmTimer = 0;
    if (G.calmTimer > 16) {
      G.wanted -= 1;
      G.calmTimer = 0;
      G.hud.flash(G.wanted === 0 ? 'Heat off — you are clean.' : `Heat down to ${G.wanted} star${G.wanted === 1 ? '' : 's'}.`);
    }
  }
  G.nearestCop = nearest;
  // Busted when any cruiser holds the player long enough.
  G.bustProgress = 0;
  for (const cop of G.cops) {
    const need = G.player.car ? 2.2 : 1.3;
    if (cop.bustTimer > 0) G.bustProgress = Math.max(G.bustProgress, cop.bustTimer / need);
    if (cop.bustTimer > need && G.player.alive) {
      G.busted = true;
      return;
    }
  }
}
