# Review Radar — 人間レビューの確認箇所

> **デモ：人工的に作成した差分のローカル規則による分析です。実際のリポジトリ／Jevの精度測定ではありません。**

対象: demo-commerce / commits  |  生成: 2026-09-18T17:50:38\.219Z

base: `26eb26cbc14bff80ab8804b2d69d0ae377d54d9f` → head: `d7fcbca562ee201e9d467427accb4e4da433ca64`

解析単位: **9** / 必須確認: **3** / 対象外: **0**

> この指数は欠陥確率ではなく、暫定的なレビュー優先度です。低い指数・通常候補・終了コード0は、安全性やマージ可を意味しません。自動承認・自動修正・テスト実行は行いません。

## 最初に見る候補（最大5件）

1. **人間の確認が必須** — migrations/20260919\_reset\.sql:1-2 \[head\] — 指数 80/100、評価済み重み 75% — `u-6b62994610f4c57b`

2. **人間の確認が必須** — src/auth/canView\.ts:2-2 \[head\] — 指数 78.3/100、評価済み重み 75% — `u-6efe24d153485a03`

3. **人間の確認が必須** — src/billing/retryPayment\.ts:4-5 \[head\] — 指数 78.3/100、評価済み重み 75% — `u-138da1332436ae57`

4. **通常レビュー候補** — README\.md:3-3 \[head\] — 指数 26.7/100、評価済み重み 75% — `u-00502d59be14f08d`

5. **通常レビュー候補** — src/queue/retry\.ts:2-2 \[head\] — 指数 26.7/100、評価済み重み 75% — `u-b4828ce834f7ea1d`

## 未確認事項

- 業務仕様は未提供。--context に仕様・受け入れ条件を渡すと評価材料に含められます。

- ローカル規則モード。Jevの意味評価は未実行で、検証不足の軸は未評価です。

CI: **unknown** — CI結果は未提供。このツールはテストを実行しません。

Jev HTTP試行: 0 / キャッシュ: 0 / API未完了: 0 / 失敗試行: 0

APIから報告されたtoken: input 0 / output 0。タイムアウト等の課金を含む請求額ではありません。

## 全候補

### migrations/20260919\_reset\.sql:1-2 \[head\]

**人間の確認が必須** · 指数 **80/100** · 評価済み重み 75% · heuristic · `u-6b62994610f4c57b`

- DBマイグレーションの変更 — 設定したパス規則との一致。欠陥の検出ではありません。 [E0]

- 破壊的データ操作の候補 — 追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。 [E0]

**人間が確認する問い**

- 部分失敗・再実行・並行処理でもデータ整合性が保たれるか。

- 削除・移行の対象範囲、バックアップ、ロールバックまたは復旧手順を確認する。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 3.50/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 3.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 3.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 3.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** migrations/20260919\_reset\.sql head:1-2 (diff)

```diff
@@ -0,0 +1,2 @@
+-- DEMO ONLY. Never execute this fixture on a database.
+DROP TABLE payment_attempts;

```

**E2** migrations/20260919\_reset\.sql head:1-3 (after)

```text
-- DEMO ONLY. Never execute this fixture on a database.
DROP TABLE payment_attempts;

```

### src/auth/canView\.ts:2-2 \[head\]

**人間の確認が必須** · 指数 **78.3/100** · 評価済み重み 75% · heuristic · `u-6efe24d153485a03`

- 認証・認可ディレクトリの変更 — 設定したパス規則との一致。欠陥の検出ではありません。 [E0]

- 認可条件に関係する語・処理の変更 — 追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。 [E0]

**人間が確認する問い**

- 権限のない利用者・別テナント・期限切れセッションを拒否できるか。拒否経路のテストはあるか。

- 従来の認可条件が削除・緩和されていないか。変更が意図した仕様かを担当者に確認する。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 3.50/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 3.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 3.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/auth/canView\.ts head:2-2 (diff)

```diff
@@ -1,3 +1,3 @@
 export function canView(user: { tenantId: string }, document: { tenantId: string }) {
-  return user.tenantId === document.tenantId;
+  return Boolean(user);
 }

```

**E1** src/auth/canView\.ts base:1-4 (before)

```text
export function canView(user: { tenantId: string }, document: { tenantId: string }) {
  return user.tenantId === document.tenantId;
}

```

**E2** src/auth/canView\.ts head:1-4 (after)

```text
export function canView(user: { tenantId: string }, document: { tenantId: string }) {
  return Boolean(user);
}

```

### src/billing/retryPayment\.ts:4-5 \[head\]

**人間の確認が必須** · 指数 **78.3/100** · 評価済み重み 75% · heuristic · `u-138da1332436ae57`

- 課金ディレクトリの変更 — 設定したパス規則との一致。欠陥の検出ではありません。 [E0]

- 支払い・返金に関係する処理の変更 — 追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。 [E0]

- 非同期・再試行・トランザクションの変更 — 追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。 [E0]

- 外部境界・インターフェースの変更 — 追加・削除行の字句パターンとの一致。コメントやテストも一致し得ます。 [E0]

**人間が確認する問い**

- タイムアウト・再送・Webhookの重複でも課金や返金が二重に成立しないか。

- 金額・通貨・端数処理・状態遷移が業務ルールと一致するか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 3.50/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 3.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 3.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/billing/retryPayment\.ts head:4-5 (diff)

```diff
@@ -1,5 +1,6 @@
 import { gateway } from '../gateway';
 
 export async function retryPayment(order: { id: string; amount: number }) {
-  return gateway.charge({ amount: order.amount, idempotencyKey: order.id });
+  // Retry after a timeout. Does the original request already have a result?
+  return gateway.charge({ amount: order.amount });
 }

```

