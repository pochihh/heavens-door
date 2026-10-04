import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {importImage} from '../src/core/images';
import {moveCardLinks,rewriteHtmlLinks} from '../src/card-links';

test('image imports are local, non-overwriting and reject paths or asset symlinks outside the workspace',async()=>{
  const root=await fs.mkdtemp(join(tmpdir(),'heavens-images-')),outside=await fs.mkdtemp(join(tmpdir(),'heavens-outside-'));
  try{
    await fs.mkdir(join(root,'Ideas'));await fs.writeFile(join(root,'Ideas','Card.md'),'# Card\n');
    const bytes=Uint8Array.from([137,80,78,71]),one=await importImage(root,'Ideas/Card.md','Diagram.png','image/png',bytes),two=await importImage(root,'Ideas/Card.md','Diagram.png','image/png',bytes);
    assert.notEqual(one.src,two.src);assert.match(one.src,/^_assets\/Diagram-[\w-]+\.png$/);assert.deepEqual(await fs.readFile(join(root,'Ideas',one.src)),Buffer.from(bytes));
    assert.equal(await fs.readFile(join(root,'Ideas/Card.md'),'utf8'),'# Card\n');
    assert.match(moveCardLinks(`<img src="${one.src}" alt="Diagram" width="320">`,'Ideas/Card.md','Inbox/Card.md'),/src="\.\.\/Ideas\/_assets\//);
    await assert.rejects(importImage(root,'../Card.md','Diagram.png','image/png',bytes));
    await assert.rejects(importImage(root,'Ideas/Card.md','Diagram.txt','text/plain',bytes));
    await fs.mkdir(join(root,'Other'));await fs.writeFile(join(root,'Other','Card.md'),'# Card');await fs.symlink(outside,join(root,'Other','_assets'));
    await assert.rejects(importImage(root,'Other/Card.md','Diagram.png','image/png',bytes));assert.deepEqual(await fs.readdir(outside),[]);
  }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});


test('HTML link rewrites change actual references without touching other attributes or comments',()=>{
  const source='<img title="Example > src=old.png" data-src="old.png" src = "old.png"> <!-- <img src="old.png"> --> <a href=old.png>Read</a>';
  const result=rewriteHtmlLinks(source,path=>path==='old.png'?'new.png':path);
  assert.equal(result,'<img title="Example > src=old.png" data-src="old.png" src = "new.png"> <!-- <img src="old.png"> --> <a href="new.png">Read</a>');
});
