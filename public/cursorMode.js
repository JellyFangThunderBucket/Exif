const STORAGE_KEY = 'metaCursorMode';
const MOVE_THRESHOLD = 8;
const TAP_MAX_MS = 400;
const SENSITIVITY = 1;
const CURSOR_WIDTH = 20;
const CURSOR_HEIGHT = 24;

export function clampPosition(x, y, width, height) {
  return { x: Math.max(0, Math.min(Number(x) || 0, Math.max(0, width - CURSOR_WIDTH))), y: Math.max(0, Math.min(Number(y) || 0, Math.max(0, height - CURSOR_HEIGHT))) };
}

export function isTapGesture(distance, duration) {
  return distance <= MOVE_THRESHOLD && duration <= TAP_MAX_MS;
}

export function createCursorMode({ document: doc = document, window: win = window, storage = win.localStorage } = {}) {
  let enabled = false, initialized = false, x = 0, y = 0, gesture = null, twoFingerY = null;
  let cursor, feedback, toggle;

  const updateToggle = () => {
    if (!toggle) return;
    toggle.textContent = `Cursor Mode: ${enabled ? 'Cursor' : 'Touch'}`;
    toggle.setAttribute('aria-pressed', String(enabled));
  };
  const render = () => { if (cursor) cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
  const clamp = () => { ({ x, y } = clampPosition(x, y, win.innerWidth, win.innerHeight)); render(); return { x, y }; };
  const moveCursor = (dx, dy) => { if (!enabled) return { x, y }; x += dx * SENSITIVITY; y += dy * SENSITIVITY; return clamp(); };
  const flash = () => {
    feedback.style.transform = `translate3d(${x - 6}px, ${y - 6}px, 0)`;
    feedback.classList.remove('virtual-cursor-click'); void feedback.offsetWidth;
    feedback.classList.add('virtual-cursor-click');
  };
  const clickAtCursor = () => {
    if (!enabled) return false;
    const target = doc.elementFromPoint(x, y);
    if (!target || target.closest?.(':disabled,[aria-disabled="true"]')) return false;
    flash();
    if (target.matches?.('input, textarea, select, [contenteditable="true"]')) target.focus({ preventScroll: true });
    target.click();
    return true;
  };
  const persist = () => { try { storage.setItem(STORAGE_KEY, enabled ? 'cursor' : 'touch'); } catch {} };
  const enableCursorMode = () => {
    if (!initialized) initialize();
    if (!enabled) { enabled = true; if (!x && !y) { x = win.innerWidth / 2; y = win.innerHeight / 2; } }
    cursor.hidden = false; doc.documentElement.classList.add('cursor-mode-active'); updateToggle(); clamp(); persist();
  };
  const disableCursorMode = () => {
    enabled = false; gesture = null; twoFingerY = null;
    if (cursor) cursor.hidden = true; doc.documentElement.classList.remove('cursor-mode-active'); updateToggle(); persist();
  };
  const toggleCursorMode = () => enabled ? disableCursorMode() : enableCursorMode();
  const averageY = touches => [...touches].reduce((sum, touch) => sum + touch.clientY, 0) / touches.length;
  const onTouchStart = event => {
    if (!enabled) return;
    event.preventDefault();
    if (event.touches.length === 1) {
      const t = event.touches[0]; gesture = { lastX: t.clientX, lastY: t.clientY, distance: 0, started: Date.now(), multi: false }; twoFingerY = null;
    } else if (event.touches.length >= 2) {
      if (gesture) gesture.multi = true; twoFingerY = averageY(event.touches); gesture ||= { multi: true };
    }
  };
  const onTouchMove = event => {
    if (!enabled) return;
    event.preventDefault();
    if (event.touches.length >= 2) {
      const nextY = averageY(event.touches); if (twoFingerY !== null) win.scrollBy(0, twoFingerY - nextY); twoFingerY = nextY; if (gesture) gesture.multi = true; return;
    }
    if (event.touches.length === 1 && gesture) {
      const t = event.touches[0], dx = t.clientX - gesture.lastX, dy = t.clientY - gesture.lastY;
      gesture.distance += Math.hypot(dx, dy); gesture.lastX = t.clientX; gesture.lastY = t.clientY; moveCursor(dx, dy);
    }
  };
  const onTouchEnd = event => {
    if (!enabled) return;
    event.preventDefault();
    if (event.touches.length) { if (event.touches.length === 1) twoFingerY = null; return; }
    const finished = gesture; gesture = null; twoFingerY = null;
    if (finished && !finished.multi && isTapGesture(finished.distance, Date.now() - finished.started)) clickAtCursor();
  };
  const initialize = ({ toggleElement = doc.getElementById('cursorModeToggle') } = {}) => {
    if (initialized) return;
    initialized = true; toggle = toggleElement;
    cursor = doc.createElement('div'); cursor.id = 'virtualCursor'; cursor.className = 'virtual-cursor'; cursor.hidden = true; cursor.setAttribute('aria-hidden', 'true');
    feedback = doc.createElement('div'); feedback.className = 'virtual-cursor-feedback'; feedback.setAttribute('aria-hidden', 'true');
    doc.body.append(cursor, feedback);
    doc.addEventListener('touchstart', onTouchStart, { passive: false }); doc.addEventListener('touchmove', onTouchMove, { passive: false });
    doc.addEventListener('touchend', onTouchEnd, { passive: false }); doc.addEventListener('touchcancel', onTouchEnd, { passive: false });
    win.addEventListener('resize', clamp); updateToggle();
    let saved = 'touch'; try { saved = storage.getItem(STORAGE_KEY) || 'touch'; } catch {}
    if (saved === 'cursor') enableCursorMode();
  };
  return { initialize, enableCursorMode, disableCursorMode, toggleCursorMode, moveCursor, clickAtCursor, clamp, isEnabled: () => enabled, getPosition: () => ({ x, y }) };
}

const cursorMode = typeof document === 'undefined' ? null : createCursorMode();
if (cursorMode) window.CursorMode = cursorMode;
