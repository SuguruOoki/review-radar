import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { parseHunks, parseRawDiff, snapshot, readSource } from '../dist/git.js';
import { scan } from '../dist/scanner.js';

test('unified diff keeps old/new changed line numbers',()=>{
 const h=parseHunks('@@ -10,3 +10,3 @@\n a\n-old\n+new\n z\n')[0];
 assert.deepEqual(h.addedLines,[11]);assert.deepEqual(h.removedLines,[11]);
});
test('deletion-only hunk has base-side lines',()=>{const h=parseHunks('@@ -4,2 +3,0 @@\n-one\n-two\n')[0];assert.equal(h.newCount,0);assert.deepEqual(h.removedLines,[4,5])});
test('no-newline marker does not shift line counters',()=>{const h=parseHunks('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n')[0];assert.deepEqual(h.addedLines,[1])});
test('reject a truncated diff instead of scoring it',()=>assert.throws(()=>parseHunks('@@ -1,5 +1,5 @@\n one\n'),/Truncated/));
test('raw NUL diff preserves spaces and tabs in path',()=>{const fs=parseRawDiff(':100644 100644 abc def M\0a b\tc.ts\0');assert.equal(fs[0].path,'a b\tc.ts')});
test('raw diff rejects path traversal',()=>assert.throws(()=>parseRawDiff(':100644 100644 abc def M\0../secret\0')));

test('committed scan uses pinned Git contents, not dirty worktree',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n = 2;\n');f.git('add','.');f.git('commit','-m','change');
 f.put('src/util.ts','DO NOT USE DIRTY CONTENT\n');const r=await scan(f.options({head:'HEAD'}));
 assert.match(r.candidates[0].diff,/n = 2/);assert.doesNotMatch(JSON.stringify(r),/DO NOT USE DIRTY/);
});
test('staged scan excludes later unstaged edits',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n = 2;\n');f.git('add','.');f.put('src/util.ts','unstaged marker\n');
 const r=await scan(f.options({staged:true}));assert.match(r.candidates[0].diff,/n = 2/);assert.doesNotMatch(r.candidates[0].diff,/unstaged marker/);
});
test('worktree scan includes staged plus unstaged net change',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n = 2;\n');f.git('add','.');f.put('src/util.ts','export const n = 3;\n');
 const r=await scan(f.options());assert.match(r.candidates[0].diff,/n = 3/);
});
test('untracked files are explicitly omitted unless opted in',async t=>{
 const f=fixture(t);f.put('new.ts','export const value = 3;\n');
 const omitted=await scan(f.options());assert.equal(omitted.candidates.length,0);assert.equal(omitted.omissions[0].path,'new.ts');
 const included=await scan(f.options({includeUntracked:true}));assert.equal(included.candidates[0].path,'new.ts');
});
test('deleted authorization condition triggers human requirement',async t=>{
 const f=fixture(t,{'src/access.ts':'export function allow(user) {\n  if (!user.tenantId) throw new Error("Denied");\n  return true;\n}\n'});
 f.put('src/access.ts','export function allow(user) {\n  return true;\n}\n');const r=await scan(f.options());
 assert.equal(r.candidates[0].required,true);assert.equal(r.candidates[0].focus,'authorization');assert.equal(r.candidates[0].added,0);
});
test('deleted file is retained with base evidence',async t=>{
 const f=fixture(t,{'src/auth/check.ts':'export const requireAuth = true;\n'});rmSync(join(f.root,'src/auth/check.ts'));
 const r=await scan(f.options());assert.equal(r.candidates[0].status,'D');assert.equal(r.candidates[0].evidence[0].side,'base');assert.equal(r.candidates[0].required,true);
});
test('excluded lockfile is listed, never silently marked safe',async t=>{
 const f=fixture(t,{'package-lock.json':'{"v":1}\n'});f.put('package-lock.json','{"v":2}\n');
 const r=await scan(f.options());assert.equal(r.candidates.length,0);assert.equal(r.omissions.length,1);assert.equal(r.complete,false);
});
test('secrets path creates manual placeholder with no content',async t=>{
 const f=fixture(t,{'.env':'TOP_SECRET=hiddenBefore\n'});f.put('.env','TOP_SECRET=hiddenAfter\n');const r=await scan(f.options());
 assert.equal(r.candidates[0].providerStatus,'not_applicable');assert.doesNotMatch(JSON.stringify(r),/hiddenBefore|hiddenAfter/);
});
test('symlink is not followed',async t=>{
 const f=fixture(t);symlinkSync('/etc/passwd',join(f.root,'link.ts'));f.git('add','link.ts');
 const r=await scan(f.options());assert.equal(r.candidates[0].providerStatus,'not_applicable');assert.doesNotMatch(JSON.stringify(r),/root:x:/);
});
test('binary change is left for manual inspection',async t=>{
 const f=fixture(t,{'asset.bin':Buffer.from([0,1,2])});f.put('asset.bin',Buffer.from([0,2,3]));
 const r=await scan(f.options());assert.equal(r.candidates[0].providerStatus,'not_applicable');assert.equal(r.candidates[0].required,true);
});
test('mode-only change is retained',async t=>{
 const f=fixture(t,{'script.sh':'#!/bin/sh\necho hello\n'});chmodSync(join(f.root,'script.sh'),0o755);
 const r=await scan(f.options());assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].providerStatus,'not_applicable');
});
test('unit limit exposes unanalysed remainder',async t=>{
 const f=fixture(t,{'a.ts':'a\n','b.ts':'b\n'});f.put('a.ts','aa\n');f.put('b.ts','bb\n');const o=f.options();o.config.limits.maxUnits=1;
 const r=await scan(o);assert.equal(r.candidates.length,1);assert.ok(r.omissions.length);assert.equal(r.complete,false);
});
test('filenames do not execute shell expressions',async t=>{
 const path='src/$(touch HACKED).ts';const f=fixture(t,{[path]:'one\n'});f.put(path,'two\n');const r=await scan(f.options());assert.equal(r.candidates[0].path,path);
 assert.throws(()=>readSource(snapshot(f.options()),'HACKED','head',100));
});
test('mismatched CI revision is unknown',async t=>{
 const f=fixture(t);f.put('src/util.ts','two\n');f.git('add','.');f.git('commit','-m','change');f.put('ci.json',JSON.stringify({revision:f.base,status:'passed'}));
 const r=await scan(f.options({head:'HEAD',ci:join(f.root,'ci.json')}));assert.equal(r.ci.status,'unknown');
});
test('changed relative dependency and test are retrieved from the same target',async t=>{
 const f=fixture(t,{'src/util.ts':"import { n } from './value.js';\nexport const value = n;\n",'src/value.ts':'export const n = 1;\n','tests/util.test.ts':'test("x", () => expect(value).toBe(1));\n'});
 f.put('src/util.ts',"import { n } from './value.js';\nexport const value = n + 1;\n");const r=await scan(f.options());
 assert.ok(r.candidates[0].evidence.some(e=>e.kind==='dependency'&&e.path==='src/value.ts'));assert.ok(r.candidates[0].evidence.some(e=>e.kind==='test'));
});
test('Jev consent is mandatory and checked before Git access',async()=>{
 await assert.rejects(scan({repo:'/not/there',provider:'jev',out:'/tmp/noop',config:(await import('../dist/config.js')).DEFAULT_CONFIG}),/allow-external-data/);
});
