import type { CardInfo, PaletteColor, Placement } from './shared';
import { ui } from './text/ui';
export const DEFAULT_PALETTE:PaletteColor[] = Object.entries({rose:'#c9838a',terracotta:'#c99579',ochre:'#c6ad72',sage:'#91aa8b',teal:'#80aaa6',blue:'#8aa5c5',lavender:'#a699c3',slate:'#8b929e'}).map(([id,color])=>({id,color,name:ui.style.paletteNames[id as keyof typeof ui.style.paletteNames]}));
export const isHexColor=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
// A saved Theme choice (null) overrides legacy per-placement fills; absent metadata preserves them.
export const cardFill=(card:CardInfo|undefined,placement?:Placement)=>card?.fillColor!==undefined?card.fillColor??undefined:placement?.fillColor;
export type ColorRole='fill'|'stroke'|'canvas'|'grid';
export function tintColor(color:string|undefined,role:ColorRole='fill') {
  if(!isHexColor(color))return undefined;
  const base=role==='fill'?'--card':role==='canvas'?'--surface':'--muted';
  return `color-mix(in srgb, ${color} var(--tint-${role}), var(${base}))`;
}
