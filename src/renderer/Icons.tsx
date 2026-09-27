import type { ButtonHTMLAttributes } from 'react';
import { WandSparkles, Mouse, Touchpad, Map, FileText, Tag, Star, History, Search, Plus, X, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, PanelLeft, PanelRight, Columns2, Rows2, Settings, Ellipsis, Undo2, Redo2, Sparkles, PanelsTopLeft, Folder, Check, RefreshCw, Table2, SquareKanban, Type, Database, GripVertical, File, Image, FileCode, Copy, FolderOpen, ChevronsDownUp, BookOpen, Lightbulb, FlaskConical, Target, Sprout, Pin, Heart, Bookmark, Calendar, ListTodo, Music, Film, Globe, Code, Coffee, Briefcase, GraduationCap, Palette, Rocket, Link, ArrowUp, ArrowDown, Pencil, ArrowUpRight, ArrowDownRight, Minus, Bold, Italic, Heading1, Heading2, List, Quote } from 'lucide-react';
const icons={autoInput:WandSparkles,mouse:Mouse,trackpad:Touchpad,workspace:ChevronsUpDown,map:Map,note:FileText,tag:Tag,star:Star,clock:History,search:Search,plus:Plus,close:X,chevron:ChevronRight,down:ChevronDown,chevronUp:ChevronUp,left:PanelLeft,right:PanelRight,splitRight:Columns2,splitDown:Rows2,settings:Settings,more:Ellipsis,undo:Undo2,redo:Redo2,agent:Sparkles,window:PanelsTopLeft,folder:Folder,check:Check,sync:RefreshCw,table:Table2,kanban:SquareKanban,format:Type,database:Database,grip:GripVertical,file:File,image:Image,source:FileCode,copy:Copy,reveal:FolderOpen,collapse:ChevronsDownUp,book:BookOpen,idea:Lightbulb,science:FlaskConical,target:Target,plant:Sprout,pin:Pin,heart:Heart,bookmark:Bookmark,calendar:Calendar,tasks:ListTodo,music:Music,film:Film,globe:Globe,code:Code,coffee:Coffee,work:Briefcase,study:GraduationCap,art:Palette,rocket:Rocket,link:Link,up:ArrowUp,arrowDown:ArrowDown,edit:Pencil,external:ArrowUpRight,resize:ArrowDownRight,minus:Minus,bold:Bold,italic:Italic,h1:Heading1,h2:Heading2,list:List,quote:Quote};
export type IconName=keyof typeof icons;
export const documentIcons:IconName[]=['map','note','folder','tag','book','idea','science','target','plant','pin','star','heart','bookmark','calendar','tasks','music','film','image','globe','code','coffee','work','study','art','rocket','link','database','table','kanban'];
export function Icon({name,size=16}:{name:IconName;size?:number}) {
  const Component=icons[name]??File;
  return <Component size={size} strokeWidth={1.65} aria-hidden="true"/>;
}
export function DocumentIcon({value,fallback}:{value?:string;fallback:IconName}) {
  if(value?.startsWith('icon:'))return <Icon name={value.slice(5) as IconName}/>;
  return value?<span className="document-icon" aria-hidden="true">{value}</span>:<Icon name={fallback}/>;
}
export function Tool({icon,label,...props}:{icon:IconName;label:string}&ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={'tool '+(props.className??'')} data-tooltip={label} aria-label={label}><Icon name={icon}/></button>;
}
