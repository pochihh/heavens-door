import type {CardInfo,Snapshot} from '../shared';
import {READLATER_STATUS,DEFAULT_READING_STATUS} from '../reading';
import {resolveTag} from '../tags';
import {PropertyInput} from './PropertyValue';
import type {Session} from './session';
export const readingStatusField=(snapshot:Snapshot)=>resolveTag(snapshot.tags??[],'readlater').fields.find(f=>f.propertyKey===READLATER_STATUS)??DEFAULT_READING_STATUS;
export function ReadingStatus({card,snapshot,session}:{card:CardInfo;snapshot:Snapshot;session:Session}){
 return <PropertyInput field={readingStatusField(snapshot)} value={card.readLaterStatus} cards={snapshot.cards} boards={snapshot.boards} onSave={value=>session.setTagProperty(card.path,card.revision,'readlater',READLATER_STATUS,value)}/>;
}
