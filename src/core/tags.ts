import {basename} from 'node:path';
import {splitNote,revision,readCard} from './format';
import {validTag,tagsFrom,validateFields,validateTagValue,resolveTag} from '../tags';
import type {TagInfo,TagField,TagValue} from '../shared';
import {ui} from '../text/ui';
export function readTag(path:string,raw:string):TagInfo {
  const {front}=splitNote(raw),data=front.toJSON()??{},tag=data.tag??basename(path,'.tag');
  if(!validTag(tag)||data.inherits!==undefined&&(!Array.isArray(data.inherits)||data.inherits.length>32||!data.inherits.every(validTag)))throw new Error(ui.tags.invalidTag);
  const fields=data.fields??[];validateFields(fields);
  const overrides=data.overrides??[];
  if(!Array.isArray(overrides)||overrides.length>100||overrides.some(o=>!o||typeof o!=='object'||typeof o.key!=='string'))throw new Error(ui.tags.invalidFields);
  return {path,name:tag.split('/').at(-1)!,tag,revision:revision(raw),fields,inherits:data.inherits??[],overrides};
}
export function editTag(raw:string,fields:TagField[],inherits:string[]) {
  const {front,body}=splitNote(raw);front.set('fields',fields);front.set('inherits',inherits);
  return `---\n${front.toString()}---\n${body}`;
}
function schema(tags:TagInfo[],tag:string){const resolved=resolveTag(tags,tag);if(resolved.warnings.length)throw new Error(resolved.warnings.join('\n'));return resolved.fields;}
export function editCardTag(raw:string,path:string,tags:TagInfo[],tag:string,add:boolean) {
  if(!validTag(tag))throw new Error(ui.tags.invalidTag);
  const {front,body}=splitNote(raw),stored=front.toJSON()?.tags;
  if(stored!==undefined&&stored!==null&&!(validTag(stored)||Array.isArray(stored)&&stored.every(validTag)))throw new Error(ui.tags.invalidStoredTags);
  const before=tagsFrom(stored),fields=add?schema(tags,tag):resolveTag(tags,tag).fields;
  if(add===before.includes(tag))return raw;
  const after=add?[...before,tag]:before.filter(t=>t!==tag);
  if(add){for(const field of fields)if(!front.has(field.propertyKey)&&field.default!==undefined)front.set(field.propertyKey,field.default);}
  else {
    const keep=new Set(after.flatMap(t=>resolveTag(tags,t).fields.map(f=>f.propertyKey)));
    const owned=Object.keys(front.toJSON()??{}).filter(key=>key.startsWith(tag+'/')&&!key.slice(tag.length+1).includes('/'));
    for(const key of new Set([...owned,...fields.map(f=>f.propertyKey)]))if(!keep.has(key))front.delete(key);
  }
  front.set('tags',after);front.set('card-id',readCard(path,raw).id);
  return `---\n${front.toString()}---\n${body}`;
}
export function editTagProperty(raw:string,path:string,tags:TagInfo[],tag:string,key:string,value:TagValue) {
  const {front,body}=splitNote(raw),attached=tagsFrom(front.toJSON()?.tags);
  if(!attached.some(t=>t===tag||t.startsWith(tag+'/')))throw new Error(ui.tags.notAttached);
  const field=schema(tags,tag).find(f=>f.propertyKey===key);if(!field)throw new Error(ui.tags.missingField(key));
  validateTagValue(field,value);front.set(key,value);front.set('card-id',readCard(path,raw).id);
  return `---\n${front.toString()}---\n${body}`;
}

export function reorderTagProperties(raw:string,path:string,tags:TagInfo[],tag:string,keys:string[]){
  const {front,body}=splitNote(raw),attached=tagsFrom(front.toJSON()?.tags);
  if(!attached.includes(tag))throw new Error(ui.tags.notAttached);
  const fields=schema(tags,tag),allowed=new Set(fields.map(f=>f.propertyKey));
  if(!Array.isArray(keys)||keys.length!==allowed.size||new Set(keys).size!==keys.length||keys.some(k=>!allowed.has(k)))throw new Error(ui.tags.invalidFields);
  for(const key of keys)if(!front.has(key))front.set(key,null);
  const items=front.contents as import('yaml').YAMLMap,byKey=new Map(items.items.map(item=>[String(item.key),item]));
  let i=0;items.items=items.items.map(item=>allowed.has(String(item.key))?byKey.get(keys[i++])!:item);
  front.set('card-id',readCard(path,raw).id);return `---\n${front.toString()}---\n${body}`;
}
