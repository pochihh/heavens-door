// Navigation adapted from Toby's obsidian-whiteboard (MIT); see THIRD_PARTY_NOTICES.md.
export interface Camera { x: number; y: number; zoom: number }
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export function normalizedWheelDelta(delta: number, mode: number) {
  if (mode === 1) return delta * 16;
  if (mode === 2) return delta * 800;
  return Math.max(-120, Math.min(120, delta));
}
export function looksLikeMouseWheel(event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>) {
  return event.deltaMode !== 0 || (Math.abs(event.deltaX) < 1 && Math.abs(event.deltaY) >= 48);
}
export function zoomAt(camera: Camera, x: number, y: number, zoom: number): Camera {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return { zoom: next, x: x - (x - camera.x) * next / camera.zoom, y: y - (y - camera.y) * next / camera.zoom };
}
export function shouldLetCardScroll(event: WheelEvent, viewport: HTMLElement) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const root = target?.closest<HTMLElement>('.card-preview');
  if (!root) return false;
  const dx = normalizedWheelDelta(event.deltaX, event.deltaMode);
  const dy = normalizedWheelDelta(event.deltaY, event.deltaMode);
  for (let element = target; element && element !== viewport && root.contains(element); element = element.parentElement) {
    if ((dy < 0 && element.scrollTop > 0) ||
        (dy > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1) ||
        (dx < 0 && element.scrollLeft > 0) ||
        (dx > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1)) return true;
  }
  return false;
}

// The camera paints one world transform per frame. React only refreshes the
// overscanned card set after a substantial move, a detail-level change, or settling.
export class BoardNavigation {
  current: Camera = { x: 20, y: 20, zoom: 0.85 };
  private published = this.current;
  private frame: number | null = null;
  private settle: ReturnType<typeof setTimeout> | undefined;
  private pan = { x: 0, y: 0 };
  private zoomDelta = 0;
  private zoomPoint = { x: 0, y: 0 };
  private win: Window;
  constructor(
    private viewport: HTMLElement,
    private world: HTMLElement,
    private grid: HTMLElement,
    private zoomInput: HTMLInputElement,
    private publish: (camera: Camera) => void,
  ) {
    this.win = viewport.ownerDocument.defaultView!;
    this.paint();
  }
  wheel(event: WheelEvent) {
    if (shouldLetCardScroll(event, this.viewport)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.ctrlKey || event.metaKey || looksLikeMouseWheel(event)) {
      this.zoomDelta += normalizedWheelDelta(event.deltaY, event.deltaMode) * (event.ctrlKey ? 8 : 1);
      const rect = this.viewport.getBoundingClientRect();
      this.zoomPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    } else {
      this.pan.x += normalizedWheelDelta(event.deltaX, event.deltaMode);
      this.pan.y += normalizedWheelDelta(event.deltaY, event.deltaMode);
    }
    this.requestFrame();
  }
  set(camera: Camera) { this.current = camera; this.requestFrame(); }
  zoomTo(zoom: number) {
    this.flush();
    this.set(zoomAt(this.current, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, zoom));
  }
  private requestFrame() {
    if (this.frame === null) this.frame = this.win.requestAnimationFrame(() => { this.frame = null; this.flush(); });
    clearTimeout(this.settle);
    this.settle = setTimeout(() => { this.flush(); this.publishCurrent(); }, 100);
  }
  flush() {
    if (this.frame !== null) { this.win.cancelAnimationFrame(this.frame); this.frame = null; }
    if (this.zoomDelta !== 0) {
      this.current = zoomAt(this.current, this.zoomPoint.x, this.zoomPoint.y, this.current.zoom * Math.exp(-this.zoomDelta * 0.0012));
    } else if (this.pan.x || this.pan.y) {
      this.current = { ...this.current, x: this.current.x - this.pan.x, y: this.current.y - this.pan.y };
    }
    this.zoomDelta = 0; this.pan = { x: 0, y: 0 };
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
    if (this.viewport.ownerDocument.activeElement !== this.zoomInput) this.zoomInput.value = `${Math.round(c.zoom * 100)}%`;
    const ratio = c.zoom / p.zoom;
    if (Math.abs(c.x - p.x * ratio) > width * 0.4 || Math.abs(c.y - p.y * ratio) > height * 0.4 || ratio < 0.8 || ratio > 1.25 || (c.zoom < 0.4) !== (p.zoom < 0.4)) this.publishCurrent();
  }
  dispose() {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    clearTimeout(this.settle);
  }
}
