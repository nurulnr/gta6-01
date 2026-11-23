// The HUD: DOM panels over the 3D canvas — health, cash, wanted stars, clock,
// objective, speed, and a live minimap — plus the menus (title, pause, jobs,
// busted) and the toasts that narrate the story. The minimap draws the same
// roads and buildings the city built, so it never disagrees with the world.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const root = el('hud');
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashEl = el('cash');
  const starsEl = el('stars');
  const clockEl = el('clock');
  const objectiveEl = el('objective');
  const speedEl = el('speed');
  const map = el('minimap');
  const mapCtx = map.getContext('2d');
  const crosshair = el('crosshair');
  const flashEl = el('flash');
  const toastEl = el('toast');
  const toastTitle = el('toast-title');
  const toastSub = el('toast-sub');
  const briefEl = el('brief');
  const briefTitle = el('brief-title');
  const briefBody = el('brief-body');
  const menuEl = el('menu');
  const menuTitle = el('menu-title');
  const menuSub = el('menu-sub');
  const pauseEl = el('pause');
  const jobsEl = el('jobs');
  const jobsList = el('jobs-list');
  const bustedEl = el('busted');
  const bustedTitle = el('busted-title');
  const vignette = el('vignette');
  const bustBar = el('bust-bar');
  const bustFill = el('bust-fill');
  const promptEl = el('prompt');

  let flashTimer = null;
  let toastTimer = null;
  let briefTimer = null;

  const SCALE = 180 / 560;
  const mapX = (x) => (x + 280) * SCALE;
  const mapY = (z) => (z + 310) * SCALE;

  function drawMinimap(G) {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, 180, 180);
    ctx.fillStyle = '#24351f';
    ctx.fillRect(0, 0, 180, 180);
    // Sea and sand at the bottom of the map.
    ctx.fillStyle = '#2a7fa8';
    ctx.fillRect(0, mapY(232), 180, 180 - mapY(232));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, mapY(196), 180, mapY(232) - mapY(196));
    // Roads.
    ctx.strokeStyle = '#55585f';
    ctx.lineWidth = 4;
    for (const r of G.city.mapRoads) {
      ctx.beginPath();
      ctx.moveTo(mapX(r.x1), mapY(r.z1));
      ctx.lineTo(mapX(r.x2), mapY(r.z2));
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#7d838d';
    for (const b of G.city.mapBuildings) {
      ctx.fillRect(mapX(b.x - b.w / 2), mapY(b.z - b.d / 2), Math.max(2, b.w * SCALE), Math.max(2, b.d * SCALE));
    }
    // Mission beacon.
    if (G.mission && G.mission.active) {
      const def = G.missionDef();
      const stage = def ? def.stages[G.mission.stage] : null;
      let bx = null;
      let bz = null;
      if (stage) {
        if (stage.kind === 'gates') {
          const g = stage.gates[G.mission.gateIndex];
          if (g) { bx = g[0]; bz = g[1]; }
        } else if (stage.x !== undefined) {
          bx = stage.x; bz = stage.z;
        }
      }
      if (bx !== null) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(mapX(bx), mapY(bz), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mapX(bx), mapY(bz), 8 + Math.sin(G.elapsed * 5) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Cops and thugs.
    ctx.fillStyle = '#4aa8ff';
    for (const cop of G.cops) {
      ctx.beginPath();
      ctx.arc(mapX(cop.car.pos.x), mapY(cop.car.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff4444';
    for (const t of G.thugs) {
      if (t.down) continue;
      ctx.beginPath();
      ctx.arc(mapX(t.pos.x), mapY(t.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, an arrow pointing where they face.
    ctx.save();
    ctx.translate(mapX(G.player.pos.x), mapY(G.player.pos.z));
    ctx.rotate(Math.PI - G.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return {
    show() {
      root.style.display = 'block';
    },
    hide() {
      root.style.display = 'none';
    },
    update(G) {
      const hp = Math.max(0, Math.round(G.player.health));
      healthFill.style.width = `${hp}%`;
      healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
      healthText.textContent = hp;
      cashEl.textContent = `$${Math.floor(G.cash).toLocaleString('en-US')}`;
      starsEl.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
      starsEl.style.color = G.wanted > 0 ? '#ffd166' : '#888888';
      const hh = Math.floor(G.clockMin / 60) % 24;
      const mm = Math.floor(G.clockMin % 60);
      clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      objectiveEl.textContent = G.objective || '';
      const mph = G.player.car ? Math.abs(G.player.car.speed) * 2.237 : 0;
      speedEl.textContent = G.player.car ? `${Math.round(mph)} mph` : '';
      crosshair.style.display = !G.player.car && G.screen === 'play' ? 'block' : 'none';
      if (G.bustProgress > 0.02) {
        bustBar.style.display = 'block';
        bustFill.style.width = `${Math.min(100, G.bustProgress * 100)}%`;
      } else {
        bustBar.style.display = 'none';
      }
      const near = G.nearCar;
      promptEl.style.display = near && !G.player.car && G.screen === 'play' ? 'block' : 'none';
      if (near) promptEl.textContent = 'Press E to get in the car';
      drawMinimap(G);
    },
    flash(msg) {
      flashEl.textContent = msg;
      flashEl.style.opacity = '1';
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { flashEl.style.opacity = '0'; }, 2600);
    },
    showToast(title, sub) {
      toastTitle.textContent = title;
      toastSub.textContent = sub || '';
      toastEl.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 3400);
    },
    showBrief(m) {
      briefTitle.textContent = `${m.title} — ${m.giver}`;
      briefBody.textContent = m.brief;
      briefEl.style.opacity = '1';
      if (briefTimer) clearTimeout(briefTimer);
      briefTimer = setTimeout(() => { briefEl.style.opacity = '0'; }, 6000);
    },
    damageVignette() {
      vignette.style.opacity = '0.55';
      setTimeout(() => { vignette.style.opacity = '0'; }, 180);
    },
    // Hide the timed panels at once (the screenshot scenes run faster than
    // real time, so their timers have not fired yet when the frame is taken).
    clearTransient() {
      if (flashTimer) clearTimeout(flashTimer);
      if (toastTimer) clearTimeout(toastTimer);
      if (briefTimer) clearTimeout(briefTimer);
      flashTimer = null;
      toastTimer = null;
      briefTimer = null;
      flashEl.style.opacity = '0';
      toastEl.style.opacity = '0';
      briefEl.style.opacity = '0';
    },
    showMenu(title, sub) {
      menuTitle.textContent = title;
      menuSub.textContent = sub || '';
      menuEl.style.display = 'flex';
    },
    hideMenu() {
      menuEl.style.display = 'none';
    },
    showPause(show) {
      pauseEl.style.display = show ? 'flex' : 'none';
    },
    showBusted(show, wasted) {
      bustedEl.style.display = show ? 'flex' : 'none';
      bustedTitle.textContent = wasted ? 'WASTED' : 'BUSTED';
    },
    toggleJobs(G, show) {
      jobsEl.style.display = show ? 'block' : 'none';
      if (!show) return;
      const rows = [];
      const { MISSIONS } = G;
      MISSIONS.forEach((m, i) => {
        let state = 'Locked';
        if (G.mission && i < G.mission.index) state = 'Done ✓';
        else if (G.mission && i === G.mission.index) state = G.mission.active ? 'In progress' : 'Done ✓';
        else if (i === 0) state = 'Available';
        rows.push(`<div class="job-row"><b>${i + 1}. ${m.title}</b> — ${m.giver} · $${m.reward}<br><span>${m.brief}</span><br><i>${state}</i></div>`);
      });
      jobsList.innerHTML = rows.join('');
    },
  };
}
