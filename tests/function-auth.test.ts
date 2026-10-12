import test from 'node:test';import assert from 'node:assert/strict';import { randomBytes } from 'node:crypto';
import push from '../netlify/functions/push';import dispatch from '../netlify/functions/dispatch';
test('push and dispatch fail closed without production configuration; no subscription data exposed',async()=>{
 delete process.env.CONTEXT;delete process.env.SITE_ORIGIN;
 assert.equal((await push(new Request('https://example.org/api/push/config'))).status,503);assert.equal((await dispatch(new Request('https://example.org/api/push/dispatch',{method:'POST'}))).status,503);
 const context={deploy:{context:'production',published:true,id:'fixture'}} as import('@netlify/functions').Context;const dispatchProduction=(request:Request)=>dispatch(request,context);const pushProduction=(request:Request)=>push(request,context);
 process.env.SITE_ORIGIN='https://example.org';process.env.PUSH_DISPATCH_SECRET=randomBytes(32).toString('base64url');
 try{const absent=await dispatchProduction(new Request('https://example.org/api/push/dispatch',{method:'POST'}));assert.equal(absent.status,401);assert.deepEqual(await absent.json(),{code:'unauthorized'});
 assert.equal((await dispatchProduction(new Request('https://example.org/api/push/dispatch',{method:'POST',headers:{Authorization:`Bearer ${randomBytes(32).toString('base64url')}`}}))).status,401);
 assert.equal((await dispatchProduction(new Request('https://example.org/api/push/dispatch',{method:'GET'}))).status,405);
 assert.equal((await dispatchProduction(new Request('https://example.org/api/push/dispatch',{method:'POST',headers:{Origin:'https://evil.org'}}))).status,403);
 assert.equal((await pushProduction(new Request('https://example.org/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))).status,403);
 assert.equal((await pushProduction(new Request('https://example.org/api/push/subscribe',{method:'POST',headers:{Origin:'https://example.org','Content-Type':'application/json'},body:'{}'}))).status,400);
 assert.equal((await pushProduction(new Request('https://example.org/api/push/config'))).status,503);
 }finally{delete process.env.CONTEXT;delete process.env.SITE_ORIGIN;delete process.env.PUSH_DISPATCH_SECRET;}
});
