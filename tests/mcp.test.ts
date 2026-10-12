import test from 'node:test';import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../netlify/functions/mcp';
test('official MCP client initializes, lists and calls read-only tools, reads resources',async()=>{
 const client=new Client({name:'public-radar-test',version:'1.0.0'});const transport=new StreamableHTTPClientTransport(new URL('https://example.org/mcp'),{fetch:async(input,init)=>handler(new Request(input as string,init))});
 await client.connect(transport);try{const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name).sort(),['get_item','list_sources','list_topics','search_news']);const topics=await client.callTool({name:'list_topics',arguments:{}});assert(!topics.isError);const search=await client.callTool({name:'search_news',arguments:{limit:2}});const data=JSON.parse((search.content as {text:string}[])[0].text);assert.equal(data.items.length,2);assert(!('saved'in data.items[0]));const item=await client.callTool({name:'get_item',arguments:{id:data.items[0].id}});assert(!item.isError);const resources=await client.listResources();assert.equal(resources.resources.length,3);const read=await client.readResource({uri:'radar://feed'});assert('text' in read.contents[0]);const feed=JSON.parse(read.contents[0].text);assert(feed.items.length>=300);
 for(const args of [{limit:51},{q:'x'.repeat(201)},{offset:-1},{sql:'SELECT private'}]){const invalid=await client.callTool({name:'search_news',arguments:args});assert.equal(invalid.isError,true);}
 await assert.rejects(()=>client.callTool({name:'save_item',arguments:{id:data.items[0].id}}));
 }finally{await client.close();}
});
test('MCP methods, origins, batches and body bounds rejected',async()=>{
 assert.equal((await handler(new Request('https://example.org/mcp'))).status,405);
 assert.equal((await handler(new Request('https://example.org/mcp',{method:'POST',headers:{Origin:'https://evil.org'}}))).status,403);
 for(const body of [JSON.stringify([]),JSON.stringify({q:'x'.repeat(17000)})])assert.equal((await handler(new Request('https://example.org/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body}))).status,400);
});
