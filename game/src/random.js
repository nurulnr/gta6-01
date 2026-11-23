// Small shared helpers: a deterministic PRNG, angle and number helpers, and
// the two text formatters the HUD uses. The world is laid out from a fixed
// seed, so the city, the traffic and the screenshot scenes are identical on
// every load; Math.random is never used for layout.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tiny random source with the conveniences the world builders reach for.
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(low, high) {
      return low + next() * (high - low);
    },
    int(low, high) {
      return Math.floor(low + next() * (high - low + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    chance(probability) {
      return next() < probability;
    },
  };
}

export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// The shortest signed rotation from heading a toward heading b, in radians.
export function angleDelta(a, b) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function formatCash(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

export function formatClock(minutesOfDay) {
  const hours = Math.floor(minutesOfDay / 60) % 24;
  const minutes = Math.floor(minutesOfDay % 60);
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}
