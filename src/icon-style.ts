export const iconStyles=['macos','windows','linux','original'] as const;
export type IconStyle=typeof iconStyles[number];
export const platformIconStyle=(platform:string):IconStyle=>platform==='darwin'?'macos':platform==='win32'?'windows':'linux';
const frames={macos:{inset:100,radius:181.28},windows:{inset:48,radius:96},linux:{inset:32,radius:0},original:{inset:0,radius:0}};
// These are the app's visual presets; Windows and Linux do not mandate one icon silhouette.
export function styledLogo(image:string,style:IconStyle):string {
 if(!iconStyles.includes(style)||!/^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('Invalid icon style or image.');
 const {inset,radius}=frames[style],size=1024-2*inset;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><clipPath id="frame"><rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs><image x="${inset}" y="${inset}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" clip-path="url(#frame)" href="${image}"/></svg>`;
}
