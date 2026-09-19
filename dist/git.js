import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, hash, safeLocalRead, safeRelative } from './util.js';
export function git(root, args, maxBuffer = 32 * 1024 * 1024) {
    try {
        return execFileSync('git', ['--literal-pathspecs', '-C', root, '-c', 'core.pager=cat', '-c', 'core.quotePath=false', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
            encoding: 'utf8', maxBuffer, timeout: 30_000,
            env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
    }
    catch {
        // Git's stderr may contain source, unusual filenames or credentials in config; do not echo it.
        throw new Error(`Git command failed (${args[0]}). Check repository, refs, file limits and permissions.`);
    }
}
export function resolveCommit(root, ref) {
    assert(ref.length < 1024 && !/[\0\r\n]/.test(ref), 'Invalid Git ref');
    const sha = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
    assert(/^[a-f0-9]{40,64}$/.test(sha), 'Ref did not resolve to a commit');
    return sha;
}
export function diffArgs(s) {
    if (s.mode === 'staged')
        return ['--cached', s.baseSha];
    if (s.mode === 'worktree')
        return [s.baseSha];
    return [s.baseSha, s.headSha];
}
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--ignore-submodules=none'];
export function parseRawDiff(raw) {
    const parts = raw.split('\0'), files = [];
    for (let i = 0; i < parts.length && parts[i]; i += 2) {
        const match = /^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ ([A-Z])\d*$/.exec(parts[i]);
        assert(match && parts[i + 1], 'Unsupported or unmerged Git raw diff');
        const path = parts[i + 1];
        assert(safeRelative(path), 'Unsafe Git path');
        files.push({ path, oldMode: match[1], newMode: match[2], status: match[3] });
    }
    return files;
}
function trackedInventory(root, mode, headSha) {
    const result = new Map();
    const entries = mode === 'commits'
        ? git(root, ['ls-tree', '-r', '-z', headSha]).split('\0')
        : git(root, ['ls-files', '--stage', '-z']).split('\0');
    for (const e of entries) {
        if (!e)
            continue;
        const m = mode === 'commits' ? /^(\d{6}) \w+ [a-f0-9]+\t([\s\S]+)$/.exec(e) : /^(\d{6}) [a-f0-9]+ (\d)\t([\s\S]+)$/.exec(e);
        assert(m, 'Unsupported Git inventory');
        if (mode !== 'commits')
            assert(m[2] === '0', 'Unmerged index entries: resolve conflicts before scanning');
        const path = mode === 'commits' ? m[2] : m[3];
        if (safeRelative(path))
            result.set(path, m[1]);
    }
    return result;
}
export function fingerprint(s) {
    const patch = git(s.root, ['diff', ...DIFF_FLAGS, '--binary', ...diffArgs(s), '--']);
    const untracked = s.files.filter(f => f.untracked).map(f => {
        try {
            return [f.path, hash(safeLocalRead(s.root, f.path, 2_000_000))];
        }
        catch {
            return [f.path, 'unreadable'];
        }
    });
    return hash({ patch, untracked });
}
export function snapshot(options) {
    const requested = realpathSync(resolve(options.repo));
    const root = git(requested, ['rev-parse', '--show-toplevel']).trimEnd();
    assert(root.length > 0, 'Not a working Git repository');
    assert(!(options.staged && options.head), '--staged and --head cannot be combined');
    let baseSha = resolveCommit(root, options.base ?? 'HEAD');
    const mode = options.staged ? 'staged' : (options.head && options.head !== 'worktree' ? 'commits' : 'worktree');
    const headSha = mode === 'commits' ? resolveCommit(root, options.head) : null;
    if (options.mergeBase) {
        assert(mode === 'commits', '--merge-base requires a committed --head');
        baseSha = git(root, ['merge-base', baseSha, headSha]).trim();
        assert(/^[a-f0-9]{40,64}$/.test(baseSha), 'No unique merge base');
    }
    const s = { root, baseSha, headSha, mode, headLabel: mode === 'commits' ? headSha : mode, files: [], inventory: new Map(), untracked: [], diffFingerprint: '' };
    s.inventory = trackedInventory(root, mode, headSha);
    s.files = parseRawDiff(git(root, ['diff', ...DIFF_FLAGS, '--raw', '-z', ...diffArgs(s), '--']));
    if (mode === 'worktree') {
        s.untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
        if (options.includeUntracked) {
            for (const path of s.untracked) {
                assert(safeRelative(path), 'Unsafe untracked path');
                s.files.push({ path, status: 'A', oldMode: '000000', newMode: '100644', untracked: true });
                s.inventory.set(path, '100644');
            }
        }
    }
    else
        assert(!options.includeUntracked, '--include-untracked is supported only for worktree scans');
    s.diffFingerprint = fingerprint(s);
    return s;
}
export function readSource(s, path, side, maxBytes) {
    assert(safeRelative(path), 'Unsafe source path');
    if (side === 'head' && s.mode === 'worktree')
        return safeLocalRead(s.root, path, maxBytes);
    const spec = side === 'base' ? `${s.baseSha}:${path}` : (s.mode === 'staged' ? `:${path}` : `${s.headSha}:${path}`);
    const size = Number(git(s.root, ['cat-file', '-s', spec]).trim());
    assert(Number.isFinite(size) && size <= maxBytes, 'Source exceeds file byte limit');
    const text = git(s.root, ['cat-file', 'blob', spec], maxBytes + 4096);
    assert(!text.includes('\0') && !text.includes('\uFFFD'), 'Binary or non-UTF-8 source');
    return text;
}
export function fileDiff(s, f, maxBytes) {
    if (f.untracked) {
        const text = readSource(s, f.path, 'head', maxBytes);
        const lines = text.replace(/\n$/, '').split('\n');
        if (text.length === 0)
            return '';
        return `@@ -0,0 +1,${lines.length} @@\n` + lines.map(l => '+' + l).join('\n') + '\n';
    }
    return git(s.root, ['diff', ...DIFF_FLAGS, '--unified=6', '--src-prefix=a/', '--dst-prefix=b/', ...diffArgs(s), '--', f.path], maxBytes);
}
export function parseHunks(patch) {
    const lines = patch.split('\n'), hunks = [];
    let h, old = 0, next = 0;
    for (const line of lines) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
        if (m) {
            if (h)
                assert(old === h.oldStart + h.oldCount && next === h.newStart + h.newCount, 'Truncated or malformed diff hunk');
            h = { header: line, oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]), text: line + '\n', added: [], removed: [], addedLines: [], removedLines: [] };
            old = h.oldStart;
            next = h.newStart;
            hunks.push(h);
            continue;
        }
        if (!h)
            continue;
        if (line.startsWith('+')) {
            h.added.push(line.slice(1));
            h.addedLines.push(next++);
        }
        else if (line.startsWith('-')) {
            h.removed.push(line.slice(1));
            h.removedLines.push(old++);
        }
        else if (line.startsWith(' ')) {
            old++;
            next++;
        }
        else if (line.startsWith('\\ No newline')) { /* no line-number change */ }
        else if (line === '')
            continue;
        else
            throw new Error('Unsupported diff body');
        h.text += line + '\n';
    }
    if (h)
        assert(old === h.oldStart + h.oldCount && next === h.newStart + h.newCount, 'Truncated or malformed diff hunk');
    return hunks;
}
export function historyCount(s, path) {
    try {
        return git(s.root, ['log', '--format=%H', '-n', '40', s.baseSha, '--', path]).trim().split('\n').filter(Boolean).length;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=git.js.map