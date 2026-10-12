import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { TOPICS, KINDS } from '../../shared/domain';
import { boundedJson, reply } from '../lib/http';
import { feed } from '../lib/snapshot';
const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}]});
export function createServer(){
 const server=new McpServer({name:'tech-radar-public',version:'1.0.0'});
 const paging={limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(5000).default(0)};
 server.registerTool('search_news',{description:'Search the public snapshot. No personal reading state or live external fetching.',inputSchema:z.object({q:z.string().max(200).default(''),topic:z.enum(TOPICS).optional(),kind:z.enum(KINDS).optional(),source:z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),...paging}).strict()},async({q,topic,kind,source,limit,offset})=>{const matches=feed.items.filter(i=>(!q||`${i.title} ${i.excerpt}`.toLowerCase().includes(q.toLowerCase()))&&(!topic||i.topics.includes(topic))&&(!kind||i.kind===kind)&&(!source||i.evidence.some(e=>e.source===source)));return result({version:feed.version,total:matches.length,items:matches.slice(offset,offset+limit),offset,limit});});
 server.registerTool('list_topics',{description:'List generic public news topics.',inputSchema:z.object({}).strict()},async()=>result({topics:TOPICS}));
 server.registerTool('get_item',{description:'Read one public news item by ID.',inputSchema:z.object({id:z.string().regex(/^[a-f0-9]{24}$/)}).strict()},async({id})=>{const item=feed.items.find(i=>i.id===id);return item?result(item):{...result({code:'not_found'}),isError:true};});
 server.registerTool('list_sources',{description:'List public source definitions and sanitized availability.',inputSchema:z.object({}).strict()},async()=>result({version:feed.version,sources:feed.sources}));
 server.registerResource('public-feed','radar://feed',{description:'The complete public snapshot. No browser state.',mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(feed)}]}));
 server.registerResource('public-topics','radar://topics',{mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(TOPICS)}]}));
 server.registerResource('public-sources','radar://sources',{mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(feed.sources)}]}));
 return server;
}
export default async function handler(req:Request):Promise<Response>{
 if(req.method!=='POST')return reply(405,{code:'method_rejected'},{Allow:'POST'});
 const url=new URL(req.url);const origin=req.headers.get('origin');const allowed=new Set([url.origin,...(process.env.SITE_ORIGIN?[process.env.SITE_ORIGIN]:[])]);
 if(origin&&!allowed.has(origin))return reply(403,{code:'origin_rejected'});
 const host=req.headers.get('host');if(host&&host!==url.host)return reply(403,{code:'host_rejected'});
 let body:unknown;try{body=await boundedJson(req,16384);}catch{return reply(400,{code:'invalid_request'});}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{code:'invalid_request'});
 const server=createServer();const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try {await server.connect(transport);const incomingHeaders=new Headers(req.headers);incomingHeaders.delete('content-length');const incoming=new Request(req.url,{method:'POST',headers:incomingHeaders,body:JSON.stringify(body)});const response=await transport.handleRequest(incoming);const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers});}
 catch{return reply(500,{code:'protocol_error'});}finally{await server.close();}
}
export const config={path:'/mcp'};
