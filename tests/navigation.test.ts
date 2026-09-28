import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BoardNavigation, normalizedWheelDelta, zoomAt } from '../src/renderer/navigation';

function setup(t: TestContext) {
  const dom = new JSDOM('<div id="viewport"><div id="grid"></div><div id="world"><article class="board-card"><div class="card-preview" style="overflow-x:auto;overflow-y:auto"><p>Note</p></div></article></div><button>85%</button></div>');
  Object.assign(globalThis, { HTMLElement: dom.window.HTMLElement });
  const viewport = dom.window.document.getElementById('viewport')!;
  const world = dom.window.document.getElementById('world')!;
  const grid = dom.window.document.getElementById('grid')!;
  Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, now = 0;
  dom.window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  dom.window.cancelAnimationFrame = id => { frames.delete(id); };
  dom.window.performance.now = () => now;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publications = 0;
  const nav = new BoardNavigation(viewport, world, grid, viewport.querySelector('button')!, () => { publications++; });
  viewport.addEventListener('wheel', event => nav.wheel(event), { passive: false });
  const wheel = (init: WheelEventInit, target: Element = viewport) => {
    const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 300, clientY: 200, ...init });
    target.dispatchEvent(event); return event;
  };
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
  const advance = (ms: number) => { now += ms; t.mock.timers.tick(ms); };
  t.after(() => { nav.dispose(); dom.window.close(); });
  return { dom, viewport, world, grid, nav, frames, frame, wheel, advance, publications: () => publications };
}

function assertAnchored(before: { x: number; y: number; zoom: number }, after: typeof before) {
  assert.ok(Math.abs((300 - before.x) / before.zoom - (300 - after.x) / after.zoom) < 1e-9, 'horizontal world point under pointer stays fixed');
  assert.ok(Math.abs((200 - before.y) / before.zoom - (200 - after.y) / after.zoom) < 1e-9, 'vertical world point under pointer stays fixed');
}

test('automatic navigation paints once per frame, switches devices between gestures, and anchors zoom', t => {
  const f = setup(t);
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
  f.advance(300);
  const before = { ...f.nav.current };
  f.wheel({ deltaY: 100 }); f.frame();
  const after = f.nav.current;
  assert.ok(after.zoom < before.zoom, 'mouse wheel zooms after a trackpad gesture');
  assertAnchored(before, after);
  f.wheel({ deltaY: -2, ctrlKey: true }); f.frame();
  assert.ok(Math.abs(f.nav.current.zoom - after.zoom * Math.exp(16 * 0.0012)) < 1e-9);
  assert.equal(zoomAt(start, 0, 0, 100).zoom, 3);
  assert.equal(zoomAt(start, 0, 0, 0.001).zoom, 0.2);
});

test('small leading mouse events wait, and variable wheel deltas never alternate pan and zoom', t => {
  const f = setup(t), start = { ...f.nav.current };
  f.wheel({ deltaY: 8 }); f.frame(); f.advance(8);
  f.wheel({ deltaY: 32 }); f.frame(); f.advance(8);
  assert.deepEqual(f.nav.current, start, 'ambiguous leading events must not pan before mouse detection');
  f.wheel({ deltaY: 60 }); f.frame();
  assert.ok(Math.abs(f.nav.current.zoom - start.zoom * Math.exp(-100 * .0012)) < 1e-9, 'buffered deltas are applied once, without loss');
  for (const deltaY of [18, 3, -4, -52, -16]) {
    f.advance(12); f.wheel({ deltaY }); f.frame();
    assertAnchored(start, f.nav.current);
  }
  f.advance(300);
  const before = { ...f.nav.current };
  f.wheel({ deltaY: 2 }); f.frame();
  assert.ok(f.nav.current.zoom < before.zoom, 'a new gesture can use recent mouse memory immediately');
  assertAnchored(start, f.nav.current);
  f.advance(300);
  const zoom = f.nav.current.zoom;
  f.wheel({ deltaX: 3, deltaY: 4 }); f.frame();
  for (const deltaY of [80, 100, 12, 2]) { f.advance(12); f.wheel({ deltaY }); f.frame(); }
  assert.equal(f.nav.current.zoom, zoom, 'trackpad acceleration and inertia remain pan throughout the gesture');
});

test('ambiguous input waits at most 48ms; memory expires; explicit navigation cancels pending detection', t => {
  const f = setup(t), start = { ...f.nav.current };
  f.wheel({ deltaY: 4 }); f.advance(47); f.frame();
  assert.deepEqual(f.nav.current, start);
  f.advance(1); f.frame();
  assert.deepEqual(f.nav.current, { ...start, y: start.y - 4 });
  f.wheel({ deltaY: 100 }); f.frame();
  assert.equal(f.nav.current.zoom, start.zoom, 'a late large event cannot change an already committed pan');
  f.advance(300); f.wheel({ deltaY: 3 }); f.frame();
  assert.ok(f.nav.current.zoom < start.zoom, 'late mouse evidence informs the next gesture even when it starts small');
  f.advance(300); f.wheel({ deltaY: 3, deltaMode: 1 }); f.frame();
  f.advance(10100);
  const before = { ...f.nav.current };
  f.wheel({ deltaY: 2 }); f.frame();
  assert.deepEqual(f.nav.current, before, 'stale mouse memory must not force a device choice');
  f.nav.stopWheel(); f.advance(100); f.frame();
  assert.deepEqual(f.nav.current, before, 'starting a pointer gesture cancels buffered wheel input');
  f.wheel({ deltaY: 2 }); f.nav.dispose(); f.advance(100); f.frame();
  assert.deepEqual(f.nav.current, before, 'unmounted boards cannot apply delayed input');
});

