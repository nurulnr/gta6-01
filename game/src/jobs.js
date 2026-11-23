// The story: Mara Voss, a getaway driver back in Coral Bay, works off her
// brother's debt one job at a time. Six missions from three contacts, each a
// short list of stages — go somewhere, drive something, fight someone, escape
// something. A stage is data (a place, a timer, a head-count); the runner
// below walks the list, moves the beacon, and pays out when the last stage
// clears. Failing a timer restarts the mission, not the game.
import * as THREE from 'three';
import { spawnThug } from './people.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Tio Rey',
    brief: 'Rey needs a driver and you need wheels. Take any car on the street and bring it to the garage.',
    reward: 300,
    stages: [
      { kind: 'car', text: 'Steal a car — walk up to one and press E' },
      { kind: 'goto', x: -66, z: 66, radius: 7, text: 'Drive to Rey\u2019s Garage' },
    ],
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    giver: 'Nova',
    brief: 'A package for Club Neon, and the cops are already sniffing around. Pick it up at the hotel, then run it across town.',
    reward: 600,
    stages: [
      { kind: 'goto', x: 66, z: 154, radius: 7, text: 'Pick up the package at the Meridian Hotel', heat: 1 },
      { kind: 'deliver', x: 110, z: -66, radius: 7, time: 90, text: 'Deliver to Club Neon — beat the clock' },
    ],
  },
  {
    id: 'sunset-run',
    title: 'Sunset Run',
    giver: 'Tio Rey',
    brief: 'Five gates down the beach road before the sun is gone. Rey is timing you, and he bets on you.',
    reward: 800,
    stages: [
      { kind: 'gates', time: 80, text: 'Hit every gate down the beach road', gates: [[-132, 176], [-44, 176], [44, 176], [132, 176], [176, 176]] },
    ],
  },
  {
    id: 'beach-brawl',
    title: 'Beach Brawl',
    giver: 'Big Lou',
    brief: 'Lou\u2019s crew is being shaken down on the pier. Go on foot, settle it, and bring back what they took.',
    reward: 1000,
    stages: [
      { kind: 'goto', x: 44, z: 216, radius: 8, text: 'Get to the pier — on foot is fine' },
      { kind: 'combat', count: 4, text: 'Take out the dock thugs (click to shoot)', spawn: [[38, 232], [50, 238], [30, 226], [56, 228]] },
      { kind: 'goto', x: 44, z: 248, radius: 5, text: 'Grab the stash at the end of the pier' },
    ],
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    giver: 'Nova',
    brief: 'Coral Bank, eight seconds on the vault, then every cruiser in the city. Bring the money home.',
    reward: 2000,
    stages: [
      { kind: 'goto', x: 22, z: -22, radius: 8, text: 'Get to Coral Bank' },
      { kind: 'wait', x: 22, z: -22, radius: 9, time: 8, text: 'Crack the vault — hold position', heat: 2 },
      { kind: 'escape', x: -132, z: -132, radius: 9, text: 'Lose the heat — reach the safehouse', heat: 3 },
    ],
  },
  {
    id: 'clean-getaway',
    title: 'Clean Getaway',
    giver: 'Tio Rey',
    brief: 'One last run. Pick up the crew at the club, then outrun the whole department to the pier and sail out clean.',
    reward: 3000,
    stages: [
      { kind: 'goto', x: 110, z: -66, radius: 8, text: 'Pick up the crew at Club Neon' },
      { kind: 'escape', x: 44, z: 240, radius: 8, text: 'Outrun the cops — reach the pier', heat: 4 },
    ],
  },
];

let beacon = null;
let ring = null;

export function ensureBeacon(G) {
  if (beacon) return;
  beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 42, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 21;
  G.scene.add(beacon);
  ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.28, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  G.scene.add(ring);
  beacon.visible = false;
  ring.visible = false;
}

export function hideBeacon() {
  if (beacon) beacon.visible = false;
  if (ring) ring.visible = false;
}

function moveBeacon(x, z, pulse) {
  if (!beacon) return;
  beacon.visible = true;
  ring.visible = true;
  beacon.position.x = x;
  beacon.position.z = z;
  ring.position.x = x;
  ring.position.z = z;
  const s = 1 + Math.sin(pulse * 4) * 0.12;
  ring.scale.set(s, s, 1);
  beacon.material.opacity = 0.22 + Math.sin(pulse * 4) * 0.07;
}

export function startMission(G, index) {
  const m = MISSIONS[index];
  if (!m) return false;
  G.mission = {
    index,
    stage: 0,
    timer: 0,
    active: true,
    done: false,
    gateIndex: 0,
    waitLeft: 0,
    thugsLeft: 0,
  };
  G.objective = `${m.title} — ${m.stages[0].text}`;
  G.hud.showBrief(m);
  G.hud.flash(`New job: ${m.title} (${m.giver}) — $${m.reward}`);
  return true;
}

