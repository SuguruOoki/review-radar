import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixture, validResponse } from './helpers.mjs';
import { resolveEndpoint } from '../dist/jev.js';
const cli=resolve('dist/cli.js');
function output(t) { const p=mkdtempSync(join(tmpdir(),'rr-output-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return p; }
function run(args,extraEnv) {
 const env={...process.env,...extraEnv};delete env.TYPESAFE_API_KEY;
 return new Promise(done=>{const p=spawn(process.execPath,[cli,...args],{env});let stderr='';p.stderr.on('data',d=>stderr+=d);p.on('close',status=>done({status,stderr}));});
}
function mockJev(t) {
 const seen=[];
 const server=createServer((req,res)=>{let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{
  const body=JSON.parse(raw);seen.push({path:req.url,authorization:req.headers.authorization});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(validResponse(body.questions)));
 });});
 t.after(()=>server.close());
 return new Promise(ready=>server.listen(0,'127.0.0.1',()=>ready({url:`http://127.0.0.1:${server.address().port}/v1/systemone`,seen})));
}

test('endpoint override accepts only loopback http URLs',()=>{
 assert.equal(resolveEndpoint(undefined),'https://api.typesafe.ai/v1/systemone');
 assert.equal(resolveEndpoint('http://127.0.0.1:8765/v1/systemone'),'http://127.0.0.1:8765/v1/systemone');
 assert.equal(resolveEndpoint('http://localhost:8765/v1/systemone'),'http://localhost:8765/v1/systemone');
 assert.equal(resolveEndpoint('http://[::1]:8765/v1/systemone'),'http://[::1]:8765/v1/systemone');
 for (const bad of ['https://evil.example/v1/systemone','http://10.0.0.5:8765/v1/systemone','http://localhost.evil.example/v1/systemone','http://127.0.0.1@evil.example/v1/systemone','https://127.0.0.1:8765/v1/systemone'])
  assert.throws(()=>resolveEndpoint(bad),/ループバック/,bad);
});
test('CLI scores through a loopback server without a key or disclosure flag, and never forwards a real key',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const out=output(t),jev=await mockJev(t);
 const p=await run(['scan','--repo',f.root,'--provider','jev','--no-cache','--out',out],{REVIEW_RADAR_JEV_ENDPOINT:jev.url});
 assert.equal(p.status,0,p.stderr);
 const r=JSON.parse(readFileSync(join(out,'report.json'),'utf8'));
 assert.equal(r.usage.requests,1);assert.equal(jev.seen.length,1);assert.equal(jev.seen[0].authorization,'Bearer local');
 assert.equal(r.candidates[0].providerStatus,'live');assert.equal(r.candidates[0].returnedModel,'jev-test-model');
 assert.match(r.warnings.join('\n'),/ローカル評価器/);
});
test('CLI refuses a non-loopback endpoint override before scanning',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');
 const p=await run(['scan','--repo',f.root,'--provider','jev','--out',output(t)],{REVIEW_RADAR_JEV_ENDPOINT:'https://evil.example/v1/systemone'});
 assert.notEqual(p.status,0);assert.match(p.stderr,/ループバック/);
});
test('remote Jev still requires the disclosure flag when no override is set',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');
 const p=await run(['scan','--repo',f.root,'--provider','jev','--out',output(t)],{REVIEW_RADAR_JEV_ENDPOINT:''});
 assert.equal(p.status,1);assert.match(p.stderr,/allow-external-data/);
});
