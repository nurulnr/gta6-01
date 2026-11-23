// Boot: wires every system into one game and runs the loop. Mara Voss on foot
// or behind the wheel of a stolen car, in Coral Bay. The loop advances the
// world in fixed 1/60 s steps; ?shot=name&seed=N instead stages one of the
// four screenshot scenes and raises window.__shotReady when it is painted.
import * as THREE from 'three';
import { createRng } from './rng.js';
import { createKeys } from './keys.js';
import { createSound } from './sound.js';
import { buildCity, collideCircle, clampToCity } from './city.js';
import { spawnTraffic, spawnParked, updateTraffic, updatePlayerDrive, nearestCar } from './cars.js';
import { spawnPeds, updatePeds, updateThugs, playerShoot, buildFigure } from './people.js';
import { updateCops } from './cops.js';
import { MISSIONS, startMission, abortMission, updateMissions, ensureBeacon } from './jobs.js';
import { stageShot } from './shots.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'coralbay.save.v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1400);
camera.position.set(0, 30, 120);

const rng = createRng(seed);
const keys = createKeys(window);
const sound = createSound();
const hud = createHud();
const city = buildCity(scene, rng);
ensureBeacon({ scene });

const G = {
  scene, camera, renderer, rng, keys, sound, hud, city,
  MISSIONS,
  elapsed: 0,
  clockMin: 17 * 60 + 40,
  cash: 0,
  wanted: 0,
  calmTimer: 0,
  gunshotTimer: 0,
  nearestCop: Infinity,
  bustProgress: 0,
  busted: false,
  storyDone: false,
  screen: 'title',
  shotMode: Boolean(shot),
  driveOverride: null,
  walkOverride: null,
  nearCar: null,
  objective: 'Free roam — press M for jobs',
  player: {
    pos: new THREE.Vector3(0, 0, 120),
    heading: Math.PI,
    aimHeading: Math.PI,
    health: 100,
    alive: true,
    car: null,
    mesh: null,
  },
  traffic: [],
  parked: [],
  peds: [],
  thugs: [],
  cops: [],
  mission: null,
  camYaw: Math.PI,
  camPos: new THREE.Vector3(0, 30, 120),
  lastHitAt: -100,
  sirenFlip: 0,
};

G.missionDef = () => (G.mission ? MISSIONS[G.mission.index] : null);

G.saveGame = () => {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionIndex: G.mission ? G.mission.index : 0,
      storyDone: G.storyDone,
      clockMin: G.clockMin,
    }));
  } catch { /* storage off: progress lasts this visit only */ }
};

