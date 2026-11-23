// Keyboard and mouse input. Keys are tracked by code (KeyW, Space, ...) so the
// layout does not matter, and `pressed` fires only on the frame a key goes down.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;
    this.anyKey = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.dragging = false; });
    canvas.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  is(code) { return this.down.has(code); }

  // True once, on the frame the key went down.
  hit(code) { return this.pressed.has(code); }

  // WASD / arrows as a -1..1 pair, y forward.
  moveAxes() {
    let x = 0, y = 0;
    if (this.is('KeyA') || this.is('ArrowLeft')) x -= 1;
    if (this.is('KeyD') || this.is('ArrowRight')) x += 1;
    if (this.is('KeyW') || this.is('ArrowUp')) y += 1;
    if (this.is('KeyS') || this.is('ArrowDown')) y -= 1;
    return { x, y };
  }

  // Consume the per-frame edge state after the game loop has read it.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.anyKey = false;
  }
}
