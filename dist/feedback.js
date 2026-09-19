import { closeSync, constants, fsyncSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { AXES, OUTCOMES } from './types.js';
import { assert, bounded, object, readProvided, redact, secureDir } from './util.js';
export function loadReport(path) {
    const raw = JSON.parse(readProvided(path, 32_000_000));
    assert(object(raw) && raw.schemaVersion === 1 && typeof raw.id === 'string' && /^rr-[a-f0-9]{20}$/.test(raw.id) && Array.isArray(raw.candidates) && Array.isArray(raw.omissions) && Array.isArray(raw.warnings), 'Invalid Review Radar report');
    const ids = new Set();
    for (const c of raw.candidates) {
        assert(object(c) && typeof c.id === 'string' && /^u-[a-f0-9]{16}$/.test(c.id) && !ids.has(c.id), 'Invalid or duplicate candidate');
        ids.add(c.id);
        assert(object(c.axes) && Array.isArray(c.signals) && Array.isArray(c.missing) && Array.isArray(c.evidence), 'Invalid candidate fields');
        assert(typeof c.path === 'string' && typeof c.focus === 'string' && ['authorization', 'money', 'data', 'async', 'contract', 'general'].includes(c.focus), 'Invalid candidate focus');
        for (const a of AXES) {
            const value = c.axes[a];
            assert(object(value) && (value.value === null || bounded(value.value, 0, 1)), 'Invalid candidate axis');
        }
    }
    return raw;
}
export function recordFeedback(report, path, unitId, outcome, minutes, note = '') {
    const c = report.candidates.find(c => c.id === unitId);
    assert(c, 'Unit ID is not in this report');
    assert(OUTCOMES.includes(outcome), 'Unknown feedback outcome');
    assert(bounded(minutes, 0, 1440), 'Review minutes must be between 0 and 1440');
    assert(note.length <= 2000, 'Feedback note is too long');
    const f = { version: 1, reportId: report.id, unitId, timestamp: new Date().toISOString(), outcome: outcome, minutes, note: redact(note).text, score: c.score, route: c.route };
    secureDir(dirname(path));
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
        writeSync(fd, JSON.stringify(f) + '\n');
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    return f;
}
export function evaluate(report, path, topK) {
    assert(Number.isInteger(topK) && topK >= 1 && topK <= 1000, '--top must be 1..1000');
    const entries = readProvided(path, 16_000_000).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const latest = new Map();
    for (const e of entries) {
        assert(object(e) && e.version === 1 && typeof e.reportId === 'string' && typeof e.unitId === 'string' && OUTCOMES.includes(e.outcome) && bounded(e.minutes, 0, 1440), 'Malformed feedback JSONL');
        if (e.reportId === report.id && report.candidates.some(c => c.id === e.unitId))
            latest.set(e.unitId, e);
    }
    const important = ['critical_fix', 'bug_fix', 'spec_decision', 'design_decision'];
    const isImportant = (f) => important.includes(f.outcome);
    const labeled = [...latest.values()].filter(f => f.outcome !== 'insufficient_context');
    const top = report.candidates.slice(0, topK), topLabels = top.map(c => latest.get(c.id)).filter((f) => !!f && f.outcome !== 'insufficient_context');
    const positives = labeled.filter(isImportant), topPositives = topLabels.filter(isImportant);
    return {
        reportId: report.id, topK, candidates: report.candidates.length,
        labeled: labeled.length, unresolvedLabels: [...latest.values()].filter(f => f.outcome === 'insufficient_context').length,
        labelCoverage: report.candidates.length ? labeled.length / report.candidates.length : null,
        topKLabeled: topLabels.length, topKLabelCoverage: top.length ? topLabels.length / top.length : null,
        precisionAmongLabeledTopK: topLabels.length ? topPositives.length / topLabels.length : null,
        observedImportantShareAtK: positives.length ? topPositives.length / positives.length : null,
        importantLabeled: positives.length, importantTopK: topPositives.length,
        recordedReviewMinutes: [...latest.values()].reduce((s, f) => s + f.minutes, 0),
        auditRecommended: report.auditSample.length, auditRecorded: report.auditSample.filter(id => latest.has(id)).length,
        caveat: '評価対象はこのreport IDに紐づく最新ラベルのみ。未評価を陰性にしない。observedImportantShareAtKはラベル済み重要問題のうち上位で観測された割合であり、真の欠陥Recallや因果的な工数削減率ではありません。'
    };
}
//# sourceMappingURL=feedback.js.map