import { AXES, type Config, type Focus } from './types.js';
import { assert, bounded, object, readProvided } from './util.js';
export const DEFAULT_CONFIG: Config = {
  weights: { impact: .30, verificationGap: .25, humanJudgment: .25, boundary: .15, novelty: .05 },
  thresholds: { human: 65, uncertainty: .72, confidence: .35 },
  limits: { maxFiles: 100, maxUnits: 400, maxFileBytes: 200_000, maxPatchBytes: 150_000, evidenceChars: 8000, relatedFiles: 4 },
  jev: { model: 'jev-latest', maxRequests: 30, concurrency: 2, timeoutMs: 20_000, retries: 2, cacheTtlHours: 24 },
  exclude: ['**/node_modules/**', '**/vendor/**', '**/dist/**', '**/build/**', '**/*.min.js', '**/package-lock.json', '**/bun.lock', '**/bun.lockb', '**/pnpm-lock.yaml', '**/yarn.lock'],
  pathRules: [
    { id: 'authorization-path', pattern: '**/auth/**', title: '認証・認可ディレクトリの変更', focus: 'authorization', mandatory: true },
    { id: 'billing-path', pattern: '**/billing/**', title: '課金ディレクトリの変更', focus: 'money', mandatory: true },
    { id: 'payments-path', pattern: '**/payments/**', title: '支払いディレクトリの変更', focus: 'money', mandatory: true },
    { id: 'migration-path', pattern: '**/migrations/**', title: 'DBマイグレーションの変更', focus: 'data', mandatory: true },
    { id: 'prisma-schema', pattern: '**/schema.prisma', title: 'Prismaスキーマの変更', focus: 'data', mandatory: true },
    { id: 'ci-permissions', pattern: '.github/workflows/**', title: 'CIの権限・実行経路の確認', focus: 'contract', mandatory: true }
  ]
};
export function loadConfig(path?: string): Config {
  const raw: unknown = path ? JSON.parse(readProvided(path)) : {};
  assert(object(raw), 'Config must be a JSON object');
  const allowed = Object.keys(DEFAULT_CONFIG);
  for (const key of Object.keys(raw)) assert(allowed.includes(key), `Unknown config field: ${key}`);
  for (const section of ['weights', 'thresholds', 'limits', 'jev'] as const) {
    if (raw[section] === undefined) continue;
    assert(object(raw[section]), `Config ${section} must be an object`);
    for (const key of Object.keys(raw[section])) assert(key in DEFAULT_CONFIG[section], `Unknown config field: ${section}.${key}`);
  }
  const c: Config = {
    weights: { ...DEFAULT_CONFIG.weights, ...(raw.weights as object ?? {}) },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(raw.thresholds as object ?? {}) },
    limits: { ...DEFAULT_CONFIG.limits, ...(raw.limits as object ?? {}) },
    jev: { ...DEFAULT_CONFIG.jev, ...(raw.jev as object ?? {}) },
    exclude: raw.exclude === undefined ? [...DEFAULT_CONFIG.exclude] : raw.exclude as string[],
    pathRules: raw.pathRules === undefined ? structuredClone(DEFAULT_CONFIG.pathRules) : raw.pathRules as Config['pathRules']
  };
  validateConfig(c); return c;
}
export function validateConfig(c: Config): void {
  for (const a of AXES) assert(bounded(c.weights[a], 0, 100), `Invalid weight: ${a}`);
  assert(AXES.reduce((s, a) => s + c.weights[a], 0) > 0, 'At least one weight must be positive');
  assert(bounded(c.thresholds.human, 0, 100), 'Invalid human threshold');
  assert(bounded(c.thresholds.uncertainty, 0, 1) && bounded(c.thresholds.confidence, 0, 1), 'Invalid uncertainty threshold');
  for (const [k, v] of Object.entries(c.limits)) assert(Number.isInteger(v) && v >= 1 && v <= 2_000_000, `Invalid limit: ${k}`);
  assert(c.limits.evidenceChars >= 1000 && c.limits.evidenceChars <= 50_000, 'evidenceChars must be 1000..50000');
  assert(c.limits.relatedFiles <= 20, 'relatedFiles must be <=20');
  assert(typeof c.jev.model === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(c.jev.model), 'Invalid model name');
  for (const k of ['maxRequests', 'concurrency', 'timeoutMs', 'retries'] as const) assert(Number.isInteger(c.jev[k]) && c.jev[k] >= 0, `Invalid jev.${k}`);
  assert(c.jev.maxRequests <= 100_000 && c.jev.concurrency >= 1 && c.jev.concurrency <= 16 && c.jev.timeoutMs >= 100 && c.jev.timeoutMs <= 120_000 && c.jev.retries <= 5, 'Jev limits out of range');
  assert(bounded(c.jev.cacheTtlHours, 0, 168), 'Cache TTL must be 0..168 hours');
  assert(Array.isArray(c.exclude) && c.exclude.every(x => typeof x === 'string' && x.length < 500), 'Invalid exclude patterns');
  assert(Array.isArray(c.pathRules), 'pathRules must be an array');
  const ids = new Set<string>();
  const focuses: Focus[] = ['authorization','money','data','async','contract','general'];
  for (const r of c.pathRules) {
    assert(object(r) && typeof r.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(r.id) && !ids.has(r.id), 'Invalid or duplicate path rule id');
    ids.add(r.id);
    assert(typeof r.pattern === 'string' && r.pattern.length < 500 && typeof r.title === 'string' && typeof r.mandatory === 'boolean' && focuses.includes(r.focus), 'Invalid path rule');
  }
}
