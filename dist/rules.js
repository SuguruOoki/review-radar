import { AXES } from './types.js';
import { clamp, globMatch, round } from './util.js';
export const AXIS_LABELS = { impact: '失敗時の影響', verificationGap: '検証の不足', humanJudgment: '人間の判断', boundary: '境界の変更', novelty: '新規性（限定的）' };
export const ROUTE_LABELS = { human_required: '人間の確認が必須', human_review: '人間レビューを優先', context_needed: '判断材料を追加', regular_review: '通常レビュー候補' };
export const FOCUS_QUESTIONS = {
    authorization: ['権限のない利用者・別テナント・期限切れセッションを拒否できるか。拒否経路のテストはあるか。', '従来の認可条件が削除・緩和されていないか。変更が意図した仕様かを担当者に確認する。'],
    money: ['タイムアウト・再送・Webhookの重複でも課金や返金が二重に成立しないか。', '金額・通貨・端数処理・状態遷移が業務ルールと一致するか。'],
    data: ['部分失敗・再実行・並行処理でもデータ整合性が保たれるか。', '削除・移行の対象範囲、バックアップ、ロールバックまたは復旧手順を確認する。'],
    async: ['再試行・重複イベント・順序逆転・キャンセル時の振る舞いが仕様と一致するか。', '同時実行と中断を再現する検証があり、副作用の二重実行を防げるか。'],
    contract: ['API・DB・外部サービス・実行環境との契約変更に、既存の利用側が追従できるか。', '失敗時の振る舞い、デプロイ順序、互換性を維持する必要があるか。'],
    general: ['変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。', '差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。']
};
const DETECTORS = [
    { id: 'authorization-code', title: '認可条件に関係する語・処理の変更', focus: 'authorization', mandatory: true, pattern: /\b(?:authorize|authorization|permission|isAdmin|tenantId|ownerId|requireAuth|hasRole|cognito|verifyToken)\b/i },
    { id: 'payment-code', title: '支払い・返金に関係する処理の変更', focus: 'money', mandatory: true, pattern: /\b(?:charge|refund|paymentIntent|payment_intent|stripe|payout|invoice|capturePayment|idempotencyKey)\b/i },
    { id: 'destructive-data', title: '破壊的データ操作の候補', focus: 'data', mandatory: true, pattern: /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b|\b(?:deleteMany|deleteAll)\s*\(/i },
    { id: 'async-change', title: '非同期・再試行・トランザクションの変更', focus: 'async', mandatory: false, pattern: /\b(?:retry|retries|webhook|transaction|Promise\.all|setTimeout|queue|SQS|lock|rollback|commit)\b|\$transaction/i },
    { id: 'boundary-change', title: '外部境界・インターフェースの変更', focus: 'contract', mandatory: false, pattern: /\b(?:fetch|axios|request|response|prisma|schema|migration|endpoint|process\.env|export\s+(?:interface|type))\b/i }
];
export function detectSignals(path, hunk, config) {
    const signals = [];
    for (const r of config.pathRules)
        if (globMatch(path, r.pattern))
            signals.push({ ...r, evidenceId: 'E0', note: '設定したパス規則との一致。欠陥の検出ではありません。' });
    const changed = hunk ? [...hunk.added, ...hunk.removed].join('\n') : '';
    for (const r of DETECTORS)
        if (r.pattern.test(changed))
            signals.push({ id: r.id, title: r.title, focus: r.focus, mandatory: r.mandatory, evidenceId: 'E0', note: '追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。' });
    return signals;
}
export function chooseFocus(signals) {
    return signals.find(s => s.mandatory)?.focus ?? signals[0]?.focus ?? 'general';
}
export function initialAxes(c) {
    const critical = c.signals.some(s => s.mandatory);
    return {
        impact: { value: critical ? .875 : c.signals.length ? .50 : .25, source: 'heuristic', note: 'パス・変更語からの暫定評価。実際の利用者影響は未検証。' },
        verificationGap: { value: null, source: 'heuristic', note: 'テストの存在だけでは直接の検証・不足を判定しない。未評価。' },
        humanJudgment: { value: critical ? .75 : c.signals.length ? .5 : .25, source: 'heuristic', note: '検出カテゴリからの暫定評価。業務仕様の適合性は未検証。' },
        boundary: { value: c.signals.some(s => s.focus !== 'general') ? .75 : .25, source: 'heuristic', note: '字句・パスからの境界変更の代理指標。依存グラフ解析ではない。' },
        novelty: { value: c.status === 'A' ? .75 : c.historyCommits === null ? null : c.historyCommits <= 1 ? .5 : .25, source: 'heuristic', note: '新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。' }
    };
}
/** Scores are priorities, never defect probabilities. Unknown dimensions stay null. */
export function rankCandidate(c, config) {
    let total = 0, known = 0, weighted = 0;
    for (const axis of AXES) {
        const weight = config.weights[axis];
        total += weight;
        const value = c.axes[axis].value;
        if (value !== null) {
            weighted += weight * clamp(value);
            known += weight;
        }
    }
    c.knownWeight = round(known / total, 4);
    c.score = known > 0 ? round(100 * weighted / known, 1) : null;
    c.required = c.signals.some(s => s.mandatory);
    const failed = ['error', 'budget_skipped', 'not_applicable'].includes(c.providerStatus);
    const uncertain = c.uncertainty !== null && c.uncertainty >= config.thresholds.uncertainty;
    const contextBlocked = c.missing.some(x => x.startsWith('BLOCK:'));
    if (c.required)
        c.route = 'human_required';
    else if (failed || uncertain || contextBlocked)
        c.route = 'context_needed';
    else if ((c.score ?? 0) >= config.thresholds.human || (c.axes.humanJudgment.value ?? 0) >= .625)
        c.route = 'human_review';
    else
        c.route = 'regular_review';
    c.questions = [...FOCUS_QUESTIONS[c.focus]];
    if (c.missing.length)
        c.questions.push('未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。');
    return c;
}
export function sortCandidates(cs) {
    const order = { human_required: 0, human_review: 1, context_needed: 2, regular_review: 3 };
    return cs.sort((a, b) => order[a.route] - order[b.route] || (b.score ?? -1) - (a.score ?? -1) || a.path.localeCompare(b.path) || a.newStart - b.newStart || a.id.localeCompare(b.id));
}
//# sourceMappingURL=rules.js.map