import {Readability} from '@mozilla/readability';
import {JSDOM} from 'jsdom';
import Turndown from 'turndown';
import {webAddress} from './reading';
export function extractArticle(html:string,url:string){
  const dom=new JSDOM(html,{url:url.startsWith('file:')?url:webAddress(url)});
  try{dom.window.document.querySelectorAll('script,style,iframe,object,embed,form,button,input,video,audio,link,meta').forEach(el=>el.remove());
    const article=new Readability(dom.window.document.cloneNode(true) as Document,{charThreshold:80}).parse(),content=article?.content??dom.window.document.body.innerHTML;
    const extracted=new JSDOM(content,{url});try{const images=[...extracted.window.document.images];for(const image of images){image.setAttribute('src',image.src);image.removeAttribute('srcset');}for(const link of extracted.window.document.querySelectorAll('a'))link.setAttribute('href',link.href);
      const markdown=new Turndown({headingStyle:'atx',codeBlockStyle:'fenced'});markdown.keep(['table','thead','tbody','tr','th','td']);markdown.remove(['script','style','iframe','object','embed','form']);return {name:article?.title?.trim()||dom.window.document.title?.trim()||new URL(url).hostname,body:markdown.turndown(extracted.window.document.body.innerHTML),images:images.map(i=>i.src).filter(u=>/^(?:https?|file):/.test(u)).slice(0,100)};
    }finally{extracted.window.close();}
  }finally{dom.window.close();}
}
