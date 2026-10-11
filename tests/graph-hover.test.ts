import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {GraphCanvas} from '../src/renderer/graph-canvas';
import type {WorkspaceGraph} from '../src/graph';

test('graph hover eases in, reverses continuously, and stops without moving settled nodes',()=>{
  for(const mode of ['2d','3d'] as const)for(const reduced of [false,true]){
    const dom=new JSDOM('<canvas></canvas>',{pretendToBeVisual:true}),canvas=dom.window.document.querySelector('canvas')!;
    let now=0,id=0;const frames=new Map<number,FrameRequestCallback>(),originalPerformance=globalThis.performance;
    const circles:{x:number;y:number;radius:number;alpha:number;color:string}[]=[],labels:{name:string;alpha:number}[]=[],links:number[]=[],noop=()=>{};
    let circle:{x:number;y:number;radius:number}|undefined;
    const context={
      globalAlpha:1,fillStyle:'',clearRect:()=>{circles.length=labels.length=links.length=0;},setTransform:noop,
      beginPath:()=>{circle=undefined;},arc:(x:number,y:number,radius:number)=>{circle={x,y,radius};},
      fill:()=>{if(circle)circles[context.fillStyle==='#222'?0:context.fillStyle==='#336699'?1:2]={...circle,alpha:context.globalAlpha,color:String(context.fillStyle)};},
      stroke:()=>{if(!circle)links.push(context.globalAlpha);},setLineDash:noop,moveTo:noop,lineTo:noop,strokeText:noop,
      fillText:(name:string)=>{labels.push({name,alpha:context.globalAlpha});},measureText:(name:string)=>({width:name.length*6}),
    } as unknown as CanvasRenderingContext2D;
    canvas.getContext=(()=>context) as unknown as typeof canvas.getContext;
    canvas.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600,toJSON(){}});
    Object.assign(globalThis,{document:dom.window.document,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),
      getComputedStyle:()=>({getPropertyValue:(name:string)=>name==='--motion-normal'?(mode==='2d'?'180ms':'.18s'):''}),
      ResizeObserver:class {observe(){}disconnect(){}},MutationObserver:dom.window.MutationObserver,
      requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;},cancelAnimationFrame:(key:number)=>{frames.delete(key);},
    });Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
    const frame=(elapsed=16)=>{now+=elapsed;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));};
    const graph:WorkspaceGraph={nodes:[
      {key:'board:a',kind:'board',path:'A/A.whiteboard',name:'Board'},
      {key:'card:b',kind:'card',path:'A/b.md',name:'Card',parent:'board:a',color:'#336699'},
      {key:'card:c',kind:'card',path:'Slipbox/c.md',name:'Loose',color:'#996633'},
    ],links:[{from:'board:a',to:'card:b',kind:'membership'},{from:'board:a',to:'card:b',kind:'mention'}]};
    let hovered:string|undefined;const view=new GraphCanvas(canvas,mode,()=>{},key=>{hovered=key;});
    const snapshot=()=>circles.map(circle=>({...circle})),hover=(index:number)=>canvas.dispatchEvent(new dom.window.MouseEvent('pointermove',{clientX:circles[index].x,clientY:circles[index].y}));
    try{
      view.setData(graph);for(let n=0;frames.size&&n<500;n++)frame();assert.equal(frames.size,0);
      const initial=snapshot(),initialLinks=[...links];assert.equal(initial.length,3);hover(1);assert.equal(hovered,'card:b');
      if(reduced){assert.equal(circles[1].radius,initial[1].radius+1.8);assert.equal(labels.find(label=>label.name==='Card')?.alpha,1);assert.equal(frames.size,0);canvas.dispatchEvent(new dom.window.MouseEvent('pointerleave'));assert.deepEqual(snapshot(),initial);}
      else{
        assert.deepEqual(snapshot(),initial,'entering does not jump to the hovered appearance');frame(45);const first=snapshot(),firstLinks=[...links],firstLabel=labels.find(label=>label.name==='Card')!.alpha;
        assert.equal(first[0].alpha,1,'board interiors remain opaque while fading');assert.ok(first[1].radius>initial[1].radius&&first[1].radius<initial[1].radius+1.8);assert.ok(first[2].alpha<initial[2].alpha&&first[2].alpha>.25);assert.ok(firstLinks[0]>initialLinks[0]&&firstLinks[0]<.85);assert.ok(firstLabel>0&&firstLabel<1);
        frame(45);assert.ok(first[1].radius-initial[1].radius>circles[1].radius-first[1].radius,'ease-out slows down rather than interpolating linearly');frame(90);assert.equal(circles[1].radius,initial[1].radius+1.8);assert.equal(links[0],.85);assert.equal(labels.find(label=>label.name==='Card')!.alpha,1);assert.equal(frames.size,0);
        const focused=snapshot();hover(2);assert.deepEqual(snapshot(),focused,'switching targets continues from the current appearance');frame(45);
        assert.ok(labels.some(label=>label.name==='Card'&&label.alpha>0&&label.alpha<1));assert.ok(labels.some(label=>label.name==='Loose'&&label.alpha>0&&label.alpha<1));
        const interrupted=snapshot();canvas.dispatchEvent(new dom.window.MouseEvent('pointerleave'));assert.deepEqual(snapshot(),interrupted,'leaving during the transition does not jump');frame(45);assert.ok(circles[2].radius<interrupted[2].radius);frame(135);assert.deepEqual(snapshot(),initial);assert.deepEqual(links,initialLinks);assert.equal(frames.size,0,'no idle animation frames remain');
      }
      assert.deepEqual(circles.map(({x,y})=>({x,y})),initial.map(({x,y})=>({x,y})),'hover frames do not restart spring motion');assert.equal(circles[0].color,'#222');assert.equal(circles[0].alpha,1,'board holes continue masking lines throughout the transition');
    }finally{view.dispose();assert.equal(frames.size,0);Object.defineProperty(globalThis,'performance',{value:originalPerformance,configurable:true});dom.window.close();}
  }
});

