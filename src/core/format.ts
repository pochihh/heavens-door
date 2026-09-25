import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { parseDocument, isMap } from 'yaml';
import type { Board, Card, Placement } from '../shared';

export const revision = (text: string) => createHash('sha256').update(text).digest('hex');
export function splitNote(raw: string) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(raw);
  const front = parseDocument(match?.[2] ?? '');
  if (front.errors.length) throw new Error('Invalid frontmatter: ' + front.errors[0].message);
  if (front.contents !== null && !isMap(front.contents)) throw new Error('Frontmatter must be a mapping');
  return { front, header: match?.[0] ?? '', body: raw.slice(match?.[0].length ?? 0) };
}
export function readCard(path: string, raw: string): Card {
  const { front, body } = splitNote(raw);
  const id = front.get('card-id');
  if (id !== undefined && (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id))) throw new Error('Invalid card-id');
  return { id: id as string || revision(path).slice(0,32), path, name: basename(path, '.md'), body, revision: revision(raw), legacy: !id };
}
export function editCard(raw: string, card: Card, body: string) {
  const { front, header } = splitNote(raw);
  if (!card.legacy) return header + body;
  front.set('card-id', card.id);
  return `---\n${front.toString()}---\n${body}`;
}
export function newNote() { return `---\ncard-id: ${randomUUID()}\n---\n`; }
export function emptyBoard(path: string): Board {
  return { path, folder: dirname(path) === '.' ? '' : dirname(path), name: basename(path, '.whiteboard'), revision: '', cards: [], edges: [] };
}
export function readBoard(path: string, raw: string): Board {
  const block = /%% whiteboard-layout\s*\n([\s\S]*?)\n%%/.exec(raw);
  if (!block) throw new Error('Missing whiteboard layout');
  const layout = JSON.parse(block[1]);
  if (layout.version !== 1 || !Array.isArray(layout.cards) || !Array.isArray(layout.edges)) throw new Error('Unsupported board format');
  const membership = new Map([...raw.matchAll(/^- \[[^\n]*\]\((card|board):([^\s)]+)\) \^([\w-]+)$/gm)].map(m => [m[3], m[1] === 'card' ? {cardId:m[2]} : {cardId:'',folder:decodeURIComponent(m[2])}]));
  const board = { ...emptyBoard(path), revision: revision(raw), cards: layout.cards.map((c: Placement) => {const member=membership.get(c.id);if(!member)throw new Error('Missing board membership');return {...c,folder:undefined,...member};}), edges: layout.edges };
  validateBoard(board);
  return board;
}
export function validateBoard(board: Board) {
  if (board.cards.length > 10000 || board.edges.length > 50000) throw new Error('Board exceeds supported limits');
  const ids = new Set<string>();
  for (const p of board.cards) {
    if (!p.id || (!p.cardId && !p.folder) || ids.has(p.id) || ![p.x,p.y,p.width,p.height].every(Number.isFinite) || p.width < 120 || p.height < 80) throw new Error('Invalid board placement');
    if (p.folder !== undefined && (typeof p.folder !== 'string' || !p.folder || p.folder.startsWith('/') || p.folder.split(/[\\/]/).some(part => !part || part.startsWith('.')))) throw new Error('Invalid sub-whiteboard reference');
    ids.add(p.id);
  }
  const edges = new Set<string>();
  for (const e of board.edges) {
    if (!e.id || edges.has(e.id) || !ids.has(e.from) || !ids.has(e.to)) throw new Error('Invalid board connection');
    edges.add(e.id);
  }
}
export function writeBoard(board: Board) {
  validateBoard(board);
  const members = board.cards.map(c => c.folder ? `- [Whiteboard](board:${encodeURIComponent(c.folder)}) ^${c.id}` : `- [Card](card:${c.cardId}) ^${c.id}`).join('\n');
  const layout = { version: 1, cards: board.cards.map(p => ({id:p.id,x:p.x,y:p.y,width:p.width,height:p.height})), edges: board.edges };
  return `---\nwhiteboard: true\nwhiteboard_version: 1\n---\n# ${board.name}\n\n## Cards\n${members}\n\n%% whiteboard-layout\n${JSON.stringify(layout, null, 2)}\n%%\n`;
}
