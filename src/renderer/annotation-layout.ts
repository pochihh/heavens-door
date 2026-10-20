export interface PdfPageBox {page:number;top:number;height:number}
// Page positions and note heights are layout units: canvas zoom never changes the packing.
export function annotationPositions(notes:{id:string;page?:number;height:number}[],pages:PdfPageBox[],gap=8){
 const result=new Map<string,{top:number;column:number}>(),groups=new Map<number,typeof notes>(),occupied=new Map<number,{top:number;bottom:number}[]>();
 for(const note of notes){const page=note.page??pages[0]?.page??1;groups.set(page,[...groups.get(page)??[],note]);}
 const noted=pages.filter(p=>groups.has(p.page));
 for(let i=0;i<noted.length;i++){
  const page=noted[i],end=noted[i+1]?.top??Infinity;let top=page.top,column=0;
  for(const note of groups.get(page.page)!){
   if(top>page.top&&top+note.height>end-gap){column++;top=page.top;}
   // A very tall open comment must leave the next page's first column clear.
   if(column===0&&top+note.height>end-gap){column++;top=page.top;}
   while((occupied.get(column)??[]).some(r=>top<r.bottom+gap&&top+note.height+gap>r.top)){column++;top=page.top;}
   result.set(note.id,{top,column});occupied.set(column,[...occupied.get(column)??[],{top,bottom:top+note.height}]);top+=note.height+gap;
  }
 }
 return result;
}
