// Keyboard and mouse input. Keys are tracked by their physical code (KeyW,
// Space, ...) so the player's layout does not matter, and `hit` answers only
// on the frame a key first goes down. The mouse steers the camera while the
// player drags on the canvas.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.down.add(event.code);
      this.pressed.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.dragging = false;
    });
    canvas.addEventListener('mousedown', () => {
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });
  }

  is(code) {
    return this.down.has(code);
  }

  // True once, on the frame the key went down.
  hit(code) {
    return this.pressed.has(code);
  }

  // WASD or the arrow keys as a -1..1 pair, y pointing forward.
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.is('KeyA') || this.is('ArrowLeft')) x -= 1;
    if (this.is('KeyD') || this.is('ArrowRight')) x += 1;
    if (this.is('KeyW') || this.is('ArrowUp')) y += 1;
    if (this.is('KeyS') || this.is('ArrowDown')) y -= 1;
    return { x, y };
  }

  // Drop the per-frame edge state once the game loop has read it.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
