import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixture, validResponse } from './helpers.mjs';
import { scan } from '../dist/scanner.js';
import { writeReport } from '../dist/report.js';
const cli=resolve('dist/cli.js');
function output(t) { const p=mkdtempSync(join(tmpdir(),'rr-output-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return p; }
function run(args) {const env={...process.env};delete env.TYPESAFE_API_KEY;return spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env});}
function json(path) {return JSON.parse(readFileSync(path,'utf8'));}

test('CLI doctor checks local prerequisites without an API key',()=>{
 const p=run(['doctor']);assert.equal(p.status,0);const d=JSON.parse(p.stdout);assert.equal(d.typesafeApiKey,'not configured');assert.equal(d.externalRequests,0);
});
test('CLI rejects unknown options without writing a report',()=>{
 const p=run(['scan','--fictional']);assert.equal(p.status,1);assert.match(p.stderr,/Unknown flag/);
});
test('CLI Jev dry-run works without credentials or disclosure consent',t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t);
 const p=run(['scan','--repo',f.root,'--provider','jev','--dry-run','--max-requests','2','--out',out]);assert.equal(p.status,0,p.stderr);
 const r=json(join(out,'report.json'));assert.equal(r.usage.requests,0);assert.match(r.warnings.join('\n'),/DRY RUN/);
});
test('CLI live Jev mode fails before sending when key is missing',t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const p=run(['scan','--repo',f.root,'--provider','jev','--allow-external-data','--out',output(t)]);
 assert.equal(p.status,1);assert.match(p.stderr,/TYPESAFE_API_KEY/);
});
test('CLI fail-on-required distinguishes a normal exit from a review gate',t=>{
 const f=fixture(t,{'src/auth/check.ts':'export const permission=true;\n'});f.put('src/auth/check.ts','export const permission=false;\n');
 const p=run(['scan','--repo',f.root,'--fail-on-required','--out',output(t)]);assert.equal(p.status,3,p.stderr);
});
test('CLI rerank preserves model judgments and accepts only weight changes',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t),r=await scan(f.options({out}));writeReport(r,out);
 const config=structuredClone(r.config);config.weights.impact=.85;const cf=join(out,'weights.json');writeFileSync(cf,JSON.stringify(config));
 const next=join(out,'reranked');const p=run(['rerank','--report',join(out,'report.json'),'--config',cf,'--out',next]);assert.equal(p.status,0,p.stderr);
 const r2=json(join(next,'report.json'));assert.notEqual(r2.id,r.id);assert.deepEqual(r2.candidates[0].axes,r.candidates[0].axes);assert.equal(r2.usage.requests,0);
 config.thresholds.confidence=.9;writeFileSync(cf,JSON.stringify(config));const bad=run(['rerank','--report',join(out,'report.json'),'--config',cf,'--out',next]);assert.equal(bad.status,1);assert.match(bad.stderr,/weights/);
});
test('CLI feedback and evaluate work end-to-end on the saved report',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t),r=await scan(f.options({out}));writeReport(r,out);
 const fb=join(out,'feedback.jsonl');const p=run(['feedback','--report',join(out,'report.json'),'--unit',r.candidates[0].id,'--outcome','spec_decision','--minutes','7','--out',fb]);assert.equal(p.status,0,p.stderr);
 const ev=run(['evaluate','--report',join(out,'report.json'),'--feedback',fb,'--top','5']);assert.equal(ev.status,0,ev.stderr);assert.equal(JSON.parse(ev.stdout).recordedReviewMinutes,7);
});
test('full pipeline uses validated mock Jev results and stable cache report identity',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t);let calls=0;
 const previousFetch=globalThis.fetch,key=process.env.TYPESAFE_API_KEY;
 t.after(()=>{globalThis.fetch=previousFetch;if(key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=key;});
 process.env.TYPESAFE_API_KEY='test-placeholder-not-a-real-secret';globalThis.fetch=async (_url,init)=>{calls++;const body=JSON.parse(init.body);return new Response(JSON.stringify(validResponse(body.questions)),{status:200});};
 const opts=f.options({provider:'jev',allowExternalData:true,out});const live=await scan(opts);assert.equal(live.usage.requests,1);assert.equal(live.candidates[0].providerStatus,'live');assert.equal(live.candidates[0].axes.impact.source,'jev');
 const cached=await scan(opts);assert.equal(calls,1);assert.equal(cached.usage.requests,0);assert.equal(cached.usage.cacheHits,1);assert.equal(cached.candidates[0].providerStatus,'cached');assert.equal(cached.id,live.id);
});
test('full pipeline preserves a zero-budget candidate as incomplete without network calls',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t),config=f.options().config;config.jev.maxRequests=0;
 const previousFetch=globalThis.fetch,key=process.env.TYPESAFE_API_KEY;t.after(()=>{globalThis.fetch=previousFetch;if(key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=key;});
 process.env.TYPESAFE_API_KEY='test-placeholder';globalThis.fetch=async()=>{throw new Error('fetch must not be called')};
 const r=await scan(f.options({config,provider:'jev',allowExternalData:true,out}));assert.equal(r.usage.requests,0);assert.equal(r.usage.budgetSkipped,1);assert.equal(r.complete,false);assert.equal(r.candidates[0].route,'context_needed');
});
test('changing supplied specification changes report identity even with identical local axes',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t),spec=join(out,'spec.md');writeFileSync(spec,'First acceptance condition.');
 const a=await scan(f.options({context:spec,out}));writeFileSync(spec,'A different acceptance condition.');const b=await scan(f.options({context:spec,out}));assert.deepEqual(a.candidates[0].axes,b.candidates[0].axes);assert.notEqual(a.id,b.id);
});
