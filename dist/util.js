import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, unlinkSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
export function hash(value) { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
export function stableJson(v) {
    if (Array.isArray(v))
        return '[' + v.map(stableJson).join(',') + ']';
    if (v !== null && typeof v === 'object')
        return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
    return JSON.stringify(v) ?? 'null';
}
export function assert(condition, message) { if (!condition)
    throw new Error(message); }
export function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
export function bounded(v, min, max) { return finite(v) && v >= min && v <= max; }
export function clamp(n, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }
export function round(n, digits = 2) { return Number(n.toFixed(digits)); }
export function html(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function md(s) { return String(s).replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&'); }
export function safeMessage(e) { return e instanceof Error ? e.message : String(e); }
export function isTest(path) { return /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|\.(?:test|spec)\.[^/]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py)$/.test(path); }
export function safeRelative(path) {
    return !!path && !isAbsolute(path) && !path.split(/[\\/]/).some(s => s === '..' || s === '.git') && !path.includes('\0');
}
export function safeLocalRead(root, path, maxBytes) {
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
    }
    finally {
        closeSync(fd);
    }
}
export function readProvided(path, maxBytes = 200_000) {
    const full = resolve(path);
    return safeLocalRead(dirname(full), relative(dirname(full), full), maxBytes);
}
export function secureDir(path) {
    const full = resolve(path);
    let cursor = full;
    while (true) {
        if (existsSync(cursor))
            assert(!lstatSync(cursor).isSymbolicLink(), 'Refusing symlink output directory');
        const parent = dirname(cursor);
        if (parent === cursor)
            break;
        cursor = parent;
    }
    mkdirSync(full, { recursive: true, mode: 0o700 });
}
export function atomicWrite(path, contents) {
    secureDir(dirname(path));
    if (existsSync(path))
        assert(!lstatSync(path).isSymbolicLink(), 'Refusing symlink output file');
    const tmp = path + '.tmp-' + randomBytes(6).toString('hex');
    try {
        writeFileSync(tmp, contents, { mode: 0o600, flag: 'wx' });
        renameSync(tmp, path);
    }
    finally {
        if (existsSync(tmp))
            unlinkSync(tmp);
    }
}
export function globMatch(path, pattern) {
    let out = '^';
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '*' && pattern[i + 1] === '*') {
            i++;
            if (pattern[i + 1] === '/') {
                i++;
                out += '(?:.*/)?';
            }
            else
                out += '.*';
        }
        else if (c === '*')
            out += '[^/]*';
        else if (c === '?')
            out += '[^/]';
        else
            out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(out + '$').test(path);
}
const SECRET_PATH = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\.[^/]*)?|id_rsa|id_ed25519|service[-_]?account[^/]*\.json)$|\.(?:pem|key|p12|pfx|keystore)$/i;
export function sensitivePath(path) { return SECRET_PATH.test(path); }
/** Best-effort masking, not a data-loss-prevention guarantee. All remote use still needs explicit consent. */
export function redact(text) {
    let count = 0;
    const patterns = [
        /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g,
        /\b(?:sk_live_|sk_test_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g,
        /\bAKIA[A-Z0-9]{16}\b/g,
        /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
        /\bBearer\s+[A-Za-z0-9_.~+\/-]{12,}/gi,
        /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\r\n]{6,}["']/gi,
    ];
    for (const pattern of patterns)
        text = text.replace(pattern, () => { count++; return '[REDACTED]'; });
    return { text, count };
}
export function redactDeep(v) {
    let count = 0;
    function walk(x) {
        if (typeof x === 'string') {
            const r = redact(x);
            count += r.count;
            return r.text;
        }
        if (Array.isArray(x))
            return x.map(walk);
        if (object(x))
            return Object.fromEntries(Object.entries(x).map(([k, value]) => [k, walk(value)]));
        return x;
    }
    return { value: walk(v), count };
}
export function entropy(probabilities) {
    const ps = Object.values(probabilities);
    if (ps.length < 2)
        return 0;
    return Math.max(0, -ps.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0) / Math.log(ps.length));
}
//# sourceMappingURL=util.js.map