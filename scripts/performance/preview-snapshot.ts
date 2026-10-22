// Experimental rebuildable cache format; never an authoritative document format.
export interface PreviewGeometry {dx:number;dy:number;width:number;height:number;anchorDx:number;anchorDy:number;anchorWidth:number;anchorHeight:number}
export interface PreviewBox {x:number;y:number;width:number;height:number}
export interface PreviewSnapshot {
 version:1;signature:string;viewport:{width:number;height:number;dpr:number};scale:number;
 geometry:[string,PreviewGeometry][];tiles:{id:string;box:PreviewBox;width:number;height:number;src:string}[];
}
export function validatePreviewSnapshot(value:unknown,signature:string,viewport:PreviewSnapshot['viewport'],ids:Set<string>):PreviewSnapshot {
 const s=value as PreviewSnapshot;
 if(!s||s.version!==1||s.signature!==signature||s.scale!==.036||!s.viewport||s.viewport.width!==viewport.width||s.viewport.height!==viewport.height||s.viewport.dpr!==viewport.dpr)throw Error('Preview identity changed');
 if(!Array.isArray(s.geometry)||s.geometry.length>10000||!Array.isArray(s.tiles)||s.tiles.length>128)throw Error('Invalid preview records');
 const seen=new Set<string>();
 for(const item of s.geometry){if(!Array.isArray(item)||item.length!==2||!ids.has(item[0])||seen.has(item[0]))throw Error('Invalid preview geometry');const g=item[1];if(!g||!['dx','dy','width','height','anchorDx','anchorDy','anchorWidth','anchorHeight'].every(k=>Number.isFinite(g[k as keyof PreviewGeometry]))||g.width<=0||g.height<=0||g.anchorWidth<=0||g.anchorHeight<=0)throw Error('Invalid preview geometry');seen.add(item[0]);}
 seen.clear();let bytes=0;
 for(const t of s.tiles){
  if(!t||typeof t.id!=='string'||seen.has(t.id)||!Number.isInteger(t.width)||!Number.isInteger(t.height)||t.width<=0||t.height<=0||t.width>512||t.height>512||!t.box||!['x','y','width','height'].every(k=>Number.isFinite(t.box[k as keyof PreviewBox]))||t.box.width<=0||t.box.height<=0||typeof t.src!=='string'||!t.src.startsWith('data:image/png;base64,')||t.src.length>2_000_000)throw Error('Invalid preview tile');
  const raw=Uint8Array.from(atob(t.src.slice(22,66)),c=>c.charCodeAt(0)),view=new DataView(raw.buffer);
  if(raw.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>raw[i]===v)||view.getUint32(8)!==13||view.getUint32(12)!==0x49484452||view.getUint32(16)!==t.width||view.getUint32(20)!==t.height)throw Error('Invalid preview PNG dimensions');
  bytes+=t.width*t.height*4;if(bytes>32*1024*1024)throw Error('Preview tiles exceed budget');seen.add(t.id);
 }
 return s;
}
