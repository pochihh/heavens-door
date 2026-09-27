import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_TITLE_PLACEHOLDER, type Preferences } from '../shared';
import {MODULE_IDS,validateDocks,validateDocuments} from '../layout';

export const defaultPreferences = (): Preferences => ({ newSplitDirection:'row',explorerMode:'whiteboards', theme:'system', stem:'untitled', titlePlaceholder:DEFAULT_TITLE_PLACEHOLDER, starred:[], recent:[], icons:{} });
export function validatePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workspace settings');
  const p = value as Preferences;
  if (!['light','dark','system'].includes(p.theme) || typeof p.stem !== 'string' || p.stem.length > 120) throw new Error('Invalid appearance settings');
  if(p.titlePlaceholder!==undefined&&(typeof p.titlePlaceholder!=='string'||!p.titlePlaceholder.trim()||p.titlePlaceholder.length>120||/[\r\n]/.test(p.titlePlaceholder)))throw new Error('Invalid title placeholder');
  for (const list of [p.starred,p.recent]) if (!Array.isArray(list) || list.length > 1000 || list.some(x => typeof x !== 'string' || x.length > 2048)) throw new Error('Invalid saved navigation');
  if (!p.icons || typeof p.icons !== 'object' || Array.isArray(p.icons) || Object.keys(p.icons).length > 20000 || Object.entries(p.icons).some(([k,v]) => k.length > 2048 || typeof v !== 'string' || [...v].length > 16)) throw new Error('Invalid document icons');
  if(p.explorerMode!==undefined&&!['whiteboards','files'].includes(p.explorerMode))throw new Error('Invalid explorer mode');
  if(p.newSplitDirection!==undefined&&!['row','column'].includes(p.newSplitDirection))throw new Error('Invalid navigation settings');
  if(p.docks!==undefined)validateDocks(p.docks);
  if(p.documents!==undefined)validateDocuments(p.documents);
  if(p.navigation!==undefined){
    if(!p.navigation||typeof p.navigation!=='object'||Array.isArray(p.navigation))throw new Error('Invalid module navigation');
    for(const [id,v] of Object.entries(p.navigation))if(!MODULE_IDS.includes(id as typeof MODULE_IDS[number])||!v||typeof v!=='object'||Array.isArray(v)||v.expanded!==undefined&&(!Array.isArray(v.expanded)||v.expanded.length>10000||v.expanded.some(p=>typeof p!=='string'||p.length>2048))||v.search!==undefined&&(typeof v.search!=='string'||v.search.length>2048)||v.scroll!==undefined&&(!Number.isFinite(v.scroll)||v.scroll<0))throw new Error('Invalid module navigation');
  }
  return {newSplitDirection:p.newSplitDirection??'row',docks:p.docks,documents:p.documents,navigation:p.navigation,explorerMode:p.explorerMode??'whiteboards',theme:p.theme,stem:p.stem,titlePlaceholder:p.titlePlaceholder??DEFAULT_TITLE_PLACEHOLDER,starred:p.starred,recent:p.recent.slice(0,30),icons:p.icons};
}
export async function readPreferences(root: string) {
  try {
    const folder=join(root,'.heavens-door'),file=join(folder,'settings.json');
    if ((await fs.lstat(folder)).isSymbolicLink() || (await fs.lstat(file)).isSymbolicLink()) throw new Error('Settings cannot be a symbolic link');
    return validatePreferences(JSON.parse(await fs.readFile(file,'utf8')));
  }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return defaultPreferences(); throw e; }
}
export async function writePreferences(root: string, current: Preferences, patch: Partial<Preferences>) {
  const next=validatePreferences({...current,...patch});
  const folder=join(root,'.heavens-door');
  // Settings are app-owned; never follow an external symlink outside the workspace.
  await fs.mkdir(folder,{recursive:true});
  if ((await fs.lstat(folder)).isSymbolicLink()) throw new Error('Settings directory cannot be a symbolic link');
  const temporary=join(folder,'settings.'+randomUUID()+'.tmp');
  await fs.writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
  try { await fs.rename(temporary,join(folder,'settings.json')); } finally { await fs.unlink(temporary).catch(() => undefined); }
  return next;
}
