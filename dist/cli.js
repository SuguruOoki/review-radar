#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, loadConfig, validateConfig } from './config.js';
import { demo } from './demo.js';
import { evaluate, loadReport, recordFeedback } from './feedback.js';
import { writeReport } from './report.js';
import { rankCandidate, sortCandidates } from './rules.js';
import { scan } from './scanner.js';
import { OUTCOMES } from './types.js';
import { assert, atomicWrite, hash, safeMessage } from './util.js';
const HELP = `Review Radar 0.2.0 — 人間レビューの優先箇所を根拠付きで整理\n\nUsage:\n  node dist/cli.js scan --repo PATH [--base REF] [--head REF|worktree] [options]\n  node dist/cli.js demo [--out DIR]\n  node dist/cli.js doctor\n  node dist/cli.js init --out review-radar.config.json\n  node dist/cli.js feedback --report report.json --unit ID --outcome OUTCOME --minutes N [--note TEXT] [--out feedback.jsonl]\n  node dist/cli.js evaluate --report report.json --feedback feedback.jsonl [--top 5] [--out evaluation.json]\n  node dist/cli.js rerank --report report.json --config CONFIG --out DIR\n\nScan options:\n  --base REF                 基準コミット。既定 HEAD\n  --head REF|worktree        対象コミットまたは作業ツリー。既定 worktree\n  --merge-base               コミット比較を共通祖先から開始\n  --staged                   indexを評価。--headと併用不可\n  --include-untracked        未追跡ファイルも含める（worktreeのみ）\n  --provider heuristic|jev   既定 heuristic。ネットワーク不要\n  --allow-external-data      Jevへコード抜粋を送ることへの明示的許可\n  --context PATH.md          業務仕様・受け入れ条件\n  --ci PATH.json             {revision: full SHA, status: passed|failed|unknown}\n  --config PATH.json         重み、閾値、必須パス、上限設定\n  --max-requests N           HTTP試行の上限。再試行を含む\n  --no-cache                 キャッシュの読み書きをしない\n  --dry-run                  Jev入力の規模を算出。外部送信なし、キー不要\n  --out DIR                  出力先。既定 .review-radar\n  --fail-on-required         必須確認・未解析材料があれば終了コード3\n\nEnvironment:\n  REVIEW_RADAR_JEV_ENDPOINT  ループバックの Jev 互換サーバーで採点する（http://127.0.0.1 等のみ。キーと --allow-external-data は不要）\n\nFeedback outcomes:\n  ${OUTCOMES.join(' | ')}\n\nNo auto-approval, edits, test execution, pushes or telemetry.\n`;
const BOOLEAN = new Set(['staged', 'merge-base', 'include-untracked', 'allow-external-data', 'dry-run', 'no-cache', 'fail-on-required', 'help']);
const COMMAND_FLAGS = {
    scan: ['repo', 'base', 'head', 'merge-base', 'staged', 'include-untracked', 'provider', 'allow-external-data', 'context', 'ci', 'config', 'max-requests', 'no-cache', 'dry-run', 'out', 'fail-on-required'],
    demo: ['out', 'config'], doctor: [], init: ['out'],
    feedback: ['report', 'unit', 'outcome', 'minutes', 'note', 'out'], evaluate: ['report', 'feedback', 'top', 'out'], rerank: ['report', 'config', 'out']
};
function parse(argv) {
    const command = argv[0] ?? 'help', flags = {};
    for (let i = 1; i < argv.length; i++) {
        const flag = argv[i];
        assert(/^--[a-z-]+$/.test(flag), `Unexpected argument: ${flag}`);
        const name = flag.slice(2);
        assert(flags[name] === undefined, `Duplicate flag: ${flag}`);
        assert(name === 'help' || COMMAND_FLAGS[command]?.includes(name), `Unknown flag for ${command}: ${flag}`);
        if (BOOLEAN.has(name))
            flags[name] = true;
        else {
            const value = argv[++i];
            assert(value !== undefined && !value.startsWith('--'), `Missing value: ${flag}`);
            flags[name] = value;
        }
    }
    return { command, flags };
}
async function main() {
    assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+ is required');
    const { command, flags: f } = parse(process.argv.slice(2));
    if (command === 'help' || command === '--help' || f.help) {
        console.log(HELP);
        return;
    }
    const text = (key, fallback) => typeof f[key] === 'string' ? f[key] : fallback;
    const required = (key) => { const v = text(key); assert(v, `--${key} is required`); return v; };
    const out = resolve(text('out', '.review-radar'));
    if (command === 'doctor') {
        let gitVersion;
        try {
            gitVersion = execFileSync('git', ['--version'], { encoding: 'utf8' }).trim();
        }
        catch {
            gitVersion = 'NOT FOUND';
        }
        console.log(JSON.stringify({ tool: 'review-radar 0.1.0', node: process.version, git: gitVersion, typesafeApiKey: process.env.TYPESAFE_API_KEY ? 'present (not verified)' : 'not configured', externalRequests: 0 }, null, 2));
        return;
    }
    if (command === 'init') {
        atomicWrite(resolve(text('out', 'review-radar.config.json')), JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
        console.log('Configuration written.');
        return;
    }
    if (command === 'scan' || command === 'demo') {
        const config = loadConfig(text('config'));
        if (text('max-requests'))
            config.jev.maxRequests = Number(text('max-requests'));
        validateConfig(config);
        const provider = text('provider', 'heuristic');
        assert(provider === 'heuristic' || provider === 'jev', 'Invalid --provider');
        const report = command === 'demo' ? await demo(out, config) : await scan({
            repo: text('repo', '.'), base: text('base'), head: text('head'), staged: f.staged === true, mergeBase: f['merge-base'] === true,
            includeUntracked: f['include-untracked'] === true, provider, allowExternalData: f['allow-external-data'] === true,
            context: text('context'), ci: text('ci'), config, out, dryRun: f['dry-run'] === true, noCache: f['no-cache'] === true,
            progress: message => console.error('[review-radar] ' + message)
        });
        writeReport(report, out);
        console.log(JSON.stringify({ reportId: report.id, candidates: report.candidates.length, required: report.candidates.filter(c => c.required).length, complete: report.complete, requests: report.usage.requests, output: out }, null, 2));
        if (f['fail-on-required'] && (report.candidates.some(c => c.required) || !report.complete || report.ci.status === 'failed'))
            process.exitCode = 3;
        else if (report.candidates.some(c => ['error', 'budget_skipped'].includes(c.providerStatus)))
            process.exitCode = 2;
        return;
    }
    if (command === 'feedback') {
        const report = loadReport(required('report'));
        const result = recordFeedback(report, resolve(text('out', '.review-radar/feedback.jsonl')), required('unit'), required('outcome'), Number(required('minutes')), text('note', ''));
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (command === 'evaluate') {
        const result = evaluate(loadReport(required('report')), required('feedback'), Number(text('top', '5')));
        if (text('out'))
            atomicWrite(resolve(text('out')), JSON.stringify(result, null, 2) + '\n');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (command === 'rerank') {
        const report = loadReport(required('report')), config = loadConfig(required('config'));
        assert(hash({ ...report.config, weights: config.weights }) === hash(config), 'rerankで変更できるのはweightsだけです。閾値・パス規則・取得条件・モデルの変更にはscanを再実行してください。');
        report.config = config;
        report.candidates = sortCandidates(report.candidates.map(c => rankCandidate(c, config)));
        const previous = report.id;
        report.id = 'rr-' + hash({ previous, config }).slice(0, 20);
        report.createdAt = new Date().toISOString();
        report.auditSample = report.candidates.slice(5).map(c => ({ id: c.id, sort: hash('audit:' + c.id) })).sort((a, b) => a.sort.localeCompare(b.sort)).slice(0, 3).map(c => c.id);
        report.warnings.push(`保存済みの評価軸から再順位付け。追加API呼び出しなし。元レポート: ${previous}`);
        writeReport(report, out);
        console.log(`Re-ranked report written: ${out}`);
        return;
    }
    throw new Error(`Unknown command: ${command}. Use --help.`);
}
main().catch(e => { console.error('review-radar: ' + safeMessage(e).replace(/[\u0000-\u001f\u007f]/g, ' ')); process.exitCode = 1; });
//# sourceMappingURL=cli.js.map