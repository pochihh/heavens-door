import type {Docks,DocumentsLayout,ModuleId,NavigationMemory} from './layout';
export interface Card { tags?:string[]; fillColor?:string|null; id: string; path: string; name: string; title?:string; titleMarkdown?:string; body: string; revision: string; legacy: boolean }
export type CardInfo = Omit<Card, 'body'>;
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'triangle-outline';
export interface Stroke { strokeColor?:string; strokeWidth?:number; strokeStyle?:'solid'|'dashed'|'dotted'|'none' }
export interface Placement extends Stroke { fillColor?:string; id: string; cardId: string; x: number; y: number; width: number; height: number; collapsed?:boolean; autoHeight?:boolean; folder?: string }
export interface Edge extends Stroke { id:string; from:string; to:string; fromSide?:AnchorSide; toSide?:AnchorSide; fromArrowhead?:Arrowhead; toArrowhead?:Arrowhead; label?:string; labelSize?:number }
export type EdgeStyle = Pick<Edge,'strokeColor'|'strokeWidth'|'strokeStyle'|'fromArrowhead'|'toArrowhead'|'labelSize'>;
export function edgeStyle(edge:EdgeStyle):EdgeStyle {
  return {strokeColor:edge.strokeColor,strokeWidth:edge.strokeWidth??2,strokeStyle:edge.strokeStyle==='none'?'solid':edge.strokeStyle??'solid',fromArrowhead:edge.fromArrowhead??'none',toArrowhead:edge.toArrowhead??'none',labelSize:edge.labelSize??14};
}
export interface Mention { from:string; to:string }
export interface Board { path: string; folder: string; name: string; revision: string; cards: Placement[]; edges: Edge[]; showMentions?:boolean; mentionStyle?:Stroke; canvasColor?:string; gridColor?:string; inbox?:{x:number;y:number} }
export type PropertyValue = string | number | boolean | null;
export interface CardQuery {
  text?:string; folder?:string; recursive?:boolean; tag?:string; tagChildren?:boolean; backlinksTo?:string;
  properties?:{field:string;op:'eq'|'contains'|'exists'|'gt'|'gte'|'lt'|'lte';value?:PropertyValue}[];
  sort?:'name'|'title'|'path'; direction?:'asc'|'desc'; limit?:number; offset?:number;
}
export interface CardResult extends CardInfo { properties:Record<string,unknown>; snippet:string; score:number; terms:string[]; previewImage?:string; highlights?:{name:[number,number][];path:[number,number][];snippet:[number,number][]} }
export interface TagSearchResult {kind:'tag';path:string;name:string;tag:string;revision:string;snippet:string;score:number;terms:string[];highlights:{name:[number,number][];path:[number,number][];snippet:[number,number][]}}
export type WorkspaceSearchResult=CardResult|TagSearchResult;
export interface CheckpointChange {path:string;added:number|null;removed:number|null}
export interface Checkpoint { color?:number; id: string; parents: string[]; time: number; label: string; active: boolean }
export interface FileEntry {name:string;path:string;kind:'folder'|'file'|'symlink'}
export interface FileInspection {kind:'text'|'image'|'binary';size:number;text?:string}
export interface RegisteredWorkspace {root:string;name:string;status:'available'|'missing'|'unavailable'|'not-folder';lastUpdated:number|null}
export type WhiteboardInput = 'auto' | 'mouse' | 'trackpad';
export interface PaletteColor {id:string;name:string;color:string}
export interface Preferences { tagColors?:Record<string,string>; palette?:PaletteColor[]; whiteboardInput?:WhiteboardInput; newSplitDirection?:'row'|'column'; docks?:Docks; documents?:DocumentsLayout; navigation?:Partial<Record<ModuleId,NavigationMemory>>; explorerMode?:'whiteboards'|'files'; theme: 'light' | 'dark' | 'system'; titlePlaceholder?:string; stem: string; starred: string[]; recent: string[]; icons: Record<string,string> }
export const TAG_FIELD_TYPES=['text','number','date','boolean','select','status','multi-select','link','url','email','phone'] as const;
export type TagFieldType=typeof TAG_FIELD_TYPES[number];
export const STATUS_GROUPS=['todo','inProgress','done'] as const;
export type TagDateRange={start:string;end:string};
export type TagValue=string|number|boolean|string[]|TagDateRange|null;
export interface TagField {key:string;type:TagFieldType;label?:string;description?:string;options?:string[];statusGroups?:Record<typeof STATUS_GROUPS[number],string[]>;default?:TagValue}
export interface TagInfo { path:string;name:string;tag:string;revision:string;fields:TagField[];inherits:string[];overrides:(Partial<TagField>&{key:string})[] }
export interface ResolvedTagField extends TagField {propertyKey:string;sourceTag:string}
export interface CardProperties {revision:string;properties:Record<string,unknown>}
export interface TagResult { card: CardInfo; properties: Record<string,unknown> }
export interface Snapshot { lastEdgeStyle?:EdgeStyle; pathMoves?:BoardMove[]; assetKey?: string; root: string; name: string; cards: CardInfo[]; boards: Board[]; issues: string[]; historyAvailable: boolean; folders?: string[]; tags?: TagInfo[]; preferences?: Preferences }
export interface Edit { path: string; before: string | null; after: string | null }
export interface BoardMove { from:string; to:string }
export interface Deletion {changes:Write[]; nonEmpty:string[]}
export interface Mutation { snapshot: Snapshot; edits: Edit[]; move?:BoardMove }
export interface Write { path: string; content: string | null; expected: string | null }
export type Request =
  | { kind: 'open'; root: string; cache: string }
  | { kind: 'snapshot' }
  | { kind: 'boardMentions'; path:string }
  | { kind: 'listFiles'; path:string }
  | { kind: 'inspectFile'; path:string }
  | { kind: 'preferences'; patch: Partial<Preferences> }
  | { kind: 'createFolder'; parent: string; name: string; position?:{x:number;y:number} }
  | { kind: 'migrateRoot' }
  | { kind:'tagCards';tag:string;text?:string;offset?:number }
  | { kind:'createTag';tag:string }
  | { kind:'saveTag';path:string;expected:string;fields:TagField[];inherits:string[] }
  | { kind:'cardProperties';path:string }
  | { kind:'setCardTag';path:string;expected:string;tag:string;add:boolean;create?:boolean }
  | { kind:'reorderCardTags';path:string;expected:string;tags:string[] }
  | { kind:'reorderTagProperties';path:string;expected:string;tag:string;keys:string[] }
  | { kind:'setTagProperty';path:string;expected:string;tag:string;key:string;value:TagValue }
  | { kind: 'create'; folder: string; stem: string; x: number; y: number; place?:boolean }
  | { kind: 'renameBoard'; folder:string; name:string; expected:string }
  | { kind: 'renameCard'; path:string; stem:string; expected:string }
  | { kind: 'saveCard'; path: string; body: string; expected: string }
  | { kind: 'setFill'; cards:{path:string;expected:string}[]; color:string|null; board?:{value:Board;expected:string} }
  | { kind: 'saveBoard'; board: Board; expected: string }
  | { kind: 'query'; text: string }
  | { kind: 'queryCards'; query: CardQuery }
  | { kind: 'queryTags'; text:string;exclude?:string[];limit?:number }
  | { kind: 'searchWorkspace'; text:string }
  | { kind: 'checkpoint'; label: string }
  | { kind: 'history'; limit?:number }
  | { kind: 'checkpointChanges'; id:string }
  | { kind: 'applyCheckpoint'; source:string; target:string }
  | { kind: 'restore'; id: string }
  | { kind: 'read'; path: string }
  | { kind: 'card'; path: string }
  | { kind: 'prepareDeletion'; path:string; placements:string[]; edges:string[]; expected:string }
  | { kind: 'write'; changes: Write[] };
export interface AppSettings {hardwareAcceleration:boolean;restartRequired:boolean;warning?:string}
export interface GraphicsDiagnostics {hardwareAcceleration:boolean|null;features:Record<string,string>|null;electron:string;chromium:string}
export type WindowAction = 'close' | 'reload';
export interface Bridge {
  appSettings():Promise<AppSettings>;
  setHardwareAcceleration(enabled:boolean):Promise<AppSettings>;
  onAppSettingsChange(callback:()=>void):()=>void;
  graphicsDiagnostics():Promise<GraphicsDiagnostics>;
  listWorkspaces(refresh?:boolean):Promise<RegisteredWorkspace[]>;
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
