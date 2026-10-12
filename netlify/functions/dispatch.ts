import webpush from 'web-push';
import { reply, originAllowed, productionOrigin } from '../lib/http';
import { authorized, hash, token, pushEndpoint } from '../lib/push-domain';
import { updateRegistry } from '../lib/push-store';
import { feed } from '../lib/snapshot';
export function createDispatchHandler(update:typeof updateRegistry=updateRegistry,send:typeof fetch=fetch){return async function handler(req:Request,context?:import('@netlify/functions').Context):Promise<Response>{
 let origin:string;try{origin=productionOrigin(context);}catch{return reply(503,{code:'alerts_unavailable'});}
 if(req.method!=='POST')return reply(405,{code:'method_rejected'},{Allow:'POST'});
 if(!originAllowed(req,origin))return reply(403,{code:'origin_rejected'});
 const secret=process.env.PUSH_DISPATCH_SECRET;const provided=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret)||!authorized(provided,hash(secret)))return reply(401,{code:'unauthorized'});
 // No caller-controlled text, version, URLs, endpoints or payload are accepted.
 if(Number(req.headers.get('content-length')||0)>0||req.body)return reply(400,{code:'body_rejected'});
 const publicKey=process.env.VAPID_PUBLIC_KEY;const privateKey=process.env.VAPID_PRIVATE_KEY;if(!publicKey||!privateKey)return reply(503,{code:'alerts_unavailable'});
 const leaseId=token();let ids:string[];
 try{ids=await update(r=>{if(r.leaseUntil>Date.now())throw new Error('Busy');r.records=r.records.filter(s=>s.expiresAt>Date.now());r.leaseId=leaseId;r.leaseUntil=Date.now()+55000;return {registry:r,result:r.records.filter(s=>s.lastSentVersion!==feed.version&&s.origin===origin).map(s=>s.id)};});}catch{return reply(409,{code:'dispatch_busy'});}
 let sent=0,expired=0,failed=0;const deadline=Date.now()+40000;
 const work=async()=>{while(ids.length&&Date.now()<deadline){const id=ids.shift()!;let record;
 try{record=await update(r=>{if(r.leaseId!==leaseId||r.leaseUntil<Date.now())throw new Error('Busy');const sub=r.records.find(s=>s.id===id&&s.lastSentVersion!==feed.version&&s.expiresAt>Date.now());if(!sub)return {registry:r,result:null};const copy=structuredClone(sub);sub.lastSentVersion=feed.version;return {registry:r,result:copy};});if(!record)continue;
 if(!pushEndpoint(record.endpoint))throw new Error('Invalid endpoint');
 const details=webpush.generateRequestDetails({endpoint:record.endpoint,keys:record.keys},JSON.stringify({type:'daily-feed',version:feed.version}),{TTL:86400,urgency:'normal',vapidDetails:{subject:origin,publicKey,privateKey}});
 const response=await send(details.endpoint,{method:details.method,headers:details.headers,body:details.body as any,redirect:'error',signal:AbortSignal.timeout(Math.min(6000,Math.max(1,deadline-Date.now())))});await response.body?.cancel();
 if(response.status===404||response.status===410){expired++;await update(r=>({registry:{...r,records:r.records.filter(s=>s.id!==id)},result:true}));}else if(response.ok)sent++;else failed++;
 }catch{failed++;}
 }};
 try{await Promise.all([work(),work(),work()]);return reply(200,{version:feed.version,sent,expired,failed,remaining:ids.length,semantics:'best_effort_at_most_once'});}finally{try{await update(r=>({registry:r.leaseId===leaseId?{...r,leaseId:null,leaseUntil:0}:r,result:true}));}catch{}}
};}
export default createDispatchHandler();
export const config={path:'/api/push/dispatch'};