test('pan and explicit pinch in the same frame apply in order without dropping either input', t => {
  const f = setup(t), start = { ...f.nav.current };
  f.wheel({ deltaX: 5, deltaY: 3 });
  f.wheel({ deltaY: -2, ctrlKey: true });
  assert.equal(f.frames.size, 1);
  f.frame();
  const expected = zoomAt({ ...start, x: start.x - 5, y: start.y - 3 }, 300, 200, start.zoom * Math.exp(16 * .0012));
  assert.deepEqual(f.nav.current, expected);
});

test('selected scroll containers keep input at both boundaries; pinch still zooms and auto-height content navigates', t => {
  const f = setup(t);
  const preview = f.viewport.querySelector<HTMLElement>('.card-preview')!;
  Object.defineProperties(preview, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  assert.equal(f.wheel({ deltaY: 100 }, preview.querySelector('p')!).defaultPrevented, true);
  f.frame();
  preview.closest('.board-card')!.classList.add('selected');
  const camera = { ...f.nav.current };
  for (const [top, deltaY] of [[0, -100], [0, 100], [200, 100], [200, -100]]) {
    preview.scrollTop = top;
    assert.equal(f.wheel({ deltaY }, preview.querySelector('p')!).defaultPrevented, false);
    f.frame(); assert.deepEqual(f.nav.current, camera);
  }
  assert.equal(f.wheel({ deltaY: 2, ctrlKey: true }, preview).defaultPrevented, true);
  f.frame(); assert.ok(f.nav.current.zoom < camera.zoom);
  preview.style.overflowX = 'visible'; preview.style.overflowY = 'visible';
  assert.equal(f.wheel({ deltaY: 100 }, preview).defaultPrevented, true, 'auto-height content is not a native scroll container');
});

test('explicit mouse and trackpad modes bypass detection and switching discards undecided input', t => {
  const f = setup(t), start = { ...f.nav.current };
  f.wheel({ deltaY: 4 });
  f.nav.setInputMode('mouse'); f.advance(60); f.frame();
  assert.deepEqual(f.nav.current, start, 'switching cancels the automatic sample without moving the camera');
  for (const deltaY of [2, 100, 3]) { f.wheel({ deltaY }); f.frame(); assertAnchored(start, f.nav.current); }
  assert.ok(f.nav.current.zoom < start.zoom, 'even small mouse deltas zoom immediately');
  f.nav.setInputMode('trackpad');
  const before = { ...f.nav.current };
  f.wheel({ deltaX: 3, deltaY: 100 }); f.frame();
  assert.deepEqual(f.nav.current, { ...before, x: before.x - 3, y: before.y - 100 }, 'large trackpad deltas always pan');
  f.wheel({ deltaY: -2, ctrlKey: true }); f.frame();
  assert.ok(f.nav.current.zoom > before.zoom, 'pinch still zooms in Trackpad mode');
  f.nav.setInputMode('auto');
  const camera = { ...f.nav.current };
  f.wheel({ deltaY: 2 }); f.frame();
  assert.deepEqual(f.nav.current, camera, 'returning to Auto starts with fresh detection');
  const preview = f.viewport.querySelector<HTMLElement>('.card-preview')!;
  Object.defineProperties(preview, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  preview.closest('.board-card')!.classList.add('selected');
  for (const mode of ['mouse', 'trackpad'] as const) {
    f.nav.setInputMode(mode);
    assert.equal(f.wheel({ deltaY: 100 }, preview).defaultPrevented, false, 'selected card scrolling takes priority in '+mode+' mode');
  }
});


test('Auto tolerates slower wheel starts, reading pauses, and short gaps without changing a trackpad pan', t => {
  const f = setup(t), start = { ...f.nav.current };
  f.wheel({ deltaY: 8 }); f.advance(40); f.frame();
  assert.deepEqual(f.nav.current, start, 'a slow mouse start waits for evidence instead of moving vertically');
  f.wheel({ deltaY: 60 }); f.frame();
  assert.ok(f.nav.current.zoom < start.zoom); assertAnchored(start, f.nav.current);
  f.advance(8000);
  const before = { ...f.nav.current };
  f.wheel({ deltaY: 2 }); f.frame();
  assert.ok(f.nav.current.zoom < before.zoom, 'mouse memory survives a short reading pause');
  assertAnchored(start, f.nav.current);
  f.advance(300);
  f.wheel({ deltaX: 3, deltaY: 2 }); f.frame();
  const pan = { ...f.nav.current };
  f.advance(200); f.wheel({ deltaY: 100 }); f.frame();
  assert.deepEqual(f.nav.current, { ...pan, y: pan.y - 100 }, 'a brief pause within trackpad input does not switch it to zoom');
  f.advance(300); f.wheel({ deltaY: 100 }); f.frame();
  assert.ok(f.nav.current.zoom < pan.zoom, 'a separate mouse gesture can still override trackpad memory');
});


test('grid camera variables follow the same frame as the world without rewriting theme styles',t=>{
  const f=setup(t);
  f.grid.style.setProperty('--grid-spacing','30px');
  for(const zoom of [.2,.55,.7,.8,3]){
    f.nav.set({x:-137,y:81,zoom});f.frame();
    assert.equal(f.grid.style.getPropertyValue('--board-zoom'),String(zoom));
    assert.equal(f.grid.style.getPropertyValue('--grid-x'),'-137px');
    assert.equal(f.grid.style.getPropertyValue('--grid-y'),'81px');
    assert.equal(f.world.style.transform,`translate3d(-137px, 81px, 0) scale(${zoom})`);
    assert.equal(f.grid.style.getPropertyValue('--grid-spacing'),'30px','themes own grid appearance');
    assert.equal(f.grid.style.backgroundSize,'','CSS derives both aligned grid spacings');
  }
});