G.loadGame = () => {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Mara herself: red jacket, so she reads against the street at a glance.
const mara = buildFigure(0x8e2f2f, 0xe8b88a);
mara.position.copy(G.player.pos);
scene.add(mara);
G.player.mesh = mara;

G.traffic = spawnTraffic(G, 14);
G.parked = spawnParked(G, 10);
G.peds = spawnPeds(G, 22);

function announce(msg) {
  statusEl.textContent = msg;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function updateCamera(dt) {
  const target = G.player.car ? G.player.car.pos : G.player.pos;
  const heading = G.player.car ? G.player.car.heading : G.player.heading;
  let diff = heading - G.camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  G.camYaw += diff * Math.min(1, dt * (G.player.car ? 2.2 : 3.2));
  const dist = G.player.car ? 9.5 : 5.2;
  const height = G.player.car ? 3.6 : 2.7;
  const fx = Math.sin(G.camYaw);
  const fz = Math.cos(G.camYaw);
  const want = new THREE.Vector3(
    target.x - fx * dist,
    height,
    target.z - fz * dist,
  );
  G.camPos.lerp(want, Math.min(1, dt * 5));
  camera.position.copy(G.camPos);
  camera.lookAt(target.x + fx * 5, target.y + 1.5, target.z + fz * 5);
}

function enterCar(car) {
  car.driven = true;
  car.parked = false;
  const ti = G.traffic.indexOf(car);
  if (ti !== -1) G.traffic.splice(ti, 1);
  const pi = G.parked.indexOf(car);
  if (pi !== -1) G.parked.splice(pi, 1);
  G.player.car = car;
  G.player.pos = car.pos;
  G.player.heading = car.heading;
  mara.visible = false;
  G.wanted = Math.min(5, G.wanted + 1);
  G.sound.pickup();
  hud.flash('Car stolen — the cops noticed');
  announce('Driving. W and S for gas and brake, A and D to steer, E to get out.');
}

function exitCar() {
  const car = G.player.car;
  if (!car || Math.abs(car.speed) > 2) return;
  car.driven = false;
  car.parked = true;
  car.loop = null;
  G.parked.push(car);
  G.player.car = null;
  G.player.pos = new THREE.Vector3(car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.4, 0, car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.4);
  G.player.heading = car.heading;
  mara.visible = true;
  mara.position.copy(G.player.pos);
  G.sound.engine(0, false);
}

function updatePlayerFoot(dt) {
  const p = G.player;
  const drive = G.walkOverride || keys.drive();
  // Tank controls on foot: A/D turn Mara, W/S walk forward and back along
  // the way she faces. The camera follows her heading, so walking backward
  // is a backpedal and never swings the camera around in an arc.
  p.heading += drive.turn * 2.6 * dt;
  const speed = (keys.sprint() ? 9.5 : 5.6) * drive.fwd;
  if (drive.fwd !== 0) {
    p.pos.x += Math.sin(p.heading) * speed * dt;
    p.pos.z += Math.cos(p.heading) * speed * dt;
    const swing = Math.sin(G.elapsed * 11) * 0.55;
    mara.userData.legL.rotation.x = swing;
    mara.userData.legR.rotation.x = -swing;
    mara.userData.armL.rotation.x = -swing * 0.7;
    mara.userData.armR.rotation.x = swing * 0.7;
  } else {
    mara.userData.legL.rotation.x = 0;
    mara.userData.legR.rotation.x = 0;
    mara.userData.armL.rotation.x = 0;
    mara.userData.armR.rotation.x = 0;
  }
  clampToCity(p.pos);
  collideCircle(p.pos, 0.55, city.colliders);
  mara.position.copy(p.pos);
  mara.rotation.y = p.heading;
  // Aim where the camera looks; click fires.
  p.aimHeading = G.camYaw;
  if (keys.mouseWasPressed()) {
    sound.unlock();
    playerShoot(G);
  }
  // Get in a car.
  G.nearCar = nearestCar(G, 4.5);
  if (keys.wasPressed('KeyE') && G.nearCar) enterCar(G.nearCar);
  // Slow health regen out of trouble.
  if (p.health < 100 && G.elapsed - G.lastHitAt > 6) p.health = Math.min(100, p.health + 2.5 * dt);
}

function stepWorld(dt) {
  G.elapsed += dt;
  if (G.screen === 'play') {
    if (G.player.car) {
      updatePlayerDrive(G, dt);
      if (keys.wasPressed('KeyE')) exitCar();
      G.nearCar = null;
    } else {
      updatePlayerFoot(dt);
    }
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateThugs(G, dt);
    updateCops(G, dt);
    updateMissions(G, dt);
    if (G.gunshotTimer > 0) G.gunshotTimer -= dt;
    if (G.wanted > 0) {
      G.sirenFlip += dt;
      if (G.sirenFlip > 0.85) {
        G.sirenFlip = 0;
        sound.sirenStep(Math.random() < 0.5);
      }
      sound.siren(true);
    } else {
      sound.siren(false);
    }
    G.clockMin += dt * 0.45;
    if (G.player.health <= 0 && G.player.alive) {
      G.player.alive = false;
      G.wasted = true;
    }
    if ((G.busted || G.wasted) && G.screen === 'play') showBusted();
    if (keys.wasPressed('KeyM')) hud.toggleJobs(G, true);
    if (keys.wasPressed('KeyR') && G.mission && G.mission.active) {
      hud.flash('Job restarted');
      startMission(G, G.mission.index);
    }
  } else if (G.screen === 'title') {
    updateTraffic(G, dt);
    updatePeds(G, dt);
    G.clockMin += dt * 0.1;
  }
  updateCamera(dt);
  if (G.screen !== 'title') hud.update(G);
  keys.endFrame();
}

G.stepWorld = stepWorld;

function showBusted() {
  G.screen = 'busted';
  sound.engine(0, false);
  sound.siren(false);
  sound.busted();
  hud.showBusted(true, G.wasted);
  announce(G.wasted ? 'Wasted. Press Enter to get back up.' : 'Busted. Press Enter to get back up.');
}

function respawn() {
  G.cash = Math.max(0, G.cash - 400);
  G.player.health = 100;
  G.player.alive = true;
  G.wanted = 0;
  G.calmTimer = 0;
  G.busted = false;
  G.wasted = false;
  for (const cop of G.cops) G.scene.remove(cop.car.mesh);
  G.cops.length = 0;
  if (G.player.car) {
    G.scene.remove(G.player.car.mesh);
    G.player.car = null;
  }
  G.player.pos = new THREE.Vector3(city.spots.safehouse.x, 0, city.spots.safehouse.z);
  G.player.heading = 0;
  mara.visible = true;
  mara.position.copy(G.player.pos);
  hud.showBusted(false);
  if (G.mission) startMission(G, G.mission.index);
  G.screen = 'play';
  announce('Back on the street. The job is still waiting.');
}

function pauseGame(on) {
  if (on && G.screen !== 'play') return;
  if (on) {
    G.screen = 'pause';
    hud.showPause(true);
    announce('Paused.');
  } else if (G.screen === 'pause') {
    G.screen = 'play';
    hud.showPause(false);
    announce('Playing.');
  }
}

function newGame() {
  G.cash = 0;
  G.wanted = 0;
  G.storyDone = false;
  G.player.health = 100;
  G.player.alive = true;
  G.player.pos.set(city.spots.start.x, 0, city.spots.start.z);
  G.player.heading = Math.PI;
  mara.visible = true;
  mara.position.copy(G.player.pos);
  hud.hideMenu();
  hud.show();
  G.screen = 'play';
  startMission(G, 0);
  announce('Coral Bay. First job: steal a car and bring it to Rey\u2019s Garage.');
}

function continueGame() {
  const save = G.loadGame();
  if (!save) return newGame();
  G.cash = save.cash || 0;
  G.storyDone = Boolean(save.storyDone);
  G.clockMin = save.clockMin || 17 * 60 + 40;
  G.player.health = 100;
  G.player.alive = true;
  G.player.pos.set(city.spots.start.x, 0, city.spots.start.z);
  mara.visible = true;
  mara.position.copy(G.player.pos);
  hud.hideMenu();
  hud.show();
  G.screen = 'play';
  const idx = G.storyDone ? MISSIONS.length : Math.min(save.missionIndex || 0, MISSIONS.length - 1);
  if (idx < MISSIONS.length) startMission(G, idx);
  else G.objective = 'Story complete — free roam';
  announce('Welcome back to Coral Bay.');
}

function runShot(name) {
  const mode = stageShot(G, name);
  G.screen = mode;
  hud.show();
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (G.screen === 'pause' || G.screen === 'busted') {
    keys.endFrame();
    renderer.render(scene, camera);
    return;
  }
  const dtMs = Math.min(now - (frame.last || now), MAX_FRAME * 1000);
  frame.last = now;
  let acc = (frame.acc || 0) + dtMs / 1000;
  let guard = 0;
  while (acc >= STEP && guard < 8) {
    stepWorld(STEP);
    acc -= STEP;
    guard += 1;
  }
  frame.acc = acc;
  renderer.render(scene, camera);
}

// Title-screen input: Enter starts a new game, C continues a save. P and
// Esc pause and resume; Enter gets back up after a bust. Pause lives here
// alone — the loop never touches it, so one press can never both pause and
// resume in the same frame.
window.addEventListener('keydown', (event) => {
  if (G.screen === 'title') {
    if (event.code === 'Enter') newGame();
    else if (event.code === 'KeyC') continueGame();
  } else if (G.screen === 'busted') {
    if (event.code === 'Enter') respawn();
  } else if (G.screen === 'pause') {
    if (event.code === 'Escape' || event.code === 'KeyP' || event.code === 'Enter') pauseGame(false);
  } else if (G.screen === 'play') {
    if (event.code === 'Escape' || event.code === 'KeyP') pauseGame(true);
  }
});
document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
canvas.addEventListener('mousedown', () => sound.unlock());

if (shot) {
  runShot(shot);
} else {
  const save = G.loadGame();
  hud.showMenu('CORAL BAY', save
    ? 'An open-world crime story — press Enter for a new game, C to continue your save.'
    : 'An open-world crime story — press Enter to start.');
  document.getElementById('btn-continue').style.display = save ? 'inline-block' : 'none';
  // A slow orbit over downtown while the menu is up.
  G.camYaw = 0;
  const orbit = setInterval(() => {
    if (G.screen !== 'title') {
      clearInterval(orbit);
      return;
    }
    G.camYaw += 0.002;
    camera.position.set(Math.sin(G.camYaw) * 130, 55, Math.cos(G.camYaw) * 130);
    camera.lookAt(0, 18, 0);
  }, 16);
  announce('Coral Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}
