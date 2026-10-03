import type {TagInfo} from '../shared';
import {viewText} from '../text/views';
import {type Rule,type FieldRef,fieldKeys,resolveField,validateRule,validateView,parseViewBlock} from '../view-block';
import {multipleChoices} from '../tags';

// Only fixed SQL fragments and bound values cross this compiler boundary.
export function compileView(source:string,id:string,tags:TagInfo[]){
  const block=parseViewBlock(source),view=block.views.find(v=>v.id===id);
  if(!view)throw new Error(viewText.errors.notFound);validateView(view,tags);
  if(block.query.where)validateRule(block.query.where,tags);
  const args:(string|number)[]=[],bind=(v:unknown)=>{args.push(typeof v==='boolean'?Number(v):v as string|number);return '?';};
  const file=(key:string)=>({'file.name':'c.name','file.title':"COALESCE(NULLIF(c.title,''),c.name)",'file.path':'c.path','file.folder':'c.folder','file.text':'c.searchText'}[key]);
  function compare(column:string,op:string,value:unknown){
    if(op==='under'){const path=String(value).replace(/\/$/,'');return `(${column}=${bind(path)} OR substr(${column},1,length(${bind(path+'/')}))=${bind(path+'/')})`;}
    if(op==='contains'||op==='notContains')return `instr(lower(${column}),lower(${bind(value)})) ${op==='contains'?'>':'='} 0`;
    if(op==='starts')return `substr(lower(${column}),1,length(${bind(value)}))=lower(${bind(value)})`;
    if(op==='ends')return `substr(lower(${column}),-length(${bind(value)}))=lower(${bind(value)})`;
    if(['on','before','after'].includes(op)){const other=bind(value);return op==='on'?`date(${column})=date(${other})`:`julianday(${column}) ${op==='before'?'<':'>'} julianday(${other})`;}
    return `${column} ${{eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='}[op]!} ${bind(value)}`;
  }
  function leaf(rule:Extract<Rule,{field:FieldRef}>){
    const f=resolveField(rule.field,tags),{op,value}=rule;
    return '('+f.keys.map(key=>{
      const column=file(key);
      if(column){if(op==='exists')return '1';if(op==='missing')return '0';if(op==='empty'||op==='notEmpty')return `${column}${op==='empty'?'=':'<>'}''`;return compare(column,op,value);}
      if(f.type==='tags'&&['contains','notContains'].includes(op))return `${op==='notContains'?'NOT ':''}EXISTS(SELECT 1 FROM properties p,json_each(p.value) v WHERE p.path=c.path AND p.field='tags' AND v.type='text' AND v.value=${bind(value)})`;
      if(op==='exists'||op==='missing')return `${op==='missing'?'NOT ':''}EXISTS(SELECT 1 FROM properties p WHERE p.path=c.path AND p.field=${bind(key)})`;
      if(op==='empty'||op==='notEmpty')return `${op==='empty'?'NOT ':''}EXISTS(SELECT 1 FROM properties p WHERE p.path=c.path AND p.field=${bind(key)} AND p.value NOT IN ('null','""','[]'))`;
      const array=f.type==='tags'||!!f.definition&&multipleChoices(f.definition);
      if(array){
        const predicate=`EXISTS(SELECT 1 FROM json_each(p.value) v WHERE v.type='text' AND v.value=${bind(value)})`;
        // Legacy single-tag strings are supported; tag membership is always exact.
        return `(SELECT CASE WHEN json_type(p.value) IN ('array','text') THEN ${['neq','notContains'].includes(op)?'NOT ':''}${predicate} ELSE NULL END FROM properties p WHERE p.path=c.path AND p.field=${bind(key)})`;
      }
      const expression=f.type==='date'?"CASE WHEN json_type(p.value)='object' THEN json_extract(p.value,'$.start') ELSE json_extract(p.value,'$') END":"json_extract(p.value,'$')";
      const valid=f.type==='number'?"json_type(p.value) IN ('integer','real')":f.type==='boolean'?"json_type(p.value) IN ('true','false')":f.type==='date'?`json_type(p.value) IN ('text','object') AND julianday(${expression}) IS NOT NULL`:"json_type(p.value)='text'";
      return `(SELECT CASE WHEN ${valid} THEN ${compare(expression,op,value)} ELSE NULL END FROM properties p WHERE p.path=c.path AND p.field=${bind(key)})`;
    }).join(op==='empty'||op==='missing'?' AND ':' OR ')+')';
  }
  function condition(rule?:Rule):string {if(!rule)return '1';if('all'in rule)return rule.all.length?'('+rule.all.map(condition).join(' AND ')+')':'1';if('any'in rule)return rule.any.length?'('+rule.any.map(condition).join(' OR ')+')':'0';if('not'in rule)return '(NOT '+condition(rule.not)+')';return leaf(rule);}
  const queryWhere=condition(block.query.where),queryArgs=[...args],where=queryWhere+' AND '+condition(view.filter),whereArgs=[...args];
  const sort=typeof view.sort==='object'?view.sort:undefined;
  function sortValue(ref:FieldRef){return fieldKeys(ref).map(key=>{
    const column=file(key);if(column)return column;
    if(key==='tags')return "(SELECT group_concat(value,char(31)) FROM (SELECT DISTINCT v.value FROM json_each(c.frontmatter,'$.tags') v WHERE v.type='text' ORDER BY v.value COLLATE NOCASE,v.value))";
    const date=resolveField(key,tags).type==='date',part=sort?.part??'start';
    const value=date?`julianday(CASE WHEN json_type(p.value)='object' THEN COALESCE(json_extract(p.value,'$.${part}'),json_extract(p.value,'$.start')) ELSE json_extract(p.value,'$') END)`:"json_extract(p.value,'$')";
    return `(SELECT ${value} FROM properties p WHERE p.path=c.path AND p.field=${bind(key)})`;
  });}
  const sorts=sortValue(sort?.field??'file.name'),order=(sorts.length>1?'COALESCE('+sorts.join(',')+')':sorts[0])+' '+(sort?.direction==='desc'?'DESC':'ASC')+' NULLS LAST,c.name,c.path';
  return {where,whereArgs,queryWhere,queryArgs,order,args,view};
}
