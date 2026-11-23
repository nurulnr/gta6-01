// SOLMARA — main loop. Boots the renderer, builds the city and its systems,
// runs the game states (menu, playing, paused, busted/wasted) and owns the
// camera, collisions, pickups, saving, and the ?shot= screenshot scenes.
import * as THREE from 'three';
import { buildCity, resolveBuildingCollision, hitsBuilding } from './city.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { Player } from './player.js';
import { Traffic, makeCarMesh, Car } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { stageShot } from './shots.js';
import { makeRng, clamp } from './random.js';

const SAVE_KEY = 'solmara-save-v1';
const SPAWN = { x: -180, z: 150, heading: Math.PI / 2 };
const WORLD_SEED = 20261123;

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.input = new Input(canvas);
    this.sound = new SoundBank();
    this.hud = new Hud();
    this.clockMinutes = 18 * 60 + 42;
    this.cash = 0;
    this.state = 'menu'; // menu | playing | paused | ended
    this.frozen = false; // screenshot scenes: render but do not step
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.camOffsetYaw = 0;
    this.saveTimer = 0;
    this.damageCooldown = 0;
    this.shotMode = new URLSearchParams(location.search).get('shot');

    const city = buildCity(this.scene, WORLD_SEED);
    this.city = city;
    this.landmarks = city.landmarks;
    this.colliders = city.colliders;

    this.player = new Player(this.scene);
    this.police = new Police(this.scene);
    this.police.colliders = city.colliders;
    this.pedestrians = new Pedestrians(this.scene, WORLD_SEED, 26);
    this.traffic = new Traffic(this.scene, WORLD_SEED, 14);
    this.parked = [];
    this.stashes = [];
    this.spawnParked();
    this.spawnStashes();

    this.world = {
      player: this.player,
      police: this.police,
      pedestrians: this.pedestrians,
      landmarks: this.landmarks,
      scene: this.scene,
    };
    this.missions = new MissionRunner(this.scene, this.world, {
      feed: (t) => this.hud.feed(t),
      banner: (t, s) => this.hud.banner(t, s),
      objective: (t, x) => this.hud.objective(t, x),
      addCash: (n) => { this.cash += n; },
      sound: (n) => { if (n === 'jingle') this.sound.jingle(); if (n === 'busted') this.sound.busted(); },
    });

    this.resetWorld(WORLD_SEED);
    this.wireMenu();
    window.addEventListener('resize', () => this.onResize());
    if (this.shotMode) this.startShot(this.shotMode);
    this.last = performance.now();
    this.frames = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- world setup -------------------------------------------------------
  spawnParked() {
    const rng = makeRng(WORLD_SEED + 55);
    for (const car of this.parked) this.scene.remove(car.mesh);
    this.parked = this.traffic.spawnParked(this.scene, 12, rng);
  }

  spawnStashes() {
    const rng = makeRng(WORLD_SEED + 99);
    const mat = new THREE.MeshBasicMaterial({ color: 0x51ff7a });
    let placed = 0;
    while (placed < 10) {
      const x = rng.range(-220, 240), z = rng.range(-230, 230);
      if (hitsBuilding(this.colliders, x, z, 3)) continue; // keep stashes reachable
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
      mesh.position.set(x, 1.2, z);
      this.scene.add(mesh);
      this.stashes.push({ mesh, x, z, taken: false });
      placed += 1;
    }
  }

  resetWorld(seed) {
    this.police.clear();
    if (this.player.car) this.scene.remove(this.player.car.mesh);
    this.player.reset(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.cash = 1250;
    this.clockMinutes = 18 * 60 + 42;
    this.missions.current = 0;
    this.missions.state = 'idle';
    this.missions.step = 0;
    this.missions.timer = 0;
    this.missions.showStartBeacon();
    this.cameraYaw = Math.PI;
    // respawn parked cars and stashes so a reset is a fresh city
    this.spawnParked();
    for (const s of this.stashes) { s.taken = false; s.mesh.visible = true; }
  }

  startDriving(kind, x, z, heading) {
    const mesh = makeCarMesh(kind === 'sports' ? 0xc23a2e : 0x2e6ac2, kind);
    const car = new Car(mesh, { kind, maxSpeed: kind === 'sports' ? 42 : 34 });
    car.pos.set(x, 0, z);
    car.heading = heading;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = heading;
    this.scene.add(mesh);
    this.parked.push(car);
    this.player.enterCar(car);
    return car;
  }

  // ---- menus -------------------------------------------------------------
  wireMenu() {
    const $ = (id) => document.getElementById(id);
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    if (hasSave) $('btnContinue').classList.remove('hidden');
    $('btnNew').onclick = () => { this.sound.unlock(); this.sound.click(); this.newGame(); };
    $('btnContinue').onclick = () => { this.sound.unlock(); this.sound.click(); this.loadGame(); };
    $('btnHow').onclick = () => { this.sound.click(); $('howto').classList.toggle('hidden'); };
    $('btnResume').onclick = () => { this.sound.click(); this.setState('playing'); };
    $('btnQuit').onclick = () => { this.saveGame(); this.setState('menu'); };
    $('btnRetry').onclick = () => { this.sound.click(); this.respawnAfterEnd(); };
    $('btnMenu2').onclick = () => { this.setState('menu'); };
    $('btnCloseMissions').onclick = () => { this.sound.click(); $('missionList').classList.add('hidden'); this.setState('playing'); };
    document.addEventListener('pointerdown', () => this.sound.unlock(), { once: true });
    document.addEventListener('keydown', () => this.sound.unlock(), { once: true });
  }

  setState(next) {
    this.state = next;
    document.getElementById('menu').classList.toggle('hidden', next !== 'menu');
    document.getElementById('pauseMenu').classList.toggle('hidden', next !== 'paused');
    document.getElementById('endScreen').classList.toggle('hidden', next !== 'ended');
    if (next === 'menu') this.hud.clearObjective();
  }

  newGame() {
    localStorage.removeItem(SAVE_KEY);
    this.resetWorld(WORLD_SEED);
    this.setState('playing');
    this.hud.feed('Welcome to Solmara, Mara. Rico\u2019s marker is gold — go say hi.');
  }

  loadGame() {
    try {
      const save = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.resetWorld(WORLD_SEED);
      this.cash = save.cash ?? 1250;
      this.missions.current = save.missionsDone ?? 0;
      this.missions.state = 'idle';
      this.missions.showStartBeacon();
      this.player.reset(save.px ?? SPAWN.x, save.pz ?? SPAWN.z, save.heading ?? 0);
      this.clockMinutes = save.clock ?? 1122;
      this.setState('playing');
      this.hud.feed('Welcome back, Mara.');
    } catch { this.newGame(); }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionsDone: this.missions.doneCount(),
        px: this.player.pos.x, pz: this.player.pos.z,
        heading: this.player.heading,
        clock: this.clockMinutes,
      }));
    } catch { /* storage unavailable; the game still plays */ }
  }

  respawnAfterEnd() {
    this.player.health = 100;
    this.police.clear();
    const L = this.landmarks.safehouse;
    this.player.reset(L.x + 10, L.z + 8, 0);
    this.setState('playing');
  }

  endGame(title, text) {
    this.sound.busted();
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endText').textContent = text;
    this.setState('ended');
  }

  // ---- screenshots -------------------------------------------------------
  startShot(name) {
    this.setState('playing');
    document.getElementById('help').classList.add('hidden');
    stageShot(name, this);
    this.frozen = true;
    // face the action: put the camera behind the player for a readable frame
    const p = this.player;
    const heading = p.onFoot ? p.heading : p.car.heading;
    this.cameraYaw = this.shotCamYaw ?? heading + Math.PI;
    this.cameraPitch = this.shotCamPitch ?? 0.3;
    this.syncHud();
  }

  // Push the current game state into the HUD once (used by screenshot scenes,
  // where the live loop is frozen and update() never runs).
  syncHud() {
    const p = this.player;
    const playerPos = p.onFoot ? p.pos : p.car.pos;
    this.hud.update({
      cash: this.cash,
      health: p.health,
      stars: this.police.stars,
      clockMinutes: this.clockMinutes,
      missionsDone: this.missions.doneCount(),
      inCar: !p.onFoot,
      speedKmh: p.onFoot ? 0 : Math.abs(p.car.speed) * 3.6,
      carKind: p.car?.kind,
    });
    this.hud.drawMinimap({
      playerX: playerPos.x, playerZ: playerPos.z,
      playerHeading: p.onFoot ? p.heading : p.car.heading,
      policeCars: this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      marker: this.missions.beacon ? { x: this.missions.beacon.position.x, z: this.missions.beacon.position.z } : null,
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- per-frame update --------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.frames += 1;
    if (this.state === 'playing' && !this.frozen) this.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.shotMode && this.frames > 12) window.__shotReady = true;
    this.input.endFrame();
  }

  update(dt) {
    const input = this.input;
    const p = this.player;
    this.clockMinutes = (this.clockMinutes + dt * 0.4) % 1440;
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (p.punchCooldown > 0) p.punchCooldown -= dt;

    // global shortcuts
    if (input.hit('KeyM')) { this.showMissions(); return; }
    if (input.hit('KeyP') || input.hit('Escape')) { this.setState('paused'); return; }
    if (input.hit('KeyR')) { this.resetWorld(WORLD_SEED); this.hud.feed('Fresh start — same city, new attitude.'); return; }
    if (input.hit('KeyU')) { this.sound.setMuted(!this.sound.muted); this.hud.feed(this.sound.muted ? 'Sound off.' : 'Sound on.'); }

    // camera orbit from mouse drag
    this.camOffsetYaw -= this.camOffsetYaw * Math.min(1, dt * 1.5);
    this.cameraYaw += input.mouseDX * 0.004;
    this.camOffsetYaw += input.mouseDX * 0.004;
    this.cameraPitch = clamp(this.cameraPitch + input.mouseDY * 0.002, 0.08, 0.9);

    const playerPos = p.onFoot ? p.pos : p.car.pos;

    // --- driving / walking ---
    if (!p.onFoot && p.car) {
      const axes = input.moveAxes();
      const throttle = axes.y;
      const steer = -axes.x;
      const handbrake = input.is('Space');
      const speedBefore = Math.abs(p.car.speed);
      p.car.drive(throttle, steer, handbrake, dt);
      const hit = resolveBuildingCollision(this.colliders, p.car.pos, p.car.radius);
      if (hit) {
        const impact = speedBefore;
        p.car.speed *= -0.25;
        if (impact > 12 && this.damageCooldown <= 0) {
          this.sound.crash();
          this.damageCooldown = 0.8;
          if (p.hurt(6)) return this.wasted();
          this.police.addHeat(2, 'crash');
        }
      }
      // hit traffic cars and pedestrians
      for (const other of this.traffic.cars) this.bumpCars(p.car, other, dt);
      for (const other of this.parked) {
        if (other !== p.car) this.bumpCars(p.car, other, dt);
      }
      for (const ped of this.pedestrians.list) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.pos.x - p.car.pos.x, ped.pos.z - p.car.pos.z);
        if (d < 2.6 && Math.abs(p.car.speed) > 4) {
          this.pedestrians.punchAt(ped.pos.x, ped.pos.z, 0.1);
          this.sound.crash();
          this.police.addHeat(14, 'hit a pedestrian');
          this.hud.feed('You hit a pedestrian! The PD noticed.');
        }
      }
      this.sound.engine(Math.abs(p.car.speed) / p.car.maxSpeed, true);
    } else {
      const axes = input.moveAxes();
      p.walk(axes, input.is('ShiftLeft') || input.is('ShiftRight'), this.cameraYaw, dt);
      resolveBuildingCollision(this.colliders, p.pos, p.radius);
      this.sound.engine(0, false);
      // slow health regen on foot while calm
      if (this.police.stars === 0) p.heal(dt * 2);
    }
    // keep the player inside the world (the sea is the east edge)
    p.pos.x = clamp(p.pos.x, -260, 358);
    p.pos.z = clamp(p.pos.z, -260, 260);
    if (!p.onFoot) { p.car.pos.x = clamp(p.car.pos.x, -260, 358); p.car.pos.z = clamp(p.car.pos.z, -260, 260); }

    // --- enter / exit car, punch, missions ---
    if (input.hit('KeyE')) {
      if (p.onFoot) {
        if (!this.missions.tryStartAt(p.pos.x, p.pos.z)) {
          const car = this.nearestCar(p.pos, 4.5);
          if (car) {
            p.enterCar(car);
            this.sound.click();
            if (this.police.stars > 0 || this.nearestPoliceCar(40)) {
              this.police.addHeat(8, 'carjacking');
              this.hud.feed('Carjacking, right in front of the cops!');
            } else {
              this.hud.feed('Nice ride. It\u2019s yours now.');
            }
          }
        }
      } else {
        p.exitCar();
        this.sound.click();
      }
    }
    if (input.hit('KeyF') && p.onFoot) {
      if (p.punch()) {
        this.sound.punch();
        const fx = p.pos.x + Math.sin(p.heading) * 1.6;
        const fz = p.pos.z + Math.cos(p.heading) * 1.6;
        const hit = this.pedestrians.punchAt(fx, fz, 2.2);
        if (hit) {
          this.police.addHeat(12, 'assault');
          this.hud.feed('That\u2019ll leave a mark. The PD noticed.');
        }
      }
    }
    if (input.hit('KeyH')) this.sound.honk();

    // --- cash stashes ---
    for (const s of this.stashes) {
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 2;
      s.mesh.position.y = 1.2 + Math.sin(performance.now() / 400 + s.x) * 0.25;
      if (Math.hypot(playerPos.x - s.x, playerPos.z - s.z) < 3) {
        s.taken = true; s.mesh.visible = false;
        this.cash += 150;
        this.sound.pickup();
        this.hud.feed('Found a stash: +$150.');
      }
    }

    // --- the world lives ---
    this.traffic.step(dt, playerPos);
    this.pedestrians.step(dt, playerPos, p.onFoot ? p.speed : Math.abs(p.car?.speed ?? 0));
    this.police.step(dt, p,
      () => { // busted
        const fine = Math.round(this.cash * 0.2);
        this.cash -= fine;
        this.endGame('BUSTED', 'The Solmara PD hauled you in. Bail cost you $' + fine.toLocaleString('en-US') + '.');
      },
      () => { // police ram
        if (this.damageCooldown <= 0) {
          this.damageCooldown = 0.8;
          this.sound.crash();
          if (p.hurt(8)) return this.wasted();
        }
      },
    );
    this.missions.update(dt);
    this.sound.siren(this.police.sirenOn);

    // --- HUD + minimap ---
    this.syncHud();

    // autosave every 15 seconds of play
    this.saveTimer += dt;
    if (this.saveTimer > 15) { this.saveTimer = 0; this.saveGame(); }
  }

  wasted() {
    const lost = Math.round(this.cash * 0.1);
    this.cash -= lost;
    this.endGame('WASTED', 'Mara went down hard. The hospital patched her up for $' + lost.toLocaleString('en-US') + '.');
  }

  nearestCar(pos, range) {
    let best = null, bestD = range;
    for (const car of [...this.traffic.cars, ...this.parked]) {
      if (car === this.player.car) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  nearestPoliceCar(range) {
    const pos = this.player.pos;
    return this.police.cars.some((c) => Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < range);
  }

  bumpCars(a, b, dt) {
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = a.radius + b.radius - 0.4;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      if (b.traffic) { /* traffic holds its line; the player bounces */ }
      else { b.pos.x += nx * push; b.pos.z += nz * push; }
      const relSpeed = Math.abs(a.speed);
      if (relSpeed > 10 && this.damageCooldown <= 0) {
        this.damageCooldown = 0.7;
        this.sound.crash();
        a.speed *= 0.5;
      }
    }
  }

  showMissions() {
    const rows = MISSIONS.map((m, i) => {
      const status = i < this.missions.current ? '✅ DONE' : i === this.missions.current ? (this.missions.state === 'active' ? '▶ ACTIVE' : '○ READY — go to the gold marker') : '🔒 LOCKED';
      return `<p><b>${i + 1}. ${m.title}</b> — ${m.giver} · $${m.reward.toLocaleString('en-US')}<br>${m.briefing}<br><span style="color:#ffd23e">${status}</span></p>`;
    }).join('');
    document.getElementById('missionRows').innerHTML = rows;
    document.getElementById('missionList').classList.remove('hidden');
    this.setState('paused');
  }

  updateCamera(dt) {
    const p = this.player;
    const focus = p.onFoot ? p.pos : p.car.pos;
    const heading = p.onFoot ? p.heading : p.car.heading;
    if (!p.onFoot && !this.frozen) {
      // chase camera eases behind the car; the mouse can look around briefly
      const target = heading + Math.PI + this.camOffsetYaw;
      let d = target - this.cameraYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.cameraYaw += d * Math.min(1, dt * 2.2);
    }
    const dist = p.onFoot ? (this.shotCamDist ?? 7.5) : (this.shotCamDist ?? 11);
    const height = p.onFoot ? 3.4 : 4.6;
    const cx = focus.x + Math.sin(this.cameraYaw) * dist;
    const cz = focus.z + Math.cos(this.cameraYaw) * dist;
    const cy = height + Math.sin(this.cameraPitch) * 4;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(focus.x, (p.onFoot ? 1.6 : 1.2), focus.z);
  }
}

new Game();
