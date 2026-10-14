import {MODULE_IDS,type ModuleId} from './layout';
export const HUB_COMMANDS=['newCard','newBoard','searchWorkspace','views','templates','save','undo','redo',...MODULE_IDS] as const;
export type HubCommand=typeof HUB_COMMANDS[number];
export interface HubButton {command:HubCommand;label?:string;icon?:string}
export const DEFAULT_HUB:HubButton[]=['newCard','newBoard','searchWorkspace','views','templates'].map(command=>({command:command as HubCommand}));
export function validateActionHub(value:unknown){
  if(value===undefined)return;
  if(!Array.isArray(value)||value.length>HUB_COMMANDS.length||new Set(value.map(b=>b?.command)).size!==value.length)throw new Error('Invalid action hub');
  for(const button of value)if(!button||!HUB_COMMANDS.includes(button.command)||button.label!==undefined&&(typeof button.label!=='string'||!button.label.trim()||button.label.length>120)||button.icon!==undefined&&(typeof button.icon!=='string'||[...button.icon].length>16))throw new Error('Invalid action hub button');
}
export function hubModule(command:HubCommand):ModuleId|undefined{return MODULE_IDS.find(id=>id===command);}
