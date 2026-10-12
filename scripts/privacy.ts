import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PRIVATE_VALUE } from '../shared/domain';
import { verifySnapshot } from '../collector/export';
const root=resolve(process.argv[2]||'.');
const excluded=new Set(['.git','node_modules','dist','.netlify']);
const codeRoots=new Set(['src','shared','collector','scripts','tests','public','netlify']);
const top=new Set(['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','netlify.toml','.gitignore','README.md','ARCHITECTURE.md']);
const entries:{path:string;sha256:string;bytes:number}[]=[];
function walk(path:string){for(const name of readdirSync(path)){if(excluded.has(name))continue;const full=join(path,name);const stat=lstatSync(full);const rel=relative(root,full);if(stat.isSymbolicLink())throw new Error('Symlinks are not allowed');if(stat.isDirectory()){if(path===root&&root.endsWith('tech-radar-public')&&!codeRoots.has(name))throw new Error('Unallowlisted root');walk(full);continue;}if(path===root&&root.endsWith('tech-radar-public')&&!top.has(name))throw new Error('Unallowlisted file');if(/(?:^|\/)(?:\.env|\.secrets|\.DS_Store)|\.(?:db|sqlite|map|log|pem|key)$|(?:^|\/)(?:qa|screenshots)\//i.test(rel))throw new Error('Private artifact class');const bytes=readFileSync(full);if(!/\.(png|woff2?)$/i.test(name)){const text=bytes.toString('utf8');if(PRIVATE_VALUE.test(text))throw new Error('Private value detected');if(/(?:sourceMapping(?:URL)=|\b(?:ssh|tailscale)\s+\S+)/i.test(text))throw new Error('Private operations marker');}entries.push({path:rel,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}}
try{walk(root);const path=join(root,root.endsWith('dist')?'data/feed.json':'public/data/feed.json');const feed=verifySnapshot(JSON.parse(readFileSync(path,'utf8')));console.log(JSON.stringify({verdict:'PASS',version:feed.version,items:feed.items.length,files:entries.toSorted((a,b)=>a.path.localeCompare(b.path))}));}catch{console.error('Privacy preflight rejected candidate');process.exitCode=1;}
