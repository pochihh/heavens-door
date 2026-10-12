import {CORE_FEATURES} from '../features';
import {validNotePath,validateTemplates,validateJournal} from '../journal';
import {validateEditorSettings} from '../editor-settings';
import {DEFAULT_QUERY_PREFERENCES} from '../view-block';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CARD_FOLDER, DEFAULT_TITLE_PLACEHOLDER, DEFAULT_WHITEBOARD_NAME, type Preferences } from '../shared';
import { isHexColor } from '../colors';
import {validTag} from '../tags';
import {validateDateDisplay} from '../dates';
import { ui } from '../text/ui';
import {MODULE_IDS,validateDocks,validateDocuments} from '../layout';

export const defaultPreferences = (): Preferences => ({ whiteboardName:DEFAULT_WHITEBOARD_NAME,cardFolder:DEFAULT_CARD_FOLDER,query:{...DEFAULT_QUERY_PREFERENCES},whiteboardInput:'auto',newSplitDirection:'row',explorerMode:'whiteboards', theme:'system', stem:'untitled', titlePlaceholder:DEFAULT_TITLE_PLACEHOLDER, starred:[], recent:[], icons:{} });
export function validatePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workspace settings');
  const p = value as Preferences;
  if (!['light','dark','system'].includes(p.theme) || typeof p.stem !== 'string' || p.stem.length > 120) throw new Error('Invalid appearance settings');
  for(const [key,folder] of [['slipbox',p.cardFolder],['tags',p.tagsFolder],['trash',p.trashFolder]])if(folder!==undefined&&!(key==='trash'&&folder==='.heavens-door/trash')&&!validNotePath(folder))throw new Error('Invalid feature folder');
  if(p.workspaceName!==undefined&&(typeof p.workspaceName!=='string'||!p.workspaceName.trim()||p.workspaceName.length>120))throw new Error('Invalid workspace name');
  if(p.whiteboardName!==undefined&&(typeof p.whiteboardName!=='string'||!p.whiteboardName.trim()||p.whiteboardName.length>120||Buffer.byteLength(p.whiteboardName+'.whiteboard')>255||p.whiteboardName.startsWith('.')||/[<>:"/\\|?*]/.test(p.whiteboardName)||[...p.whiteboardName].some(c=>c.charCodeAt(0)<32)||/[. ]$/.test(p.whiteboardName)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p.whiteboardName)))throw new Error('Invalid new whiteboard name');
  if(p.titlePlaceholder!==undefined&&(typeof p.titlePlaceholder!=='string'||!p.titlePlaceholder.trim()||p.titlePlaceholder.length>120||/[\r\n]/.test(p.titlePlaceholder)))throw new Error('Invalid title placeholder');
  for (const list of [p.starred,p.recent]) if (!Array.isArray(list) || list.length > 1000 || list.some(x => typeof x !== 'string' || x.length > 2048)) throw new Error('Invalid saved navigation');
  if (!p.icons || typeof p.icons !== 'object' || Array.isArray(p.icons) || Object.keys(p.icons).length > 20000 || Object.entries(p.icons).some(([k,v]) => k.length > 2048 || typeof v !== 'string' || [...v].length > 16)) throw new Error('Invalid document icons');
  if(p.graphMode!==undefined&&!['2d','3d'].includes(p.graphMode))throw new Error('Invalid graph mode');
  if(p.explorerMode!==undefined&&!['whiteboards','files'].includes(p.explorerMode))throw new Error('Invalid explorer mode');
  if(p.whiteboardInput!==undefined&&!['auto','mouse','trackpad'].includes(p.whiteboardInput))throw new Error('Invalid whiteboard input mode');
  if(p.newSplitDirection!==undefined&&!['row','column'].includes(p.newSplitDirection))throw new Error('Invalid navigation settings');
  if(p.query!==undefined&&(!p.query||typeof p.query!=='object'||Array.isArray(p.query)||typeof p.query.mergeProperties!=='boolean'||typeof p.query.caseSensitive!=='boolean'))throw new Error('Invalid query settings');
  if(p.features!==undefined&&(!p.features||typeof p.features!=='object'||Array.isArray(p.features)||Object.entries(p.features).some(([id,on])=>!CORE_FEATURES.some(f=>f.id===id)||typeof on!=='boolean')))throw new Error('Invalid core feature settings');
  if(p.boardNavigation!==undefined){
    const n=p.boardNavigation;
    if(!n||typeof n!=='object'||!n.order||typeof n.order!=='object'||Array.isArray(n.order)||Object.keys(n.order).length>10000||Object.entries(n.order).some(([key,items])=>key.length>2048||!Array.isArray(items)||items.length>10000||new Set(items).size!==items.length||items.some(item=>typeof item!=='string'||item.length>2048))||n.systemCollapsed!==undefined&&typeof n.systemCollapsed!=='boolean')throw new Error('Invalid board navigation');
  }
  if(p.editor!==undefined)validateEditorSettings(p.editor);
  if(p.templates!==undefined)validateTemplates(p.templates);
  if(p.journal!==undefined)validateJournal(p.journal);
  if(p.dateDisplay!==undefined)validateDateDisplay(p.dateDisplay);
  if(p.tagColors!==undefined&&(!p.tagColors||typeof p.tagColors!=='object'||Array.isArray(p.tagColors)||Object.keys(p.tagColors).length>20000||Object.entries(p.tagColors).some(([tag,color])=>!validTag(tag)||!isHexColor(color))))throw new Error(ui.tags.invalidColors);
  if(p.palette!==undefined&&(!Array.isArray(p.palette)||p.palette.length>24||new Set(p.palette.map(c=>c?.id)).size!==p.palette.length||p.palette.some(c=>!c||typeof c.id!=='string'||!/^[-\w]{1,64}$/.test(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>32||!isHexColor(c.color))))throw new Error(ui.errors.invalidPalette);
  if(p.docks!==undefined)p.docks=validateDocks(p.docks);
  if(p.documents!==undefined)validateDocuments(p.documents);
  if(p.navigation!==undefined){
    if(!p.navigation||typeof p.navigation!=='object'||Array.isArray(p.navigation))throw new Error('Invalid module navigation');
    for(const [id,v] of Object.entries(p.navigation))if(!MODULE_IDS.includes(id as typeof MODULE_IDS[number])||!v||typeof v!=='object'||Array.isArray(v)||v.expanded!==undefined&&(!Array.isArray(v.expanded)||v.expanded.length>10000||v.expanded.some(p=>typeof p!=='string'||p.length>2048))||v.search!==undefined&&(typeof v.search!=='string'||v.search.length>2048)||v.scroll!==undefined&&(!Number.isFinite(v.scroll)||v.scroll<0))throw new Error('Invalid module navigation');
  }
  return {graphMode:p.graphMode,tagsFolder:p.tagsFolder,trashFolder:p.trashFolder,features:p.features,boardNavigation:p.boardNavigation,workspaceName:p.workspaceName,journal:p.journal,templates:p.templates,whiteboardName:p.whiteboardName??DEFAULT_WHITEBOARD_NAME,editor:p.editor,cardFolder:p.cardFolder??DEFAULT_CARD_FOLDER,query:p.query??{...DEFAULT_QUERY_PREFERENCES},dateDisplay:p.dateDisplay,tagColors:p.tagColors,palette:p.palette,whiteboardInput:p.whiteboardInput??'auto',newSplitDirection:p.newSplitDirection??'row',docks:p.docks,documents:p.documents,navigation:p.navigation,explorerMode:p.explorerMode??'whiteboards',theme:p.theme,stem:p.stem,titlePlaceholder:p.titlePlaceholder??DEFAULT_TITLE_PLACEHOLDER,starred:p.starred,recent:p.recent.slice(0,30),icons:p.icons};
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
