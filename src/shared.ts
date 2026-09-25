export interface Card { id: string; path: string; name: string; title?:string; body: string; revision: string; legacy: boolean }
export type CardInfo = Omit<Card, 'body'>;
export interface Placement { id: string; cardId: string; x: number; y: number; width: number; height: number; collapsed?:boolean; folder?: string }
export interface Edge { id: string; from: string; to: string }
export interface Board { path: string; folder: string; name: string; revision: string; cards: Placement[]; edges: Edge[]; inbox?:{x:number;y:number} }
export interface Checkpoint { id: string; parents: string[]; time: number; label: string; active: boolean }
export interface FileEntry {name:string;path:string;kind:'folder'|'file'|'symlink'}
export interface FileInspection {kind:'text'|'image'|'binary';size:number;text?:string}
export interface RegisteredWorkspace {root:string;name:string}
export interface Preferences { explorerMode?:'whiteboards'|'files'; theme: 'light' | 'dark' | 'system'; stem: string; starred: string[]; recent: string[]; icons: Record<string,string> }
export interface TagInfo { path: string; name: string; tag: string; revision: string }
export interface TagResult { card: CardInfo; properties: Record<string,unknown> }
export interface Snapshot { assetKey?: string; root: string; name: string; cards: CardInfo[]; boards: Board[]; issues: string[]; historyAvailable: boolean; folders?: string[]; tags?: TagInfo[]; preferences?: Preferences }
export interface Edit { path: string; before: string | null; after: string | null }
export interface Mutation { snapshot: Snapshot; edits: Edit[] }
export interface Write { path: string; content: string | null; expected: string | null }
export type Request =
  | { kind: 'open'; root: string; cache: string }
  | { kind: 'snapshot' }
  | { kind: 'listFiles'; path:string }
  | { kind: 'inspectFile'; path:string }
  | { kind: 'preferences'; patch: Partial<Preferences> }
  | { kind: 'createFolder'; parent: string; name: string }
  | { kind: 'migrateRoot' }
  | { kind: 'tagCards'; tag: string }
  | { kind: 'create'; folder: string; stem: string; x: number; y: number; place?:boolean }
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

export const COLLAPSED_CARD_HEIGHT=40;
export function placementHeight(placement:Placement){return placement.collapsed?COLLAPSED_CARD_HEIGHT:placement.height;}
