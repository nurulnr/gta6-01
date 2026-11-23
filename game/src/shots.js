// Deterministic screenshot scenes behind ?shot=<name>&seed=<n>. Each scene
// poses the live game — real cars, real police, real HUD — from a fixed seed,
// then drives the world forward a fixed number of steps with a scripted driver
// so the frame is what a short session really looks like, and the same seed
// always gives the same frame.
import { makeCarMesh, Car, chaseSteer } from './vehicles.js';
import { resolveBuildingCollision } from './city.js';
import { angleDelta, clamp } from './random.js';

const STEP = 1 / 60;

// Drive the player's car along its road toward a waypoint ahead on the road's
// centre line, steering like a careful driver; traffic and pedestrians run too.
function autopilotDrive(game, seconds) {
  const car = game.player.car;
  if (!car) return;
  for (let i = 0; i < seconds / STEP; i++) {
    const movingAlongX = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading));
    let wx, wz;
    if (movingAlongX) {
      const dir = Math.sin(car.heading) > 0 ? 1 : -1;
      wx = car.pos.x + dir * 40;
      wz = Math.round(car.pos.z / 72) * 72;
    } else {
      const dir = Math.cos(car.heading) > 0 ? 1 : -1;
      wx = Math.round(car.pos.x / 72) * 72;
      wz = car.pos.z + dir * 40;
    }
    const want = Math.atan2(wx - car.pos.x, wz - car.pos.z);
    const steer = clamp(angleDelta(car.heading, want) * 1.6, -1, 1);
    car.drive(0.85, steer, false, STEP);
    game.traffic.step(STEP, game.player.pos);
    game.pedestrians.step(STEP, game.player.pos, 0);
    // police chase manually here: police.step would trim the posed cars
    for (const cop of game.police.cars) {
      chaseSteer(cop, car.pos.x, car.pos.z, STEP, 30);
      resolveBuildingCollision(game.colliders, cop.pos, cop.radius);
    }
  }
}

export function stageShot(name, game) {
  const g = game;
  g.resetWorld(20261123);
  const L = g.landmarks;
  if (name === 'chase') {
    // Wanted 3 stars, three PD cars on the player's tail, downtown avenue.
    // The camera sits ahead of the player looking back, so the player car is
    // in the middle and the pursuing PD cars read behind it.
    g.startDriving('sports', 0, 120, Math.PI);
    g.police.setStars(3);
    for (let i = 0; i < 3; i++) {
      const mesh = makeCarMesh(0x111114, 'police');
      const car = new Car(mesh, { kind: 'police', maxSpeed: 30 });
      car.pos.set((i - 1) * 7, 0, 120 - (i + 1) * 12);
      car.heading = Math.PI;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      g.scene.add(mesh);
      g.police.cars.push(car);
    }
    g.hud.feed('Solmara PD: "All units, suspect heading north on Palm Avenue!"');
    g.hud.objective('Heat Check', '3 stars! Lose the cops — stay clean until the heat dies down.');
    autopilotDrive(g, 1.6);
    g.shotCamYaw = Math.PI; // ahead of the car, looking back at the chase
    g.shotCamPitch = 0.35;
    g.shotCamDist = 20;
    return 'chase';
  }
  if (name === 'mission') {
    // Mission 2 in progress: the package run to the pier, sunset over the sea.
    g.startDriving('sedan', 120, 0, Math.PI / 2);
    g.missions.current = 1;
    g.missions.state = 'active';
    g.missions.step = 1;
    g.missions.timer = 62;
    g.missions.enterStep();
    g.hud.feed('Tessa: "Package is hot. Pier, 90 seconds, go go go!"');
    autopilotDrive(g, 4);
    return 'mission';
  }
  if (name === 'beach') {
    // On foot at the beach plaza: palms, ocean, thugs, mission beacon.
    // Mara faces the sea; the camera looks east with her, pulled back a little.
    g.player.reset(266, 44, Math.PI / 2);
    g.missions.current = 3;
    g.missions.state = 'active';
    g.missions.step = 0;
    g.missions.enterStep();
    for (let i = 0; i < 3; i++) g.pedestrians.spawnOne(262 + (i - 1) * 5, 66);
    g.hud.feed('Vega: "Those thugs are mine now. Handle it, Mara."');
    g.hud.objective('Beach Brawl', 'Knock down 4 thugs at the beach. Walk up and press F.');
    g.pedestrians.step(STEP, g.player.pos, 0);
    g.shotCamDist = 11;
    return 'beach';
  }
  // cover: cruising the main avenue at golden hour, traffic and towers.
  g.startDriving('sports', 0, 180, Math.PI);
  g.hud.feed('Rico: "Nice wheels, Mara. The city is yours tonight."');
  g.hud.objective('First Wheels', 'Drive it to Rico\u2019s garage.');
  autopilotDrive(g, 2);
  return 'cover';
}
