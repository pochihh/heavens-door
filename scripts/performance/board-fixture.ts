import type {Board,Card,CardInfo,Placement,Edge} from '../../src/shared';
export function boardFixture(){
  const images=new Map<string,string>();
  const cards:CardInfo[]=[],bodies=new Map<string,Card>(),placements:Placement[]=[],edges:Edge[]=[],boards:Board[]=[];
  const colors=['#c9838a','#c2aa6e','#80aaa6','#91aa8b','#a99ac4'];
  for(let i=0;i<6000;i++){
    const id='p'+i,x=i%80*420,y=Math.floor(i/80)*330;
    const base={id,cardId:'',x,y,width:320,height:240,autoHeight:false};
    if(i<2500){
      const card:Card={id:'c'+i,path:'Bench/Card '+i+'.md',name:'Card '+i,title:'Card '+i,revision:'v1',legacy:false,fillColor:colors[i%colors.length],body:`# Card ${i}\n\n${['A readable idea with **bold**, *italic* and [a link](https://example.com).','日本語の文章と中文笔记。 Unicode text stays readable.','A longer paragraph. '.repeat(24),'```cpp\nint count = '+i+';\nreturn count + 1;\n```','$$\nE = mc^2\n$$'][i%5]}\n\n- [x] Complete\n- [ ] Next\n\nAdditional context ${i}.`};
      const {body,...info}=card;cards.push(info);bodies.set(card.path,{...info,body});placements.push({...base,cardId:card.id});
    }else if(i<4500)placements.push({...base,object:{type:'text',shape:(['none','rounded','ellipse','diamond'] as const)[i%4],text:'Text '+i+'\nA connected thought',fontSize:'m'},strokeColor:colors[i%5]});
    else if(i<5800){
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${colors[i%5]}"/><path d="M0 ${i%120+20} Q150 0 320 160" fill="none" stroke="white" stroke-width="12"/><text x="15" y="180" font-size="26">Figure ${i}</text></svg>`;
      images.set('Bench/Figure '+i+'.svg','data:image/svg+xml,'+encodeURIComponent(svg));
      placements.push({...base,object:{type:'image',html:`<div data-better-edit-image="filled" style="width:320px"><img src="Figure ${i}.svg" alt="Figure ${i}"/><p>Figure ${i}</p></div>`}});
    }else if(i<5996){const folder='Bench/Board '+i;boards.push({path:folder+'/Board.whiteboard',folder,name:'Board '+i,revision:'v1',cards:[],edges:[]});placements.push({...base,folder});}
    else{
      const card:Card={id:'pdf'+i,path:'Bench/PDF '+i+'.md',name:'PDF '+i,title:'PDF '+i,body:'# PDF '+i,revision:'v1',legacy:false,source:{type:'pdf',file:'paper.pdf'}};
      const {body,...info}=card;cards.push(info);bodies.set(card.path,{...info,body});placements.push({...base,x:(i-5996)*700,y:25500,cardId:card.id,width:440,height:11400,pdf:{expanded:true}});
    }
  }
  for(let i=0;i<4000;i++)edges.push({id:'e'+i,from:'p'+i,to:'p'+(i+1),fromSide:'right',toSide:'left',toArrowhead:'arrow',strokeColor:colors[i%5],...(i%19===0?{label:'Connection '+i}:{}),strokeStyle:i%7===0?'dashed':'solid'});
  return {board:{path:'Bench/Bench.whiteboard',folder:'Bench',name:'10,000 mixed elements',revision:'v1',cards:placements,edges} satisfies Board,cards,bodies,boards,images};
}
