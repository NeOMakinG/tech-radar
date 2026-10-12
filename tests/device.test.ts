import test from 'node:test';import assert from 'node:assert/strict';
import { api,clearSnapshot,readDevice,setTheme } from '../src/data';
import { exportItem,snapshot } from '../collector/export';
import type { Item } from '../shared/domain';
test('static adapter filters, persists local feedback and saved DTO across snapshot versions without writes',async()=>{
 const storage=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)}});Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://example.org'}});Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
 const at=new Date().toISOString();const first=exportItem({title:'React mobile tooling',excerpt:'TypeScript Expo project',url:'https://example.org/react',kind:'repository',source:'github-new',sourceDate:at},at)!;const paper=exportItem({title:'Local inference paper',url:'https://example.org/paper',kind:'paper',source:'huggingface',sourceDate:at},at)!;let publicFeed=snapshot([first,paper],[],at);const calls:{path:string;method:string}[]=[];
 const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{calls.push({path:String(input),method:init?.method||'GET'});return new Response(JSON.stringify(publicFeed),{headers:{'Content-Type':'application/json'}});};clearSnapshot();
 try{let feed=await api<{items:Item[];total:number}>('/api/feed?kind=paper&days=30');assert.equal(feed.total,1);assert.equal(feed.items[0].kind,'paper');feed=await api('/api/feed?q=react&topic=Mobile&days=30');assert.equal(feed.total,1);
 await api(`/api/items/${first.id}/feedback`,{method:'PATCH',body:JSON.stringify({saved:true,read:true})});await api('/api/preferences',{method:'PUT',body:JSON.stringify({density:'compact'})});setTheme('system');assert.equal(readDevice().theme,'system');assert.equal(readDevice().density,'compact');assert.equal(readDevice().marks[first.id].saved,true);
 publicFeed=snapshot([paper],[],at);clearSnapshot();feed=await api('/api/feed?view=saved');assert.equal(feed.total,1);assert.equal(feed.items[0].id,first.id);assert.equal(feed.items[0].read,true);
 await api(`/api/items/${first.id}/feedback`,{method:'PATCH',body:JSON.stringify({dismissed:true})});feed=await api('/api/feed?view=dismissed');assert.equal(feed.total,1);await api(`/api/items/${first.id}/feedback`,{method:'PATCH',body:JSON.stringify({dismissed:false,saved:false})});assert.equal(readDevice().kept.length,0);
 assert(calls.every(c=>c.method==='GET'&&c.path==='/data/feed.json'));assert(!JSON.stringify(publicFeed).includes('"saved"'));assert(!JSON.stringify(publicFeed).includes('"density"'));
 const controller=new AbortController();controller.abort();await assert.rejects(()=>api('/api/feed',{signal:controller.signal}));
 }finally{globalThis.fetch=original;clearSnapshot();}
});
