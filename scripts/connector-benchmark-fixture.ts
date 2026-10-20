import type {Board,CardInfo,Placement,Edge} from '../src/shared';
export function connectorBenchmarkFixture(){
 const cards:CardInfo[]=[],placements:Placement[]=[],edges:Edge[]=[],bodies:Record<string,string>={};
 const folder='Connector performance checks';
 for(let i=0;i<200;i++){
  const n=String(i+1).padStart(3,'0'),id='connector-card-'+n,path=folder+'/Card '+n+'.md',x=i%20*380,y=Math.floor(i/20)*360;
  cards.push({id,path,name:'Card '+n,title:'Card '+n,legacy:false,revision:'benchmark',fillColor:['#80aaa6','#c9838a','#91aa8b'][i%3]});
  bodies[path]=`# Card ${n}\n\nA card on a large whiteboard. Move close to an edge to reveal only nearby connectors.\n\n- One idea\n- Another idea\n\n${'Context for this card. '.repeat(8)}`;
  placements.push({id:'card-'+n,cardId:id,x,y,width:320,height:220,autoHeight:false},{id:'text-'+n,cardId:'',x:x+40,y:y+260,width:240,height:80,object:{type:'text',shape:i%3?'none':'rounded',text:'Text '+n+'\nA connected thought',fontSize:'m'}});
  edges.push({id:'edge-'+n,from:'card-'+n,to:'text-'+n,fromSide:'bottom',toSide:'top',toArrowhead:'arrow'});
 }
 const board:Board={path:folder+'/'+folder+'.whiteboard',folder,name:folder,revision:'benchmark',cards:placements,edges};
 return {board,cards,bodies};
}
