import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Catch copy that bypasses the review catalogs at the UI's usual entry points.
// User data and catalog references are expressions, not inline authored labels.
test('renderer labels and menu copy stay in the catalogs, except deferred Settings copy', () => {
  const directory=new URL('../src/renderer/',import.meta.url),inline:string[]=[];
  for(const file of readdirSync(directory).filter(file=>file.endsWith('.tsx'))){
    if(file==='SettingsPanel.tsx')continue; // Existing deferred Settings copy now lives in its own component.
    const source=readFileSync(new URL(file,directory),'utf8');
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node:ts.Node){
      // Leave the existing Settings panel intact until its separate copy review.
      if(ts.isConditionalExpression(node)&&node.condition.getText(tree)==="modal==='settings'"){
        visit(node.whenFalse);return;
      }
      const text=ts.isJsxText(node)?node.text.trim():ts.isStringLiteral(node)?node.text:'';
      if(text==='Workspace settings')return;
      const parent=node.parent;
      const attribute=parent&&ts.isJsxAttribute(parent)&&['aria-label','data-tooltip','placeholder','title','label'].includes(parent.name.getText(tree));
      const property=parent&&ts.isPropertyAssignment(parent)&&parent.initializer===node&&['label','hint','title','aria-label'].includes(parent.name.getText(tree).replaceAll("'",''));
      if(/[a-z]/i.test(text)&&(ts.isJsxText(node)||attribute||property)){
        inline.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}: ${text}`);
      }
      ts.forEachChild(node,visit);
    }
    visit(tree);
  }
  assert.deepEqual(inline,[],`Move UI copy into src/text/ui.ts or src/text/tooltips.ts:\n${inline.join('\n')}`);
});


test('app-authored UI terms follow the approved terminology guide',()=>{
 const root=new URL('../src/',import.meta.url),legacy=/\b(?:tab groups?|main dock|side docks?|tab strips?|tab bars?|document toolbar|window toolbar|main toolbar|action ribbon|activity bar|mother (?:whiteboard|board)|sub-whiteboard|sub-board|action hub)\b/i,found:string[]=[];
 function scan(directory:URL){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory()){scan(path);continue;}if(!/\.tsx?$/.test(entry.name))continue;const tree=ts.createSourceFile(path.pathname,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,entry.name.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node:ts.Node){
   // Keep old aliases searchable in Settings, without displaying them as UI labels.
   if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='keywords')return;
   const text=ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)?node.text:ts.isJsxText(node)?node.text.trim():'';
   if(legacy.test(text))found.push(`${path.pathname}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}: ${text}`);ts.forEachChild(node,visit);
  }visit(tree);
 }}scan(root);assert.deepEqual(found,[],`Use docs/ui-terminology.md for visible wording; preserve internal keys:\n${found.join('\n')}`);
});
