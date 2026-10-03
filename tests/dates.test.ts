import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDays,dateDraft,dateValue,dateSummary,formatDay,parseDay,shiftMonth,validateDateDisplay,DEFAULT_DATE_DISPLAY} from '../src/dates';
import {validatePreferences,defaultPreferences} from '../src/core/preferences';

test('date popup calendar, formats and timezone edits preserve portable values',()=>{
  const la={...DEFAULT_DATE_DISPLAY,timeZone:'America/Los_Angeles'},taipei={...la,timeZone:'Asia/Taipei'};
  assert.equal(shiftMonth('2024-01-31',1),'2024-02-29');assert.equal(shiftMonth('2025-01-31',1),'2025-02-28');assert.equal(shiftMonth('2026-12-01',1),'2027-01-01');
  const days=calendarDays('2024-02-01');assert.equal(days.length,42);assert.equal(days[0],'2024-01-28');assert.equal(days.at(-1),'2024-03-09');assert.equal(new Set(days).size,42);
  for(const format of ['mdy','dmy','ymd','full','short'] as const)assert.equal(parseDay(formatDay('2024-02-29',format),format),'2024-02-29');
  assert.equal(parseDay('02/29/2025','mdy'),null);assert.equal(parseDay('February 31, 2026','full'),null);assert.equal(parseDay('30/09/2026','dmy'),'2026-09-30');
  const old='2026-09-30T12:34:56.789+08:00';assert.equal(dateValue(dateDraft(old,la),la,old),old);assert.equal(dateValue(dateDraft(old,taipei),taipei,old),old);
  assert.equal(dateSummary('2026-09-30',la),'09/30/2026');assert.equal(dateSummary('2026-09-30',taipei),'09/30/2026');
  assert.equal(dateSummary('2026-09-30T00:00:00Z',{...la,timeZone:'UTC'}),'09/30/2026 12:00 AM');
  assert.equal(dateSummary('2026-09-30T12:00:00Z',{...la,timeZone:'UTC'}),'09/30/2026 12:00 PM');
  assert.equal(dateSummary({start:'2026-10-03',end:'2026-10-03'},la),'10/03/2026');
  assert.equal(dateSummary({start:'2026-10-03T09:00:00Z',end:'2026-10-03T09:00:00Z'},{...la,timeZone:'UTC'}),'10/03/2026 9:00 AM');
  assert.equal(dateSummary({start:'2026-10-03T09:00:00Z',end:'2026-10-03T11:00:00Z'},{...la,timeZone:'UTC'}),'10/03/2026 9:00 AM → 11:00 AM');
  const draft=dateDraft('2026-03-08',la);draft.time=true;draft.start.time='2:30 AM';assert.throws(()=>dateValue(draft,la),/does not exist/);
  draft.start.time='3:30 AM';assert.equal(dateValue(draft,la),'2026-03-08T10:30:00.000Z');
  const overlap='2026-11-01T01:30:00-08:00';assert.equal(dateValue(dateDraft(overlap,la),la,overlap),overlap,'Repeated time must retain its original occurrence');
  const first=dateDraft('2026-11-01',la);first.time=true;first.start.time='1:30 AM';assert.equal(dateValue(first,la),'2026-11-01T08:30:00.000Z');
  const range={start:'2026-03-07T09:00:00-08:00',end:'2026-03-09T09:00:00-07:00'};assert.deepEqual(dateValue(dateDraft(range,la),la,range),range);
  draft.start.time='13:00 PM';assert.throws(()=>dateValue(draft,la),/valid time/);draft.start.day='02/31/2026';assert.throws(()=>dateValue(draft,la),/valid date/);
  assert.equal(dateValue(dateDraft(null,la),la),null);
  assert.deepEqual(validatePreferences({...defaultPreferences(),dateDisplay:taipei}).dateDisplay,taipei);
  assert.throws(()=>validateDateDisplay({...la,timeZone:'Not/a-zone'}),/display settings/);assert.throws(()=>validateDateDisplay({...la,format:'invalid'}),/display settings/);
});
