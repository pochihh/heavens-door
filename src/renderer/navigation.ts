import type { WhiteboardInput } from '../shared';
// Navigation adapted from Toby's obsidian-whiteboard (MIT); see THIRD_PARTY_NOTICES.md.
export interface Camera { x: number; y: number; zoom: number }
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export function normalizedWheelDelta(delta: number, mode: number) {
  if (mode === 1) return delta * 16;
  if (mode === 2) return delta * 800;
  return Math.max(-120, Math.min(120, delta));
}
type WheelMode = 'pan' | 'zoom';
const GESTURE_GAP = 180, SAMPLE_WAIT = 32, INPUT_MEMORY = 5000;
// Session-only memory follows input across whiteboards in the same window.
const wheelMemory = new WeakMap<Window, { mode: WheelMode; time: number }>();
function wheelHint(event: WheelEvent): WheelMode | null {
  // ponytail: browser wheel events have no device ID. These are hints, not hardware
  // identification; refine using recorded device traces if a device is misclassified.
  if (event.deltaMode !== 0) return 'zoom';
  if (Math.abs(event.deltaX) >= 1) return 'pan';
  return Math.abs(event.deltaY) >= 48 ? 'zoom' : null;
}
export function zoomAt(camera: Camera, x: number, y: number, zoom: number): Camera {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return { zoom: next, x: x - (x - camera.x) * next / camera.zoom, y: y - (y - camera.y) * next / camera.zoom };
}
export function shouldLetCardScroll(event: WheelEvent, viewport: HTMLElement) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const root = target?.closest<HTMLElement>('.card-preview,.editor-body');
  if (!root?.closest('.board-card.selected') || event.ctrlKey || event.metaKey) return false;
  const win = viewport.ownerDocument.defaultView!;
  for (let element = target; element && element !== viewport && root.contains(element); element = element.parentElement) {
    const style = win.getComputedStyle(element);
    const scrollable = (overflow: string) => /^(auto|scroll|overlay)$/.test(overflow);
    // Selected scroll containers keep the wheel at their boundaries, too.
    if (event.deltaY !== 0 && scrollable(style.overflowY || style.overflow) && element.scrollHeight > element.clientHeight + 1 ||
        event.deltaX !== 0 && scrollable(style.overflowX || style.overflow) && element.scrollWidth > element.clientWidth + 1) return true;
  }
  return false;
}