export function abortMission(G) {
  if (G.mission) G.mission.active = false;
  hideBeacon();
  G.objective = 'Free roam — press M for jobs';
}

function failMission(G, why) {
  G.hud.flash(`Job failed: ${why}. Try again.`);
  G.sound.busted();
  hideBeacon();
  startMission(G, G.mission.index);
}

function completeMission(G) {
  const m = MISSIONS[G.mission.index];
  G.cash += m.reward;
  G.sound.missionDone();
  G.sound.cash();
  G.hud.flash(`Job complete: ${m.title} — +$${m.reward}`);
  G.hud.showToast(`${m.title} complete`, `+$${m.reward}  ·  ${G.mission.index + 1 < MISSIONS.length ? 'Next job unlocked' : 'Story complete — Coral Bay is yours'}`);
  G.mission.active = false;
  G.mission.done = true;
  hideBeacon();
  G.saveGame();
  if (G.mission.index + 1 < MISSIONS.length) {
    G.mission.nextAt = G.elapsed + 2.5;
  } else {
    G.storyDone = true;
    G.objective = 'Story complete — free roam';
  }
}

function advanceStage(G) {
  const m = MISSIONS[G.mission.index];
  G.mission.stage += 1;
  G.mission.timer = 0;
  G.mission.gateIndex = 0;
  if (G.mission.stage >= m.stages.length) {
    completeMission(G);
    return;
  }
  const s = m.stages[G.mission.stage];
  G.objective = `${m.title} — ${s.text}`;
  if (s.kind === 'combat') {
    G.mission.thugsLeft = s.count;
    for (const [x, z] of s.spawn) spawnThug(G, x, z);
  }
  if (s.kind === 'wait') G.mission.waitLeft = s.time;
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m || !m.active) {
    if (m && m.nextAt && G.elapsed >= m.nextAt) {
      m.nextAt = 0;
      startMission(G, m.index + 1);
    }
    return;
  }
  const def = MISSIONS[m.index];
  const stage = def.stages[m.stage];
  if (!stage) return;
  if (stage.heat) {
    G.wanted = Math.max(G.wanted, stage.heat);
    G.calmTimer = 0;
  }
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  if (stage.kind === 'car') {
    hideBeacon();
    if (G.player.car) advanceStage(G);
    return;
  }
  if (stage.kind === 'goto' || stage.kind === 'deliver' || stage.kind === 'wait' || stage.kind === 'escape') {
    const tx = stage.x;
    const tz = stage.z;
    moveBeacon(tx, tz, G.elapsed);
    const d = Math.hypot(px - tx, pz - tz);
    if (stage.kind === 'wait') {
      if (d < stage.radius) {
        m.waitLeft -= dt;
        G.objective = `${def.title} — cracking the vault… ${Math.ceil(m.waitLeft)}s`;
        if (m.waitLeft <= 0) advanceStage(G);
      } else {
        G.objective = `${def.title} — ${stage.text}`;
      }
      return;
    }
    if (stage.kind === 'deliver' || stage.kind === 'gates') {
      m.timer += dt;
      const left = Math.max(0, stage.time - m.timer);
      G.objective = `${def.title} — ${stage.text} · ${Math.ceil(left)}s left`;
      if (left <= 0) {
        failMission(G, 'out of time');
        return;
      }
    }
    if (d < stage.radius) {
      if (stage.kind === 'deliver') G.sound.pickup();
      advanceStage(G);
    }
    return;
  }
  if (stage.kind === 'gates') {
    const gate = stage.gates[m.gateIndex];
    moveBeacon(gate[0], gate[1], G.elapsed);
    m.timer += dt;
    const left = Math.max(0, stage.time - m.timer);
    G.objective = `${def.title} — gate ${m.gateIndex + 1}/${stage.gates.length} · ${Math.ceil(left)}s left`;
    if (left <= 0) {
      failMission(G, 'out of time');
      return;
    }
    const d = Math.hypot(px - gate[0], pz - gate[1]);
    if (d < 7) {
      G.sound.pickup();
      m.gateIndex += 1;
      if (m.gateIndex >= stage.gates.length) advanceStage(G);
    }
    return;
  }
  if (stage.kind === 'combat') {
    const alive = G.thugs.filter((t) => !t.down).length;
    m.thugsLeft = alive;
    G.objective = `${def.title} — ${stage.text} · ${alive} left`;
    moveBeacon(44, 232, G.elapsed);
    if (alive === 0) advanceStage(G);
  }
}
