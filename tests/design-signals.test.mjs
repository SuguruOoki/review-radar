import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../dist/config.js';
import { parseHunks } from '../dist/git.js';
import { detectSignals, initialAxes, rankCandidate } from '../dist/rules.js';

function candidate(signals, axes) {
  return { id: 'u1', path: 'service.ts', status: 'M', oldMode: '100644', newMode: '100644', oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 2, added: 1, removed: 1, diff: '', signals, evidence: [], axes, focus: 'design', missing: [], providerStatus: 'heuristic', uncertainty: null, score: null, knownWeight: 0, route: 'regular_review', required: false, questions: [], historyCommits: 10 };
}
const sig = (id) => ({ id, title: 't', focus: 'design', mandatory: false, evidenceId: 'E0', note: 'n' });

test('design-contract-removed: 削除行のガード節・throwを検出する', () => {
  const h = parseHunks('@@ -1,3 +1,0 @@\n-    if (price <= 0) {\n-      throw new Error("price must be positive");\n-    }\n')[0];
  assert.ok(detectSignals('service.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-contract-removed'));
});

test('design-contract-removed: assert の削除を検出する', () => {
  const h = parseHunks('@@ -1,1 +1,0 @@\n-    assert(price > 0, "price must be positive");\n')[0];
  assert.ok(detectSignals('calc.py', h, DEFAULT_CONFIG).some(s => s.id === 'design-contract-removed'));
});

test('design-contract-removed: テストファイルの assert 削除は検出しない', () => {
  const h = parseHunks('@@ -1,1 +1,0 @@\n-    Assert.assertEquals(actual, 3);\n')[0];
  assert.equal(detectSignals('service.test.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-contract-removed'), false);
});

test('design-side-effect-write: this/globalThis への代入を検出する', () => {
  const h = parseHunks('@@ -1,0 +1,2 @@\n+    this.lastApplied = price;\n+    globalThis.__appliedCount = (globalThis.__appliedCount ?? 0) + 1;\n')[0];
  assert.ok(detectSignals('service.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-side-effect-write'));
});

test('design-side-effect-write: 純粋な return 式では検出しない', () => {
  const h = parseHunks('@@ -1,0 +1,1 @@\n+    return Math.floor(price * 0.15);\n')[0];
  assert.equal(detectSignals('service.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-side-effect-write'), false);
});

test('design-side-effect-write: コンストラクタ風の代入も一致する（偽陽性はnoteで明記）', () => {
  const h = parseHunks('@@ -1,0 +1,3 @@\n+  constructor(name: string) {\n+    this.name = name;\n+  }\n')[0];
  const sigs = detectSignals('qty.ts', h, DEFAULT_CONFIG);
  assert.ok(sigs.some(s => s.id === 'design-side-effect-write'));
  assert.ok(sigs.find(s => s.id === 'design-side-effect-write').note.includes('コンストラクタ'));
});

test('design-unchecked-arithmetic: ガードのない算術を検出する', () => {
  const h = parseHunks('@@ -1,1 +1,1 @@\n-    return this.total;\n+    return this.total * 1.08;\n')[0];
  assert.ok(detectSignals('service.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-unchecked-arithmetic'));
});

test('design-unchecked-arithmetic: 同じhunkにガードがあれば検出しない', () => {
  const h = parseHunks('@@ -1,0 +1,4 @@\n+    if (price <= 0) {\n+      throw new Error("invalid price");\n+    }\n+    return price / 2;\n')[0];
  assert.equal(detectSignals('service.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-unchecked-arithmetic'), false);
});

test('design-unchecked-arithmetic: テストファイルでは検出しない', () => {
  const h = parseHunks('@@ -1,0 +1,1 @@\n+    const total = price * 1.08;\n')[0];
  assert.equal(detectSignals('calc.test.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-unchecked-arithmetic'), false);
});

test('design-stringly-typed: 文字列リテラルでの状態判別を検出する', () => {
  const h = parseHunks('@@ -1,0 +1,1 @@\n+    if (user.status === "admin") {\n')[0];
  assert.ok(detectSignals('roles.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-stringly-typed'));
});

test('design-leaky-abstraction: 4段以上のプロパティ連鎖を検出する', () => {
  const h = parseHunks('@@ -1,0 +1,1 @@\n+    return user.profile.wallet.balance.toString();\n')[0];
  assert.ok(detectSignals('report.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-leaky-abstraction'));
});

test('design-leaky-abstraction: 3段（2ドット）の慣用的な連鎖は検出しない', () => {
  const h = parseHunks('@@ -1,0 +1,1 @@\n+    const env = process.env.NODE_ENV;\n')[0];
  assert.equal(detectSignals('config.ts', h, DEFAULT_CONFIG).some(s => s.id === 'design-leaky-abstraction'), false);
});

test('design系シグナルは humanJudgment を引き上げ human_review に載る', () => {
  const signals = [sig('design-side-effect-write'), sig('design-unchecked-arithmetic')];
  const axes = initialAxes({ signals, status: 'M', historyCommits: 10 });
  assert.equal(axes.humanJudgment.value, 0.625);
  assert.equal(axes.boundary.value, 0.25);
  assert.equal(axes.impact.value, 0.5);
  const ranked = rankCandidate(candidate(signals, axes), DEFAULT_CONFIG);
  assert.equal(ranked.route, 'human_review');
});

test('design-contract-removed は impact も引き上げる', () => {
  const signals = [sig('design-contract-removed')];
  const axes = initialAxes({ signals, status: 'M', historyCommits: 10 });
  assert.equal(axes.impact.value, 0.625);
  assert.equal(axes.humanJudgment.value, 0.75);
});
