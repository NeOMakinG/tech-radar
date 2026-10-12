import { createHash } from 'node:crypto';
import { classify, parseDate, publicUrl, text, PublicItemSchema, SnapshotSchema, type Candidate, type PublicItem, type Snapshot } from '../shared/domain';
export function exportItem(raw:Candidate,at:string,previous?:PublicItem):PublicItem|null {
 const url=publicUrl(raw.url);const title=text(raw.title,240);const excerpt=text(raw.excerpt,300);if(!url||!title)return null;
 const u=new URL(url);for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|ref$)/i.test(k))u.searchParams.delete(k);u.searchParams.sort();
 const id=createHash('sha256').update(u.toString()).digest('hex').slice(0,24);
 const popularity=typeof raw.popularity==='number'&&Number.isFinite(raw.popularity)?Math.max(0,Math.min(1e9,raw.popularity)):0;
 const popularityLabel=text(raw.popularityLabel,40);const publishedAt=parseDate(raw.publishedAt);const sourceDate=parseDate(raw.sourceDate)||publishedAt;
 const dto={id,title,url,excerpt,kind:raw.kind,source:raw.source,publishedAt,sourceDate,sharedAt:parseDate(raw.sharedAt),dateBasis:raw.dateBasis||'discovered',discoveredAt:previous?.discoveredAt||at,observedAt:at,topics:classify(title,excerpt).topics,popularity,popularityLabel,evidence:[{source:raw.source,url,observedAt:at,popularity:raw.popularity===undefined?null:popularity,popularityLabel:popularityLabel||null}]};
 const parsed=PublicItemSchema.safeParse(dto);return parsed.success?parsed.data:null;
}
export function snapshot(items:PublicItem[],sources:Snapshot['sources'],at:string):Snapshot {
 const data={schemaVersion:1 as const,generatedAt:at,items:items.toSorted((a,b)=>a.id.localeCompare(b.id)),sources};const version=createHash('sha256').update(JSON.stringify(data)).digest('hex');return SnapshotSchema.parse({...data,version});
}
export function verifySnapshot(raw:unknown):Snapshot {const data=SnapshotSchema.parse(raw);const {version,...rest}=data;const hash=createHash('sha256').update(JSON.stringify(rest)).digest('hex');if(version!==hash)throw new Error('Snapshot integrity rejected');return data;}
