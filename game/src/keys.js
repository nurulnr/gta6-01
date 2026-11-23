// Keyboard and mouse state, read fresh every frame. Actions are edge-triggered
// (pressed this frame), movement is level-triggered (held down). The page never
// scrolls on game keys.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyM', 'KeyP', 'Escape', 'Enter',
  'KeyR', 'Digit1', 'Digit2', 'Digit3',
]);

export function createKeys(target) {
  const down = new Set();
  const pressed = new Set();
  let mouseDown = false;
  let mousePressed = false;
  let pointerX = 0;
  let pointerY = 0;
  let locked = false;

  function onDown(event) {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
  }
  function onUp(event) {
    down.delete(event.code);
  }
  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    mousePressed = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onMouseMove(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
  }

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('blur', () => {
    down.clear();
    mouseDown = false;
  });

  return {
    held(code) {
      return down.has(code);
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    mouseWasPressed() {
      return mousePressed;
    },
    mouseHeld() {
      return mouseDown;
    },
    pointer() {
      return { x: pointerX, y: pointerY };
    },
    // Forward/back/left/right as -1/0/1, from WASD or the arrow keys.
    drive() {
      const fwd = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0)
        - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      const turn = (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0)
        - (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0);
      return { fwd, turn };
    },
    sprint() {
      return down.has('ShiftLeft') || down.has('ShiftRight');
    },
    requestLock(canvas) {
      if (!locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
          locked = true;
        } catch {
          locked = false;
        }
      }
    },
    endFrame() {
      pressed.clear();
      mousePressed = false;
    },
  };
}
