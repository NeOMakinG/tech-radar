import { XMLParser } from 'fast-xml-parser';
import { classify, parseDate, text, type Candidate } from '../shared/domain';
export type Source = { id:string; name:string; family:string; url:string; collect:(request:RequestFn)=>Promise<Candidate[]> };
type RequestFn=(url:string)=>Promise<unknown|null>;
const array = <T>(v:T|T[]|undefined):T[] => v ? Array.isArray(v) ? v : [v] : [];
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:false});
export const ALLOWED_HOSTS = new Set(['hn.algolia.com','api.github.com','github.com','github.blog','openai.com','huggingface.co']);
function feedSource(id:string,name:string,url:string,kind:'release'|'article',family:string):Source {
 return {id,name,url,family,async collect(request) {
  const raw=await request(url); if (raw===null) return [];
  const doc=parser.parse(String(raw)); if(typeof doc.feed!=='object' && typeof doc.rss?.channel!=='object') throw new Error('Source response is not an RSS or Atom feed');
  const entries=array<any>(doc.feed?.entry || doc.rss?.channel?.item);
  return entries.slice(0,60).map(e => {
   const links=array<any>(e.link); const link=links.find(l=>typeof l==='string' || l['@_rel']==='alternate' || !l['@_rel']);
   const publishedAt=parseDate(e.published || e.pubDate); const updatedAt=parseDate(e.updated);
   return {title:kind==='release' ? `${name}: ${text(e.title)}` : text(e.title),url:typeof link==='string'?link:link?.['@_href'] || '',excerpt:text(e.description || (typeof e.summary==='string'?e.summary:e.summary?.['#text']) || (typeof e.content==='string'?e.content:e.content?.['#text'])),publishedAt,sourceDate:publishedAt || updatedAt,dateBasis:publishedAt?'published' as const:updatedAt?'updated' as const:'discovered' as const,source:id,kind};
  });
 }};
}
export function sourceDefinitions(clock:()=>number=()=>Date.now()):Source[] {
 const hn:Source={id:'hn',name:'Hacker News',family:'Community',url:'https://news.ycombinator.com',async collect(request) {
  const cutoff=Math.floor((clock()-7*86400000)/1000);
  const items:Candidate[]=[];
  for (const query of ['', 'agent', 'react']) {
   const url=`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100&numericFilters=created_at_i%3E${cutoff}&query=${query}`;
   const data=await request(url) as any; if (!data) continue;
   if (!Array.isArray(data.hits)) throw new Error('HN response missing hits');
   for (const hit of data.hits) {
    const title=text(hit.title); const excerpt=text(hit.story_text);
    if (classify(title,excerpt).fit===0) continue;
    items.push({title,url:hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,excerpt,publishedAt:null,sourceDate:parseDate(hit.created_at),dateBasis:'shared',source:'hn',kind:'story',popularity:hit.points || 0,popularityLabel:'HN points'});
   }
  } return items;
 }};
 const repos:Source={id:'github-new',name:'New GitHub projects',family:'Repositories',url:'https://github.com/explore',async collect(request) {
  const date=new Date(clock()-30*86400000).toISOString().slice(0,10);
  const items:Candidate[]=[];
  for (const tech of ['language:TypeScript','topic:llm']) {
   const q=encodeURIComponent(`created:>=${date} stars:>=5 archived:false ${tech}`);
   const data=await request(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=50`) as any;
   if (!data) continue; if (!Array.isArray(data.items)) throw new Error('GitHub response missing items');
   for (const r of data.items) items.push({title:r.full_name,url:r.html_url,stableId:String(r.id),excerpt:text(r.description),publishedAt:null,sourceDate:parseDate(r.created_at),dateBasis:'created',source:'github-new',kind:'repository',popularity:r.stargazers_count,popularityLabel:'GitHub stars'});
  } return items;
 }};
 return [hn,repos,
  ...[['nodejs/node','Node.js'],['facebook/react','React'],['expo/expo','Expo'],['oven-sh/bun','Bun'],['denoland/deno','Deno']].map(([repo,name])=>feedSource(`release-${name.toLowerCase().replace('.js','')}`,name,`https://github.com/${repo}/releases.atom`,'release','Releases')),
  feedSource('github-blog','GitHub engineering','https://github.blog/feed/','article','Engineering'),
  feedSource('openai','OpenAI news','https://openai.com/news/rss.xml','article','Engineering'),
  {id:'huggingface',name:'Hugging Face papers',family:'Research',url:'https://huggingface.co/papers',async collect(request){
   const data=await request('https://huggingface.co/api/daily_papers');if(data===null)return [];
   if(!Array.isArray(data))throw new Error('Hugging Face response is not a paper list');
   return data.slice(0,100).flatMap((entry:any)=>{const p=entry.paper;if(!p||typeof p.id!=='string'||!/^\d{4}\.\d{4,5}(v\d+)?$/.test(p.id)||typeof p.title!=='string')return [];
    const publishedAt=parseDate(p.publishedAt);const sharedAt=parseDate(p.submittedOnDailyAt || entry.publishedAt);
    return [{title:text(p.title),url:`https://huggingface.co/papers/${p.id}`,excerpt:text(p.summary),publishedAt,sharedAt,sourceDate:publishedAt||sharedAt,dateBasis:publishedAt?'published' as const:sharedAt?'shared' as const:'discovered' as const,source:'huggingface',kind:'paper' as const,popularity:typeof p.upvotes==='number'?p.upvotes:undefined,popularityLabel:typeof p.upvotes==='number'?'HF upvotes':undefined}];
   });
  }}];
}
