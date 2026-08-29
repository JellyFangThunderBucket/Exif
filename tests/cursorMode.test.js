import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clampPosition, createCursorMode, isTapGesture } from '../public/cursorMode.js';

function fixture({ saved = null, targetDisabled = false } = {}) {
  const listeners = {}, windowListeners = {}, stored = new Map(saved ? [['metaCursorMode', saved]] : []);
  const classSet = () => { const values = new Set(); return { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x) }; };
  const makeElement = () => ({ style: {}, hidden: false, classList: classSet(), setAttribute(name, value) { this[name] = value; }, matches: () => false, focus() {}, click() {}, get offsetWidth() { return 12; } });
  const target = makeElement(); target.clicks = 0; target.focuses = 0; target.click = () => target.clicks++; target.focus = () => target.focuses++;
  target.matches = selector => selector.includes('input'); target.closest = () => targetDisabled ? target : null;
  const toggle = makeElement();
  const document = {
    documentElement: { classList: classSet() }, body: { append() {} },
    createElement: makeElement, getElementById: () => toggle, elementFromPoint: (x, y) => { target.point = [x, y]; return target; },
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  const window = {
    innerWidth: 320, innerHeight: 480, localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    addEventListener(type, fn) { windowListeners[type] = fn; }, scrollCalls: [], scrollBy(x, y) { this.scrollCalls.push([x, y]); },
  };
  const event = (touches) => ({ touches, prevented: false, preventDefault() { this.prevented = true; } });
  return { document, window, listeners, windowListeners, stored, target, toggle, event };
}

describe('Cursor Mode', () => {
  it('clamps cursor coordinates and distinguishes taps from drags', () => {
    assert.deepEqual(clampPosition(-10, 999, 320, 480), { x: 0, y: 456 });
    assert.deepEqual(clampPosition(999, -1, 320, 480), { x: 300, y: 0 });
    assert.equal(isTapGesture(8, 400), true); assert.equal(isTapGesture(9, 100), false); assert.equal(isTapGesture(1, 401), false);
  });
  it('persists preference and restores Cursor Mode', () => {
    const f = fixture({ saved: 'cursor' }), mode = createCursorMode(f); mode.initialize();
    assert.equal(mode.isEnabled(), true); assert.equal(f.toggle['aria-pressed'], 'true');
    mode.disableCursorMode(); assert.equal(f.stored.get('metaCursorMode'), 'touch');
    mode.enableCursorMode(); assert.equal(f.stored.get('metaCursorMode'), 'cursor');
  });
  it('targets elementFromPoint once for a tap and never activates disabled controls', () => {
    const f = fixture(), mode = createCursorMode(f); mode.initialize(); mode.enableCursorMode();
    const start = f.event([{ clientX: 10, clientY: 10 }]); f.listeners.touchstart(start); f.listeners.touchend(f.event([]));
    assert.equal(start.prevented, true); assert.equal(f.target.clicks, 1); assert.equal(f.target.focuses, 1); assert.deepEqual(f.target.point, [160, 240]);
    const disabled = fixture({ targetDisabled: true }), disabledMode = createCursorMode(disabled); disabledMode.initialize(); disabledMode.enableCursorMode();
    disabled.listeners.touchstart(disabled.event([{ clientX: 10, clientY: 10 }])); disabled.listeners.touchend(disabled.event([]));
    assert.equal(disabled.target.clicks, 0);
  });
  it('moves relatively without clicking after a drag and clamps after resize', () => {
    const f = fixture(), mode = createCursorMode(f); mode.initialize(); mode.enableCursorMode();
    f.listeners.touchstart(f.event([{ clientX: 100, clientY: 100 }]));
    f.listeners.touchmove(f.event([{ clientX: 140, clientY: 120 }])); f.listeners.touchend(f.event([]));
    assert.deepEqual(mode.getPosition(), { x: 200, y: 260 }); assert.equal(f.target.clicks, 0);
    f.window.innerWidth = 100; f.window.innerHeight = 100; f.windowListeners.resize();
    assert.deepEqual(mode.getPosition(), { x: 80, y: 76 });
  });
  it('uses two-finger movement for scrolling rather than cursor clicks', () => {
    const f = fixture(), mode = createCursorMode(f); mode.initialize(); mode.enableCursorMode();
    f.listeners.touchstart(f.event([{ clientX: 10, clientY: 100 }]));
    f.listeners.touchstart(f.event([{ clientX: 10, clientY: 100 }, { clientX: 30, clientY: 120 }]));
    f.listeners.touchmove(f.event([{ clientX: 10, clientY: 80 }, { clientX: 30, clientY: 100 }])); f.listeners.touchend(f.event([]));
    assert.deepEqual(f.window.scrollCalls, [[0, 20]]); assert.equal(f.target.clicks, 0);
  });
  it('leaves touch events untouched in default Touch Mode', () => {
    const f = fixture(), mode = createCursorMode(f); mode.initialize();
    const start = f.event([{ clientX: 10, clientY: 10 }]); f.listeners.touchstart(start); f.listeners.touchend(f.event([]));
    assert.equal(start.prevented, false); assert.equal(f.target.clicks, 0); assert.equal(mode.isEnabled(), false);
  });
});
