import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { secureDir } from '../dist/util.js';

test('secureDir: 出力先自体がシンボリックリンクなら拒否する', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'rr-secure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'real'));
  symlinkSync(join(root, 'real'), join(root, 'link'));
  assert.throws(() => secureDir(join(root, 'link')), /Refusing symlink output directory/);
});

test('secureDir: 祖先のシンボリックリンクは許可する（macOS の /var 相当）', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'rr-secure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'real'));
  symlinkSync(join(root, 'real'), join(root, 'link'));
  secureDir(join(root, 'link', 'out'));
  assert.ok(existsSync(join(root, 'real', 'out')));
});

test('secureDir: 通常のパスはそのまま作成できる', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'rr-secure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  secureDir(join(root, 'a', 'b'));
  assert.ok(existsSync(join(root, 'a', 'b')));
});
