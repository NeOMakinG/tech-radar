import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sourceDefinitions, ALLOWED_HOSTS } from './sources';
import { exportItem, snapshot, verifySnapshot } from './export';
import type { PublicItem, Snapshot } from '../shared/domain';
class Failure extends Error {constructor(readonly code:'unavailable'|'rate_limited'|'invalid_response',readonly retrySeconds=300){super(code);}}
export class Budget {
 requests=0;bytes=0;
 async request(raw:string):Promise<unknown> {
 const timer=AbortSignal.timeout(15000);let u=new URL(raw);
 for(let n=0;n<4;n++) {
 if(this.requests++>=24||u.protocol!=='https:'||!ALLOWED_HOSTS.has(u.hostname)||u.username||u.password||u.port)throw new Failure('invalid_response');
 const res=await fetch(u,{headers:{'User-Agent':'TechRadar/1.0 public-source-reader','Accept':'application/json, application/atom+xml, application/rss+xml'},signal:timer,redirect:'manual'});
 if([301,302,303,307,308].includes(res.status)){const next=res.headers.get('location');await res.body?.cancel();if(!next)throw new Failure('invalid_response');u=new URL(next,u);continue;}
 if(!res.ok){await res.body?.cancel();const retry=res.headers.get('retry-after');throw new Failure([403,429].includes(res.status)?'rate_limited':'unavailable',retry&&/^\d+$/.test(retry)?Math.max(60,Math.min(86400,Number(retry))):[403,429].includes(res.status)?3600:300);}
 const reader=res.body?.getReader();if(!reader)throw new Failure('invalid_response');let size=0;const chunks:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;this.bytes+=value.byteLength;if(size>2_000_000||this.bytes>20_000_000){await reader.cancel();throw new Failure('invalid_response');}chunks.push(value);}
 const body=Buffer.concat(chunks).toString('utf8');await new Promise(r=>setTimeout(r,300));return ['api.github.com','hn.algolia.com','huggingface.co'].includes(u.hostname)?JSON.parse(body):body;
 }throw new Failure('unavailable');
 }
}
export async function collect(previous?:Snapshot):Promise<Snapshot> {
 const budget=new Budget();const at=new Date().toISOString();const items=new Map<string,PublicItem>();const sources:Snapshot['sources']=[];let good=0;
 for(const source of sourceDefinitions()) {
 const old=previous?.sources.find(s=>s.id===source.id);const retained=previous?.items.filter(i=>i.evidence.some(e=>e.source===source.id))||[];
 let collected:PublicItem[]=[];let status:'ok'|'error'='ok';let code:Snapshot['sources'][number]['code']='ok';let backoffUntil:string|null=null;
 try{
 if(old?.backoffUntil&&Date.parse(old.backoffUntil)>Date.now())throw new Failure(old.code==='rate_limited'?'rate_limited':'unavailable',Math.ceil((Date.parse(old.backoffUntil)-Date.now())/1000));
 const candidates=await source.collect(url=>budget.request(url));collected=candidates.flatMap(c=>{const fresh=exportItem(c,at);const item=fresh?exportItem(c,at,previous?.items.find(i=>i.id===fresh.id)):null;return item?[item]:[];});
 if(!collected.length)throw new Failure('invalid_response');good++;
 }catch(e){status='error';code=e instanceof Failure?e.code:'invalid_response';backoffUntil=new Date(Date.now()+(e instanceof Failure?e.retrySeconds:300)*1000).toISOString();collected=retained;}
 for(const item of collected){const prior=items.get(item.id);items.set(item.id,prior?{...prior,evidence:[...prior.evidence,...item.evidence].filter((e,n,all)=>all.findIndex(x=>x.source===e.source)===n)}:item);}
 sources.push({id:source.id,name:source.name,family:source.family,url:source.url,status,lastAttempt:at,lastSuccess:status==='ok'?at:old?.lastSuccess||null,code,backoffUntil,count:collected.length});
 }
 if(!good)throw new Error('No healthy public sources; previous artifact unchanged');
 return snapshot([...items.values()].slice(0,5000),sources,at);
}
if(process.argv[1]?.endsWith('/run.ts')) {
 const output=resolve(process.argv[2]||'public/data/feed.json');
 try {const prior=existsSync(output)?verifySnapshot(JSON.parse(readFileSync(output,'utf8'))):undefined;const next=await collect(prior);mkdirSync(dirname(output),{recursive:true});writeFileSync(`${output}.tmp`,JSON.stringify(next));renameSync(`${output}.tmp`,output);console.log(JSON.stringify({items:next.items.length,healthy:next.sources.filter(s=>s.status==='ok').length,sources:next.sources.length,version:next.version}));}
 catch {console.error('Collection failed; previous public snapshot retained');process.exitCode=1;}
}
