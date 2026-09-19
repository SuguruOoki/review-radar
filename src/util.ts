import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, unlinkSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function hash(value: unknown): string { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
}
export function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
export function bounded(v: unknown, min: number, max: number): v is number { return finite(v) && v >= min && v <= max; }
export function clamp(n: number, min = 0, max = 1): number { return Math.max(min, Math.min(max, n)); }
export function round(n: number, digits = 2): number { return Number(n.toFixed(digits)); }
export function html(s: unknown): string { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
export function md(s: unknown): string { return String(s).replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&'); }
export function safeMessage(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export function safeRelative(path: string): boolean {
  return !!path && !isAbsolute(path) && !path.split(/[\\/]/).some(s => s === '..' || s === '.git') && !path.includes('\0');
}
export function safeLocalRead(root: string, path: string, maxBytes: number): string {
  assert(safeRelative(path), 'Unsafe repository path');
  const rootReal = realpathSync(root), full = resolve(rootReal, path), rel = relative(rootReal, full);
  assert(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'Path leaves repository');
  let cursor = rootReal;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    assert(!lstatSync(cursor).isSymbolicLink(), 'Symlink source is not read');
  }
  const fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = fstatSync(fd);
    assert(st.isFile() && st.size <= maxBytes, 'File is not regular or exceeds byte limit');
    const buf = readFileSync(fd);
    assert(buf.length <= maxBytes && !buf.includes(0), 'Binary or oversized file');
    const text = buf.toString('utf8');
    assert(!text.includes('\uFFFD'), 'Non-UTF-8 content needs manual review');
    return text;
  } finally { closeSync(fd); }
}
export function readProvided(path: string, maxBytes = 200_000): string {
  const full = resolve(path);
  return safeLocalRead(dirname(full), relative(dirname(full), full), maxBytes);
}
export function secureDir(path: string): void {
  const full = resolve(path);
  let cursor = full;
  while (true) {
    if (existsSync(cursor)) assert(!lstatSync(cursor).isSymbolicLink(), 'Refusing symlink output directory');
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  mkdirSync(full, { recursive: true, mode: 0o700 });
}
export function atomicWrite(path: string, contents: string): void {
  secureDir(dirname(path));
  if (existsSync(path)) assert(!lstatSync(path).isSymbolicLink(), 'Refusing symlink output file');
  const tmp = path + '.tmp-' + randomBytes(6).toString('hex');
  try { writeFileSync(tmp, contents, { mode: 0o600, flag: 'wx' }); renameSync(tmp, path); }
  finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
export function globMatch(path: string, pattern: string): boolean {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '$').test(path);
}
const SECRET_PATH = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\.[^/]*)?|id_rsa|id_ed25519|service[-_]?account[^/]*\.json)$|\.(?:pem|key|p12|pfx|keystore)$/i;
export function sensitivePath(path: string): boolean { return SECRET_PATH.test(path); }
/** Best-effort masking, not a data-loss-prevention guarantee. All remote use still needs explicit consent. */
export function redact(text: string): { text: string; count: number } {
  let count = 0;
  const patterns = [
    /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g,
    /\b(?:sk_live_|sk_test_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g,
    /\bAKIA[A-Z0-9]{16}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    /\bBearer\s+[A-Za-z0-9_.~+\/-]{12,}/gi,
    /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\r\n]{6,}["']/gi,
  ];
  for (const pattern of patterns) text = text.replace(pattern, () => { count++; return '[REDACTED]'; });
  return { text, count };
}
export function redactDeep<T>(v: T): { value: T; count: number } {
  let count = 0;
  function walk(x: unknown): unknown {
    if (typeof x === 'string') { const r = redact(x); count += r.count; return r.text; }
    if (Array.isArray(x)) return x.map(walk);
    if (object(x)) return Object.fromEntries(Object.entries(x).map(([k, value]) => [k, walk(value)]));
    return x;
  }
  return { value: walk(v) as T, count };
}
export function entropy(probabilities: Record<string, number>): number {
  const ps = Object.values(probabilities); if (ps.length < 2) return 0;
  return Math.max(0, -ps.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0) / Math.log(ps.length));
}
