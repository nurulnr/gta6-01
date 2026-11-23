// Six story missions for Mara Solis, given by Rico (fixer), Tessa (mechanic)
// and Vega (club owner). Missions unlock in order; each one is a small state
// machine over the live game world, with a gold beacon marking the target.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'first-wheels', title: 'First Wheels', giver: 'Rico',
    briefing: 'Rico needs wheels. Steal any car and bring it to his garage.',
    start: { x: -180, z: 180 },
    reward: 500,
  },
  {
    id: 'sunset-run', title: 'Sunset Run', giver: 'Tessa',
    briefing: 'Tessa has a package for the pier. Drive it there in 90 seconds.',
    start: { x: -180, z: 180 },
    reward: 800,
  },
  {
    id: 'heat-check', title: 'Heat Check', giver: 'Rico',
    briefing: 'Rico wants to know if you can handle heat: get 3 stars, then lose them.',
    start: { x: -36, z: 108 },
    reward: 1000,
  },
  {
    id: 'beach-brawl', title: 'Beach Brawl', giver: 'Vega',
    briefing: 'Vega\u2019s thugs are hassling the beach bars. Put 4 of them down.',
    start: { x: 272, z: 60 },
    reward: 1200,
  },
  {
    id: 'the-vip', title: 'The VIP', giver: 'Tessa',
    briefing: 'A VIP is waiting at Hotel Miramar. Pick them up and drive them to Club Vega in 75 seconds.',
    start: { x: 180, z: -108 },
    reward: 1500,
  },
  {
    id: 'big-score', title: 'The Big Score', giver: 'Vega',
    briefing: 'The Solmara Bank. Grab the cash, then lose a 4-star wanted level at the safehouse.',
    start: { x: -36, z: 108 },
    reward: 3000,
  },
];

function makeBeacon(scene, color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  g.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 9;
  g.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  g.userData.diamond = diamond;
  scene.add(g);
  return g;
}

