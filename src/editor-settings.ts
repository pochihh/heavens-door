export interface EditorCommand {id:string;name:string;enabled:boolean;template?:string;action?:'image'|'symbols'|'view'|'search'|'checkpoint'}
export interface EditorSettings {imageFolder:string;imageLocation:'beside'|'workspace';imageWidth:string;imageAlignment:'left'|'center'|'right';commands:EditorCommand[]}
export const DEFAULT_COMMANDS:EditorCommand[]=[
  ...[1,2,3].map(level=>({id:'heading-'+level,name:'Heading '+level,enabled:true,template:'#'.repeat(level)+' {{cursor}}'})),
  {id:'bullet',name:'Bullet list',enabled:true,template:'- {{cursor}}'},
  {id:'numbered',name:'Numbered list',enabled:true,template:'1. {{cursor}}'},
  {id:'task',name:'Checklist',enabled:true,template:'- [ ] {{cursor}}'},
  {id:'quote',name:'Quote',enabled:true,template:'> {{cursor}}'},
  {id:'code',name:'Code block',enabled:true,template:'```\n{{cursor}}\n```'},
  {id:'divider',name:'Divider',enabled:true,template:'---\n'},
  {id:'image',name:'Image',enabled:true,action:'image'},
  {id:'view',name:'View block',enabled:true,action:'view'},
  {id:'symbols',name:'Symbols and emoji',enabled:true,action:'symbols'},
  {id:'search',name:'Search workspace',enabled:true,action:'search'},
  {id:'checkpoint',name:'Save checkpoint',enabled:true,action:'checkpoint'},
];
export const DEFAULT_EDITOR_SETTINGS:EditorSettings={imageFolder:'_assets',imageLocation:'beside',imageWidth:'100%',imageAlignment:'center',commands:DEFAULT_COMMANDS};
export function validateEditorSettings(value:EditorSettings){
  if(!value||typeof value!=='object'||!['beside','workspace'].includes(value.imageLocation)||typeof value.imageFolder!=='string'||!value.imageFolder||value.imageFolder.length>200||value.imageFolder.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||/[\\:*?"<>|]/.test(value.imageFolder)||[...value.imageFolder].some(c=>c.charCodeAt(0)<32)||!['left','center','right'].includes(value.imageAlignment)||typeof value.imageWidth!=='string'||!/^([1-9]\d{0,3}px|100%|[1-9]\d?%)$/.test(value.imageWidth)||!Array.isArray(value.commands)||value.commands.length>100||new Set(value.commands.map(c=>c?.id)).size!==value.commands.length||value.commands.some(c=>!c||typeof c.id!=='string'||c.id.length>100||typeof c.name!=='string'||!c.name.trim()||c.name.length>120||typeof c.enabled!=='boolean'||(c.template!==undefined&&(typeof c.template!=='string'||c.template.length>50000))||(c.action!==undefined&&!['image','symbols','view','search','checkpoint'].includes(c.action))||c.template===undefined&&c.action===undefined))throw new Error('Invalid editor settings');
  return value;
}
