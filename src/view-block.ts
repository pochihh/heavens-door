import {marked} from 'marked';
import {viewText} from './text/views';
import {parseDocument,LineCounter} from 'yaml';
import type {TagInfo,TagField} from './shared';
import {resolveTag,propertyType,multipleChoices,validTagDate,tagsFrom} from './tags';

export type FieldRef=string|string[];
export type Rule={field:FieldRef;op:string;value?:unknown}|{all:Rule[]}|{any:Rule[]}|{not:Rule};
export interface BlockView {id:string;name:string;type:'table'|'list'|'kanban';filter?:Rule;fields?:FieldRef[];groupBy?:FieldRef;sort?:{field:FieldRef;direction:'asc'|'desc'}}
export interface ViewBlock {version:1;query:{from:'cards';where?:Rule};views:BlockView[]}
export interface QueryPreferences {mergeProperties:boolean;caseSensitive:boolean}
export const DEFAULT_QUERY_PREFERENCES:QueryPreferences={mergeProperties:true,caseSensitive:false};
export interface QueryField {keys:string[];name:string;type:TagField['type']|'tags';tags:string[];definition?:TagField}
export const FILE_FIELDS:QueryField[]=[{keys:['file.title'],name:viewText.fields.cardName,type:'text',tags:[]},{keys:['file.path'],name:viewText.fields.filePath,type:'text',tags:[]},{keys:['file.folder'],name:viewText.fields.folder,type:'text',tags:[]},{keys:['file.text'],name:viewText.fields.cardText,type:'text',tags:[]},{keys:['tags'],name:viewText.fields.tags,type:'tags',tags:[]}];
export const OPERATORS:Record<string,string>=viewText.operators;
export const fieldKeys=(ref:FieldRef)=>typeof ref==='string'?[ref]:ref;
export const sameField=(a:FieldRef,b:FieldRef)=>JSON.stringify(fieldKeys(a))===JSON.stringify(fieldKeys(b));
export function positiveTags(rule?:Rule):string[]{if(!rule)return [];if('not'in rule)return [];if('all'in rule)return [...new Set(rule.all.flatMap(positiveTags))];if('any'in rule)return [...new Set(rule.any.flatMap(positiveTags))];return rule.field==='tags'&&['contains','eq'].includes(rule.op)&&typeof rule.value==='string'?[rule.value]:[];}
export function queryFields(tags:TagInfo[],scope:string[],prefs:QueryPreferences=DEFAULT_QUERY_PREFERENCES):QueryField[]{
  const grouped=new Map<string,QueryField>();
  for(const name of scope)for(const f of resolveTag(tags,name).fields){
    const type=propertyType(f.type),identity=prefs.mergeProperties?(prefs.caseSensitive?f.key:f.key.toLowerCase())+'\0'+type+'\0'+multipleChoices(f):f.propertyKey;
    const previous=grouped.get(identity);
    if(previous){if(!previous.keys.includes(f.propertyKey))previous.keys.push(f.propertyKey);if(!previous.tags.includes(name))previous.tags.push(name);
      if(previous.definition)previous.definition={...previous.definition,options:[...new Set([...(previous.definition.options??[]),...(f.options??[])])],...(type==='status'?{statusGroups:Object.fromEntries(['todo','inProgress','done'].map(group=>[group,[...new Set([...(previous.definition?.statusGroups?.[group as 'todo']??[]),...(f.statusGroups?.[group as 'todo']??[])])]])) as TagField['statusGroups']}: {})};
    }else grouped.set(identity,{keys:[f.propertyKey],name:f.key,type,tags:[name],definition:f});
  }
  return [...FILE_FIELDS,...grouped.values()];
}
export function resolveField(ref:FieldRef,tags:TagInfo[]):QueryField {
  const keys=fieldKeys(ref),fields=queryFields(tags,tags.map(t=>t.tag),{mergeProperties:false,caseSensitive:true});
  const found=keys.map(key=>fields.find(field=>field.keys.includes(key)));
  if(found.some(f=>!f))throw new Error(viewText.errors.unknownProperty+keys.filter((_,i)=>!found[i]).join(', '));
  const first=found[0]!;
  if(found.some(f=>f!.type!==first.type))throw new Error(viewText.errors.sameType);
  if(found.some(f=>f?.definition&&first.definition&&multipleChoices(f.definition)!==multipleChoices(first.definition)))throw new Error(viewText.errors.compatibleValues);
  return {...first,keys,tags:[...new Set(found.flatMap(f=>f!.tags))]};
}
export function operators(field:QueryField){const type=field.type;
  return [...(type==='tags'||field.definition&&multipleChoices(field.definition)?['contains','notContains']:type==='number'?['eq','neq','gt','gte','lt','lte']:type==='date'?['on','before','after']:type==='boolean'?['eq','neq']:['eq','neq',...(['text','select','status'].includes(type)?['contains','notContains','starts','ends']:[]),...(field.keys[0]==='file.folder'?['under']:[])]),'exists','missing','empty','notEmpty'];
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function keys(value:Record<string,unknown>,allowed:string[]){const unknown=Object.keys(value).find(key=>!allowed.includes(key));if(unknown)throw new Error(viewText.errors.unknownOption+unknown);}
function field(value:unknown):asserts value is FieldRef {if(!(typeof value==='string'&&value.length>0&&value.length<=256||Array.isArray(value)&&value.length>0&&value.length<=32&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<=256)&&new Set(value).size===value.length))throw new Error(viewText.errors.chooseProperty);}
export function validateRule(value:unknown,tags?:TagInfo[],depth=0,budget={left:100}):asserts value is Rule {
  if(!record(value)||depth>8||--budget.left<0)throw new Error(viewText.errors.invalidCondition);
  for(const key of ['all','any','not'])if(key in value){keys(value,[key]);if(key==='not')validateRule(value.not,tags,depth+1,budget);else{const items=value[key];if(!Array.isArray(items)||items.length>100)throw new Error(viewText.errors.invalidGroup);for(const item of items)validateRule(item,tags,depth+1,budget);}return;}
  keys(value,['field','op','value']);field(value.field);
  if(typeof value.op!=='string'||!Object.hasOwn(OPERATORS,value.op))throw new Error(viewText.errors.unknownComparison+String(value.op));
  const unary=['exists','missing','empty','notEmpty'].includes(value.op);
  if(!unary&&(!['string','number','boolean'].includes(typeof value.value)||typeof value.value==='number'&&!Number.isFinite(value.value)||typeof value.value==='string'&&value.value.length>2048))throw new Error(viewText.errors.enterValue);
  if(tags){const f=resolveField(value.field,tags);if(!operators(f).includes(value.op))throw new Error(viewText.errors.invalidComparison+f.name+'.');
    if(!unary&&(f.type==='number'?typeof value.value!=='number':f.type==='boolean'?typeof value.value!=='boolean':typeof value.value!=='string'))throw new Error(viewText.errors.invalidValue+f.name+'.');
    if(!unary&&f.type==='tags'&&(typeof value.value!=='string'||!value.value.trim()))throw new Error(viewText.errors.chooseTag);
    if(!unary&&f.type==='date'&&!validTagDate(value.value))throw new Error(viewText.errors.isoDate);
  }
}
export function validateView(value:unknown,tags?:TagInfo[]):asserts value is BlockView {
  if(!record(value))throw new Error(viewText.errors.invalidView);keys(value,['id','name','type','filter','fields','groupBy','sort']);
  if(typeof value.id!=='string'||!value.id||value.id.length>100||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||!['table','list','kanban'].includes(String(value.type)))throw new Error(viewText.errors.requiredView);
  if(value.filter!==undefined)validateRule(value.filter,tags);
  if(value.fields!==undefined){if(!Array.isArray(value.fields)||value.fields.length>40)throw new Error(viewText.errors.invalidProperties);for(const f of value.fields){field(f);if(tags)resolveField(f,tags);}}
  if(value.groupBy!==undefined){field(value.groupBy);if(tags)resolveField(value.groupBy,tags);}
  if(value.sort!==undefined){if(!record(value.sort))throw new Error(viewText.errors.invalidSort);keys(value.sort,['field','direction']);field(value.sort.field);if(!['asc','desc'].includes(String(value.sort.direction)))throw new Error(viewText.errors.invalidDirection);if(tags)resolveField(value.sort.field,tags);}
}
export function parseViewBlock(source:string):ViewBlock {
  if(source.length>100000)throw new Error(viewText.errors.tooLarge);
  const lineCounter=new LineCounter(),doc=parseDocument(source,{lineCounter,uniqueKeys:true});
  if(doc.errors.length)throw new Error(doc.errors[0].message);
  const data:unknown=doc.toJS({maxAliasCount:50});
  if(!record(data))throw new Error(viewText.errors.mapping);keys(data,['version','query','views']);
  if(data.version!==1)throw new Error(viewText.errors.version);
  if(!record(data.query)||data.query.from!=='cards')throw new Error(viewText.errors.from);keys(data.query,['from','where']);
  if(data.query.where!==undefined)validateRule(data.query.where);
  if(!Array.isArray(data.views)||!data.views.length||data.views.length>20)throw new Error(viewText.errors.viewLimit);
  // Validate each view only when selected, so its errors do not disable sibling views.
  const ids=new Set<string>();for(const view of data.views){if(!record(view)||typeof view.id!=='string'||!view.id||ids.has(view.id))throw new Error(viewText.errors.uniqueId);ids.add(view.id);}
  return data as unknown as ViewBlock;
}
export function writeViewBlock(source:string,next:ViewBlock){const doc=parseDocument(source),previous=doc.toJS()??{};for(const key of ['version','query','views'] as const)if(JSON.stringify(previous[key])!==JSON.stringify(next[key]))doc.set(key,next[key]);return doc.toString({lineWidth:0});}
export function newViewBlock(tag?:string):ViewBlock {return {version:1,query:{from:'cards',where:{all:tag?[{field:'tags',op:'contains',value:tag}]:[]}},views:[{id:'table',name:viewText.table,type:'table',fields:['file.title']}]};}
export function viewFence(tag?:string){return '\n\n```view-block\n'+writeViewBlock('',newViewBlock(tag))+'```\n';}

