import type {HTMLAttributes,ReactNode} from 'react';

export function SettingsGroup({title,scope,children,className='',...props}:HTMLAttributes<HTMLElement>&{title:string;scope?:string;children:ReactNode}){
 return <section {...props} className={'settings-group '+className} aria-label={props['aria-label']??title}><header className="settings-group-heading"><h3>{title}</h3>{scope&&<small>{scope}</small>}</header><div className="settings-card">{children}</div></section>;
}
