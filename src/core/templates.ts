import {visit} from 'yaml';
import {splitNote} from './format';
import {moveCardLinks} from '../card-links';
import {expandTemplate,validJournalDay,validNotePath} from '../journal';
import type {TemplateInput,TemplateValues,TemplateValue} from '../templates';

const inputPattern=/\{\{input:([^}]*)\}\}/g,includePattern=/\{\{include:([^}]*)\}\}/g;
const inputName=/^[a-zA-Z][\w-]*$/;
const inputLabel=(name:string)=>name.replace(/[_-]/g,' ').replace(/^./,c=>c.toUpperCase());
function definition(name:string,value:unknown):TemplateInput {
  if(!inputName.test(name)||!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid template input: '+name);
  const spec=value as Record<string,unknown>,type=spec.type??(spec.options?'choice':'text');
  if(!['text','number','checkbox','date','choice','note','tag'].includes(String(type))||spec.label!==undefined&&typeof spec.label!=='string'||spec.required!==undefined&&typeof spec.required!=='boolean')throw new Error('Invalid template input: '+name);
  const field:TemplateInput={name,label:typeof spec.label==='string'?spec.label:inputLabel(name),type:type as TemplateInput['type'],required:spec.required!==false};
  if(type==='choice'){
    if(!Array.isArray(spec.options)||!spec.options.length||spec.options.some(v=>typeof v!=='string')||new Set(spec.options).size!==spec.options.length)throw new Error('Choose options for template input: '+name);
    field.options=spec.options;
  }
  if(spec.default!==undefined){validateInput(field,spec.default);field.default=spec.default as TemplateValue;}
  return field;
}
function validateInput(field:TemplateInput,value:unknown){
  const empty=value===undefined||typeof value==='string'&&!value.trim();
  if(empty){if(field.required)throw new Error('Enter '+field.label);return;}
  if(field.type==='number'?typeof value!=='number'||!Number.isFinite(value):field.type==='checkbox'?typeof value!=='boolean':typeof value!=='string')throw new Error('Invalid value for '+field.label);
  if(field.type==='date'&&!validJournalDay(String(value)))throw new Error('Enter a valid date for '+field.label);
  if(field.type==='choice'&&!field.options!.includes(String(value)))throw new Error('Choose an option for '+field.label);
  if(field.type==='note'&&!/^card:[\w-]{1,128}$/.test(String(value)))throw new Error('Choose a note for '+field.label);
  if(field.type==='tag'&&!/^[^#\s]+$/.test(String(value)))throw new Error('Choose a tag for '+field.label);
}
interface Part {path:string;body:string;front:ReturnType<typeof splitNote>['front'];children:Part[]}
export async function loadTemplate(path:string,read:(path:string)=>Promise<string>){
  const definitions=new Map<string,TemplateInput>(),names=new Set<string>(),cache=new Map<string,string>();
  function collect(value:string){for(const match of value.matchAll(inputPattern)){if(!inputName.test(match[1]))throw new Error('Invalid template input: '+match[1]);names.add(match[1]);}}
  async function load(path:string,stack:string[]):Promise<Part>{
    if(!validNotePath(path)||!path.endsWith('.md'))throw new Error('Invalid template include path: '+path);
    if(stack.includes(path))throw new Error('Circular template include: '+[...stack,path].join(' → '));
    if(stack.length>=32)throw new Error('Template includes are nested too deeply.');
    let raw=cache.get(path);if(raw===undefined){try{raw=await read(path);}catch(e){if((e as {code?:string}).code==='ENOENT')throw new Error('Template not found: '+path,{cause:e});throw e;}cache.set(path,raw);}
    const {front,body}=splitNote(raw),spec=front.toJSON()?.template;
    if(spec!==undefined){
      if(!spec||typeof spec!=='object'||Array.isArray(spec)||spec.inputs!==undefined&&(!spec.inputs||typeof spec.inputs!=='object'||Array.isArray(spec.inputs)))throw new Error('Invalid template input definitions in '+path);
      for(const [name,value] of Object.entries(spec.inputs??{})){
        const field=definition(name,value),previous=definitions.get(name);
        if(previous&&JSON.stringify(previous)!==JSON.stringify(field))throw new Error('Conflicting definitions for template input: '+name);
        definitions.set(name,field);
      }
    }
    collect(body);
    if(front.has('template'))front.delete('template');
    if(!stack.length)visit(front,{Scalar(_key,node){if(typeof node.value==='string'){collect(node.value);if(node.value.includes('{{include:'))throw new Error('Template includes belong in the note body.');}}});
    const children:Part[]=[];
    for(const match of body.matchAll(includePattern))children.push(await load(match[1].trim(),[...stack,path]));
    return {path,body,front,children};
  }
  const root=await load(path,[]),inputs=[...names].map(name=>definitions.get(name)??{name,label:inputLabel(name),type:'text' as const,required:true});
  return {inputs,render(destination:string,title:string,day:string,time:string,provided:TemplateValues={}){
    if(!provided||typeof provided!=='object'||Array.isArray(provided))throw new Error('Invalid template input values.');
    const values=new Map<string,TemplateValue>();
    for(const field of inputs){const value=Object.hasOwn(provided,field.name)?provided[field.name]:field.default;validateInput(field,value);values.set(field.name,value??'');}
    const text=(value:string)=>value.replace(/\{\{(input:[^}]*|title|(?:date|time)(?::[^}]+)?)\}\}/g,(token,key)=>key.startsWith('input:')?String(values.get(key.slice(6))??''):expandTemplate(token,title,day,time));
    function render(part:Part):string{
      let result='',cursor=0,i=0;
      for(const match of part.body.matchAll(includePattern)){result+=moveCardLinks(text(part.body.slice(cursor,match.index)),part.path,destination)+render(part.children[i++]).trimEnd();cursor=match.index+match[0].length;}
      return result+moveCardLinks(text(part.body.slice(cursor)),part.path,destination);
    }
    const front=root.front.clone();
    visit(front,{Scalar(_key,node){if(typeof node.value==='string'){const exact=/^\{\{input:([^}]*)\}\}$/.exec(node.value);node.value=exact?values.get(exact[1])??'':text(node.value);}}});
    return {front,body:render(root)};
  }};
}
