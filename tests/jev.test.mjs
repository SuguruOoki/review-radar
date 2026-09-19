import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture,usage,validResponse,simpleQuestions } from './helpers.mjs';
import { DEFAULT_CONFIG } from '../dist/config.js';
import { JevClient,ENDPOINT,BudgetExhausted,validateResponse,questions,buildRequest,applyJev } from '../dist/jev.js';
import { scan } from '../dist/scanner.js';

const config=()=>structuredClone(DEFAULT_CONFIG);
const req=()=>({model:'jev-latest',state:{change:'x'},questions:simpleQuestions()});
test('HTTP request uses documented endpoint, auth, body and no redirect',async()=>{
 const body=req(),stats=usage();
 const client=new JevClient({config:config(),apiKey:'test-only',usage:stats,fetcher:async(url,init)=>{assert.equal(url,ENDPOINT);assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer test-only');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),body);return Response.json(validResponse(body.questions));}});
 const result=await client.evaluate(body);assert.equal(result.response.answers.risk.score,2);assert.equal(stats.requests,1);assert.equal(stats.inputTokens,100);
});
test('reject absent question response',()=>{const q=simpleQuestions(),r=validResponse(q);delete r.answers.risk;assert.throws(()=>validateResponse(r,q))});
test('reject probabilities that do not sum to 1',()=>{const q=simpleQuestions(),r=validResponse(q);r.answers.risk.probabilities={'0':.5,'1':.5,'2':.5,'3':.5,'4':.5};assert.throws(()=>validateResponse(r,q),/sum to one/)});
test('reject NaN confidence',()=>{const q=simpleQuestions(),r=validResponse(q);r.answers.risk.confidence=NaN;assert.throws(()=>validateResponse(r,q))});
test('reject score inconsistent with distribution',()=>{const q=simpleQuestions(),r=validResponse(q);r.answers.risk.score=4;assert.throws(()=>validateResponse(r,q),/inconsistent/)});
test('reject invented evidence choice',()=>{
 const q={evidence:{type:'choice',instructions:'Choose',criteria:{E0:'real',none:'none'}}};const r=validResponse(q);r.answers.evidence.choice='E900';assert.throws(()=>validateResponse(r,q),/allowed option/);
});
test('retryable status is retried inside total budget',async()=>{
 let calls=0;const stats=usage(),body=req();const c=config();c.jev.maxRequests=3;
 const client=new JevClient({config:c,apiKey:'test',usage:stats,sleep:async()=>{},fetcher:async()=>++calls===1?new Response('',{status:429}):Response.json(validResponse(body.questions))});
 await client.evaluate(body);assert.equal(calls,2);assert.equal(stats.requests,2);assert.equal(stats.errors,1);
});
test('401 is not retried',async()=>{
 let calls=0;const stats=usage();const client=new JevClient({config:config(),apiKey:'test',usage:stats,sleep:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:401})}});
 await assert.rejects(client.evaluate(req()),/401/);assert.equal(calls,1);
});
test('hard budget counts failed attempts and stops retries',async()=>{
 const c=config();c.jev.maxRequests=1;let calls=0;const stats=usage();
 const client=new JevClient({config:c,apiKey:'test',usage:stats,sleep:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:529})}});
 await assert.rejects(client.evaluate(req()),BudgetExhausted);assert.equal(calls,1);
});
test('cache hit does not consume request budget; changed evidence invalidates',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'rr-cache-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let calls=0;const c=config(),stats=usage(),body=req();
 const client=new JevClient({config:c,apiKey:'test',usage:stats,cacheDir:dir,fetcher:async()=>{calls++;return Response.json(validResponse(body.questions))}});
 await client.evaluate(body);const second=await client.evaluate(body);assert.equal(second.cached,true);assert.equal(calls,1);assert.equal(stats.cacheHits,1);
 await client.evaluate({...body,state:{change:'different'}});assert.equal(calls,2);
});
test('TTL expiry prevents stale cache reuse',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'rr-cache-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let now=1000,calls=0;const body=req();
 const client=new JevClient({config:config(),apiKey:'test',usage:usage(),cacheDir:dir,now:()=>now,fetcher:async()=>{calls++;return Response.json(validResponse(body.questions))}});
 await client.evaluate(body);now+=25*3600000;await client.evaluate(body);assert.equal(calls,2);
});
test('verification unknown remains unscored even with high score response',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n = 2;\n');const r=await scan(f.options()),c=r.candidates[0],qs=questions(c);
 applyJev(c,validateResponse(validResponse(qs),qs),false,config());assert.equal(c.axes.verificationGap.value,null);assert.equal(c.providerStatus,'live');
});
test('Jev cannot remove deterministic mandatory condition',async t=>{
 const f=fixture(t,{'auth/test.ts':'export const a=1;\n'});f.put('auth/test.ts','export const a=2;\n');const r=await scan(f.options()),c=r.candidates[0],qs=questions(c);
 const response=validResponse(qs);for(const a of Object.values(response.answers))if(a.type==='score'){a.score=0;a.probabilities={'0':1,'1':0,'2':0,'3':0,'4':0}}
 applyJev(c,validateResponse(response,qs),false,config());assert.equal(c.route,'human_required');
});
test('request only includes supplied evidence and masks credentials',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const api_key = "sk_live_abcdefghijklmno";\n');const r=await scan(f.options()),c=r.candidates[0];
 const request=buildRequest(c,config(),r.ci);assert.doesNotMatch(JSON.stringify(request.body),/sk_live_abcdefghijklmno/);assert.ok(request.body.questions.context);assert.ok(request.body.questions.evidence.criteria.none);
});
test('weight-only change does not change model request',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=3;\n');const r=await scan(f.options()),c=r.candidates[0];const a=config(),b=config();b.weights.impact=.7;
 assert.deepEqual(buildRequest(c,a,r.ci).body,buildRequest(c,b,r.ci).body);
});
