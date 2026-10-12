import { reply, boundedJson, originAllowed, productionOrigin } from '../lib/http';
import { SubscribeBody, UnsubscribeBody, admit, remove } from '../lib/push-domain';
import { updateRegistry } from '../lib/push-store';
export default async function handler(req:Request,context?:import('@netlify/functions').Context):Promise<Response>{
 let origin:string;try{origin=productionOrigin(context);}catch{return reply(503,{code:'alerts_unavailable'});}
 if(!originAllowed(req,origin))return reply(403,{code:'origin_rejected'});
 const action=new URL(req.url).pathname.split('/').at(-1);
 if(action==='config'){if(req.method!=='GET')return reply(405,{code:'method_rejected'},{Allow:'GET'});const publicKey=process.env.VAPID_PUBLIC_KEY;if(!publicKey||!/^[A-Za-z0-9_-]{87}$/.test(publicKey)||!process.env.VAPID_PRIVATE_KEY||!process.env.PUSH_DISPATCH_SECRET)return reply(503,{code:'alerts_unavailable'});return reply(200,{publicKey});}
 if(req.method!=='POST')return reply(405,{code:'method_rejected'},{Allow:'POST'});
 // Browser mutation requests must carry the exact site Origin; CORS is not enabled.
 if(req.headers.get('origin')!==origin)return reply(403,{code:'origin_rejected'});
 let body:unknown;try{body=await boundedJson(req,4096);}catch{return reply(400,{code:'invalid_request'});}
 try{
 if(action==='subscribe'){const parsed=SubscribeBody.safeParse(body);if(!parsed.success)return reply(400,{code:'invalid_subscription'});const capability=await updateRegistry(r=>{const next=admit(r,parsed.data,origin);return {registry:next.registry,result:next.token};});return reply(201,{token:capability});}
 if(action==='unsubscribe'){const parsed=UnsubscribeBody.safeParse(body);if(!parsed.success)return reply(400,{code:'invalid_request'});await updateRegistry(r=>({registry:remove(r,parsed.data.endpoint,parsed.data.token),result:true}));return reply(200,{disabled:true});}
 return reply(404,{code:'not_found'});
 }catch(e){const message=e instanceof Error?e.message:'';return reply(message==='Capacity'?429:message.startsWith('Unauthorized')?403:503,{code:message==='Capacity'?'capacity':message.startsWith('Unauthorized')?'unauthorized':'temporarily_unavailable'});}
}
export const config={path:['/api/push/config','/api/push/subscribe','/api/push/unsubscribe']};
