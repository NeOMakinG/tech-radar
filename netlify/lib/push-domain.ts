import { createHash, ECDH, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const providers=new Map([['fcm.googleapis.com',/^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:-]+$/],['updates.push.services.mozilla.com',/^\/wpush\/v2\/[A-Za-z0-9_-]+$/],['web.push.apple.com',/^\/[A-Za-z0-9_/-]+$/]]);
export function pushEndpoint(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&raw.length<=2048&&!!providers.get(u.hostname)?.test(u.pathname);}catch{return false;}}
const b64=(bytes:number)=>z.string().regex(/^[A-Za-z0-9_-]+$/).refine(s=>Buffer.from(s,'base64url').length===bytes&&Buffer.from(s,'base64url').toString('base64url')===s);
const point=b64(65).refine(s=>{try{ECDH.convertKey(Buffer.from(s,'base64url'),'prime256v1');return true;}catch{return false;}});
export const Subscription=z.object({endpoint:z.string().max(2048).refine(pushEndpoint),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:point,auth:b64(16)}).strict()}).strict();
export const SubscribeBody=z.object({subscription:Subscription,token:b64(32).optional()}).strict();
export const UnsubscribeBody=z.object({endpoint:z.string().max(2048).refine(pushEndpoint),token:b64(32)}).strict();
export type PushRecord={id:string;endpoint:string;keys:{p256dh:string;auth:string};origin:string;tokenHash:string;expiresAt:number;lastSentVersion:string|null};
export type Registry={records:PushRecord[];admissionHour:number;admissions:number;leaseUntil:number;leaseId:string|null};
export const emptyRegistry=():Registry=>({records:[],admissionHour:0,admissions:0,leaseUntil:0,leaseId:null});
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export function authorized(value:string|undefined,expectedHash:string){return !!value&&/^[A-Za-z0-9_-]{43}$/.test(value)&&timingSafeEqual(Buffer.from(hash(value),'hex'),Buffer.from(expectedHash,'hex'));}
export function admit(r:Registry,body:z.infer<typeof SubscribeBody>,origin:string,now=Date.now()):{token:string;registry:Registry}{
 const records=r.records.filter(s=>s.expiresAt>now);const id=hash(body.subscription.endpoint);const old=records.find(s=>s.id===id);const hour=Math.floor(now/3600000);const admissions=r.admissionHour===hour?r.admissions:0;
 if(old&&!authorized(body.token,old.tokenHash))throw new Error('Unauthorized subscription');if(!old&&(records.length>=30||admissions>=10))throw new Error('Capacity');
 const capability=old?body.token!:token();const fresh:PushRecord={id,endpoint:body.subscription.endpoint,keys:body.subscription.keys,origin,tokenHash:hash(capability),expiresAt:now+30*86400000,lastSentVersion:old?.lastSentVersion||null};
 return {token:capability,registry:{...r,records:[...records.filter(s=>s.id!==id),fresh],admissionHour:hour,admissions:admissions+(old?0:1)}};
}
export function remove(r:Registry,endpoint:string,capability:string){const id=hash(endpoint);const found=r.records.find(s=>s.id===id);if(found&&!authorized(capability,found.tokenHash))throw new Error('Unauthorized subscription');return {...r,records:r.records.filter(s=>s.id!==id)};}