// The camera paints one world transform per frame. React only refreshes the
// overscanned card set after a substantial move or zoom, or settling.
export class BoardNavigation {
  current: Camera = { x: 20, y: 20, zoom: 0.85 };
  private published = this.current;
  private frame: number | null = null;
  private settle: ReturnType<typeof setTimeout> | undefined;
  private pending: Camera | null = null;
  private inputMode: WhiteboardInput = 'auto';
  private wheelMode: WheelMode | null = null;
  private wheelLast = -Infinity;
  private modifiedWheel = false;
  private hintedWheel = false;
  private samples: WheelEvent[] = [];
  private sampleTimer: ReturnType<typeof setTimeout> | undefined;
  private win: Window;
  constructor(
    private viewport: HTMLElement,
    private world: HTMLElement,
    private grid: HTMLElement,
    private zoomLabel: HTMLElement,
    private publish: (camera: Camera) => void,
  ) {
    this.win = viewport.ownerDocument.defaultView!;
    this.paint();
  }
  setInputMode(mode: WhiteboardInput) {
    if (mode === this.inputMode) return;
    this.stopWheel(); this.flush(); this.inputMode = mode;
    wheelMemory.delete(this.win);
  }
  wheel(event: WheelEvent) {
    if (shouldLetCardScroll(event, this.viewport)) { this.stopWheel(); event.stopPropagation(); return; }
    event.preventDefault(); event.stopPropagation();
    if (!event.deltaX && !event.deltaY) return;
    const now = this.win.performance.now(), modified = event.ctrlKey || event.metaKey;
    if (this.inputMode !== 'auto') {
      this.applyWheel(event, modified || this.inputMode === 'mouse' ? 'zoom' : 'pan'); return;
    }
    if (now - this.wheelLast > GESTURE_GAP || modified !== this.modifiedWheel) {
      this.resolveSamples();
      this.wheelMode = null; this.hintedWheel = false;
    }
    this.wheelLast = now; this.modifiedWheel = modified;
    if (modified) this.wheelMode = 'zoom';
    if (this.wheelMode) {
      const remembered = wheelMemory.get(this.win);
      const hint = !modified && !this.hintedWheel ? wheelHint(event) : null;
      if (hint) {
        // Learn late evidence for the next gesture without changing this one.
        wheelMemory.set(this.win, { mode: hint, time: now }); this.hintedWheel = true;
      } else if (!modified && remembered?.mode === this.wheelMode) remembered.time = now;
      this.applyWheel(event, this.wheelMode); return;
    }

    const hint = wheelHint(event), remembered = wheelMemory.get(this.win);
    const recent = remembered && now - remembered.time < INPUT_MEMORY ? remembered.mode : null;
    this.samples.push(event);
    // A strong hint can override recent memory at the start, never halfway through
    // a gesture. Small leading/trailing mouse events inherit the remembered zoom.
    if (hint) this.resolveSamples(hint, true);
    else if (recent) this.resolveSamples(recent);
    else if (!this.sampleTimer) this.sampleTimer = setTimeout(() => this.resolveSamples(), SAMPLE_WAIT);
  }
  private resolveSamples(mode?: WheelMode, hinted = false) {
    clearTimeout(this.sampleTimer); this.sampleTimer = undefined;
    if (!this.samples.length) return;
    this.wheelMode = mode ?? 'pan'; this.hintedWheel = hinted;
    // Only confident evidence is remembered; an ambiguous cold-start pan is not.
    if (mode) wheelMemory.set(this.win, { mode, time: this.wheelLast });
    for (const event of this.samples) this.applyWheel(event, this.wheelMode);
    this.samples = [];
  }
  private applyWheel(event: WheelEvent, mode: WheelMode) {
    const camera = this.pending ?? this.current;
    if (mode === 'zoom') {
      const delta = normalizedWheelDelta(event.deltaY, event.deltaMode) * (event.ctrlKey ? 8 : 1);
      const rect = this.viewport.getBoundingClientRect();
      this.pending = zoomAt(camera, event.clientX - rect.left, event.clientY - rect.top, camera.zoom * Math.exp(-delta * 0.0012));
    } else {
      this.pending = { ...camera, x: camera.x - normalizedWheelDelta(event.deltaX, event.deltaMode), y: camera.y - normalizedWheelDelta(event.deltaY, event.deltaMode) };
    }
    this.requestFrame();
  }
  stopWheel() {
    clearTimeout(this.sampleTimer); this.sampleTimer = undefined;
    this.samples = []; this.wheelMode = null; this.wheelLast = -Infinity;
  }
  set(camera: Camera) { this.stopWheel(); this.pending = null; this.current = camera; this.requestFrame(); }
  zoomTo(zoom: number) {
    this.stopWheel(); this.flush();
    this.set(zoomAt(this.current, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, zoom));
  }
  private requestFrame() {
    if (this.frame === null) this.frame = this.win.requestAnimationFrame(() => { this.frame = null; this.flush(); });
    clearTimeout(this.settle);
    this.settle = setTimeout(() => { this.flush(); this.publishCurrent(); }, 100);
  }
  flush() {
    if (this.frame !== null) { this.win.cancelAnimationFrame(this.frame); this.frame = null; }
    if (this.pending) { this.current = this.pending; this.pending = null; }
    this.paint();
  }
  private publishCurrent() {
    const c = this.current, p = this.published;
    if (c.x === p.x && c.y === p.y && c.zoom === p.zoom) return;
    this.published = { ...c }; this.publish(this.published);
  }
  private paint() {
    const c = this.current, p = this.published;
    const width = this.viewport.clientWidth || 1000, height = this.viewport.clientHeight || 800;
    this.world.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.zoom})`;
    // Only the lightweight grid repaints; card positions and edge geometry stay in world coordinates.
    this.grid.style.backgroundSize = `${24 * c.zoom}px ${24 * c.zoom}px`;
    this.grid.style.backgroundPosition = `${c.x}px ${c.y}px`;
    this.zoomLabel.textContent = `${Math.round(c.zoom * 100)}%`;
    const ratio = c.zoom / p.zoom;
    if (Math.abs(c.x - p.x * ratio) > width * 0.4 || Math.abs(c.y - p.y * ratio) > height * 0.4 || ratio < 0.8 || ratio > 1.25) this.publishCurrent();
  }
  dispose() {
    this.stopWheel();
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    clearTimeout(this.settle);
  }
}
