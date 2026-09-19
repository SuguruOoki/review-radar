import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.mjs';
import { scan } from '../dist/scanner.js';
import { reportHtml, markdown,writeReport,location } from '../dist/report.js';
import { recordFeedback,evaluate,loadReport } from '../dist/feedback.js';

test('HTML escapes repository source, filenames and comments',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2; // <script>globalThis.XSS=true</script>\n');const r=await scan(f.options());r.candidates[0].path='<img src=x onerror=alert(1)>.ts';
 const html=reportHtml(r);assert.doesNotMatch(html,/<img src=x/);assert.doesNotMatch(html,/<script>globalThis.XSS/);assert.match(html,/&lt;script&gt;/);assert.match(html,/connect-src 'none'/);
});
test('Markdown fences cannot be broken by source backticks',async t=>{
 const f=fixture(t);f.put('src/util.ts','```\n</script>\n');const r=await scan(f.options());const md=markdown(r);assert.match(md,/````diff/);
});
test('deletion locations identify base, not incorrect head lines',async t=>{
 const f=fixture(t);f.put('src/util.ts','');const r=await scan(f.options());assert.match(location(r.candidates[0]),/base \/ 削除側/);
});
test('all three report formats are written and JSON loads',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const r=await scan(f.options());writeReport(r,join(f.root,'output'));
 assert.equal(loadReport(join(f.root,'output/report.json')).id,r.id);assert.match(readFileSync(join(f.root,'output/report.html'),'utf8'),/Review Radar/);assert.match(readFileSync(join(f.root,'output/report.md'),'utf8'),/全候補/);
});
test('feedback uses report and unit IDs; unknown unit rejected',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const r=await scan(f.options()),file=join(f.root,'fb.jsonl');
 assert.throws(()=>recordFeedback(r,file,'bad','no_action',1));recordFeedback(r,file,r.candidates[0].id,'bug_fix',5);
 const metrics=evaluate(r,file,5);assert.equal(metrics.labeled,1);assert.equal(metrics.precisionAmongLabeledTopK,1);assert.equal(metrics.recordedReviewMinutes,5);
});
test('unlabeled units are not interpreted as negatives',async t=>{
 const f=fixture(t,{'a.ts':'a\n','b.ts':'b\n'});f.put('a.ts','aa\n');f.put('b.ts','bb\n');const r=await scan(f.options()),file=join(f.root,'fb.jsonl');
 recordFeedback(r,file,r.candidates[0].id,'spec_decision',4);const m=evaluate(r,file,5);assert.equal(m.labelCoverage,.5);assert.equal(m.precisionAmongLabeledTopK,1);assert.equal(m.topKLabelCoverage,.5);
});
test('latest label replaces earlier outcome for metrics only',async t=>{
 const f=fixture(t);f.put('src/util.ts','n=2;\n');const r=await scan(f.options()),file=join(f.root,'fb.jsonl'),id=r.candidates[0].id;
 recordFeedback(r,file,id,'bug_fix',4);recordFeedback(r,file,id,'no_action',6);const m=evaluate(r,file,5);assert.equal(m.labeled,1);assert.equal(m.importantLabeled,0);assert.equal(readFileSync(file,'utf8').trim().split('\n').length,2);
});
test('insufficient_context label is unresolved, not negative',async t=>{
 const f=fixture(t);f.put('src/util.ts','n=2;\n');const r=await scan(f.options()),file=join(f.root,'fb.jsonl');recordFeedback(r,file,r.candidates[0].id,'insufficient_context',1);const m=evaluate(r,file,5);assert.equal(m.labeled,0);assert.equal(m.unresolvedLabels,1);assert.equal(m.precisionAmongLabeledTopK,null);
});
test('route dropdown has well-formed options for all four review routes',async t=>{
 const f=fixture(t);f.put('src/util.ts','export const n=2;\n');const r=await scan(f.options()),html=reportHtml(r);
 for(const route of ['all','human_required','human_review','context_needed','regular_review'])assert.match(html,new RegExp('<option value="'+route+'">'));
 assert.doesNotMatch(html,/<\/option\s+value=/);
});
