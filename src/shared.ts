import type {TemplateValues} from './templates';
import type {CoreFeature,BoardNavigation} from './features';
import type {JournalSettings,TemplateSettings} from './journal';
import type {EditorSettings} from './editor-settings';
import type {QueryPreferences} from './view-block';
import type {Docks,DocumentsLayout,ModuleId,NavigationMemory} from './layout';
export interface Card { source?:import('./reading').ReadingSource; reading?:import('./reading').ReadingProgress; header?:string; tags?:string[]; fillColor?:string|null; id: string; path: string; name: string; title?:string; titleMarkdown?:string; body: string; revision: string; legacy: boolean }
export type CardInfo = Omit<Card, 'body'|'header'>;
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'triangle-outline';
export interface Stroke { strokeColor?:string; strokeWidth?:number; strokeStyle?:'solid'|'dashed'|'dotted'|'none' }
export type BoardObject={type:'text';text:string;shape:'none'|'rectangle'|'rounded'|'ellipse'|'diamond';fontSize?:number;textColor?:string}|{type:'image';html:string};
export interface Placement extends Stroke {object?:BoardObject; fillColor?:string; id: string; cardId: string; x: number; y: number; width: number; height: number; collapsed?:boolean; autoHeight?:boolean; folder?: string }
export interface Edge extends Stroke { kind?:'branch'; id:string; from:string; to:string; fromSide?:AnchorSide; toSide?:AnchorSide; fromArrowhead?:Arrowhead; toArrowhead?:Arrowhead; label?:string; labelSize?:number }
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
export interface ReferenceTarget {kind:'card'|'board';key:string;path:string;name:string}
export interface CheckpointChange {path:string;added:number|null;removed:number|null}
export interface Checkpoint { color?:number; id: string; parents: string[]; time: number; label: string; active: boolean }
export interface TrashEntry extends CardInfo {kind?:'file'|'folder';archive?:string;originalPath?:string;deleted:number}
export interface FileEntry {name:string;path:string;kind:'folder'|'file'|'symlink'}
export interface FileInspection {kind:'text'|'image'|'binary';size:number;text?:string}
export interface RegisteredWorkspace {root:string;name:string;status:'available'|'missing'|'unavailable'|'not-folder';lastUpdated:number|null}
export type WhiteboardInput = 'auto' | 'mouse' | 'trackpad';
export interface PaletteColor {id:string;name:string;color:string}
export interface DateDisplay {format:'full'|'short'|'mdy'|'dmy'|'ymd';timeFormat:'12'|'24';timeZone:string}
export interface Preferences { whiteboardText?:{fontSize?:number;textColor?:string}; reading?:import('./reading').ReadingSettings; actionHub?:import('./action-hub').HubButton[]; keybindings?:import('./keybindings').Keybindings; graphMode?:import('./graph').GraphMode; features?:Partial<Record<CoreFeature,boolean>>; boardNavigation?:BoardNavigation; workspaceName?:string; journal?:JournalSettings; templates?:TemplateSettings; whiteboardName?:string; editor?:EditorSettings; cardFolder?:string; tagsFolder?:string; trashFolder?:string; query?:QueryPreferences; dateDisplay?:DateDisplay; tagColors?:Record<string,string>; palette?:PaletteColor[]; whiteboardInput?:WhiteboardInput; newSplitDirection?:'row'|'column'; docks?:Docks; documents?:DocumentsLayout; navigation?:Partial<Record<ModuleId,NavigationMemory>>; explorerMode?:'whiteboards'|'files'; theme: 'light' | 'dark' | 'system'; titlePlaceholder?:string; stem: string; starred: string[]; recent: string[]; icons: Record<string,string> }
export const TAG_FIELD_TYPES=['text','number','boolean','date','select','status','link'] as const;
// Read old definitions without rewriting them just because they were opened.
export const LEGACY_TAG_FIELD_TYPES=['multi-select','url','email','phone'] as const;
export type TagFieldType=typeof TAG_FIELD_TYPES[number]|typeof LEGACY_TAG_FIELD_TYPES[number];
export const STATUS_GROUPS=['todo','inProgress','done'] as const;
export type TagDateRange={start:string;end:string};
export type TagValue=string|number|boolean|string[]|TagDateRange|null;
export interface TagField {optional?:boolean;key:string;type:TagFieldType;label?:string;description?:string;options?:string[];multiple?:boolean;statusGroups?:Record<typeof STATUS_GROUPS[number],string[]>;default?:TagValue}
export interface TagInfo { body?:string; path:string;name:string;tag:string;revision:string;fields:TagField[];inherits:string[];propertiesCollapsed?:boolean;overrides:(Partial<TagField>&{key:string})[] }
export interface ResolvedTagField extends TagField {propertyKey:string;sourceTag:string}
export interface CardProperties {revision:string;properties:Record<string,unknown>}
export interface ViewResults {scopeTags?:string[];rows:TagResult[];total:number;columns?:{value:string;ids:string[];total:number}[];nextOffset?:number}
export interface ViewCardMove {owner:{path:string;expected:string;block:number;source:string};view:string;card:{path:string;expected:string};from:string;to:string;before?:string;after?:string;date?:TagValue}
export interface TagResult { previewImage?:string;snippet?:string; card: CardInfo; properties: Record<string,unknown> }
export interface Snapshot { lastEdgeStyle?:EdgeStyle; pathMoves?:BoardMove[]; assetKey?: string; root: string; name: string; cards: CardInfo[]; boards: Board[]; issues: string[]; historyAvailable: boolean; folders?: string[]; tags?: TagInfo[]; preferences?: Preferences }
export interface Edit { path: string; before: string | null; after: string | null }
export interface BoardMove { from:string; to:string }
export interface Deletion {changes:Write[]; nonEmpty:string[]}
export interface Mutation { snapshot: Snapshot; edits: Edit[]; move?:BoardMove }
export interface Write { path: string; content: string | null; expected: string | null }
export interface FileOperation {action:'copy'|'move'|'trash'|'restore';path:string;destination?:string;expected?:string;position?:{x:number;y:number};boards?:Write[]}
export interface FileMutation extends Mutation {path:string;inverse:FileOperation}
export interface BoardTransfer {moves:{from:string;to:string;expected:string}[];changes:Write[]}
export interface TransferMutation extends Mutation {inverse:BoardTransfer}
export interface ReadingImport {missingImages?:string[];name:string;type:'pdf'|'web';data:Uint8Array;url?:string;body?:string;folder?:string;feed?:string;entry?:string}
export type Request =
  | {kind:'importReading';value:ReadingImport}
  | {kind:'readingProgress';path:string;expected:string;value:import('./reading').ReadingProgress}
  | {kind:'readingFeeds'}
  | {kind:'saveReadingFeeds';source:string;expected:string|null}
  | { kind: 'open'; root: string; cache: string }
  | { kind: 'snapshot' }
  | { kind:'trashEntries' }
  | { kind:'restoreTrash';path:string;expected:string }
  | { kind:'trashCard';path:string;expected:string }
  | { kind:'journalEntries'; year:number }
  | { kind:'openJournal'; date:string; period:'daily'|'weekly';inputs?:TemplateValues }
  | { kind:'createFromTemplate'; template:string; folder:string; stem:string;inputs?:TemplateValues }
  | {kind:'templatePlan';template:string}
  | {kind:'ensureSystemGuide';id:import('./features').SystemEntry}
  | { kind:'createTemplate';period?:'daily'|'weekly' }
  | { kind: 'boardMentions'; path:string }
  | { kind:'workspaceGraph' }
  | {kind:'fileOperation';operation:FileOperation}
  | {kind:'moveSelection';source:string;expected:string;ids:string[];destination:string;destinationExpected:string;x:number;y:number}
  | {kind:'transfer';operation:BoardTransfer}
  | {kind:'prepareBoardTrash';folder:string}
  | { kind: 'listFiles'; path:string }
  | { kind: 'inspectFile'; path:string }
  | { kind: 'preferences'; patch: Partial<Preferences> }
  | {kind:'ensureFolder';path:string}
  | {kind:'createEntry';folder:string;name:string;type:'file'|'folder'}
  | { kind: 'createFolder'; parent: string; name?: string; position?:{x:number;y:number} }
  | { kind: 'migrateRoot' }
  | { kind:'tagCards';tag:string;text?:string;offset?:number }
  | { kind:'createTag';tag:string }
  | { kind:'saveTag';path:string;expected:string;fields:TagField[];inherits:string[];createParent?:string;propertiesCollapsed?:boolean }
  | { kind:'renameTagProperty';path:string;expected:string;key:string;name:string }
  | { kind:'cardProperties';path:string }
  | { kind:'setCardTag';path:string;expected:string;tag:string;add:boolean;create?:boolean }
  | { kind:'reorderCardTags';path:string;expected:string;tags:string[] }
  | { kind:'reorderTagProperties';path:string;expected:string;tag:string;keys:string[] }
  | { kind:'addTagProperty';path:string;expected:string;tag:string;tagExpected:string;field:TagField;value:TagValue }
  | { kind:'setViewProperty';path:string;expected:string;key:string;value:TagValue }
  | { kind:'setTagProperty';path:string;expected:string;tag:string;key:string;value:TagValue }
  | {kind:'convertTopic';path:string;expected:string;placement:string|string[]}
  | { kind: 'create'; folder: string; stem: string; x: number; y: number; place?:boolean }
  | { kind: 'renameBoard'; folder:string; name:string; expected:string }
  | { kind: 'renameCard'; path:string; stem:string; expected:string }
  | { kind: 'saveCard'; path: string; body: string; expected: string; source?:string }
  | { kind: 'setFill'; cards:{path:string;expected:string}[]; color:string|null; board?:{value:Board;expected:string} }
  | { kind: 'saveBoard'; board: Board; expected: string }
  | { kind: 'query'; text: string }
  | { kind: 'queryCards'; query: CardQuery }
  | { kind:'moveViewCard';move:ViewCardMove }
  | { kind:'createViewCard';owner:ViewCardMove['owner'];view:string;choice:number;column?:string;date?:TagValue }
  | { kind:'placeCard';id:string;expected:string;board:string;boardExpected:string;x:number;y:number;mode:'move'|'reference'|'move-reference';source?:string;placement?:string }
  | { kind:'viewCards';source:string;view:string;offset?:number }
  | { kind:'saveTagBody';path:string;expected:string;body:string }
  | { kind: 'queryTags'; text:string;exclude?:string[];limit?:number }
  | { kind: 'searchWorkspace'; text:string }
  | { kind: 'queryReferences';text:string;cardsOnly?:boolean;exclude?:string[] }
  | {kind:'extractAssetNote';path:string;expected:string;note:string;folder:string;boardExpected:string;x:number;y:number}
  | { kind: 'createSlipboxCard';name:string;board?:{folder:string;expected:string;x:number;y:number} }
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
export interface UpdateState {currentVersion:string;status:'idle'|'checking'|'up-to-date'|'available'|'downloading'|'ready'|'installing'|'error';canInstall:boolean;version?:string;progress?:number;message?:string}
export type WindowAction = 'close' | 'reload' | 'update';
export interface Bridge {
  chooseReadingFiles():Promise<{imports:(Mutation&{path:string})[];errors:string[]}>;
  importReading(value:ReadingImport):Promise<Mutation&{path:string}>;
  capturePage(url:string):Promise<Mutation&{path:string}>;
  capturePairing():Promise<{port:number;token:string;workspace:string;name:string}>;
  refreshFeed(url:string,limit:number):Promise<{imported:number}>;
  attachmentData(path:string):Promise<Uint8Array>;
  updateState():Promise<UpdateState>;
  checkUpdates():Promise<UpdateState>;
  downloadUpdate():Promise<UpdateState>;
  installUpdate():Promise<void>;
  openDownloadPage():Promise<void>;
  onUpdateChange(callback:(state:UpdateState)=>void):()=>void;
  resolveImage(notePath:string,source:string):Promise<string[]>;
  importImageLink(notePath:string,url:string):Promise<{src:string;alt:string}>;
  importImage(notePath:string,name:string,type:string,data:Uint8Array):Promise<{src:string;alt:string}>;
  imageData(path:string):Promise<Uint8Array>;
  copyImage(png:Uint8Array):Promise<void>;
  appSettings():Promise<AppSettings>;
  setHardwareAcceleration(enabled:boolean):Promise<AppSettings>;
  onAppSettingsChange(callback:()=>void):()=>void;
  graphicsDiagnostics():Promise<GraphicsDiagnostics>;
  listWorkspaces(refresh?:boolean):Promise<RegisteredWorkspace[]>;
  reorderWorkspaces(roots:string[]):Promise<RegisteredWorkspace[]>;
  renameWorkspace(root:string,name:string):Promise<RegisteredWorkspace[]>;
  relinkWorkspace(root:string):Promise<RegisteredWorkspace[]>;
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
export const DEFAULT_CARD_FOLDER='Slipbox';
export const DEFAULT_WHITEBOARD_NAME='A new board';
export const COLLAPSED_CARD_HEIGHT=70;
export function placementHeight(placement:Placement){return placement.collapsed?COLLAPSED_CARD_HEIGHT:placement.height;}
