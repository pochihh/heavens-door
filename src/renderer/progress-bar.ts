import {ui} from '../text/ui';
// Counts rendered tasks inside this card only; code examples never become tasks.
export function updateCardProgress(root:ParentNode){
 const elements=[...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,li[data-checked],[data-progress-bar]')];
 elements.forEach((bar,index)=>{
  if(!bar.hasAttribute('data-progress-bar'))return;
  let start=0,level=0,end=elements.length;
  for(let i=index-1;i>=0;i--)if(/^H[1-6]$/.test(elements[i].tagName)){start=i;level=Number(elements[i].tagName[1]);break;}
  if(level)for(let i=index+1;i<elements.length;i++)if(/^H[1-6]$/.test(elements[i].tagName)&&Number(elements[i].tagName[1])<=level){end=i;break;}
  const tasks=elements.slice(start,end).filter(el=>el.matches('li[data-checked]')),done=tasks.filter(el=>el.dataset.checked==='true').length,total=tasks.length,percent=total?Math.round(done/total*100):0;
  const count=bar.querySelector('[data-progress-count]'),meter=bar.querySelector<HTMLElement>('[role=progressbar]'),fill=bar.querySelector<HTMLElement>('.card-progress-fill');
  if(count)count.textContent=total?`${done}/${total} (${percent}%)`:ui.editorTools.noCheckboxes;
  if(meter){meter.setAttribute('aria-valuenow',String(percent));meter.setAttribute('aria-valuetext',`${done} of ${total} tasks completed`);}
  if(fill)fill.style.width=percent+'%';
 });
}
export function progressPreview(label:string){
 const block=document.createElement('div');block.className='card-progress';block.dataset.progressBar='';
 const heading=document.createElement('div'),title=document.createElement('span'),count=document.createElement('span'),meter=document.createElement('div'),fill=document.createElement('div');
 heading.className='card-progress-heading';title.className='card-progress-label';title.textContent=label;count.dataset.progressCount='';heading.append(title,count);
 meter.className='card-progress-track';meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',label||ui.editorTools.taskProgress);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');fill.className='card-progress-fill';meter.append(fill);block.append(heading,meter);return block;
}
