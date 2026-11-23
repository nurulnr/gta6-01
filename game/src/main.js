// SOLMARA — the main loop. Boots the renderer, builds the city and its
// systems, runs the game states (menu, playing, paused, busted/wasted) and
// owns the camera, the collisions, the pickups, the saving, and the ?shot=
// screenshot scenes.
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
    this.frozen = false; // screenshot scenes: render but never step
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
      feed: (text) => this.hud.feed(text),
      banner: (title, sub) => this.hud.banner(title, sub),
      objective: (title, text) => this.hud.objective(title, text),
      addCash: (n) => {
        this.cash += n;
      },
      sound: (name) => {
        if (name === 'jingle') this.sound.jingle();
        if (name === 'busted') this.sound.busted();
      },
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
      const x = rng.range(-220, 240);
      const z = rng.range(-230, 230);
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
    // A reset is a fresh city: new parked cars, stashes back on the map.
    this.spawnParked();
    for (const s of this.stashes) {
      s.taken = false;
      s.mesh.visible = true;
    }
  }

  // Put the player in a fresh car at a place and heading (used by the
  // screenshot scenes and by nothing else — real play steals parked cars).
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
    $('btnNew').onclick = () => {
      this.sound.unlock();
      this.sound.click();
      this.newGame();
    };
    $('btnContinue').onclick = () => {
      this.sound.unlock();
      this.sound.click();
      this.loadGame();
    };
    $('btnHow').onclick = () => {
      this.sound.click();
      $('howto').classList.toggle('hidden');
    };
    $('btnResume').onclick = () => {
      this.sound.click();
      this.setState('playing');
    };
    $('btnQuit').onclick = () => {
      this.saveGame();
      this.setState('menu');
    };
    $('btnRetry').onclick = () => {
      this.sound.click();
      this.respawnAfterEnd();
    };
    $('btnMenu2').onclick = () => this.setState('menu');
    $('btnCloseMissions').onclick = () => {
      this.sound.click();
      $('missionList').classList.add('hidden');
      this.setState('playing');
    };
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
    } catch {
      this.newGame();
    }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionsDone: this.missions.doneCount(),
        px: this.player.pos.x,
        pz: this.player.pos.z,
        heading: this.player.heading,
        clock: this.clockMinutes,
      }));
    } catch {
      // Storage unavailable; the game still plays.
    }
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

  wasted() {
    const lost = Math.round(this.cash * 0.1);
    this.cash -= lost;
    this.endGame('WASTED', 'Mara went down hard. The hospital patched her up for $' + lost.toLocaleString('en-US') + '.');
  }

  // ---- screenshots -------------------------------------------------------

  startShot(name) {
    this.setState('playing');
    document.getElementById('help').classList.add('hidden');
    stageShot(name, this);
    this.frozen = true;
    // Face the action: the camera sits behind the player for a readable frame.
    const p = this.player;
    const heading = p.onFoot ? p.heading : p.car.heading;
    this.cameraYaw = this.shotCamYaw ?? heading + Math.PI;
    this.cameraPitch = this.shotCamPitch ?? 0.3;
    this.syncHud();
  }

  // Push the current game state into the HUD once. The live loop calls this
  // every frame; the frozen screenshot scenes call it once here.
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
      playerX: playerPos.x,
      playerZ: playerPos.z,
      playerHeading: p.onFoot ? p.heading : p.car.heading,
      policeCars: this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      marker: this.missions.beacon
        ? { x: this.missions.beacon.position.x, z: this.missions.beacon.position.z }
        : null,
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

    // Global shortcuts, before anything else.
    if (input.hit('KeyM')) {
      this.showMissions();
      return;
    }
    if (input.hit('KeyP') || input.hit('Escape')) {
      this.setState('paused');
      return;
    }
    if (input.hit('KeyR')) {
      this.resetWorld(WORLD_SEED);
      this.hud.feed('Fresh start — same city, new attitude.');
      return;
    }
    if (input.hit('KeyU')) {
      this.sound.setMuted(!this.sound.muted);
      this.hud.feed(this.sound.muted ? 'Sound off.' : 'Sound on.');
    }

    // Camera orbit from a mouse drag; it eases back behind the car.
    this.camOffsetYaw -= this.camOffsetYaw * Math.min(1, dt * 1.5);
    this.cameraYaw += input.mouseDX * 0.004;
    this.camOffsetYaw += input.mouseDX * 0.004;
    this.cameraPitch = clamp(this.cameraPitch + input.mouseDY * 0.002, 0.08, 0.9);

    if (!p.onFoot && p.car) this.updateDriving(dt);
    else this.updateOnFoot(dt);

    // Keep the player inside the world; the sea is the east edge.
    p.pos.x = clamp(p.pos.x, -260, 358);
    p.pos.z = clamp(p.pos.z, -260, 260);
    if (!p.onFoot) {
      p.car.pos.x = clamp(p.car.pos.x, -260, 358);
      p.car.pos.z = clamp(p.car.pos.z, -260, 260);
    }

    this.handleActions();
    this.collectStashes(dt);

    // The world lives: traffic, pedestrians, police, missions, sound.
    const playerPos = p.onFoot ? p.pos : p.car.pos;
    this.traffic.step(dt, playerPos);
    this.pedestrians.step(dt, playerPos, p.onFoot ? p.speed : Math.abs(p.car?.speed ?? 0));
    this.police.step(
      dt,
      p,
      () => { // busted
        const fine = Math.round(this.cash * 0.2);
        this.cash -= fine;
        this.endGame('BUSTED', 'The Solmara PD hauled you in. Bail cost you $' + fine.toLocaleString('en-US') + '.');
      },
      () => { // a police ram
        if (this.damageCooldown <= 0) {
          this.damageCooldown = 0.8;
          this.sound.crash();
          if (p.hurt(8)) return this.wasted();
        }
      },
    );
    this.missions.update(dt);
    this.sound.siren(this.police.sirenOn);

    this.syncHud();

    // Autosave every 15 seconds of play.
    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.saveGame();
    }
  }

  updateDriving(dt) {
    const p = this.player;
    const input = this.input;
    const axes = input.moveAxes();
    const handbrake = input.is('Space');
    const speedBefore = Math.abs(p.car.speed);
    p.car.drive(axes.y, -axes.x, handbrake, dt);
    const hit = resolveBuildingCollision(this.colliders, p.car.pos, p.car.radius);
    if (hit) {
      p.car.speed *= -0.25;
      if (speedBefore > 12 && this.damageCooldown <= 0) {
        this.sound.crash();
        this.damageCooldown = 0.8;
        if (p.hurt(6)) return this.wasted();
        this.police.addHeat(2, 'crash');
      }
    }
    // Bumping traffic and parked cars; running a pedestrian down is a crime.
    for (const other of this.traffic.cars) this.bumpCars(p.car, other);
    for (const other of this.parked) {
      if (other !== p.car) this.bumpCars(p.car, other);
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
  }

  updateOnFoot(dt) {
    const p = this.player;
    const input = this.input;
    const axes = input.moveAxes();
    p.walk(axes, input.is('ShiftLeft') || input.is('ShiftRight'), this.cameraYaw, dt);
    resolveBuildingCollision(this.colliders, p.pos, p.radius);
    this.sound.engine(0, false);
    // Slow health regen on foot while calm.
    if (this.police.stars === 0) p.heal(dt * 2);
  }

  // E to enter a car or start a mission, F to punch, H to honk.
  handleActions() {
    const input = this.input;
    const p = this.player;
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
        if (this.pedestrians.punchAt(fx, fz, 2.2)) {
          this.police.addHeat(12, 'assault');
          this.hud.feed('That\u2019ll leave a mark. The PD noticed.');
        }
      }
    }
    if (input.hit('KeyH')) this.sound.honk();
  }

  collectStashes(dt) {
    const p = this.player;
    const playerPos = p.onFoot ? p.pos : p.car.pos;
    for (const s of this.stashes) {
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 2;
      s.mesh.position.y = 1.2 + Math.sin(performance.now() / 400 + s.x) * 0.25;
      if (Math.hypot(playerPos.x - s.x, playerPos.z - s.z) < 3) {
        s.taken = true;
        s.mesh.visible = false;
        this.cash += 150;
        this.sound.pickup();
        this.hud.feed('Found a stash: +$150.');
      }
    }
  }

  nearestCar(pos, range) {
    let best = null;
    let bestD = range;
    for (const car of [...this.traffic.cars, ...this.parked]) {
      if (car === this.player.car) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  nearestPoliceCar(range) {
    const pos = this.player.pos;
    return this.police.cars.some((c) => Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < range);
  }

  // Push two overlapping cars apart; a hard hit slows the player and hurts.
  bumpCars(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = a.radius + b.radius - 0.4;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      if (!b.traffic) {
        // Traffic holds its line; the player bounces off everything else.
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
      if (Math.abs(a.speed) > 10 && this.damageCooldown <= 0) {
        this.damageCooldown = 0.7;
        this.sound.crash();
        a.speed *= 0.5;
      }
    }
  }

  showMissions() {
    const rows = MISSIONS.map((m, i) => {
      let status;
      if (i < this.missions.current) status = '✅ DONE';
      else if (i === this.missions.current) {
        status = this.missions.state === 'active' ? '▶ ACTIVE' : '○ READY — go to the gold marker';
      } else status = '🔒 LOCKED';
      return '<p><b>' + (i + 1) + '. ' + m.title + '</b> — ' + m.giver + ' · $' + m.reward.toLocaleString('en-US')
        + '<br>' + m.briefing + '<br><span style="color:#ffd23e">' + status + '</span></p>';
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
      // The chase camera eases behind the car; a mouse drag looks around
      // briefly and the view settles back on its own.
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
    this.camera.lookAt(focus.x, p.onFoot ? 1.6 : 1.2, focus.z);
  }
}

new Game();
