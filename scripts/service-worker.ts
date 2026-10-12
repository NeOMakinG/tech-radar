import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
function walk(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(path,e.name)):[join(path,e.name)]);}
const files=walk('dist').filter(p=>!p.endsWith('/sw.js'));const assets=files.map(p=>`/${p.slice(5)}`);const version=createHash('sha256').update(files.map(p=>readFileSync(p)).reduce((a,b)=>Buffer.concat([a,b]),Buffer.alloc(0))).digest('hex').slice(0,20);
const sw=`const CACHE='radar-${version}';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('radar-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const req=event.request;const u=new URL(req.url);if(req.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname==='/mcp'||u.pathname.startsWith('/.netlify/'))return;
if(req.mode==='navigate'){event.respondWith(fetch(req).then(res=>res.ok?res:Promise.reject()).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match('/index.html')||Response.error();}));return;}
if(u.pathname==='/data/feed.json'){event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const res=await fetch(req);if(!res.ok)throw new Error();const copy=res.clone();const json=await copy.json();if(json.schemaVersion!==1||!Array.isArray(json.items))throw new Error();try{await cache.put('/data/feed.json',res.clone());}catch{}return res;}catch{return await cache.match('/data/feed.json')||Response.error();}})());return;}
if(ASSETS.includes(u.pathname)){event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(u.pathname);return cached||fetch(req);})());}});
self.addEventListener('push',event=>{let data;try{data=event.data.json();}catch{return;}if(data.type!=='daily-feed'||!/^[a-f0-9]{64}$/.test(data.version))return;event.waitUntil(self.registration.showNotification('Tech radar',{body:'A fresh public engineering snapshot is ready.',icon:'/icons/radar-192.png',badge:'/icons/radar-192.png',tag:'daily-'+data.version,data:{url:'/?sort=latest'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=all.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate('/?sort=latest');await existing.focus();}else await self.clients.openWindow('/?sort=latest');})());});
`;
writeFileSync('dist/sw.js',sw);
