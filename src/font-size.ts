export const FONT_SIZE_PRESETS={s:14,m:20,l:28,xl:40} as const;
export type FontSizePreset=keyof typeof FONT_SIZE_PRESETS;
export type FontSize=FontSizePreset|number;
export const isFontSize=(value:unknown):value is FontSize=>typeof value==='number'?Number.isFinite(value)&&value>=8&&value<=120:typeof value==='string'&&Object.hasOwn(FONT_SIZE_PRESETS,value);
// Numbers retain explicit legacy sizes; named sizes follow the theme without rewriting files.
export const fontSizeCSS=(size:FontSize)=>typeof size==='number'?size:`var(--whiteboard-font-size-${size}, ${FONT_SIZE_PRESETS[size]}px)`;
