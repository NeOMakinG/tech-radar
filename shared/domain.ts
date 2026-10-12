import { z } from 'zod';
export const TOPICS = ['AI agents','Local AI','Frontend','Mobile','Web3','DevTools','Data'] as const;
export const KINDS = ['story','repository','release','article','paper'] as const;
export const BASES = ['published','shared','created','updated','discovered'] as const;
export type Topic = typeof TOPICS[number];
export const PRIVATE_VALUE = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\/(?:Users|home)\/[^\s/]+|\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\b|[\w.-]+\.ts\.net\b|\b(?:sk-ant-|ghp_|github_pat_|PRIVATE_CANARY_)[\w-]+|\bBearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [\w ]*PRIVATE KEY-----)/i;
export function publicUrl(raw: unknown): string | null {
 if(typeof raw!=='string'||raw.length>2048||PRIVATE_VALUE.test(raw))return null;
 try {const u=new URL(raw);const h=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!h.includes('.')||h.includes(':')||/^\d+\./.test(h)||h==='localhost'||/\.(local|localhost|internal|lan|test|invalid)$/.test(h)||h.endsWith('.ts.net'))return null;
 for(const key of u.searchParams.keys())if(/token|secret|password|credential|auth|api.?key/i.test(key))return null;
 u.hash='';return u.toString();}catch{return null;}
}
export function text(value:unknown,limit=300):string {
 const raw=typeof value==='string'?value:'';
 const decoded=raw.slice(0,10000).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m]||' ')).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n:string)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return cp>0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):' ';});
 return decoded.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
}
export function parseDate(v:unknown,now=Date.now()):string|null {
 if(typeof v!=='string'&&typeof v!=='number')return null;
 if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(v))return null;
 const ms=typeof v==='number'?v*1000:Date.parse(v);return Number.isFinite(ms)&&ms<=now&&ms>=Date.UTC(1990,0,1)?new Date(ms).toISOString():null;
}
const rules:[Topic,RegExp][]=[['AI agents',/\b(agents?|agentic|mcp|tool.call|orchestrat\w*)\b/i],['Local AI',/\b(ollama|llama|gguf|inference|local.ai|on.device|quantiz\w*|hugging.face|mlx|vllm)\b/i],['Frontend',/\b(typescript|react|next.js|vite|frontend|css|javascript|svelte)\b/i],['Mobile',/\b(react.native|expo|mobile|android|ios|swift|flutter)\b/i],['Web3',/\b(web3|wallet|ethereum|solana|blockchain|smart.contract|defi|signing)\b/i],['DevTools',/\b(node.js|nodejs|bun|deno|developer|devtool\w*|cli|debug\w*|security|runtime|sdk|compiler|git|docker)\b/i],['Data',/\b(sqlite|database|postgres|data.pipeline|vector|retrieval|data.engineer\w*)\b/i]];
export function classify(title:string,excerpt:string){const matches=rules.filter(([,re])=>re.test(`${title} ${excerpt}`));const topics:Topic[]=matches.length?matches.map(([t])=>t):['DevTools'];return {topics,fit:Math.min(100,matches.length*25),why:matches.length?topics.map(t=>`Public title or excerpt contains ${t.toLowerCase()} topic terms.`):['Collected from a public engineering source; no specific topic terms matched.']};}
const safeText=(max:number)=>z.string().max(max).refine(v=>!PRIVATE_VALUE.test(v),'Private value rejected');
const safeUrl=z.string().refine(v=>publicUrl(v)!==null,'Public URL required');
const iso=z.string().datetime();
export const EvidenceSchema=z.object({source:z.string().regex(/^[a-z0-9-]{1,40}$/),url:safeUrl,observedAt:iso,popularity:z.number().nonnegative().max(1e9).nullable(),popularityLabel:safeText(40).nullable()}).strict();
export const PublicItemSchema=z.object({id:z.string().regex(/^[a-f0-9]{24}$/),title:safeText(240).refine(v=>v.length>0),url:safeUrl,excerpt:safeText(300),kind:z.enum(KINDS),source:z.string().regex(/^[a-z0-9-]{1,40}$/),publishedAt:iso.nullable(),sourceDate:iso.nullable(),sharedAt:iso.nullable(),dateBasis:z.enum(BASES),discoveredAt:iso,observedAt:iso,topics:z.array(z.enum(TOPICS)).max(7),popularity:z.number().nonnegative().max(1e9),popularityLabel:safeText(40),evidence:z.array(EvidenceSchema).max(10)}).strict();
export type PublicItem=z.infer<typeof PublicItemSchema>;
export const SourceSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),name:safeText(80),family:safeText(40),url:safeUrl,status:z.enum(['ok','error','idle']),lastAttempt:iso.nullable(),lastSuccess:iso.nullable(),code:z.enum(['ok','unavailable','rate_limited','invalid_response','pending']),backoffUntil:iso.nullable(),count:z.number().int().nonnegative().max(5000)}).strict();
export const SnapshotSchema=z.object({schemaVersion:z.literal(1),version:z.string().regex(/^[a-f0-9]{64}$/),generatedAt:iso,items:z.array(PublicItemSchema).max(5000),sources:z.array(SourceSchema).max(20)}).strict();
export type Snapshot=z.infer<typeof SnapshotSchema>;
export type SourceState=z.infer<typeof SourceSchema>&{error?:string|null};
export type RefreshState={running:boolean;current:string|null;completed:number;total:number;message:string;nextAllowedAt:string|null};
export type Item=PublicItem&{saved:boolean;read:boolean;dismissed:boolean;why:string[];fit:number;score:number};
export type Candidate={title:string;url:string;excerpt?:string;source:string;kind:typeof KINDS[number];publishedAt?:string|null;sourceDate?:string|null;sharedAt?:string|null;dateBasis?:typeof BASES[number];popularity?:number;popularityLabel?:string;stableId?:string};
export function score(i:{fit:number;popularity:number;sourceDate:string|null;discoveredAt:string},mode:string,now=Date.now()) {const recency=100*Math.exp(-Math.max(0,now-Date.parse(i.sourceDate||i.discoveredAt))/432000000);const popularity=Math.min(100,20*Math.log10(1+i.popularity));return mode==='popular'?popularity*.7+recency*.3:i.fit*.6+recency*.25+popularity*.15;}
