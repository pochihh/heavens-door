import type {Preferences} from './shared';
import {DEFAULT_JOURNAL,DEFAULT_TEMPLATES} from './journal';
import {DEFAULT_CARD_FOLDER} from './shared';
import type {ModuleId} from './layout';
export const CORE_FEATURES=[
  {id:'reading',name:'Read later',icon:'layers',description:'Collect webpages and PDFs in Inbox, with highlights and notes.'},
  {id:'templates',name:'Templates',icon:'copy',description:'Create notes from Markdown templates.'},
  {id:'slipbox',name:'Slipbox',icon:'layers',description:'Keep cards that have not been placed on a board.'},
  {id:'journal',name:'Journal and Calendar',icon:'calendar',description:'Create daily and weekly notes and navigate them with Calendar.'},
  {id:'tags',name:'Tags',icon:'tag',description:'Browse tags and their properties.'},
  {id:'trash',name:'Trash',icon:'trash',description:'Browse and restore deleted cards.'},
  {id:'graph',name:'Graph',icon:'graph',description:'Explore connections between cards and whiteboards.'},
  {id:'views',name:'Views and queries',icon:'database',description:'Render view blocks in notes and tag pages.'},
] as const;
export type CoreFeature=typeof CORE_FEATURES[number]['id'];
export type SystemEntry=Exclude<CoreFeature,'views'|'graph'>;
export interface BoardNavigation {order:Record<string,string[]>;systemCollapsed?:boolean}
export const featureEnabled=(prefs:Preferences|undefined,id:CoreFeature)=>id==='slipbox'||id==='trash'||prefs?.features?.[id]!==false;
export function systemEntries(prefs?:Preferences){return CORE_FEATURES.filter(f=>f.id!=='views'&&f.id!=='graph'&&featureEnabled(prefs,f.id)) as readonly (typeof CORE_FEATURES[number]&{id:SystemEntry})[];}
export function systemPath(id:SystemEntry,prefs?:Preferences){
  return id==='reading'?prefs?.reading?.folder??'Inbox':id==='templates'?(prefs?.templates??DEFAULT_TEMPLATES).folder:id==='slipbox'?prefs?.cardFolder??DEFAULT_CARD_FOLDER:id==='journal'?(prefs?.journal??DEFAULT_JOURNAL).folder:id==='tags'?prefs?.tagsFolder??'tags':prefs?.trashFolder??'.heavens-door/trash';
}
// Reserved paths stay out of Boards even while their feature is off. Files remain indexed.
export function systemFolder(path:string,prefs?:Preferences){return (['templates','slipbox','journal','tags','trash','reading'] as const).some(id=>{const folder=systemPath(id,prefs);return path===folder||path.startsWith(folder+'/');});}
export function moduleEnabled(module:ModuleId,prefs?:Preferences){return module==='graph'?featureEnabled(prefs,'graph'):module==='calendar'?featureEnabled(prefs,'journal'):module==='tags'?featureEnabled(prefs,'tags'):true;}
export function navigationOrder(keys:string[],saved:string[]=[]){const available=new Set(keys),seen=new Set<string>(),order:string[]=[];for(const key of [...saved,...keys])if(available.has(key)&&!seen.has(key)){seen.add(key);order.push(key);}return order;}
