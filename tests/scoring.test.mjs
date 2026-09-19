import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { DEFAULT_CONFIG,validateConfig } from '../dist/config.js';
import { detectSignals,rankCandidate } from '../dist/rules.js';
import { parseHunks } from '../dist/git.js';
import { scan } from '../dist/scanner.js';
import { entropy,globMatch,redact,redactDeep } from '../dist/util.js';

test('glob double-star matches zero and multiple directories',()=>{assert.ok(globMatch('schema.prisma','**/schema.prisma'));assert.ok(globMatch('a/b/schema.prisma','**/schema.prisma'));assert.equal(globMatch('a/b/c','a/*'),false)});
test('unchanged context does not trigger critical keyword rule',()=>{
 const h=parseHunks('@@ -1,2 +1,2 @@\n const tenantId = 1;\n-const title = "a";\n+const title = "b";\n')[0];
 assert.equal(detectSignals('title.ts',h,DEFAULT_CONFIG).some(s=>s.id==='authorization-code'),false);
});
test('SQL DROP and deletion of a destructive operation are surfaced',()=>{
 for(const text of ['@@ -0,0 +1 @@\n+DROP TABLE users;\n','@@ -1 +0,0 @@\n-DELETE FROM users;\n'])assert.ok(detectSignals('db.sql',parseHunks(text)[0],DEFAULT_CONFIG).some(s=>s.id==='destructive-data'));
});
test('deleteMany call is detected with whitespace inside parentheses',()=>{
 const h=parseHunks('@@ -0,0 +1 @@\n+await prisma.user.deleteMany( {} );\n')[0];assert.ok(detectSignals('db.ts',h,DEFAULT_CONFIG).some(s=>s.id==='destructive-data'));
});
test('invalid weights and request settings fail closed',()=>{
 const c=structuredClone(DEFAULT_CONFIG);c.weights.impact=NaN;assert.throws(()=>validateConfig(c));
 const d=structuredClone(DEFAULT_CONFIG);d.jev.concurrency=0;assert.throws(()=>validateConfig(d));
 const e=structuredClone(DEFAULT_CONFIG);for(const a of Object.keys(e.weights))e.weights[a]=0;assert.throws(()=>validateConfig(e));
});
test('unknown verification stays null, not zero',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const r=await scan(f.options());assert.equal(r.candidates[0].axes.verificationGap.value,null);assert.equal(r.candidates[0].knownWeight,.75);
});
test('mandatory condition cannot be cancelled by low weighted scores',async t=>{
 const f=fixture(t,{'src/auth/a.ts':'export const valid = true;\n'});f.put('src/auth/a.ts','export const valid = false;\n');const r=await scan(f.options());const c=r.candidates[0];
 for(const a of Object.values(c.axes))a.value=0;
 rankCandidate(c,DEFAULT_CONFIG);assert.equal(c.score,0);assert.equal(c.route,'human_required');
});
test('uncertainty routes a nonmandatory unit to context, not approval',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const r=await scan(f.options());const c=r.candidates[0];c.uncertainty=.99;rankCandidate(c,DEFAULT_CONFIG);assert.equal(c.route,'context_needed');
});
test('entropy recognizes concentrated and flat distributions',()=>{assert.equal(entropy({a:1,b:0}),0);assert.ok(Math.abs(entropy({a:.5,b:.5})-1)<1e-10)});
test('common secrets are masked recursively without breaking JSON',()=>{
 const secret='sk_live_abcdefghijklmno';const obj={source:`const api_key = "${secret}";`,quote:'"\n'};const result=redactDeep(obj);assert.ok(result.count>0);assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));assert.equal(result.value.quote,'"\n');
 assert.doesNotMatch(redact('-----BEGIN PRIVATE KEY-----\nabcdef\n-----END PRIVATE KEY-----').text,/abcdef/);
});
