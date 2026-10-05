import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarView} from '../src/renderer/CalendarView';
import {DEFAULT_JOURNAL,journalToday,journalWeek,type JournalPeriod} from '../src/journal';
import type {Snapshot,Bridge} from '../src/shared';
import type {Session} from '../src/renderer/session';

test('Calendar opens daily/weekly notes and navigation does not create notes',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window)});dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const today=journalToday(),calls:{date:string;period:JournalPeriod}[]=[],opened:string[]=[],snapshot={cards:[],preferences:{journal:DEFAULT_JOURNAL}} as unknown as Snapshot;
  window.door={request:async()=>[{date:today,period:'daily',path:'Journal/today.md',id:'today',words:500}]} as unknown as Bridge;
  const session={openJournal:async(date:string,period:JournalPeriod)=>{calls.push({date,period});return {id:date};},update:()=>{}} as unknown as Session;
  const root=createRoot(document.getElementById('root')!);await act(async()=>root.render(<CalendarView snapshot={snapshot} session={session} onOpen={key=>opened.push(key)}/>));
  const click=async(selector:string)=>{const button=document.querySelector<HTMLButtonElement>(selector);assert.ok(button,selector);await act(async()=>button.click());};
  assert.equal(document.querySelectorAll('.journal-week').length,6);assert.equal(document.querySelectorAll('[role=gridcell]').length,42);assert.equal(document.querySelector('[aria-current=date]')?.parentElement?.getAttribute('data-level'),'3');
  await click(`[data-day="${today}"]`);assert.deepEqual(calls[0],{date:today,period:'daily'});assert.equal(opened[0],'card:'+today);
  const firstWeek=document.querySelector<HTMLElement>('[data-day]')!.dataset.day!;await click('.journal-week-link');assert.deepEqual(calls[1],{date:journalWeek(firstWeek),period:'weekly'});
  await click('[aria-label="Next"]');assert.equal(calls.length,2);
  await act(async()=>root.unmount());dom.window.close();
});
