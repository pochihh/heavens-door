export interface Card { id: string; path: string; name: string; body: string; revision: string; legacy: boolean }
export type CardInfo = Omit<Card, 'body'>;
export interface Placement { id: string; cardId: string; x: number; y: number; width: number; height: number }
export interface Edge { id: string; from: string; to: string }
export interface Board { path: string; folder: string; name: string; revision: string; cards: Placement[]; edges: Edge[] }
export interface Checkpoint { id: string; parents: string[]; time: number; label: string; active: boolean }
export interface Snapshot { root: string; name: string; cards: CardInfo[]; boards: Board[]; issues: string[]; historyAvailable: boolean }
export interface Edit { path: string; before: string | null; after: string | null }
export interface Mutation { snapshot: Snapshot; edits: Edit[] }
export interface Write { path: string; content: string | null; expected: string | null }
export type Request =
  | { kind: 'open'; root: string; cache: string }
  | { kind: 'snapshot' }
  | { kind: 'create'; folder: string; stem: string; x: number; y: number }
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
}
declare global { interface Window { door: Bridge } }
