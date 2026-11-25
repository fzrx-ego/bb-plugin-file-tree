// Named layout-only boundary adapter. No SDK/RPC/data/permission registry.
import React, {useLayoutEffect,useRef,useState} from 'react';
export type DockTarget='files'|'jtbd'|'artifacts';
export const REQUEST='bb-plugin-file-tree:review-request';
export function requestDock(target:DockTarget){
 const e=new CustomEvent(REQUEST,{detail:{target},cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;
}
type Context={threadId?:string|null;projectId?:string|null};
export type DockToken={anchor:HTMLElement;epoch:string;thread:string;project:string;generation:number};
export function useDockPortal(slot:'jtbd'|'artifacts',pluginId:string,context:Context){
 const [container]=useState(()=>{
  const n=document.createElement('div');n.dataset.bbPlugin=pluginId;n.dataset.bbPluginRoot='';n.dataset.bbPortaledOverlay='';
  n.style.cssText='height:100%;min-height:0;min-width:0;overflow:hidden';return n;
 });
 const own=useRef(context);own.current=context;
 const anchor=useRef<HTMLElement|null>(null),generation=useRef(0),signature=useRef(''),alive=useRef(true);
 const [binding,setBinding]=useState({active:false,version:0});
 const previousAnchor=useRef<HTMLElement|null>(null);
 const matches=(n:HTMLElement|null)=>!!n?.isConnected&&n.dataset.bbDockThread===(own.current.threadId??'')&&n.dataset.bbDockProject===(own.current.projectId??'');
 const current=(token?:DockToken)=>{
  const n=anchor.current;
  if(!alive.current||!matches(n)||!n||n.dataset.bbDockActive!=='1'||document.visibilityState==='hidden'||container.parentElement!==n)return false;
  return !token||(token.anchor===n&&token.epoch===n.dataset.bbDockEpoch&&token.thread===(own.current.threadId??'')&&token.project===(own.current.projectId??'')&&token.generation===generation.current);
 };
 const capture=():DockToken|null=>current()?{anchor:anchor.current!,epoch:anchor.current!.dataset.bbDockEpoch!,thread:own.current.threadId??'',project:own.current.projectId??'',generation:generation.current}:null;
 useLayoutEffect(()=>{
  alive.current=true;let queued=false,disposed=false;let host:HTMLElement|null=null;
  const hostObserver=new MutationObserver(records=>{
   if(records.some(r=>!container.contains(r.target)))schedule();
  });
  function sync(){
   if(disposed)return;queued=false;
   const nodes=document.querySelectorAll<HTMLElement>(`[data-bb-review-anchor="${slot}"]`);
   const n=nodes.length===1?nodes[0]:null;anchor.current=n;
   const root=n?.closest<HTMLElement>('[data-bb-right-rail]')??null;
   if(root!==host){hostObserver.disconnect();host=root;if(host)hostObserver.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-bb-dock-active','data-bb-dock-thread','data-bb-dock-project','data-bb-dock-epoch']});}
   if(n&&matches(n)){if(container.parentElement!==n)n.appendChild(container);}else container.remove();
   const next=[n?.dataset.bbDockEpoch,own.current.threadId,own.current.projectId,current()].join('|');
   if(next!==signature.current||previousAnchor.current!==n){signature.current=next;previousAnchor.current=n;generation.current++;setBinding({active:current(),version:generation.current});}
  }
  function schedule(){if(!queued&&!disposed){queued=true;queueMicrotask(sync);}}
  const bodyObserver=new MutationObserver(schedule);bodyObserver.observe(document.body,{childList:true});
  document.addEventListener('visibilitychange',schedule);sync();
  return()=>{disposed=true;alive.current=false;generation.current++;hostObserver.disconnect();bodyObserver.disconnect();document.removeEventListener('visibilitychange',schedule);container.remove();};
 },[slot,container,context.threadId,context.projectId]);
 return {container,active:binding.active,version:binding.version,capture,current};
}
export class DockErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return{failed:true};}
 render(){return this.state.failed?<p role="alert">Панель не удалось показать. Другие области доступны.</p>:this.props.children;}
}

// Public SDK command callbacks have no KeyboardEvent/effective-binding lookup.
// Host owns key matching, conflicts, IME/repeat handling; never add a global key listener.
export const DOCK_SHORTCUTS={files:{key:"f",mod:true,alt:true},jtbd:{key:"j",mod:true,alt:true},artifacts:{key:"a",mod:true,alt:true}} as const;
export function dockShortcutHint(target:DockTarget){const mac=typeof navigator!=="undefined"&&/Mac|iPhone|iPad/.test(navigator.platform);return `По умолчанию: ${mac?"⌘⌥":"Ctrl+Alt+"}${DOCK_SHORTCUTS[target].key.toUpperCase()}; сочетание может быть изменено. Команды BB: ${mac?"⌘⇧P":"Ctrl+Shift+P"}.`;}
// An SDK callback is explicit navigation intent, including palette invocation
// after the host restores composer focus. Do not infer its origin from focus.
export function runDockCommand(target:DockTarget){if(!requestDock(target))throw new Error("Правая панель File Tree недоступна");return true;}
