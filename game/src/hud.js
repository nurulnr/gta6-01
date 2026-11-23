// The HUD: cash, health, wanted stars, clock, mission objective, speed, the
// message feed, banners, and the 2D minimap drawn from the city layout.
import { formatCash, formatClock } from './random.js';
import { ROAD_COORDS, CITY_EDGE } from './city.js';

export class Hud {
  constructor() {
    this.cashEl = document.getElementById('cash');
    this.healthEl = document.getElementById('healthfill');
    this.starsEl = document.getElementById('stars');
    this.clockEl = document.getElementById('clock');
    this.objectiveEl = document.getElementById('objective');
    this.objTitle = document.getElementById('objTitle');
    this.objText = document.getElementById('objText');
    this.speedEl = document.getElementById('speed');
    this.gearEl = document.getElementById('gear');
    this.speedoEl = document.getElementById('speedo');
    this.feedEl = document.getElementById('feed');
    this.bannerEl = document.getElementById('banner');
    this.repEl = document.getElementById('rep');
    this.missionCountEl = document.getElementById('missionCount');
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.bannerTimer = null;
    this.feedTimer = null;
  }

  update(state) {
    this.cashEl.textContent = formatCash(state.cash);
    this.healthEl.style.width = Math.max(0, state.health) + '%';
    const stars = this.starsEl.children;
    for (let i = 0; i < 5; i++) stars[i].className = i < state.stars ? '' : 'off';
    this.clockEl.textContent = formatClock(state.clockMinutes);
    this.missionCountEl.textContent = state.missionsDone + '/6 missions';
    if (state.inCar) {
      this.speedoEl.classList.remove('hidden');
      this.speedEl.textContent = Math.round(Math.abs(state.speedKmh));
      this.gearEl.textContent = 'km/h · ' + (state.carKind || 'car');
    } else {
      this.speedoEl.classList.add('hidden');
    }
  }

  objective(title, text) {
    this.objectiveEl.classList.remove('hidden');
    this.objTitle.textContent = title;
    this.objText.textContent = text;
  }

  clearObjective() { this.objectiveEl.classList.add('hidden'); }

  banner(title, sub) {
    this.bannerEl.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    this.bannerEl.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.bannerEl.style.opacity = '0'; }, 2600);
  }

  feed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.feedEl.appendChild(div);
    while (this.feedEl.children.length > 3) this.feedEl.removeChild(this.feedEl.firstChild);
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => { this.feedEl.innerHTML = ''; }, 6000);
  }

  // Top-down map: roads, blocks, sea, player arrow, police, mission marker.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 200;
    const toMap = (x, z) => [((x + CITY_EDGE + 90) / (2 * (CITY_EDGE + 90))) * S, ((z + CITY_EDGE + 40) / (2 * (CITY_EDGE + 40))) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#12233a'; ctx.fillRect(0, 0, S, S);
    // sea on the right edge
    ctx.fillStyle = '#1d6a8a';
    const [seaX] = toMap(316, 0);
    ctx.fillRect(seaX, 0, S - seaX, S);
    // blocks
    ctx.fillStyle = '#3a4552';
    for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 6; bz++) {
      const [x, z] = toMap(-180 + bx * 72, -180 + bz * 72);
      ctx.fillRect(x - 13, z - 13, 26, 26);
    }
    // roads
    ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 5;
    for (const c of ROAD_COORDS) {
      const [x] = toMap(c, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, z] = toMap(0, c); ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx, mz, r, 0, Math.PI * 2); ctx.fill();
    };
    // mission marker
    if (state.marker) dot(state.marker.x, state.marker.z, 5, '#ffd23e');
    // police blips
    for (const p of state.policeCars) dot(p.x, p.z, 3, '#4a9aff');
    // player arrow
    const [px, pz] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(state.playerHeading), Math.cos(state.playerHeading)) + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // north tick
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('N', 4, 12);
  }
}