test('graph background orbit follows horizontal and vertical drags while panning and node dragging stay direct',()=>{
  for(const mode of ['2d','3d'] as const){
    const dom=new JSDOM('<canvas></canvas>',{pretendToBeVisual:true}),canvas=dom.window.document.querySelector('canvas')!,points=new Map<string,{x:number;y:number}>(),noop=()=>{};
    let point={x:0,y:0};const context={clearRect:()=>points.clear(),setTransform:noop,beginPath:noop,arc:(x:number,y:number)=>{point={x,y};},fill:()=>points.set(String(context.fillStyle),point),stroke:noop,setLineDash:noop,moveTo:noop,lineTo:noop,strokeText:noop,fillText:noop,measureText:()=>({width:20})} as unknown as CanvasRenderingContext2D;
    canvas.getContext=(()=>context) as unknown as typeof canvas.getContext;canvas.setPointerCapture=noop;
    canvas.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600,toJSON(){}});
    Object.assign(globalThis,{document:dom.window.document,devicePixelRatio:1,matchMedia:()=>({matches:true}),getComputedStyle:dom.window.getComputedStyle,ResizeObserver:class {observe(){}disconnect(){}},MutationObserver:dom.window.MutationObserver,requestAnimationFrame:()=>1,cancelAnimationFrame:noop});
    const graph:WorkspaceGraph={nodes:['a','b','c','d'].map((id,index)=>({key:`card:${id}`,kind:'card',path:`${id}.md`,name:id,color:`#${index+1}${index+1}${index+1}${index+1}${index+1}${index+1}`})),links:[]},view=new GraphCanvas(canvas,mode,noop,noop);
    const pointer=(type:string,x:number,y:number,shiftKey=false)=>{const event=new dom.window.MouseEvent(type,{button:0,clientX:x,clientY:y,shiftKey,cancelable:true});Object.defineProperty(event,'pointerId',{value:1});canvas.dispatchEvent(event);},near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should match ${expected}`);
    try{
      view.setData(graph);const initial=points.get('#222222')!,vertical=points.get('#111111')!;pointer('pointerdown',15,15);pointer('pointermove',45,15);
      assert.ok(points.get('#222222')!.x>initial.x,`${mode}: dragging right moves the foreground node right`);pointer('pointermove',15,15);near(points.get('#222222')!.x,initial.x);
      pointer('pointermove',15,45);assert.ok(points.get('#111111')!.y>vertical.y,`${mode}: dragging down moves the foreground node down`);pointer('pointermove',15,15);near(points.get('#111111')!.y,vertical.y);pointer('pointerup',15,15);
      const beforePan=new Map(points);pointer('pointerdown',15,15);pointer('pointermove',45,45,true);pointer('pointerup',45,45,true);
      for(const [color,p] of beforePan){near(points.get(color)!.x,p.x+30);near(points.get(color)!.y,p.y+30);}
      const node=points.get('#222222')!;pointer('pointerdown',node.x,node.y);pointer('pointermove',node.x+50,node.y+25);pointer('pointerup',node.x+50,node.y+25);near(points.get('#222222')!.x,node.x+50);near(points.get('#222222')!.y,node.y+25);
    }finally{view.dispose();dom.window.close();}
  }
});
