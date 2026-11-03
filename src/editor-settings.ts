export interface EditorCommand {id:string;name:string;enabled:boolean;description?:string;aliases?:string[];template?:string;action?:'image'|'symbols'|'view'|'search'|'checkpoint'}
export interface EditorSettings {slashEnabled?:boolean;imageFolder:string;imageLocation:'beside'|'workspace';imageWidth:string;imageAlignment:'left'|'center'|'right';commands:EditorCommand[]}
export const DEFAULT_COMMANDS:EditorCommand[]=[
  ...[1,2,3].map(level=>({id:'heading-'+level,name:'Heading '+level,enabled:true,template:'#'.repeat(level)+' {{cursor}}'})),
  {id:'bullet',name:'Bullet list',enabled:true,template:'- {{cursor}}'},
  {id:'numbered',name:'Numbered list',enabled:true,template:'1. {{cursor}}'},
  {id:'task',name:'Checklist',enabled:true,template:'- [ ] {{cursor}}'},
  {id:'quote',name:'Quote',enabled:true,template:'> {{cursor}}'},
  {id:'code',name:'Code block',enabled:true,template:'```\n{{cursor}}\n```'},
  {id:'progress',name:'Progress bar',enabled:true,template:'```sp-bar\n{{cursor}}\n```'},
  {id:'divider',name:'Divider',enabled:true,template:'---\n'},
  {id:'image',name:'Image',enabled:true,action:'image'},
  {id:'view',name:'View block',enabled:true,action:'view'},
  {id:'symbols',name:'Symbols and emoji',enabled:true,action:'symbols'},
  {id:'search',name:'Search workspace',enabled:true,action:'search'},
  {id:'checkpoint',name:'Save checkpoint',enabled:true,action:'checkpoint'},
];
export const DEFAULT_EDITOR_SETTINGS:EditorSettings={imageFolder:'_assets',imageLocation:'beside',imageWidth:'100%',imageAlignment:'center',commands:DEFAULT_COMMANDS};
export function validateEditorSettings(value:EditorSettings){
  if(!value||typeof value!=='object'||value.slashEnabled!==undefined&&typeof value.slashEnabled!=='boolean'||!['beside','workspace'].includes(value.imageLocation)||typeof value.imageFolder!=='string'||!value.imageFolder||value.imageFolder.length>200||value.imageFolder.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||/[\\:*?"<>|]/.test(value.imageFolder)||[...value.imageFolder].some(c=>c.charCodeAt(0)<32)||!['left','center','right'].includes(value.imageAlignment)||typeof value.imageWidth!=='string'||!/^([1-9]\d{0,3}px|100%|[1-9]\d?%)$/.test(value.imageWidth)||!Array.isArray(value.commands)||value.commands.length>100||new Set(value.commands.map(c=>c?.id)).size!==value.commands.length||value.commands.some(c=>!c||typeof c.id!=='string'||c.id.length>100||typeof c.name!=='string'||!c.name.trim()||c.name.length>120||typeof c.enabled!=='boolean'||c.description!==undefined&&(typeof c.description!=='string'||c.description.length>500)||c.aliases!==undefined&&(!Array.isArray(c.aliases)||c.aliases.length>30||c.aliases.some(alias=>typeof alias!=='string'||alias.length>80))||(c.template!==undefined&&(typeof c.template!=='string'||c.template.length>50000))||(c.action!==undefined&&!['image','symbols','view','search','checkpoint'].includes(c.action))||c.template===undefined&&c.action===undefined))throw new Error('Invalid editor settings');
  return value;
}
