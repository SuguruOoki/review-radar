import { AXES, type Axis, type Candidate, type Config, type Focus, type Hunk, type Signal } from './types.js';
import { clamp, globMatch, isTest, round } from './util.js';

export const AXIS_LABELS: Record<Axis, string> = { impact: '失敗時の影響', verificationGap: '検証の不足', humanJudgment: '人間の判断', boundary: '境界の変更', novelty: '新規性（限定的）' };
export const ROUTE_LABELS = { human_required: '人間の確認が必須', human_review: '人間レビューを優先', context_needed: '判断材料を追加', regular_review: '通常レビュー候補' };
export const FOCUS_QUESTIONS: Record<Focus, string[]> = {
  authorization: ['権限のない利用者・別テナント・期限切れセッションを拒否できるか。拒否経路のテストはあるか。', '従来の認可条件が削除・緩和されていないか。変更が意図した仕様かを担当者に確認する。'],
  money: ['タイムアウト・再送・Webhookの重複でも課金や返金が二重に成立しないか。', '金額・通貨・端数処理・状態遷移が業務ルールと一致するか。'],
  data: ['部分失敗・再実行・並行処理でもデータ整合性が保たれるか。', '削除・移行の対象範囲、バックアップ、ロールバックまたは復旧手順を確認する。'],
  async: ['再試行・重複イベント・順序逆転・キャンセル時の振る舞いが仕様と一致するか。', '同時実行と中断を再現する検証があり、副作用の二重実行を防げるか。'],
  contract: ['API・DB・外部サービス・実行環境との契約変更に、既存の利用側が追従できるか。', '失敗時の振る舞い、デプロイ順序、互換性を維持する必要があるか。'],
  design: ['変更した関数の事前条件・事後条件・不変条件は、シグニチャと入口から読めるか。境界値のガードは明示されているか。', '削除・緩和されたガードや検証が意図した仕様かを確認する。契約が変わったなら呼び出し側とテストも同時に変える必要はないか。', 'この関数は引数→戻り値以外に外部状態を変えていないか。副作用は隔離されているか。シグニチャだけで挙動が予測できるか。', '魔法数や内部構造への依存が漏れていないか。読み手が内部の具体コードを読まずに使える抽象化か。'],
  general: ['変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。', '差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。']
};
interface Detector {
  id: string; title: string; focus: Focus; mandatory: boolean;
  /** 一致を調べる行。any は追加・削除の結合テキスト（従来の挙動）。 */
  lines: 'added' | 'removed' | 'any';
  /** テストファイルでは一致させない。 */
  skipTests?: boolean;
  pattern?: RegExp;
  /** 単一の正規表現で書けない判定。 */
  compound?: (hunk: Hunk) => boolean;
  note?: string;
}
const LEXICAL_NOTE = '追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。';
const DETECTORS: Detector[] = [
  { id: 'authorization-code', title: '認可条件に関係する語・処理の変更', focus: 'authorization', mandatory: true, lines: 'any', pattern: /\b(?:authorize|authorization|permission|isAdmin|tenantId|ownerId|requireAuth|hasRole|cognito|verifyToken)\b/i },
  { id: 'payment-code', title: '支払い・返金に関係する処理の変更', focus: 'money', mandatory: true, lines: 'any', pattern: /\b(?:charge|refund|paymentIntent|payment_intent|stripe|payout|invoice|capturePayment|idempotencyKey)\b/i },
  { id: 'destructive-data', title: '破壊的データ操作の候補', focus: 'data', mandatory: true, lines: 'any', pattern: /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b|\b(?:deleteMany|deleteAll)\s*\(/i },
  { id: 'async-change', title: '非同期・再試行・トランザクションの変更', focus: 'async', mandatory: false, lines: 'any', pattern: /\b(?:retry|retries|webhook|transaction|Promise\.all|setTimeout|queue|SQS|lock|rollback|commit)\b|\$transaction/i },
  { id: 'boundary-change', title: '外部境界・インターフェースの変更', focus: 'contract', mandatory: false, lines: 'any', pattern: /\b(?:fetch|axios|request|response|prisma|schema|migration|endpoint|process\.env|export\s+(?:interface|type))\b/i },
  { id: 'design-contract-removed', title: 'ガード節・契約の検証の削除', focus: 'design', mandatory: false, lines: 'removed', skipTests: true, pattern: /\b(?:throw|raise)\b|\bassert\b|\bAssert\.|\brequireNonNull\b|\bcheck(?:Argument|State|NotNull)\b|\bPreconditions\.|\bObjects\.requireNonNull\b|\bfail\s*\(/, note: '削除行に契約の検証（throw/assert/require等）がある。検証の移設・例外型の変更など意図的な契約変更でないか、呼び出し側とテストが同時に追従しているかを確認する。欠陥の検出ではありません。' },
  { id: 'design-side-effect-write', title: '外部状態への代入（副作用の候補）', focus: 'design', mandatory: false, lines: 'added', skipTests: true, pattern: /\b(?:this|self|globalThis|window|global|process\.env)\.[A-Za-z_$#][\w$]*\s*(?:\+\+|--|[+\-*/%&|^]?=)/, note: 'インスタンス変数・グローバル等への代入。コンストラクタの初期化や意図的な状態更新か、計算中に混入した副作用かを確認する。引数オブジェクトの書き換えは字句では検出しない。欠陥の検出ではありません。' },
  { id: 'design-unchecked-arithmetic', title: '検証なしの算術・変換（事前条件の未確認）', focus: 'design', mandatory: false, lines: 'added', skipTests: true, compound: (hunk) => {
    const ARITH = /(?:[\w.)\]"']\s*[+*/%]\s*[\w(.$'"-]|[\w.)\]"']\s+-\s+[\w(.$'"-]|parse(?:Int|Float)\s*\(|Number\s*\()/;
    const GUARD = /(?:if\s*\(|throw\b|assert\b|validate|isValid|\.parse\s*\(|\.safeParse\s*\(|\.test\s*\()/i;
    return hunk.added.some(l => ARITH.test(l)) && !hunk.added.some(l => GUARD.test(l));
  }, note: '追加行に算術やparse系の変換があるが、同じhunkの追加行にガード・検証が見当たらない。hunk外（呼び出し元・上位バリデータ）で検証済みの場合は偽陽性。欠陥の検出ではありません。' },
  { id: 'design-stringly-typed', title: '文字列リテラルによる型・状態の判別', focus: 'design', mandatory: false, lines: 'added', skipTests: true, pattern: /(?:===|!==|==|!=)\s*['"][A-Za-z_][\w-]*['"]/, note: '文字列リテラルとの比較で状態・種別を判別している。列挙・専用型・定数にできるかを確認する。typeofや環境変数の慣用的な比較は個別に判断する。欠陥の検出ではありません。' },
  { id: 'design-leaky-abstraction', title: '深いプロパティ連鎖（抽象化の漏れの候補）', focus: 'design', mandatory: false, lines: 'added', skipTests: true, pattern: /\b[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*){3,}/, note: '4段以上のプロパティ連鎖で内部表現に依存している可能性。読み手が内部構造を知らないと使えない・変えられない抽象化になっていないかを確認する。欠陥の検出ではありません。' }
];
export function detectSignals(path: string, hunk: Hunk | null, config: Config): Signal[] {
  const signals: Signal[] = [];
  for (const r of config.pathRules) if (globMatch(path, r.pattern)) signals.push({ ...r, evidenceId: 'E0', note: '設定したパス規則との一致。欠陥の検出ではありません。' });
  if (hunk) {
    const changed = [...hunk.added, ...hunk.removed].join('\n');
    for (const d of DETECTORS) {
      if (d.skipTests && isTest(path)) continue;
      const lines = d.lines === 'removed' ? hunk.removed : d.lines === 'added' ? hunk.added : [changed];
      const hit = d.compound ? d.compound(hunk) : lines.some(l => d.pattern!.test(l));
      if (hit) signals.push({ id: d.id, title: d.title, focus: d.focus, mandatory: d.mandatory, evidenceId: 'E0', note: d.note ?? LEXICAL_NOTE });
    }
  }
  return signals;
}
export function chooseFocus(signals: Signal[]): Focus {
  return signals.find(s => s.mandatory)?.focus ?? signals[0]?.focus ?? 'general';
}
export function initialAxes(c: Pick<Candidate, 'signals' | 'status' | 'historyCommits'>): Record<Axis, { value: number | null; source: 'heuristic'; note: string }> {
  const critical = c.signals.some(s => s.mandatory);
  const designSignals = c.signals.filter(s => s.focus === 'design');
  const contractRemoved = designSignals.some(s => s.id === 'design-contract-removed');
  return {
    impact: { value: critical ? .875 : contractRemoved ? .625 : c.signals.length ? .50 : .25, source: 'heuristic', note: 'パス・変更語からの暫定評価。実際の利用者影響は未検証。' },
    verificationGap: { value: null, source: 'heuristic', note: 'テストの存在だけでは直接の検証・不足を判定しない。未評価。' },
    humanJudgment: { value: critical ? .75 : contractRemoved ? .75 : designSignals.length ? .625 : c.signals.length ? .5 : .25, source: 'heuristic', note: '検出カテゴリからの暫定評価。業務仕様の適合性は未検証。' },
    boundary: { value: c.signals.some(s => s.focus !== 'general' && s.focus !== 'design') ? .75 : .25, source: 'heuristic', note: '字句・パスからの境界変更の代理指標。依存グラフ解析ではない。' },
    novelty: { value: c.status === 'A' ? .75 : c.historyCommits === null ? null : c.historyCommits <= 1 ? .5 : .25, source: 'heuristic', note: '新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。' }
  };
}
/** Scores are priorities, never defect probabilities. Unknown dimensions stay null. */
export function rankCandidate(c: Candidate, config: Config): Candidate {
  let total = 0, known = 0, weighted = 0;
  for (const axis of AXES) {
    const weight = config.weights[axis]; total += weight;
    const value = c.axes[axis].value;
    if (value !== null) { weighted += weight * clamp(value); known += weight; }
  }
  c.knownWeight = round(known / total, 4);
  c.score = known > 0 ? round(100 * weighted / known, 1) : null;
  c.required = c.signals.some(s => s.mandatory);
  const failed = ['error', 'budget_skipped', 'not_applicable'].includes(c.providerStatus);
  const uncertain = c.uncertainty !== null && c.uncertainty >= config.thresholds.uncertainty;
  const contextBlocked = c.missing.some(x => x.startsWith('BLOCK:'));
  if (c.required) c.route = 'human_required';
  else if (failed || uncertain || contextBlocked) c.route = 'context_needed';
  else if ((c.score ?? 0) >= config.thresholds.human || (c.axes.humanJudgment.value ?? 0) >= .625) c.route = 'human_review';
  else c.route = 'regular_review';
  c.questions = [...FOCUS_QUESTIONS[c.focus]];
  if (c.missing.length) c.questions.push('未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。');
  return c;
}
export function sortCandidates(cs: Candidate[]): Candidate[] {
  const order = { human_required: 0, human_review: 1, context_needed: 2, regular_review: 3 };
  return cs.sort((a, b) => order[a.route] - order[b.route] || (b.score ?? -1) - (a.score ?? -1) || a.path.localeCompare(b.path) || a.newStart - b.newStart || a.id.localeCompare(b.id));
}
