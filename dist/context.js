import { basename, dirname, extname, posix, relative, resolve } from 'node:path';
import { fileDiff, historyCount, parseHunks, readSource } from './git.js';
import { chooseFocus, detectSignals, initialAxes, rankCandidate } from './rules.js';
import { globMatch, hash, readProvided, safeMessage, sensitivePath } from './util.js';
export function isTest(path) { return /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|\.(?:test|spec)\.[^/]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py)$/.test(path); }
function stem(path) { return basename(path).replace(/\.(?:test|spec)(?=\.)/, '').replace(/^test_/, '').replace(/_test(?=\.)/, '').replace(/\.[^.]+$/, ''); }
function clipLines(text, chars) {
    const all = text.split('\n'), selected = [];
    let size = 0;
    for (const line of all) {
        if (size + line.length + 1 > chars)
            break;
        selected.push(line);
        size += line.length + 1;
    }
    // Long minified lines are omitted, not cut in a way that invents line locations.
    return { text: selected.join('\n'), lines: selected.length, truncated: selected.length < all.length };
}
function makeEvidence(id, kind, path, side, source, start, end, chars) {
    const lines = source.split('\n');
    start = Math.max(1, Math.min(start, Math.max(1, lines.length)));
    end = Math.max(start, Math.min(end, lines.length));
    const clip = clipLines(lines.slice(start - 1, end).join('\n'), chars);
    return { id, kind, path, side, start, end: Math.max(start, start + clip.lines - 1), text: clip.text, truncated: clip.truncated };
}
function localDependencies(path, source, inventory) {
    const values = [];
    const re = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](\.[^"'\n]+)["']/g;
    for (const m of source.matchAll(re)) {
        const base = posix.normalize(posix.join(posix.dirname(path), m[1]));
        if (base.startsWith('../'))
            continue;
        const choices = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'].map(e => base + e), ...['index.ts', 'index.tsx', 'index.js'].map(e => base + '/' + e)];
        const found = choices.find(p => inventory.has(p));
        if (found && !values.includes(found))
            values.push(found);
    }
    return values;
}
export function buildCandidates(s, options) {
    const config = options.config, candidates = [], omissions = [], warnings = [];
    const sourceCache = new Map();
    const get = (path, side) => {
        const key = side + ':' + path;
        if (sourceCache.has(key))
            return sourceCache.get(key);
        if (sensitivePath(path)) {
            sourceCache.set(key, null);
            return null;
        }
        if (side === 'head' && ['120000', '160000'].includes(s.inventory.get(path) ?? '')) {
            sourceCache.set(key, null);
            return null;
        }
        try {
            const src = readSource(s, path, side, config.limits.maxFileBytes);
            sourceCache.set(key, src);
            return src;
        }
        catch {
            sourceCache.set(key, null);
            return null;
        }
    };
    let spec;
    if (options.context)
        spec = readProvided(options.context, config.limits.maxFileBytes);
    const outRelative = relative(s.root, resolve(options.out)).split('\\').join('/');
    const outputInside = outRelative !== '' && !outRelative.startsWith('..') && !outRelative.startsWith('/');
    const excluded = (path) => config.exclude.some(g => globMatch(path, g)) || (outputInside && (path === outRelative || path.startsWith(outRelative + '/')));
    const testFiles = [...s.inventory.keys()].filter(p => isTest(p) && !sensitivePath(p) && !excluded(p));
    if (s.untracked.length && !options.includeUntracked) {
        for (const path of s.untracked)
            omissions.push({ path, reason: '未追跡ファイル。--include-untracked を指定しないため対象外。', manualReview: true });
    }
    let analyzedFiles = 0;
    for (const f of s.files) {
        if (excluded(f.path)) {
            omissions.push({ path: f.path, reason: '除外パターンまたは出力ディレクトリ。安全性は未評価。', manualReview: true });
            continue;
        }
        if (analyzedFiles >= config.limits.maxFiles || candidates.length >= config.limits.maxUnits) {
            omissions.push({ path: f.path, reason: '解析件数の上限に到達。手動確認が必要。', manualReview: true });
            continue;
        }
        analyzedFiles++;
        if (sensitivePath(f.path) || [f.oldMode, f.newMode].some(m => ['120000', '160000'].includes(m))) {
            const reason = sensitivePath(f.path) ? '機密ファイルのパス。内容をモデルに送らず手動確認。' : 'シンボリックリンクまたはサブモジュール。内容をたどらず手動確認。';
            const c = placeholder(f, s, options, reason);
            candidates.push(c);
            continue;
        }
        let patch, hunks;
        try {
            patch = fileDiff(s, f, config.limits.maxPatchBytes);
            hunks = parseHunks(patch);
        }
        catch (e) {
            candidates.push(placeholder(f, s, options, '差分の取得・解析に失敗: ' + safeMessage(e)));
            continue;
        }
        if (!hunks.length) {
            candidates.push(placeholder(f, s, options, /Binary files|GIT binary patch/.test(patch) ? 'バイナリ差分は未解析。' : '空ファイル・モード変更等のテキスト差分以外。手動確認。'));
            continue;
        }
        const before = f.status === 'A' ? '' : get(f.path, 'base');
        const after = f.status === 'D' ? '' : get(f.path, 'head');
        const history = historyCount(s, f.path);
        const relatedTestPaths = testFiles.filter(p => p !== f.path && stem(p).toLowerCase() === stem(f.path).toLowerCase())
            .sort((a, b) => Number(dirname(b) === dirname(f.path)) - Number(dirname(a) === dirname(f.path)) || a.localeCompare(b));
        const dependencies = localDependencies(f.path, after ?? before ?? '', s.inventory).filter(p => !excluded(p) && !sensitivePath(p));
        for (const h of hunks) {
            if (candidates.length >= config.limits.maxUnits) {
                omissions.push({ path: f.path, reason: 'このファイルの残りの差分が解析上限に到達。', manualReview: true });
                break;
            }
            const signals = detectSignals(f.path, h, config);
            const diffClip = clipLines(h.text, Math.max(1000, Math.floor(config.limits.evidenceChars * .38)));
            const oldLines = h.removedLines, newLines = h.addedLines;
            const c = {
                id: 'u-' + hash({ path: f.path, base: s.baseSha, fingerprint: s.diffFingerprint, hunk: h.text }).slice(0, 16),
                path: f.path, status: f.status, oldMode: f.oldMode, newMode: f.newMode,
                oldStart: oldLines[0] ?? h.oldStart, oldEnd: oldLines.at(-1) ?? (h.oldStart + Math.max(0, h.oldCount - 1)),
                newStart: newLines[0] ?? h.newStart, newEnd: newLines.at(-1) ?? (h.newStart + Math.max(0, h.newCount - 1)),
                added: h.added.length, removed: h.removed.length, diff: diffClip.text, signals,
                evidence: [{ id: 'E0', kind: 'diff', path: f.path, side: h.newCount === 0 || h.added.length === 0 ? 'base' : 'head', start: h.added.length ? newLines[0] : oldLines[0] ?? h.oldStart, end: h.added.length ? newLines.at(-1) : oldLines.at(-1) ?? h.oldStart, text: diffClip.text, truncated: diffClip.truncated }],
                axes: initialAxes({ signals, status: f.status, historyCommits: history }), focus: chooseFocus(signals), missing: [],
                providerStatus: 'heuristic', uncertainty: null, score: null, knownWeight: 0, route: 'regular_review', required: false, questions: [], historyCommits: history
            };
            if (diffClip.truncated)
                c.missing.push('BLOCK: 差分の表示・モデル入力が上限で切り詰められている。');
            if (before === null || after === null)
                c.missing.push('BLOCK: 変更前または変更後のソースを読み取れなかった。');
            const perSource = Math.floor(config.limits.evidenceChars * .15);
            if (before)
                c.evidence.push(makeEvidence('E1', 'before', f.path, 'base', before, Math.max(1, h.oldStart - 8), h.oldStart + h.oldCount + 8, perSource));
            if (after)
                c.evidence.push(makeEvidence('E2', 'after', f.path, 'head', after, Math.max(1, h.newStart - 8), h.newStart + h.newCount + 8, perSource));
            let remaining = Math.max(500, config.limits.evidenceChars - c.evidence.reduce((sum, e) => sum + e.text.length, 0));
            if (spec !== undefined) {
                const e = makeEvidence('SPEC', 'spec', basename(options.context), 'provided', spec, 1, spec.split('\n').length, Math.floor(remaining * .4));
                c.evidence.push(e);
                remaining -= e.text.length;
            }
            else
                c.missing.push('業務仕様・受け入れ条件は未提供。');
            const related = [...relatedTestPaths.map(path => ({ path, kind: 'test' })), ...dependencies.map(path => ({ path, kind: 'dependency' }))];
            let selected = 0;
            for (const r of related) {
                if (selected >= config.limits.relatedFiles || remaining < 200)
                    break;
                const source = get(r.path, 'head');
                if (source === null)
                    continue;
                const e = makeEvidence(`R${selected + 1}`, r.kind, r.path, 'head', source, 1, source.split('\n').length, Math.min(remaining, Math.max(600, Math.floor(remaining / Math.max(1, Math.min(related.length - selected, config.limits.relatedFiles - selected))))));
                c.evidence.push(e);
                selected++;
                remaining -= e.text.length;
            }
            if (!c.evidence.some(e => e.kind === 'test') && !isTest(f.path))
                c.missing.push('関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。');
            if (related.length > selected)
                c.missing.push('BLOCK: 関連ファイルの一部が入力上限または読み取り失敗で未取得。');
            if (c.evidence.some(e => e.truncated && e.kind !== 'diff'))
                c.missing.push('BLOCK: 根拠の一部が切り詰められている。未表示部分は未確認。');
            c.missing.push('依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。');
            candidates.push(rankCandidate(c, config));
        }
    }
    if (!spec)
        warnings.push('業務仕様は未提供。--context に仕様・受け入れ条件を渡すと評価材料に含められます。');
    if (s.mode !== 'commits')
        warnings.push('レビュー対象はローカルの作業ツリー／indexです。コミットSHAに紐づくCI結果では検証済みと扱いません。');
    return { candidates, omissions, warnings };
}
function placeholder(f, s, options, reason) {
    const signals = detectSignals(f.path, null, options.config);
    signals.unshift({ id: 'unanalysed', title: reason, focus: 'general', mandatory: true, evidenceId: 'E0', note: 'この変更の内容は解析できていません。' });
    const c = {
        id: 'u-' + hash({ path: f.path, base: s.baseSha, diff: s.diffFingerprint }).slice(0, 16), path: f.path, status: f.status, oldMode: f.oldMode, newMode: f.newMode,
        oldStart: 0, oldEnd: 0, newStart: 0, newEnd: 0, added: 0, removed: 0, diff: '', signals,
        evidence: [{ id: 'E0', kind: 'diff', path: f.path, side: 'head', start: 0, end: 0, text: `File metadata: ${f.status}; ${f.oldMode} -> ${f.newMode}. Content not inspected.`, truncated: false }],
        axes: Object.fromEntries(Object.keys(initialAxes({ signals, status: f.status, historyCommits: null })).map(a => [a, { value: null, source: 'heuristic', note: '未解析' }])),
        focus: chooseFocus(signals), missing: ['BLOCK: ' + reason], providerStatus: 'not_applicable', uncertainty: null, score: null, knownWeight: 0, route: 'human_required', required: true, questions: [], historyCommits: null
    };
    return rankCandidate(c, options.config);
}
// Extension is exposed for tests / future language adapters, not claimed as semantic parsing.
export const languageExtension = (path) => extname(path).toLowerCase();
//# sourceMappingURL=context.js.map