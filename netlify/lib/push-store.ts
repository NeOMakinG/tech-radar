import { getStore } from '@netlify/blobs';
import { emptyRegistry, type Registry } from './push-domain';
export async function updateRegistry<T>(mutate:(registry:Registry)=>{registry:Registry;result:T}):Promise<T>{
 const store=getStore({name:'push-subscriptions',consistency:'strong'});
 for(let attempt=0;attempt<6;attempt++){
 const previous=await store.getWithMetadata('registry',{type:'json'});const registry:Registry=previous?previous.data as Registry:emptyRegistry();const next=mutate(structuredClone(registry));
 if(next.registry.records.length>30)throw new Error('Capacity');
 const write=await store.setJSON('registry',next.registry,previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});if(write.modified)return next.result;
 await new Promise(r=>setTimeout(r,15+Math.random()*35));
 }throw new Error('Busy');
}
