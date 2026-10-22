export function needsBoardView(previous:{x:number;y:number;zoom:number},next:{x:number;y:number;zoom:number},width:number,height:number){
 const ratio=next.zoom/previous.zoom;
 // The mounted set has a full viewport of overscan; density has 20% headroom.
 return ratio<.9||ratio>1.1||Math.abs(next.x-previous.x*ratio)>width*.4||Math.abs(next.y-previous.y*ratio)>height*.4;
}
