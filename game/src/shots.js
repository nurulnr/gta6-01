// Deterministic screenshot scenes behind ?shot=<name>. Each scene poses the
// live game — real cars, real police, the real HUD — from a fixed seed, then
// drives the world forward a fixed number of steps with a scripted driver, so
// the frame is what a short session really looks like, and the same seed
// always gives the same frame.
import { makeCarMesh, Car, chaseSteer } from './vehicles.js';
import { resolveBuildingCollision } from './city.js';
import { angleDelta, clamp } from './random.js';

const STEP = 1 / 60;
const SHOT_SEED = 20261123;

// Drive the player's car along its road toward a waypoint ahead on the road's
// centre line, steering like a careful driver; traffic and pedestrians run
// too, and the police chase is stepped by hand so the posed cars stay put.
function autopilotDrive(game, seconds) {
  const car = game.player.car;
  if (!car) return;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const headingEastWest = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading));
    let wx;
    let wz;
    if (headingEastWest) {
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
    for (const cop of game.police.cars) {
      chaseSteer(cop, car.pos.x, car.pos.z, STEP, 30);
      resolveBuildingCollision(game.colliders, cop.pos, cop.radius);
    }
  }
}

function posePoliceChase(game) {
  // Wanted 3 stars, three PD cars on the player's tail, on the downtown
  // avenue. The camera sits ahead of the player looking back, so the player
  // car reads in the middle and the pursuing PD cars behind it.
  game.startDriving('sports', 0, 120, Math.PI);
  game.police.setStars(3);
  for (let i = 0; i < 3; i++) {
    const mesh = makeCarMesh(0x111114, 'police');
    const car = new Car(mesh, { kind: 'police', maxSpeed: 30 });
    car.pos.set((i - 1) * 7, 0, 120 - (i + 1) * 12);
    car.heading = Math.PI;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    game.scene.add(mesh);
    game.police.cars.push(car);
  }
  game.hud.feed('Solmara PD: "All units, suspect heading north on Palm Avenue!"');
  game.hud.objective('Heat Check', '3 stars! Lose the cops — stay clean until the heat dies down.');
  autopilotDrive(game, 1.6);
  game.shotCamYaw = Math.PI; // ahead of the car, looking back at the chase
  game.shotCamPitch = 0.35;
  game.shotCamDist = 20;
}

function posePackageRun(game) {
  // Mission 2 in progress: the package run to the pier, sunset over the sea.
  const L = game.landmarks;
  game.startDriving('sedan', 120, 0, Math.PI / 2);
  game.missions.current = 1;
  game.missions.state = 'active';
  game.missions.step = 1;
  game.missions.timer = 62;
  game.missions.enterStep();
  game.hud.feed('Tessa: "Package is hot. Pier, 90 seconds, go go go!"');
  autopilotDrive(game, 4);
  return L;
}

function poseBeachBrawl(game) {
  // On foot at the beach plaza: palms, ocean, thugs, the mission beacon.
  // Mara faces the sea; the camera looks east with her, pulled back a little
  // and tilted down so the near palms stay out of the frame's top corner.
  game.player.reset(258, 50, Math.PI / 2);
  game.missions.current = 3;
  game.missions.state = 'active';
  game.missions.step = 0;
  game.missions.enterStep();
  for (let i = 0; i < 3; i++) game.pedestrians.spawnOne(262 + (i - 1) * 5, 66);
  game.hud.feed('Vega: "Those thugs are mine now. Handle it, Mara."');
  game.hud.objective('Beach Brawl', 'Knock down 4 thugs at the beach. Walk up and press F.');
  game.pedestrians.step(STEP, game.player.pos, 0);
  game.shotCamDist = 15;
  game.shotCamPitch = 0.5;
}

function poseCover(game) {
  // Cruising the main avenue at golden hour, traffic and towers around.
  game.startDriving('sports', 0, 180, Math.PI);
  game.hud.feed('Rico: "Nice wheels, Mara. The city is yours tonight."');
  game.hud.objective('First Wheels', 'Drive it to Rico\u2019s garage.');
  autopilotDrive(game, 2);
}

export function stageShot(name, game) {
  game.resetWorld(SHOT_SEED);
  if (name === 'chase') return posePoliceChase(game);
  if (name === 'mission') return posePackageRun(game);
  if (name === 'beach') return poseBeachBrawl(game);
  return poseCover(game);
}