export function viewBlockRanges(body:string){let offset=0;const blocks:{start:number;end:number;source:string}[]=[];for(const token of marked.lexer(body)){const start=body.indexOf(token.raw,offset);if(start<0)continue;offset=start+token.raw.length;if(token.type==='code'&&token.lang==='view-block')blocks.push({start,end:offset,source:token.text});}return blocks;}

// Display grouping follows preferences; saved query predicates keep their explicit keys.
export function viewDisplayFields(refs:FieldRef[],tags:TagInfo[],prefs:QueryPreferences=DEFAULT_QUERY_PREFERENCES):QueryField[]{
  const choices=queryFields(tags,tags.map(t=>t.tag),prefs),out:QueryField[]=[];
  for(const key of refs.flatMap(fieldKeys)){
    const f=choices.find(f=>f.keys.includes(key))??resolveField(key,tags);
    if(!out.some(previous=>sameField(previous.keys,f.keys)))out.push(f);
  }
  return out;
}
export function viewPropertyTargets(key:string,tags:TagInfo[],properties:Record<string,unknown>,prefs:QueryPreferences=DEFAULT_QUERY_PREFERENCES){
  const seed=resolveField(key,tags);if(!seed.definition)throw new Error(viewText.errors.chooseProperty);
  const name=(name:string)=>prefs.caseSensitive?name:name.toLowerCase();
  return tagsFrom(properties.tags).flatMap(tag=>{
    const resolved=resolveTag(tags,tag);
    const fields=resolved.fields.filter(f=>prefs.mergeProperties?name(f.key)===name(seed.definition!.key)&&propertyType(f.type)===seed.type&&multipleChoices(f)===multipleChoices(seed.definition!):f.propertyKey===key);
    if(fields.length&&resolved.warnings.length)throw new Error(resolved.warnings.join('\n'));
    return fields.map(field=>({tag,field}));
  });
}
