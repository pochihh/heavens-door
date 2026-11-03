import {useState} from 'react';
import type {Snapshot} from '../shared';
import type {Session} from './session';
import {FileView} from './DocumentViews';
import {useConfirmation} from './Confirmation';
import {ui} from '../text/ui';

export function FileProblem({path,message,snapshot,session,onHistory}:{path:string;message:string;snapshot:Snapshot;session:Session;onHistory:()=>void}){
  const confirm=useConfirmation(),[source,setSource]=useState(false),[error,setError]=useState('');
  async function remove(){try{
    const expected=await session.bridge.request<string>({kind:'fileStamp',path});
    if(await confirm({title:ui.system.moveToTrash,message:ui.recovery.trashUnreadable(path),accept:ui.system.moveToTrash,danger:true}))await session.fileOperation({action:'trash',path,expected},ui.system.moveToTrash);
  }catch(error){setError(String(error));}}
  return <section className="document-editor"><div className="notice" role="alert"><strong>{ui.recovery.unreadableFile(path)}</strong><p>{message}</p>{error&&<p>{error}</p>}<button onClick={()=>setSource(!source)}>{ui.explorer.viewSource}</button><button onClick={onHistory}>{ui.layout.history}</button><button onClick={()=>{void session.refresh().catch(error=>setError(String(error)));}}>{ui.common.reload}</button><button className="danger" onClick={()=>void remove()}>{ui.system.moveToTrash}</button></div>{source&&<FileView path={path} snapshot={snapshot} memory={{}} onViewChange={()=>{}}/>}</section>;
}
