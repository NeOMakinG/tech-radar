export function reply(status:number,data:unknown,extra:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
export function originAllowed(req:Request,siteOrigin:string){const origin=req.headers.get('origin');return new URL(req.url).origin===siteOrigin&&(!origin||origin===siteOrigin);}
export async function boundedJson(req:Request,max:number):Promise<unknown>{
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Invalid content type');
 if(Number(req.headers.get('content-length')||0)>max)throw new Error('Body too large');
 const reader=req.body?.getReader();if(!reader)throw new Error('Missing body');let bytes=0;const parts:Uint8Array[]=[];
 let timer:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Body deadline')),5000);});
 try{while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;bytes+=value.length;if(bytes>max)throw new Error('Body too large');parts.push(value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch(e){void reader.cancel().catch(()=>{});throw e;}finally{clearTimeout(timer);}
}
export function productionOrigin(context?:import('@netlify/functions').Context){const raw=process.env.SITE_ORIGIN;if(context?.deploy?.context!=='production'||context.deploy.published!==true||!raw)throw new Error('Unavailable');const u=new URL(raw);if(u.protocol!=='https:'||u.origin!==raw||u.username||u.password||u.port)throw new Error('Unavailable');return raw;}
