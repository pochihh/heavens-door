import {common,createLowlight} from 'lowlight';
import {ui} from '../text/ui';
export const codeHighlight=createLowlight(common);
codeHighlight.registerAlias({cpp:['c++'],csharp:['c#']});
const labels:Record<string,string>={plaintext:ui.editorTools.plainText,cpp:'C++',c:'C',csharp:'C#',javascript:'JavaScript',typescript:'TypeScript',python:'Python',xml:'HTML / XML',css:'CSS',scss:'SCSS',json:'JSON',sql:'SQL',yaml:'YAML',vbnet:'Visual Basic .NET',objectivec:'Objective-C',php:'PHP',wasm:'WebAssembly'};
const aliases:Record<string,string>={'':'plaintext','c++':'cpp','c#':'csharp',js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',py:'python',cs:'csharp',html:'xml',yml:'yaml',text:'plaintext',txt:'plaintext',sh:'bash'};
export const codeLanguage=(value:string)=>aliases[value.toLowerCase()]??value;
export const codeLabel=(value:string)=>labels[codeLanguage(value)]??value.charAt(0).toUpperCase()+value.slice(1);
export const codeLanguages=codeHighlight.listLanguages().sort((a,b)=>codeLabel(a).localeCompare(codeLabel(b)));
// Lowlight emits only token spans and text; never interpret code as document HTML.
export function highlightCodePreview(code:HTMLElement){
 const language=code.className.match(/(?:^|\s)language-(\S+)/)?.[1]??'',value=code.textContent??'';
 type Token={type:string;value?:string;properties?:{className?:unknown};children?:Token[]};
 const render=(tokens:Token[]):Node[]=>tokens.map(token=>{if(token.type==='text')return document.createTextNode(token.value??'');const span=document.createElement('span');if(Array.isArray(token.properties?.className))span.className=token.properties.className.join(' ');span.append(...render(token.children??[]));return span;});
 if(codeHighlight.registered(language))code.replaceChildren(...render(codeHighlight.highlight(language,value).children));
 const pre=code.parentElement!,wrapper=document.createElement('div'),toolbar=document.createElement('div'),label=document.createElement('span');wrapper.className='editor-code-block';toolbar.className='code-block-toolbar';label.textContent=codeLabel(language);toolbar.append(label);pre.before(wrapper);wrapper.append(toolbar,pre);
}
