import { TAG_FIELD_TYPES, LEGACY_TAG_FIELD_TYPES, STATUS_GROUPS, type TagInfo, type TagField, type TagValue, type ResolvedTagField } from './shared';
import {ui} from './text/ui';
export const validTag=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200&&value.split('/').every(p=>!!p&&!/[\s#<>:"\\|?*]/.test(p)&&!p.startsWith('.')&&!p.endsWith('.'));
export function tagsFrom(value:unknown):string[]{return [...new Set((Array.isArray(value)?value:typeof value==='string'?[value]:[]).filter(validTag))];}
export const fieldOptions=(field:TagField):string[]=>field.type==='status'?STATUS_GROUPS.flatMap(group=>field.statusGroups?.[group]??[]):field.options??[];
export const propertyType=(type:TagField['type']):typeof TAG_FIELD_TYPES[number]=>type==='multi-select'?'select':['url','email','phone'].includes(type)?'text':type as typeof TAG_FIELD_TYPES[number];
export const multipleChoices=(field:TagField)=>field.type==='multi-select'||field.type==='select'&&field.multiple===true;
export const validReferencePath=(value:string)=>value.length<=2048&&!/[\\:]/.test(value)&&![...value].some(c=>c.charCodeAt(0)<32)&&value.split('/').every(part=>!!part&&part!=='.'&&part!=='..')&&/\.(md|whiteboard)$/.test(value);
export function validTagDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value))return false;
  const day=new Date(value.slice(0,10)+'T00:00:00Z');
  return Number.isFinite(+day)&&day.toISOString().slice(0,10)===value.slice(0,10)&&Number.isFinite(Date.parse(value));
}
export function validateTagValue(field:TagField,value:unknown):asserts value is TagValue {
  if(value===null)return;
  let valid=false;
  if(field.type==='number')valid=typeof value==='number'&&Number.isFinite(value);
  else if(field.type==='boolean')valid=typeof value==='boolean';
  else if(field.type==='date'){
    if(typeof value==='string')valid=validTagDate(value);
    else if(value&&typeof value==='object'&&!Array.isArray(value)){const range=value as Record<string,unknown>;valid=Object.keys(range).length===2&&validTagDate(range.start)&&validTagDate(range.end)&&(range.start.length===10)===(range.end.length===10)&&Date.parse(range.end)>=Date.parse(range.start);}
  }
  else if(multipleChoices(field))valid=Array.isArray(value)&&value.length<=200&&value.every(v=>typeof v==='string'&&(field.options??[]).includes(v));
  else if(typeof value==='string'&&value.length<=10000){
    valid=true;
    if(field.type==='select'||field.type==='status')valid=fieldOptions(field).includes(value);
    if(field.type==='link')valid=/^card:[\w-]{1,128}$/.test(value)||validReferencePath(value);
    if(field.type==='url'){try{valid=['http:','https:'].includes(new URL(value).protocol);}catch{valid=false;}}
    if(field.type==='email')valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  if(!valid)throw new Error(ui.tags.invalidValue(field.label??field.key));
}
export function validateFields(fields:unknown):asserts fields is TagField[] {
  if(!Array.isArray(fields)||fields.length>100)throw new Error(ui.tags.invalidFields);
  const keys=new Set<string>();
  for(const field of fields){
    if(!field||typeof field!=='object'||typeof field.key!=='string'||!field.key.trim()||field.key!==field.key.trim()||field.key.length>100||/[/\n\r]/.test(field.key)||keys.has(field.key)||![...TAG_FIELD_TYPES,...LEGACY_TAG_FIELD_TYPES].includes(field.type)||
      ['label','description'].some(k=>field[k]!==undefined&&(typeof field[k]!=='string'||field[k].length>2000))||
      field.options!==undefined&&(!Array.isArray(field.options)||field.options.length>200||field.options.some((o:unknown)=>typeof o!=='string'||!o||o.length>200)||new Set(field.options).size!==field.options.length))throw new Error(ui.tags.invalidFields);
    if(field.multiple!==undefined&&(typeof field.multiple!=='boolean'||field.type!=='select'))throw new Error(ui.tags.invalidFields);
    if(field.optional!==undefined&&typeof field.optional!=='boolean')throw new Error(ui.tags.invalidFields);
    if(field.type==='status'){
      const groups=field.statusGroups;
      if(!groups||typeof groups!=='object'||Array.isArray(groups)||Object.keys(groups).length!==3||STATUS_GROUPS.some(group=>!Array.isArray(groups[group])||groups[group].some((option:unknown)=>typeof option!=='string'||!option.trim()||option.length>200)))throw new Error(ui.tags.invalidFields);
      const options=fieldOptions(field);if(!options.length||options.length>200||new Set(options).size!==options.length)throw new Error(ui.tags.invalidFields);
    }
    keys.add(field.key);if(field.default!==undefined)validateTagValue(field,field.default);
  }
}
export function resolveTag(tags:TagInfo[],name:string,stack:string[]=[]):{fields:ResolvedTagField[];warnings:string[]} {
  if(stack.includes(name)||stack.length>32)return {fields:[],warnings:[ui.tags.cycle(name)]};
  const matches=tags.filter(t=>t.tag===name);
  if(matches.length!==1)return {fields:[],warnings:[matches.length?ui.tags.duplicate(name):ui.tags.missing(name)]};
  const tag=matches[0],fields=new Map<string,ResolvedTagField>(),warnings:string[]=[];
  for(const parent of tag.inherits){const resolved=resolveTag(tags,parent,[...stack,name]);warnings.push(...resolved.warnings);for(const f of resolved.fields)if(!fields.has(f.key))fields.set(f.key,f);}
  for(const override of tag.overrides){const field=fields.get(override.key);if(!field){warnings.push(ui.tags.missingField(override.key));continue;}
    try{const next={...field,...override,sourceTag:field.sourceTag,propertyKey:field.propertyKey,options:override.options?[...new Set([...(field.options??[]),...override.options])]:field.options};
    validateFields([next]);fields.set(next.key,next);}catch(error){warnings.push(String(error));}
  }
  for(const field of tag.fields)fields.set(field.key,{...field,sourceTag:name,propertyKey:name+'/'+field.key});
  return {fields:[...fields.values()],warnings:[...new Set(warnings)]};
}

// A card's YAML keys are its property membership; schema changes never add rows to it.
export function cardTagFields(tags:TagInfo[],name:string,properties:Record<string,unknown>):ResolvedTagField[]{
  const known=new Map(resolveTag(tags,name).fields.map(field=>[field.propertyKey,field]));
  return Object.entries(properties).flatMap(([key,value])=>{
    const field=known.get(key);if(field)return [field];
    if(!key.startsWith(name+'/')||key.slice(name.length+1).includes('/'))return [];
    // Removed definitions retain editable stored values without writing inferred schema back.
    const fallback:TagField=typeof value==='number'?{key,type:'number'}:typeof value==='boolean'?{key,type:'boolean'}:Array.isArray(value)&&value.every(v=>typeof v==='string')?{key,type:'select',multiple:true,options:[...new Set(value)]}:value&&typeof value==='object'&&'start' in value&&'end' in value&&validTagDate(value.start)&&validTagDate(value.end)?{key,type:'date'}:{key,type:'text'};
    return [{...fallback,key:key.slice(name.length+1),sourceTag:name,propertyKey:key}];
  });
}

// Property names are labels; only explicit namespaced keys identify write destinations.
export function tagPropertyTargets(tags:TagInfo[],keys:readonly string[],properties:Record<string,unknown>,attach=false){
  const wanted=new Set(keys),targets=tagsFrom(properties.tags).flatMap(tag=>{
    const resolved=resolveTag(tags,tag),fields=resolved.fields.filter(field=>wanted.has(field.propertyKey));
    if(fields.length&&resolved.warnings.length)throw new Error(resolved.warnings.join('\n'));
    return fields.map(field=>({tag,field}));
  });
  if(targets.length||!attach)return targets;
  const key=keys[0],tag=key.slice(0,key.lastIndexOf('/')),resolved=resolveTag(tags,tag),field=resolved.fields.find(field=>field.propertyKey===key);
  if(!field||resolved.warnings.length)throw new Error(resolved.warnings.join('\n')||ui.tags.missingField(key));
  return [{tag,field}];
}
