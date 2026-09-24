import type { Edit, Write } from '../shared';

export async function hash(content: string | null) {
  if (content === null) return null;
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes),b => b.toString(16).padStart(2,'0')).join('');
}
interface Action { label: string; edits: Edit[]; time: number }
export class UndoHistory {
  past: Action[] = [];
  future: Action[] = [];
  record(label: string, edits: Edit[], group=false, time=Date.now()) {
    edits = edits.filter(e => e.before !== e.after);
    if (!edits.length) return;
    const previous = this.past.at(-1);
    if (group && previous && previous.label === label && time-previous.time < 2000 && edits.length === 1 && previous.edits.length === 1 && previous.edits[0].path === edits[0].path && previous.edits[0].after === edits[0].before) {
      previous.edits[0].after=edits[0].after; previous.time=time;
    } else this.past.push({label,edits,time});
    this.future=[];
  }
  async travel(redo: boolean, apply: (changes: Write[]) => Promise<unknown>) {
    const source = redo ? this.future : this.past;
    const target = redo ? this.past : this.future;
    const action = source.at(-1);
    if (!action) return;
    const changes = await Promise.all(action.edits.map(async e => ({path:e.path,content:redo ? e.after : e.before,expected:await hash(redo ? e.before : e.after)})));
    await apply(changes);
    source.pop(); target.push(action);
  }
  clear() { this.past=[]; this.future=[]; }
}
