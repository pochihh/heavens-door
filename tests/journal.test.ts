import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Workspace} from '../src/core/workspace';
import {splitNote,revision} from '../src/core/format';
import {UndoHistory} from '../src/renderer/history';
import {DEFAULT_JOURNAL,formatTemplateDate,journalWeek,journalDays,journalMonth,journalToday,validateJournal,validateTemplates} from '../src/journal';
import {defaultDocks,validateDocks} from '../src/layout';

test('journal dates, ISO weeks, timezone boundaries and settings are portable',()=>{
  assert.equal(journalWeek('2021-01-01'),'2020-12-28');assert.equal(formatTemplateDate('2021-01-01','GGGG-[W]WW'),'2020-W53');
  assert.equal(formatTemplateDate('2026-10-05','dddd, MMMM D, YYYY'),'Monday, October 5, 2026');
  assert.equal(journalToday({format:'ymd',timeFormat:'24',timeZone:'America/Los_Angeles'},new Date('2026-10-05T01:00:00Z')),'2026-10-04');
  assert.equal(journalMonth('2024-02-29').length,42);assert.ok(journalDays(2024).includes('2024-02-29'));assert.equal(journalDays(2026).length%7,0);
  validateJournal(DEFAULT_JOURNAL);assert.throws(()=>validateJournal({...DEFAULT_JOURNAL,dailyFormat:'YYYY-MM'}));assert.throws(()=>validateTemplates({folder:'../secret'}));assert.throws(()=>validateTemplates({folder:'Templates/CON'}));
  const old=defaultDocks();old.right.groups[0].tabs=old.right.groups[0].tabs.filter(id=>id!=='calendar');old.right.groups[0].active='style';assert.ok(validateDocks(old).right.groups[0].tabs.includes('calendar'));
});

test('templates and journals create recoverable Markdown, preserve links, and never replace existing notes',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-journals-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);
  let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  const created=await w.createTemplate(),template=created.edits[0].path;
  const raw='---\ncard-id: template-id\ntags: [project]\nproject/Location: "{{title}}"\nproject/Date: "{{date}}"\n---\n# {{title}}\n\n{{date:dddd, MMMM D, YYYY}}\n\n<img src="images/picture.png">\n';
  await w.write([{path:template,content:raw,expected:revision(await w.read(template))}]);
  await w.setPreferences({journal:{...DEFAULT_JOURNAL,dailyTemplate:template,weeklyTemplate:template}});
  const day=await w.openJournal('2026-10-04','daily'),content=await w.read(day.path),note=splitNote(content);
  assert.equal(day.path,'Journal/2026/10/2026-10-04.md');assert.equal(note.front.get('project/Date'),'2026-10-04');assert.deepEqual(note.front.toJSON().journal,{date:'2026-10-04',period:'daily'});assert.notEqual(note.front.get('card-id'),'template-id');assert.match(note.body,/Sunday, October 4, 2026/);assert.match(note.body,/src="..\/..\/..\/Templates\/images\/picture.png"/);
  assert.equal((await w.openJournal('2026-10-04','daily')).edits.length,0);assert.equal(await w.read(day.path),content);
  const weekly=await w.openJournal('2027-01-01','weekly');assert.equal(weekly.path,'Journal/Weekly/2026-W53.md');assert.equal(splitNote(await w.read(weekly.path)).front.toJSON().journal.date,'2026-12-28');assert.equal((await w.openJournal('2026-12-29','weekly')).path,weekly.path);
  const copy=await w.createFromTemplate(template,'Inbox','A "quote"'.replaceAll('"',"'")),newPath=copy.edits.find(e=>e.path.endsWith('.md'))!.path,copyFront=splitNote(await w.read(newPath)).front;
  assert.equal(copyFront.get('project/Location'),"A 'quote'");assert.equal(copyFront.has('journal'),false);assert.notEqual(copyFront.get('card-id'),note.front.get('card-id'));
  const undo=new UndoHistory();undo.record('Create',copy.edits);await undo.travel(false,changes=>w.write(changes));await assert.rejects(fs.access(join(root,newPath)));await undo.travel(true,changes=>w.write(changes));assert.equal(splitNote(await w.read(newPath)).front.get('card-id'),copyFront.get('card-id'));
  const renamed=await w.renameCard(day.path,'Sunday journal',(await w.card(day.path)).revision);assert.ok(renamed.edits.length);const again=await w.openJournal('2026-10-04','daily');assert.match(again.path,/Sunday journal.md$/);assert.equal(again.edits.length,0);
  const legacy='Journal/2026/10/2026-10-06.md';await fs.writeFile(join(root,legacy),'# Existing journal\n\nLeave me unchanged.\n');await w.refresh(legacy);
  assert.equal((await w.openJournal('2026-10-06','daily')).edits.length,0);assert.ok(w.journalEntries(2026).some(e=>e.path===legacy&&e.words>0));
  await assert.rejects(w.openJournal('2026-02-30','daily'));await assert.rejects(w.createFromTemplate('../secret.md','Inbox','new'));assert.throws(()=>w.journalEntries(0));
  await w.setPreferences({journal:{...DEFAULT_JOURNAL,weeklyFormat:DEFAULT_JOURNAL.dailyFormat}});const monday=await w.openJournal('2026-10-05','daily');await assert.rejects(w.openJournal('2026-10-05','weekly'),/different journal/);assert.equal(splitNote(await w.read(monday.path)).front.toJSON().journal.period,'daily');
  w.close();w=await Workspace.open(root,cache);assert.equal((await w.openJournal('2026-10-04','daily')).path,again.path);assert.ok(w.journalEntries(2026).some(e=>e.path===again.path));
});
