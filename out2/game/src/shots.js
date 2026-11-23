// The four screenshot scenes. Each one resets the world, puts Mara somewhere
// interesting, and plays the real game forward for a fixed number of steps
// with a scripted autopilot — steering toward waypoints, firing at thugs — so
// the frame is what a short game really looks like, and the same seed always
// gives the same frame. ?shot=cruise|chase|mission|brawl with &seed=N.
import { makeCar } from './cars.js';
import { MISSIONS, startMission, ensureBeacon, hideBeacon } from './jobs.js';
import { spawnThug, playerShoot } from './people.js';

const STEP = 1 / 60;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function driveToward(G, tx, tz) {
  const car = G.player.car;
  if (!car) return;
  const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
  const diff = wrapAngle(want - car.heading);
  G.driveOverride = { fwd: 1, turn: Math.max(-1, Math.min(1, diff * 2.2)) };
}

function simulate(G, seconds, fn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (fn) fn(i * STEP);
    G.stepWorld(STEP);
  }
  G.driveOverride = null;
  G.walkOverride = null;
  // The simulation runs faster than real time, so the timed panels (the job
  // brief, the flash line, the toast) would still be showing when the frame
  // is taken. Hide them: the HUD, the objective and the minimap stay.
  G.hud.clearTransient();
}

function giveCar(G, kind, color, x, z, heading) {
  const car = makeCar(G, kind, color, x, z, heading);
  car.driven = true;
  car.parked = false;
  G.player.car = car;
  G.player.pos = car.pos;
  G.player.heading = heading;
  return car;
}

function resetScene(G) {
  for (const t of G.thugs) G.scene.remove(t.mesh);
  G.thugs.length = 0;
  for (const cop of G.cops) G.scene.remove(cop.car.mesh);
  G.cops.length = 0;
  if (G.player.car) {
    G.scene.remove(G.player.car.mesh);
    G.player.car = null;
  }
  G.player.health = 100;
  G.player.alive = true;
  G.wanted = 0;
  G.calmTimer = 0;
  G.busted = false;
  G.bustProgress = 0;
  G.cash = 2450;
  G.clockMin = 17 * 60 + 40;
  if (G.mission) G.mission.active = false;
  G.mission = null;
  hideBeacon();
  G.screen = 'play';
}

export function stageShot(G, name) {
  ensureBeacon(G);
  resetScene(G);
  if (name === 'chase') {
    // Three stars, cruisers closing in, Mara running the beach road east. A
    // sedan, not a sports car: the cruisers are faster than it, so they catch
    // up and sit right on the bumper, in frame behind the car.
    G.wanted = 3;
    giveCar(G, 'sedan', 0xc0392b, -120, 176, Math.PI / 2);
    startMission(G, 5);
    G.mission.stage = 1;
    G.objective = 'Clean Getaway — Outrun the cops — reach the pier';
    simulate(G, 11, () => {
      const car = G.player.car;
      const tx = car.pos.x < 150 ? 170 : 170;
      const tz = car.pos.x < 150 ? 176 : 120;
      driveToward(G, tx, tz);
    });
    return 'play';
  }
  if (name === 'mission') {
    // The Sunset Run: gates down the beach road, beacon ahead, clock running.
    giveCar(G, 'sport', 0x2e6db4, -160, 176, Math.PI / 2);
    startMission(G, 2);
    simulate(G, 9, () => {
      const car = G.player.car;
      const gates = MISSIONS[2].stages[0].gates;
      const gate = gates[Math.min(G.mission.gateIndex, gates.length - 1)];
      driveToward(G, gate[0], gate[1]);
    });
    return 'play';
  }
  if (name === 'brawl') {
    // On foot on the pier, dock thugs ahead, Mara returning fire.
    G.player.pos.set(44, 0, 222);
    G.player.heading = 0;
    G.player.aimHeading = 0;
    startMission(G, 3);
    G.mission.stage = 1;
    G.mission.thugsLeft = 4;
    for (const [x, z] of MISSIONS[3].stages[1].spawn) spawnThug(G, x, z);
    let nextShot = 1.2;
    simulate(G, 6, (t) => {
      let best = null;
      let bestD = 60;
      for (const thug of G.thugs) {
        if (thug.down) continue;
        const d = Math.hypot(thug.pos.x - G.player.pos.x, thug.pos.z - G.player.pos.z);
        if (d < bestD) { bestD = d; best = thug; }
      }
      if (best) {
        G.player.aimHeading = Math.atan2(best.pos.x - G.player.pos.x, best.pos.z - G.player.pos.z);
        G.player.heading = G.player.aimHeading;
        if (t >= nextShot) {
          nextShot = t + 0.9;
          playerShoot(G);
        }
      }
    });
    return 'play';
  }
  // cruise (the cover): a golden-hour drive down the main avenue, traffic
  // around, the tower and the sign ahead. Seven seconds keeps the car
  // mid-city among the towers instead of out past the northern edge.
  giveCar(G, 'sedan', 0x27ae60, 2, 150, Math.PI);
  G.objective = 'Free roam — press M for jobs';
  simulate(G, 7, () => {
    const car = G.player.car;
    const tz = car.pos.z > -140 ? -150 : 150;
    driveToward(G, 0, tz);
  });
  return 'play';
}
