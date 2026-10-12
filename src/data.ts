import { SnapshotSchema, PublicItemSchema, classify, score, type Snapshot, type Item, type PublicItem } from '../shared/domain';
const KEY='tech-radar:device:v1';
type Marks=Record<string,{saved:boolean;read:boolean;dismissed:boolean}>;
type Device={marks:Marks;kept:PublicItem[];density:string;theme:string};
let current:Snapshot|null=null;let pending:Promise<Snapshot>|null=null;let generation=0;
export function readDevice():Device {
 try{const d=JSON.parse(localStorage.getItem(KEY)||'{}');const marks:Marks=Object.create(null);for(const [id,v] of Object.entries(d.marks||{}).slice(0,10000)){if(/^[a-f0-9]{24}$/.test(id)&&v&&typeof v==='object'){const m=v as Record<string,unknown>;marks[id]={saved:m.saved===true,read:m.read===true,dismissed:m.dismissed===true};}}const kept:PublicItem[]=Array.isArray(d.kept)?d.kept.slice(0,1000).flatMap((raw:unknown)=>{const item=PublicItemSchema.safeParse(raw);return item.success&&marks[item.data.id]?.saved?[item.data]:[];}):[];return {marks,kept,density:d.density==='compact'?'compact':'comfortable',theme:['dark','light','system'].includes(d.theme)?d.theme:'dark'};}catch{return {marks:Object.create(null),kept:[],density:'comfortable',theme:'dark'};}
}
function write(d:Device){localStorage.setItem(KEY,JSON.stringify(d));window.dispatchEvent(new Event('device-change'));}
export function setTheme(theme:string){const d=readDevice();d.theme=theme;write(d);}
export function mergeItem(item:PublicItem,device=readDevice()):Item {const c=classify(item.title,item.excerpt);return {...item,...c,...(device.marks[item.id]||{saved:false,read:false,dismissed:false}),score:score({...item,fit:c.fit},'for-you')};}
export async function loadSnapshot(refresh=false):Promise<Snapshot> {
 if(refresh)clearSnapshot();if(current)return current;if(pending)return pending;const revision=generation;
 pending=fetch('/data/feed.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw new Error();const parsed=SnapshotSchema.parse(await r.json());if(revision===generation)current=parsed;return parsed;}).catch(()=>{if(revision===generation)pending=null;throw new Error('Public feed unavailable. Try again when connected.');});return pending;
}
export function clearSnapshot(){generation++;current=null;pending=null;}
export async function api<T>(path:string,options:RequestInit={}):Promise<T> {
 options.signal?.throwIfAborted();const u=new URL(path,location.origin);const d=readDevice();
 if(u.pathname==='/api/preferences'){if(options.method==='PUT'){const p=JSON.parse(String(options.body));d.density=p.density==='compact'?'compact':'comfortable';write(d);}return {density:d.density} as T;}
 const snap=await loadSnapshot();options.signal?.throwIfAborted();
 const itemById=(id:string)=>snap.items.find(i=>i.id===id)||d.kept.find(i=>i.id===id);
 if(/\/feedback$/.test(u.pathname)){const id=u.pathname.split('/')[3];if(!/^[a-f0-9]{24}$/.test(id))throw new Error('Unknown discovery');const item=itemById(id);if(!item)throw new Error('Discovery no longer available');const patch=JSON.parse(String(options.body));const before=d.marks[id]||{saved:false,read:false,dismissed:false};for(const key of ['saved','read','dismissed'] as const)if(typeof patch[key]==='boolean')before[key]=patch[key];d.marks[id]=before;d.kept=d.kept.filter(i=>i.id!==id);if(before.saved){if(d.kept.length>=1000)throw new Error('Device collection is full. Remove a saved item first.');d.kept.push(item);}write(d);return mergeItem(item,d) as T;}
 if(u.pathname==='/api/sources')return {sources:snap.sources.map(s=>({...s,error:s.status==='error'?`Source status: ${s.code.replaceAll('_',' ')}`:null})),refresh:{running:false,current:null,completed:snap.sources.length,total:snap.sources.length,message:`Daily public snapshot · ${new Date(snap.generatedAt).toLocaleString()} · ${snap.version.slice(0,8)}`,nextAllowedAt:null}} as T;
 if(u.pathname.startsWith('/api/items/')){const item=itemById(u.pathname.split('/')[3]);if(!item)throw new Error('Discovery no longer available');return mergeItem(item,d) as T;}
 if(u.pathname!=='/api/feed')throw new Error('Unsupported local operation');
 const p=u.searchParams;const view=p.get('view')||'feed';const publicIds=new Set(snap.items.map(i=>i.id));const all=[...snap.items,...d.kept.filter(i=>!publicIds.has(i.id))].map(i=>mergeItem(i,d));const query=(p.get('q')||'').toLowerCase().slice(0,200);const days=p.get('days')==='30'?30:7;
 const filtered=all.filter(i=>(view==='saved'?i.saved:view==='dismissed'?i.dismissed:publicIds.has(i.id)&&!i.dismissed)&&(!p.get('topic')||i.topics.some(t=>t===p.get('topic')))&&(!p.get('kind')||i.kind===p.get('kind'))&&(!p.get('source')||i.evidence.some(e=>e.source===p.get('source')))&&(!query||`${i.title} ${i.excerpt}`.toLowerCase().includes(query))&&(view!=='feed'||Date.parse(i.sourceDate||i.discoveredAt)>=Date.now()-days*86400000));
 const mode=p.get('sort')||'for-you';filtered.sort((a,b)=>mode==='latest'?Date.parse(b.sourceDate||b.discoveredAt)-Date.parse(a.sourceDate||a.discoveredAt):score(b,mode)-score(a,mode)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(filtered.length/50));const page=Math.min(pages,Math.max(1,Math.floor(Number(p.get('page')))||1));return {items:filtered.slice((page-1)*50,page*50),total:filtered.length,page,pages,counts:{all:snap.items.length,saved:all.filter(i=>i.saved).length,dismissed:all.filter(i=>i.dismissed).length}} as T;
}
