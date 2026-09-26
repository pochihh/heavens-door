import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BoardNavigation, looksLikeMouseWheel, normalizedWheelDelta, zoomAt } from '../src/renderer/navigation';

function setup() {
  const dom = new JSDOM('<div id="viewport"><div id="grid"></div><div id="world"><article class="board-card"><div class="card-preview"><p>Note</p></div></article></div><button>85%</button></div>');
  Object.assign(globalThis, { HTMLElement: dom.window.HTMLElement });
  const viewport = dom.window.document.getElementById('viewport')!;
  const world = dom.window.document.getElementById('world')!;
  const grid = dom.window.document.getElementById('grid')!;
  Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const frames = new Map<number, FrameRequestCallback>(); let id = 0;
  dom.window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  dom.window.cancelAnimationFrame = id => { frames.delete(id); };
  let publications = 0;
  const nav = new BoardNavigation(viewport, world, grid, viewport.querySelector('button')!, () => { publications++; });
  viewport.addEventListener('wheel', event => nav.wheel(event), { passive: false });
  const wheel = (init: WheelEventInit, target: Element = viewport) => {
    const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 300, clientY: 200, ...init });
    target.dispatchEvent(event); return event;
  };
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
  return { dom, viewport, world, nav, frames, frame, wheel, publications: () => publications, close: () => { nav.dispose(); dom.window.close(); } };
}

test('plugin wheel rules distinguish mouse zoom, trackpad pan, and pinch with anchored zoom limits', t => {
  const f = setup(); t.after(f.close);
  assert.equal(looksLikeMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 48 }), true);
  assert.equal(looksLikeMouseWheel({ deltaMode: 0, deltaX: 3, deltaY: 9 }), false);
  assert.equal(normalizedWheelDelta(2, 1), 32);
  assert.equal(normalizedWheelDelta(1, 2), 800);
  assert.equal(normalizedWheelDelta(500, 0), 120);
  const start = { ...f.nav.current };
  for (let i = 0; i < 6; i++) f.wheel({ deltaX: 3, deltaY: 2 });
  assert.equal(f.frames.size, 1, 'input burst schedules one paint');
  assert.deepEqual(f.nav.current, start, 'wheel work is deferred until animation frame');
  f.frame();
  assert.deepEqual(f.nav.current, { ...start, x: start.x - 18, y: start.y - 12 });
  assert.equal(f.publications(), 0, 'small pans do not rerender the React card tree');
  const before = { ...f.nav.current };
  f.wheel({ deltaY: 100 }); f.frame();
  const after = f.nav.current;
  assert.ok(after.zoom < before.zoom, 'mouse wheel zooms rather than pans');
  assert.ok(Math.abs((300 - before.x) / before.zoom - (300 - after.x) / after.zoom) < 1e-9);
  f.wheel({ deltaY: -2, ctrlKey: true }); f.frame();
  assert.ok(Math.abs(f.nav.current.zoom - after.zoom * Math.exp(16 * 0.0012)) < 1e-9);
  assert.equal(zoomAt(start, 0, 0, 100).zoom, 3);
  assert.equal(zoomAt(start, 0, 0, 0.001).zoom, 0.2);
});

test('only selected card content scrolls, until its boundary; pinch always zooms', t => {
  const f = setup(); t.after(f.close);
  const preview = f.viewport.querySelector<HTMLElement>('.card-preview')!;
  Object.defineProperties(preview, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  assert.equal(f.wheel({ deltaY: 100 }, preview.querySelector('p')!).defaultPrevented, true, 'unselected content must zoom the canvas');
  f.frame();
  preview.closest('.board-card')!.classList.add('selected');
  assert.equal(f.wheel({ deltaY: 100 }, preview.querySelector('p')!).defaultPrevented, false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.wheel({ deltaY: 2, ctrlKey: true }, preview).defaultPrevented, true, 'pinch on selected content still zooms');
  f.frame();
  preview.scrollTop = 200;
  assert.equal(f.wheel({ deltaY: 100 }, preview).defaultPrevented, true);
  assert.equal(f.frames.size, 1);
  f.frame();
  assert.equal(f.wheel({ deltaY: -100 }, preview).defaultPrevented, false);
  preview.scrollTop = 0;
  assert.equal(f.wheel({ deltaY: -100 }, preview).defaultPrevented, true);
});
