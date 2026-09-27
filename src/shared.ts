import type {Docks,DocumentsLayout,ModuleId,NavigationMemory} from './layout';
export interface Card { id: string; path: string; name: string; title?:string; titleMarkdown?:string; body: string; revision: string; legacy: boolean }
export type CardInfo = Omit<Card, 'body'>;
export interface Placement { id: string; cardId: string; x: number; y: number; width: number; height: number; collapsed?:boolean; autoHeight?:boolean; folder?: string }
export interface Edge { id: string; from: string; to: string }
export interface Board { path: string; folder: string; name: string; revision: string; cards: Placement[]; edges: Edge[]; inbox?:{x:number;y:number} }
export interface Checkpoint { id: string; parents: string[]; time: number; label: string; active: boolean }
export interface FileEntry {name:string;path:string;kind:'folder'|'file'|'symlink'}
export interface FileInspection {kind:'text'|'image'|'binary';size:number;text?:string}
export interface RegisteredWorkspace {root:string;name:string}
export interface Preferences { newSplitDirection?:'row'|'column'; docks?:Docks; documents?:DocumentsLayout; navigation?:Partial<Record<ModuleId,NavigationMemory>>; explorerMode?:'whiteboards'|'files'; theme: 'light' | 'dark' | 'system'; titlePlaceholder?:string; stem: string; starred: string[]; recent: string[]; icons: Record<string,string> }
export interface TagInfo { path: string; name: string; tag: string; revision: string }
export interface TagResult { card: CardInfo; properties: Record<string,unknown> }
export interface Snapshot { pathMoves?:BoardMove[]; assetKey?: string; root: string; name: string; cards: CardInfo[]; boards: Board[]; issues: string[]; historyAvailable: boolean; folders?: string[]; tags?: TagInfo[]; preferences?: Preferences }
export interface Edit { path: string; before: string | null; after: string | null }
export interface BoardMove { from:string; to:string }
export interface Mutation { snapshot: Snapshot; edits: Edit[]; move?:BoardMove }
export interface Write { path: string; content: string | null; expected: string | null }
export type Request =
  | { kind: 'open'; root: string; cache: string }
  | { kind: 'snapshot' }
  | { kind: 'listFiles'; path:string }
  | { kind: 'inspectFile'; path:string }
  | { kind: 'preferences'; patch: Partial<Preferences> }
  | { kind: 'createFolder'; parent: string; name: string; position?:{x:number;y:number} }
  | { kind: 'migrateRoot' }
  | { kind: 'tagCards'; tag: string }
  | { kind: 'create'; folder: string; stem: string; x: number; y: number; place?:boolean }
  | { kind: 'renameBoard'; folder:string; name:string; expected:string }
  | { kind: 'renameCard'; path:string; stem:string; expected:string }
  | { kind: 'saveCard'; path: string; body: string; expected: string }
  | { kind: 'saveBoard'; board: Board; expected: string }
  | { kind: 'query'; text: string }
  | { kind: 'checkpoint'; label: string }
  | { kind: 'history' }
  | { kind: 'restore'; id: string }
  | { kind: 'read'; path: string }
  | { kind: 'card'; path: string }
  | { kind: 'write'; changes: Write[] };
export type WindowAction = 'close' | 'reload';
export interface Bridge {
  listWorkspaces():Promise<RegisteredWorkspace[]>;
  unregisterWorkspace(root:string):Promise<RegisteredWorkspace[]>;
  openWorkspace(root:string):Promise<Snapshot>;
  revealFile(path:string):Promise<void>;
  chooseWorkspace(): Promise<Snapshot | null>;
  demo(): Promise<Snapshot>;
  request<T>(request: Exclude<Request, { kind: 'open' }>): Promise<T>;
  onChange(callback: () => void): () => void;
  currentWorkspace(): Promise<Snapshot | null>;
  onClosing(callback: (action: WindowAction) => void): () => void;
  finishClosing(action: WindowAction): void;
  cancelClosing(action: WindowAction): void;
  reload(): void;
  assetUrl(path: string): string;
  newWindow(sameWorkspace: boolean): Promise<void>;
  platform: string;
}
declare global { interface Window { door: Bridge } }

export const DEFAULT_TITLE_PLACEHOLDER='A new card';
export const COLLAPSED_CARD_HEIGHT=70;
export function placementHeight(placement:Placement){return placement.collapsed?COLLAPSED_CARD_HEIGHT:placement.height;}