**E1** src/billing/retryPayment\.ts base:1-6 (before)

```text
import { gateway } from '../gateway';

export async function retryPayment(order: { id: string; amount: number }) {
  return gateway.charge({ amount: order.amount, idempotencyKey: order.id });
}

```

**E2** src/billing/retryPayment\.ts head:1-7 (after)

```text
import { gateway } from '../gateway';

export async function retryPayment(order: { id: string; amount: number }) {
  // Retry after a timeout. Does the original request already have a result?
  return gateway.charge({ amount: order.amount });
}

```

**R1** tests/retryPayment\.test\.ts head:1-8 (test)

```text
// Illustrative test source; this file is not executed by Review Radar.
import { retryPayment } from '../src/billing/retryPayment';
import { expect, test } from 'vitest';
test('returns a result', async () => {
  const result = await retryPayment({ id: 'order-1', amount: 100 });
  expect(result.id).toBe('demo');
});

```

**R2** src/gateway\.ts head:1-3 (dependency)

```text
// Demo adapter only. No real payment processing.
export const gateway = { charge: async (args: { amount: number; idempotencyKey?: string }) => ({ id: 'demo', ...args }) };

```

### README\.md:3-3 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-00502d59be14f08d`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** README\.md head:3-3 (diff)

```diff
@@ -1,3 +1,3 @@
 # Demo
 
-Example application.
+Example application for a review-priority report.

```

**E1** README\.md base:1-4 (before)

```text
# Demo

Example application.

```

**E2** README\.md head:1-4 (after)

```text
# Demo

Example application for a review-priority report.

```

### src/queue/retry\.ts:2-2 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-b4828ce834f7ea1d`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/queue/retry\.ts head:2-2 (diff)

```diff
@@ -1,3 +1,3 @@
 export function retryLimit() {
-  return 1;
+  return 5;
 }

```

**E1** src/queue/retry\.ts base:1-4 (before)

```text
export function retryLimit() {
  return 1;
}

```

**E2** src/queue/retry\.ts head:1-4 (after)

```text
export function retryLimit() {
  return 5;
}

```

### src/ui/button\.ts:1-1 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-034672da0e8ecd27`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/ui/button\.ts head:1-1 (diff)

```diff
@@ -1 +1 @@
-export const label = 'Submit';
+export const label = 'Continue';

```

**E1** src/ui/button\.ts base:1-2 (before)

```text
export const label = 'Submit';

```

**E2** src/ui/button\.ts head:1-2 (after)

```text
export const label = 'Continue';

```

### src/ui/footer\.ts:1-1 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-5e1df4cec4d32f89`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/ui/footer\.ts head:1-1 (diff)

```diff
@@ -1 +1 @@
-export const footer = 'All rights reserved';
+export const footer = 'Thank you for visiting';

```

**E1** src/ui/footer\.ts base:1-2 (before)

```text
export const footer = 'All rights reserved';

```

**E2** src/ui/footer\.ts head:1-2 (after)

```text
export const footer = 'Thank you for visiting';

```

### src/ui/help\.ts:1-1 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-1c240a77e4e0f270`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/ui/help\.ts head:1-1 (diff)

```diff
@@ -1 +1 @@
-export const help = 'Contact support';
+export const help = 'Ask us a question';

```

**E1** src/ui/help\.ts base:1-2 (before)

```text
export const help = 'Contact support';

```

**E2** src/ui/help\.ts head:1-2 (after)

```text
export const help = 'Ask us a question';

```

### src/ui/title\.ts:1-1 \[head\]

**通常レビュー候補** · 指数 **26.7/100** · 評価済み重み 75% · heuristic · `u-7b0aa8770ee28ee0`

**人間が確認する問い**

- 変更した条件と期待する結果を説明できるか。その条件を直接検証するテストはあるか。

- 差分外の呼び出し元や業務仕様に、同時に変更すべき箇所がないか。

- 未確認事項を補ってから判断する。低い指数やCI成功だけで承認しない。

**評価軸**

- 失敗時の影響: 1.00/4 — パス・変更語からの暫定評価。実際の利用者影響は未検証。

- 検証の不足: 未評価 — テストの存在だけでは直接の検証・不足を判定しない。未評価。

- 人間の判断: 1.00/4 — 検出カテゴリからの暫定評価。業務仕様の適合性は未検証。

- 境界の変更: 1.00/4 — 字句・パスからの境界変更の代理指標。依存グラフ解析ではない。

- 新規性（限定的）: 2.00/4 — 新規ファイルとbase時点の最大40コミット数だけを使用。意味的な前例は未検証。

**未確認・追加材料**

- 業務仕様・受け入れ条件は未提供。

- 関連テストを限定探索で取得できなかった。テスト不存在とは判断しない。

- 依存解決は相対importとファイル名一致による限定探索。型解決・全呼び出し元・動的依存は未解析。

Jevの分布エントロピー: 未計算（正しさの確率ではない） / 選択根拠: 未選択

**根拠**

**E0** src/ui/title\.ts head:1-1 (diff)

```diff
@@ -1 +1 @@
-export const title = 'Welcome';
+export const title = 'Welcome back';

```

**E1** src/ui/title\.ts base:1-2 (before)

```text
export const title = 'Welcome';

```

**E2** src/ui/title\.ts head:1-2 (after)

```text
export const title = 'Welcome back';

```

## 下位候補の抜き取り確認

`u-034672da0e8ecd27`

## 対象外・未解析パス

対象外パスなし（全依存関係の解析完了を意味しません）。

## 識別子

Report ID: `rr-757c12ff48cd0851e249` / schema 1 / tool 0.1.0

重み・閾値は未較正の初期値です。Jevの実用途精度は人間の評価結果で検証してください。
