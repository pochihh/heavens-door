export const KEY_COMMANDS=[
  {id:'readerLibrary',name:'Return to Inbox',key:'Shift-j',scope:'Reader'},
  {id:'readerSearch',name:'Search PDF text',key:'Mod-f',scope:'Reader'},
  {id:'readerHighlight',name:'Highlight selected text',key:'h',scope:'Reader'},
  {id:'readerNote',name:'Add reader note',key:'n',scope:'Reader'},
  {id:'readerNext',name:'Next Inbox item',key:'j',scope:'Reader'},
  {id:'readerDone',name:'Mark reading done',key:'d',scope:'Reader'},
  {id:'search',name:'Search workspace',key:'Mod-k',scope:'App'},
  {id:'save',name:'Save checkpoint',key:'Mod-s',scope:'App'},
  {id:'undo',name:'Undo',key:'Mod-z',scope:'App'},
  {id:'redo',name:'Redo',key:'Mod-Shift-z',scope:'App'},
  {id:'bold',name:'Bold',key:'Mod-b',scope:'Editor'},
  {id:'italic',name:'Italic',key:'Mod-i',scope:'Editor'},
  {id:'strike',name:'Strikethrough',key:'Mod-Shift-s',scope:'Editor'},
  {id:'code',name:'Inline code',key:'Mod-e',scope:'Editor'},
  {id:'symbols',name:'Symbols and emoji',key:'Ctrl-Shift-Space',scope:'Editor'},
  {id:'indent',name:'Indent selected lines',key:'Tab',scope:'Editor'},
  {id:'outdent',name:'Unindent selected lines',key:'Shift-Tab',scope:'Editor'},
  {id:'lineStart',name:'Start of displayed line',key:'Home',scope:'Editor'},
  {id:'lineEnd',name:'End of displayed line',key:'End',scope:'Editor'},
  {id:'cardStart',name:'Start of card',key:'Mod-Home',scope:'Editor'},
  {id:'cardEnd',name:'End of card',key:'Mod-End',scope:'Editor'},
] as const;
export type KeyCommand=typeof KEY_COMMANDS[number]['id'];
export type Keybindings=Partial<Record<KeyCommand,string>>;
export function binding(command:KeyCommand,value?:Keybindings){return value?.[command]??KEY_COMMANDS.find(c=>c.id===command)!.key;}
export function matchesBinding(event:Pick<KeyboardEvent,'key'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'>,command:KeyCommand,value?:Keybindings,platform='darwin',extendSelection=false){
  const parts=binding(command,value).split('-'),key=parts.pop();if(!key)return false;
  const mod=parts.includes('Mod'),meta=parts.includes('Meta')||mod&&platform==='darwin',ctrl=parts.includes('Ctrl')||mod&&platform!=='darwin';
  return event.key.toLowerCase()===(key==='Space'?' ':key.toLowerCase())&&event.metaKey===meta&&event.ctrlKey===ctrl&&event.altKey===parts.includes('Alt')&&(extendSelection||event.shiftKey===parts.includes('Shift'));
}
export function recordBinding(event:Pick<KeyboardEvent,'key'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'>,platform='darwin'){
  if(['Meta','Control','Alt','Shift','Dead','Unidentified'].includes(event.key))return null;
  return [...event.metaKey?[platform==='darwin'?'Mod':'Meta']:[],...event.ctrlKey?[platform==='darwin'?'Ctrl':'Mod']:[],...event.altKey?['Alt']:[],...event.shiftKey?['Shift']:[],event.key===' '?'Space':event.key.length===1?event.key.toLowerCase():event.key].join('-');
}
export function validateKeybindings(value:unknown){
  if(value===undefined)return;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid keyboard shortcuts');
  for(const [id,key] of Object.entries(value)){
    const command=KEY_COMMANDS.find(c=>c.id===id);
    if(!command||typeof key!=='string'||key.length>60||key&&!/^(?:(?:Mod|Meta|Ctrl|Alt|Shift)-)*(?:[a-z0-9]|F(?:[1-9]|1[0-2])|Tab|Home|End|Enter|Escape|Space|Arrow(?:Left|Right|Up|Down)|Backspace|Delete)$/.test(key))throw new Error('Invalid keyboard shortcut');
    if(key&&command.scope==='App'&&!/^(?:Mod|Meta|Ctrl|Alt)-|^F\d+$/.test(key))throw new Error('App shortcuts need Command, Control, Alt or a function key.');
  }
  const seen=new Map<string,string>();
  for(const command of KEY_COMMANDS){const key=binding(command.id,value as Keybindings);if(key&&seen.has(key))throw new Error('Shortcut already used by '+seen.get(key));if(key)seen.set(key,command.name);}
}