export class MissionRunner {
  // world: the live game state (player, police, pedestrians, landmarks, cash...).
  // hooks: { feed(text), banner(title, sub), objective(title, text), addCash(n), setMarker(x,z,color)|clearMarker(), sound(name) }
  constructor(scene, world, hooks) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.current = 0;           // index into MISSIONS
    this.state = 'idle';        // idle | active | done-all
    this.step = 0;
    this.timer = 0;
    this.beacon = null;
    this.vipPed = null;
    this.thugsSpawned = false;
    this.showStartBeacon();
  }

  mission() { return MISSIONS[this.current] ?? null; }

  doneCount() { return this.current; }

  showStartBeacon() {
    this.clearBeacon();
    const m = this.mission();
    if (!m || this.state === 'done-all') return;
    this.beacon = makeBeacon(this.scene, 0xffd23e);
    this.beacon.position.set(m.start.x, 0, m.start.z);
    this.hooks.objective('Next job: ' + m.title, m.briefing + ' — go to the gold marker.');
  }

  clearBeacon() {
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
  }

  setTarget(x, z, color) {
    this.clearBeacon();
    this.beacon = makeBeacon(this.scene, color ?? 0xffd23e);
    this.beacon.position.set(x, 0, z);
  }

  start() {
    const m = this.mission();
    if (!m || this.state === 'active') return false;
    this.state = 'active';
    this.step = 0;
    this.timer = 0;
    this.hooks.banner(m.title, m.giver + ': ' + m.briefing);
    this.hooks.feed(m.giver + ': ' + m.briefing);
    this.hooks.sound('jingle');
    this.enterStep();
    return true;
  }

  enterStep() {
    const m = this.mission();
    const L = this.world.landmarks;
    switch (m.id) {
      case 'first-wheels':
        if (this.step === 0) { this.hooks.objective(m.title, 'Steal any car (walk up and press E).'); this.clearBeacon(); }
        else { this.hooks.objective(m.title, 'Drive it to Rico\u2019s garage.'); this.setTarget(L.garage.x, L.garage.z); }
        break;
      case 'sunset-run':
        if (this.step === 0) { this.hooks.objective(m.title, 'Get in a car, then run the package to the pier.'); this.clearBeacon(); }
        else { this.timer = 90; this.hooks.objective(m.title, 'Deliver to the pier — 90 seconds!'); this.setTarget(L.pier.x, L.pier.z); }
        break;
      case 'heat-check':
        if (this.step === 0) { this.hooks.objective(m.title, 'Cause some trouble — get to 3 wanted stars.'); this.clearBeacon(); }
        else { this.timer = 120; this.hooks.objective(m.title, 'Now lose them. Stay clean until the heat dies down.'); this.clearBeacon(); }
        break;
      case 'beach-brawl':
        this.hooks.objective(m.title, 'Knock down 4 thugs at the beach. Walk up and press F.');
        this.setTarget(L.beach.x, L.beach.z);
        if (!this.thugsSpawned) {
          this.thugsSpawned = true;
          for (let i = 0; i < 6; i++) {
            this.world.pedestrians.spawnOne(L.beach.x + (i % 3) * 6 - 6, L.beach.z + Math.floor(i / 3) * 6 - 3);
          }
        }
        break;
      case 'the-vip':
        if (this.step === 0) {
          this.hooks.objective(m.title, 'Walk up to the VIP outside Hotel Miramar.');
          this.setTarget(L.hotel.x, L.hotel.z);
          this.vipPed = this.world.pedestrians.spawnOne(L.hotel.x + 12, L.hotel.z + 6);
          this.vipPed.state = 'walk'; this.vipPed.speed = 0;
        } else {
          this.timer = 75;
          this.hooks.objective(m.title, 'Drive the VIP to Club Vega — 75 seconds, and drive smooth!');
          this.setTarget(L.club.x, L.club.z);
        }
        break;
      case 'big-score':
        if (this.step === 0) { this.hooks.objective(m.title, 'Drive to the Solmara Bank.'); this.setTarget(L.bank.x, L.bank.z); }
        else if (this.step === 1) { this.hooks.objective(m.title, 'On foot — walk into the bank and grab the cash!'); this.setTarget(L.bank.x, L.bank.z, 0x7dff9a); }
        else { this.hooks.objective(m.title, '4 stars! Lose the cops at the safehouse.'); this.setTarget(L.safehouse.x, L.safehouse.z, 0x7dff9a); }
        break;
    }
  }

  complete() {
    const m = this.mission();
    this.hooks.addCash(m.reward);
    this.hooks.banner('JOB DONE', m.title + ' — +$' + m.reward.toLocaleString('en-US'));
    this.hooks.feed('Paid $' + m.reward.toLocaleString('en-US') + ' for ' + m.title + '.');
    this.hooks.sound('jingle');
    this.current += 1;
    this.thugsSpawned = false;
    this.vipPed = null;
    if (this.current >= MISSIONS.length) {
      this.state = 'done-all';
      this.clearBeacon();
      this.hooks.objective('Solmara is yours', 'Every job done. Free roam — the city is yours, Mara.');
      this.hooks.banner('SOLMARA IS YOURS', 'All six jobs complete. Legend status.');
    } else {
      this.state = 'idle';
      this.showStartBeacon();
    }
  }

  fail(reason) {
    const m = this.mission();
    this.hooks.banner('JOB FAILED', reason);
    this.hooks.feed('Failed: ' + m.title + ' — ' + reason + ' Go back to the gold marker to retry.');
    this.hooks.sound('busted');
    this.state = 'idle';
    this.timer = 0;
    this.showStartBeacon();
  }

  // Called every frame while a mission is active. Returns nothing; uses world state.
  update(dt) {
    if (this.beacon) {
      this.beacon.userData.diamond.rotation.y += dt * 2;
      this.beacon.userData.diamond.position.y = 9 + Math.sin(performance.now() / 300) * 0.8;
    }
    if (this.state !== 'active') return;
    const m = this.mission();
    const w = this.world;
    const p = w.player;
    const px = p.onFoot ? p.pos.x : p.car.pos.x;
    const pz = p.onFoot ? p.pos.z : p.car.pos.z;
    const L = w.landmarks;
    const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time.'); return; }
    }
    switch (m.id) {
      case 'first-wheels':
        if (this.step === 0 && !p.onFoot) { this.step = 1; this.enterStep(); }
        else if (this.step === 1 && !p.onFoot && near(L.garage.x, L.garage.z, 14)) this.complete();
        break;
      case 'sunset-run':
        if (this.step === 0 && !p.onFoot) { this.step = 1; this.enterStep(); }
        else if (this.step === 1 && !p.onFoot && near(L.pier.x, L.pier.z, 16)) this.complete();
        break;
      case 'heat-check':
        if (this.step === 0 && w.police.stars >= 3) { this.step = 1; this.enterStep(); }
        else if (this.step === 1 && w.police.stars === 0) this.complete();
        break;
      case 'beach-brawl': {
        const down = w.pedestrians.downCountNear(L.beach.x, L.beach.z, 34);
        this.hooks.objective(m.title, 'Thugs down: ' + down + ' / 4');
        if (down >= 4) this.complete();
        break;
      }
      case 'the-vip':
        if (this.step === 0 && p.onFoot && this.vipPed && Math.hypot(p.pos.x - this.vipPed.pos.x, p.pos.z - this.vipPed.pos.z) < 3.5) {
          w.pedestrians.list.splice(w.pedestrians.list.indexOf(this.vipPed), 1);
          w.scene.remove(this.vipPed.mesh);
          this.vipPed = null;
          this.step = 1; this.enterStep();
          this.hooks.feed('VIP: "Drive, and don\u2019t scratch the paint."');
        } else if (this.step === 1 && !p.onFoot && near(L.club.x, L.club.z, 14)) this.complete();
        break;
      case 'big-score':
        if (this.step === 0 && !p.onFoot && near(L.bank.x, L.bank.z, 14)) { this.step = 1; this.enterStep(); }
        else if (this.step === 1 && p.onFoot && near(L.bank.x, L.bank.z, 8)) {
          this.step = 2; this.enterStep();
          w.police.setStars(4);
          this.hooks.feed('ALARM! The whole Solmara PD is coming. Run!');
          this.hooks.sound('busted');
        } else if (this.step === 2 && near(L.safehouse.x, L.safehouse.z, 14) && w.police.stars === 0) this.complete();
        break;
    }
  }

  // The player is standing at the gold start marker and pressed E.
  tryStartAt(px, pz) {
    const m = this.mission();
    if (!m || this.state === 'active') return false;
    if (Math.hypot(px - m.start.x, pz - m.start.z) < 10) return this.start();
    return false;
  }
}
