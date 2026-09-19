import { basename, resolve } from 'node:path';
import { buildCandidates } from './context.js';
import { fingerprint, snapshot } from './git.js';
import { applyJev, BudgetExhausted, buildRequest, ENDPOINT, JevClient, LOCAL_ENDPOINT } from './jev.js';
import { rankCandidate, sortCandidates } from './rules.js';
import type { Report, ScanOptions, Snapshot, Usage } from './types.js';
import { assert, hash, object, readProvided, redactDeep, safeMessage } from './util.js';
import { validateConfig } from './config.js';

function readCI(path: string | undefined, s: Snapshot): Report['ci'] {
  if (!path) return { status: 'unknown', note: 'CI結果は未提供。このツールはテストを実行しません。' };
  const raw: unknown = JSON.parse(readProvided(path));
  assert(object(raw) && ['passed', 'failed', 'unknown'].includes(String(raw.status)), 'CI JSON needs status: passed|failed|unknown');
  assert(typeof raw.revision === 'string' && /^[a-f0-9]{40,64}$/.test(raw.revision), 'CI JSON needs the full revision SHA');
  if (s.mode !== 'commits' || s.headSha !== raw.revision) return { status: 'unknown', note: 'CIのrevisionと解析対象が一致しないため、結果を採用していません。' };
  return { status: raw.status as Report['ci']['status'], note: '利用者が提供した、対象SHAと一致するCI結果。独立検証はしておらず、行カバレッジを意味しません。' };
}
export async function scan(options: ScanOptions): Promise<Report> {
  validateConfig(options.config);
  if (options.provider === 'jev' && !options.dryRun && !LOCAL_ENDPOINT) {
    assert(options.allowExternalData === true, 'Jevへコードを送るには --allow-external-data が必要です。まず --provider heuristic または --dry-run で確認してください。');
    assert(!!process.env.TYPESAFE_API_KEY, 'TYPESAFE_API_KEY が未設定です。実通信は開始していません。');
  }
  const s = snapshot(options), built = buildCandidates(s, options), ci = readCI(options.ci, s);
  let candidates = sortCandidates(built.candidates);
  const usage: Usage = { requests: 0, cacheHits: 0, errors: 0, budgetSkipped: 0, inputTokens: 0, outputTokens: 0, redactions: 0 };
  const warnings = [...built.warnings];
  options.progress?.(`${s.files.length} files → ${candidates.length} review units; ${built.omissions.length} omitted paths`);
  if (ci.status === 'failed') warnings.push('対象SHAのCI失敗が報告されています。失敗した自動チェックの解消も必要です。');
  if (options.provider === 'jev' && options.dryRun) {
    const eligible = candidates.filter(c => c.providerStatus !== 'not_applicable');
    let bytes = 0;
    for (const c of eligible) {
      const r = buildRequest(c, options.config, ci); bytes += Buffer.byteLength(JSON.stringify(r.body)); usage.redactions += r.redactions;
    }
    warnings.push(`DRY RUN: 外部送信なし。対象 ${eligible.length} 単位、全単位のJSON合計 ${bytes} bytes（トークン数ではありません）。最大 ${options.config.jev.maxRequests} HTTP試行、再試行もこの上限に含む。`);
  } else if (options.provider === 'jev') {
    const client = new JevClient({ config: options.config, apiKey: LOCAL_ENDPOINT ? 'local' : process.env.TYPESAFE_API_KEY!, cacheDir: options.noCache ? undefined : resolve(options.out, 'cache'), usage });
    if (LOCAL_ENDPOINT) warnings.push(`ローカル評価器（${ENDPOINT}）で採点。Jev の結果ではなく、コードは外部に送っていません。`);
    let cursor = 0, done = 0;
    const worker = async (): Promise<void> => {
      while (cursor < candidates.length) {
        const index = cursor++, c = candidates[index];
        if (c.providerStatus === 'not_applicable') continue;
        const request = buildRequest(c, options.config, ci); usage.redactions += request.redactions;
        try {
          const result = await client.evaluate(request.body);
          candidates[index] = applyJev(c, result.response, result.cached, options.config);
        } catch (e) {
          c.providerStatus = e instanceof BudgetExhausted ? 'budget_skipped' : 'error';
          if (e instanceof BudgetExhausted) usage.budgetSkipped++;
          c.providerError = safeMessage(e); c.missing.push('BLOCK: Jevによる採点は未完了。表示値はローカル規則による暫定値。');
          rankCandidate(c, options.config);
        }
        done++; if (done % 10 === 0) options.progress?.(`${done} units processed; ${usage.requests} HTTP attempts; ${usage.cacheHits} cache hits`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.config.jev.concurrency, Math.max(1, candidates.length)) }, worker));
  } else warnings.push('ローカル規則モード。Jevの意味評価は未実行で、検証不足の軸は未評価です。');
  if (fingerprint(s) !== s.diffFingerprint) throw new Error('解析中に差分が変化しました。混在した結果は保存しません。変更を止めて再実行してください。');
  if (candidates.some(c => c.providerStatus === 'error' || c.providerStatus === 'budget_skipped')) warnings.push('Jevで未採点の単位があります。APIエラーや予算切れを低リスクと扱わず、未完了として残しています。');
  if (built.omissions.length) warnings.push('除外・未追跡・上限超過のパスがあります。対象外一覧を確認してください。');
  candidates = sortCandidates(candidates);
  const auditSample = candidates.slice(5).map(c => ({ id: c.id, key: hash('audit:' + c.id) })).sort((a, b) => a.key.localeCompare(b.key)).slice(0, Math.min(3, Math.max(1, Math.ceil(candidates.length * .1)))).map(c => c.id);
  const id = 'rr-' + hash({ snapshot: s.diffFingerprint, candidates: candidates.map(c => ({ id: c.id, axes: c.axes, route: c.route, status: c.providerStatus === 'cached' ? 'live' : c.providerStatus, evidence: c.evidence, missing: c.missing, questions: c.questions })), config: options.config, ci }).slice(0, 20);
  const report: Report = {
    schemaVersion: 1, toolVersion: '0.1.0', id, createdAt: new Date().toISOString(), demo: false,
    repository: { name: basename(s.root), base: s.baseSha, head: s.headLabel, mode: s.mode, diffFingerprint: s.diffFingerprint },
    provider: options.provider, config: options.config, candidates, omissions: built.omissions, warnings, auditSample, usage,
    complete: built.omissions.length === 0 && candidates.every(c => !['error', 'budget_skipped', 'not_applicable'].includes(c.providerStatus) && !c.missing.some(m => m.startsWith('BLOCK:'))), ci
  };
  // Reports are local but still receive best-effort secret masking before persistence.
  return redactDeep(report).value;
}
