export type TemplateValue=string|number|boolean;
export type TemplateValues=Record<string,TemplateValue>;
export interface TemplateInput {name:string;label:string;type:'text'|'number'|'checkbox'|'date'|'choice'|'note'|'tag';required:boolean;default?:TemplateValue;options?:string[]}
export interface TemplatePlan {inputs:TemplateInput[]}
export const templateDefaults=(inputs:TemplateInput[]):TemplateValues=>Object.fromEntries(inputs.map(input=>[input.name,input.default??(input.type==='checkbox'?false:'')]));
