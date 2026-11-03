export interface BoardMeasurement {height:number;width:number;top:number;pdfHeight?:number;notes?:Record<string,{x:number;y:number}>;signature:string}
// Session-only geometry survives tab unmounts; signatures still validate each measurement.
const entries=new Map<string,BoardMeasurement>(),LIMIT=20_000;
export function boardMeasurements(board:string,ids:string[]){const result:Record<string,BoardMeasurement>={};for(const id of ids){const key=board+'\n'+id,value=entries.get(key);if(value){entries.delete(key);entries.set(key,value);result[id]=value;}}return result;}
export function rememberBoardMeasurements(board:string,values:Record<string,BoardMeasurement>){for(const [id,value] of Object.entries(values)){if(![value.width,value.height,value.top].every(Number.isFinite)||value.width<=0||value.height<=0)continue;const key=board+'\n'+id;entries.delete(key);entries.set(key,value);}while(entries.size>LIMIT)entries.delete(entries.keys().next().value!);}
