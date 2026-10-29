import {CORE_FEATURES,featureEnabled,systemPath,type SystemEntry} from '../features';
import type {Preferences} from '../shared';
import {portable} from './documents';

export interface FolderNavigation {key:string;folder:(prefs?:Preferences)=>string;enabled?:(prefs?:Preferences)=>boolean}
const registrations=new Map<string,FolderNavigation>();
// Routes and view rendering stay with the shell; this registry owns folder-to-route navigation.
export function registerFolderNavigation(registration:FolderNavigation){
  if(!registration.key||registrations.has(registration.key))throw new Error('Folder navigation is already registered.');
  registrations.set(registration.key,registration);
  return ()=>{if(registrations.get(registration.key)===registration)registrations.delete(registration.key);};
}
for(const feature of CORE_FEATURES)if(feature.id!=='graph'&&feature.id!=='views')registerFolderNavigation({key:'system:'+feature.id,folder:prefs=>systemPath(feature.id as SystemEntry,prefs),enabled:prefs=>featureEnabled(prefs,feature.id)});
export function folderNavigation(path:string,prefs?:Preferences){
  const folder=portable(path).replace(/\/$/,'');
  return [...registrations.values()].find(entry=>(!entry.enabled||entry.enabled(prefs))&&portable(entry.folder(prefs)).replace(/\/$/,'')===folder)?.key;
}
