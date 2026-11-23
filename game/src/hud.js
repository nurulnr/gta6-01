// The HUD: cash, health, wanted stars, the clock, the mission objective,
// the speedometer, the message feed, banners, and the 2D minimap drawn from
// the city layout. Everything here is plain DOM except the minimap, which is
// a small canvas redrawn every frame.
import { formatCash, formatClock } from './random.js';
import { ROAD_COORDS, CITY_EDGE } from './city.js';

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.cashEl = $('cash');
    this.healthEl = $('healthfill');
    this.starsEl = $('stars');
    this.clockEl = $('clock');
    this.objectiveEl = $('objective');
    this.objTitle = $('objTitle');
    this.objText = $('objText');
    this.speedEl = $('speed');
    this.gearEl = $('gear');
    this.speedoEl = $('speedo');
    this.feedEl = $('feed');
    this.bannerEl = $('banner');
    this.missionCountEl = $('missionCount');
    this.minimap = $('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.bannerTimer = null;
    this.feedTimer = null;
  }

  update(state) {
    this.cashEl.textContent = formatCash(state.cash);
    this.healthEl.style.width = Math.max(0, state.health) + '%';
    const stars = this.starsEl.children;
    for (let i = 0; i < 5; i++) {
      stars[i].className = i < state.stars ? '' : 'off';
    }
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

  clearObjective() {
    this.objectiveEl.classList.add('hidden');
  }

  banner(title, sub) {
    this.bannerEl.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    this.bannerEl.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.bannerEl.style.opacity = '0';
    }, 2600);
  }

  feed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.feedEl.appendChild(div);
    while (this.feedEl.children.length > 3) {
      this.feedEl.removeChild(this.feedEl.firstChild);
    }
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => {
      this.feedEl.innerHTML = '';
    }, 6000);
  }

  // Top-down map: the sea, the blocks, the roads, then the live blips — the
  // gold mission marker, blue police cars and the white player arrow.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 200;
    const spanX = CITY_EDGE + 90;
    const spanZ = CITY_EDGE + 40;
    const toMap = (x, z) => [
      ((x + spanX) / (2 * spanX)) * S,
      ((z + spanZ) / (2 * spanZ)) * S,
    ];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#12233a';
    ctx.fillRect(0, 0, S, S);
    // Sea along the right edge.
    const [seaX] = toMap(316, 0);
    ctx.fillStyle = '#1d6a8a';
    ctx.fillRect(seaX, 0, S - seaX, S);
    // City blocks.
    ctx.fillStyle = '#3a4552';
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        const [x, z] = toMap(-180 + bx * 72, -180 + bz * 72);
        ctx.fillRect(x - 13, z - 13, 26, 26);
      }
    }
    // Roads.
    ctx.strokeStyle = '#8a8f98';
    ctx.lineWidth = 5;
    for (const c of ROAD_COORDS) {
      const [x] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
      const [, z] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(S, z);
      ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, mz, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (state.marker) dot(state.marker.x, state.marker.z, 5, '#ffd23e');
    for (const p of state.policeCars) dot(p.x, p.z, 3, '#4a9aff');
    // The player arrow, rotated to the heading.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(state.playerHeading), Math.cos(state.playerHeading)) + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 4, 12);
  }
}
