# Review Radar — 人間が読むべき変更を、根拠とともに

Gitの変更差分を、**必須確認・優先レビュー・判断材料不足・通常候補**に整理するCLIです。Jev / TypeSafeで意味的な判断を行い、差分取得・必須ルール・合算・レポート出力は通常のコードで処理します。

**v0.1.0 / 実装済みのMVP。自動承認、変更コードの実行、修正、GitHubへの投稿は行いません。** 点数は欠陥確率ではなく、重みと閾値も未較正です。実際のレビュー工数の削減効果とJevの判定精度は未検証です。

## 1. まずAPIキーなしで試す

必要環境は **Node.js 22以上とGit**。ZIPにはビルド済みの`dist/`を同梱しているため、利用だけなら`npm install`は不要です。LinuxのNode.js 22で検証しました。macOSでの実行は未検証です。

```bash
cd review-radar
node dist/cli.js doctor
node dist/cli.js demo --out ./demo-output

# macOSでレポートを開く
open ./demo-output/report.html
```

デモは一時ディレクトリに人工的なGitリポジトリを作り、9箇所の変更を解析します。認可条件の削除・二重課金防止の変更・DB削除操作の3箇所が必須確認になります。外部APIには接続しません。変更例のSQLやアプリコードも実行しません。

出力は`report.html`、`report.md`、`report.json`の3形式です。HTMLには検索、確認ルートの絞り込み、根拠コードの展開があります。外部アセットや通信は使いません。

## 2. 自分のリポジトリを解析する

### コミット済みのブランチ差分

ツールを展開したディレクトリから実行します。`/path/to/your-repo`は対象リポジトリの絶対パスに置き換えてください。

```bash
node dist/cli.js scan \
  --repo /path/to/your-repo \
  --base origin/main --head HEAD --merge-base \
  --provider heuristic \
  --out ./review-output
```

`origin/main`がローカルに存在することが前提です。ツールはfetchしません。`--merge-base`により、共通祖先から対象ブランチまでを比較します。省略すると指定した2つのコミットを直接比較します。

### 未コミット・ステージ済みの変更

```bash
# HEADと作業ツリーの比較。追跡済みファイルが対象
node dist/cli.js scan --repo /path/to/your-repo --out ./review-output

# 未追跡ファイルも含める
node dist/cli.js scan --repo /path/to/your-repo \
  --include-untracked --out ./review-output

# ステージ済みの変更だけ。--headとは併用しない
node dist/cli.js scan --repo /path/to/your-repo \
  --staged --out ./review-output
```

初版の単位は**Gitのhunk（差分のまとまり）**です。関数境界やASTによる分割ではありません。削除された行も評価します。renameは削除と追加として扱い、binary・symlink・submodule・モードのみの変更などは中身をモデルに送らず、未解析の確認対象に残します。

出力先は対象リポジトリの外に置くか、対象側の`.gitignore`に`.review-radar/`などを追加してください。未追跡・除外・上限超過のファイルはレポートの対象外一覧に表示されます。

## 3. Jevによる意味評価を使う

Jevモードはコード抜粋を外部APIへ送信します。業務コードを扱う場合は、先に会社・顧客の許可とデータ取り扱い条件を確認してください。APIキーをチャットやGitへ記載しないでください。

まず送信なしのドライランを行います。

```bash
node dist/cli.js scan \
  --repo /path/to/your-repo \
  --base origin/main --head HEAD --merge-base \
  --provider jev --dry-run \
  --max-requests 10 --out ./review-output
```

この段階ではAPIキーは不要です。対象数、生成したリクエストJSONの合計バイト数、HTTP試行上限を表示します。**バイト数はトークン数・請求額ではありません。**

APIキーを安全な方法で環境変数`TYPESAFE_API_KEY`に設定した後、明示的な送信許可を付けます。`.env`ファイルの自動読込はしません。

```bash
node dist/cli.js scan \
  --repo /path/to/your-repo \
  --base origin/main --head HEAD --merge-base \
  --provider jev --allow-external-data \
  --max-requests 10 --out ./review-output
```

`--allow-external-data`とAPIキーの両方が必要です。1差分単位につき、5つのScoreと4つのChoiceを1回のHTTPリクエストにまとめます。`max-requests`は再試行も含む上限です。超過した単位やAPI障害は未評価として残し、低リスク判定へ置き換えません。

既定モデルは`jev-latest`です。比較実験では設定ファイルの`jev.model`に利用可能な固定バージョンを指定し、`--no-cache`も検討してください。結果には返されたモデル名も保存します。モデル名・契約は公式ドキュメントを参照してください。

**Jevの実APIとの接続テストは未実施です。** 公開HTTP仕様に沿ったクライアントを実装し、応答検証・再試行・予算・キャッシュ・異常系はモックで確認しています。

## 4. 仕様・CI結果を添える

```bash
node dist/cli.js scan \
  --repo /path/to/your-repo \
  --base origin/main --head HEAD --merge-base \
  --context ./examples/acceptance-criteria.md \
  --ci ./your-ci-result.json \
  --provider heuristic --out ./review-output
```

`--context`には対象変更の受け入れ条件、維持すべき業務ルール、未決事項を書いたMarkdownを渡します。同梱例は架空の課金仕様なので、そのまま実プロダクトの仕様として使わないでください。

CIファイルは次の形です。

```json
{
  "revision": "解析するheadコミットの完全なSHA",
  "status": "passed"
}
```

実際には40文字または64文字の16進SHAが必要です。`status`は`passed`、`failed`、`unknown`。**コミット比較で対象SHAが一致した場合のみ採用**します。作業ツリーやindexにはCI成功を引き継ぎません。CI結果は利用者からの申告であり、ツールが独立に検証したものではありません。テスト実行・カバレッジ計測はしません。

## 5. 評価の読み方

| 項目 | 役割 |
| --- | --- |
| 人間の確認が必須 | 認可・課金・破壊的操作・設定した重要パスなど。点数やconfidenceで解除しない |
| 人間レビューを優先 | 高い優先指数、または人間の判断が必要と評価した候補 |
| 判断材料を追加 | API未完了、取得制限、モデルの判断不確実など |
| 通常レビュー候補 | 上記に当てはまらない候補。レビュー不要・安全という意味ではない |

5軸は「失敗時の影響」「検証の不足」「人間の判断」「境界の変更」「新規性」です。既定の重みは順に0.30 / 0.25 / 0.25 / 0.15 / 0.05。

未評価の軸は`null`にし、**分かっている軸の重みで再正規化**します。画面には既知軸の割合も併記します。評価軸の欠け方が違う点数を、同じ確かさの値として比較しないでください。ローカル規則モードでは検証不足を未評価のまま残します。

JevのScoreは各段階への確率分布から計算した評価値であり、欠陥確率ではありません。不確実性には、採用した評価軸と補助Choiceの正規化エントロピーの最大値を使います。confidenceも正答確率とはみなしません。較正済みの統計保証はありません。

単なる単語・パスの一致は、欠陥を発見した証拠ではありません。コメントやテストコードも一致し得ます。既定ルールは保守的に広く取っているため、誤警告の観察も必要です。

### 設計レンズ（design）

「読む量を減らす設計」（契約による設計・副作用のない関数・抽象化）の観点で、疑わしい hunk を優先レビューに上げます。出典はミノ駆動「[設計次第でAIコードの読む量は減らせる](https://speakerdeck.com/minodriven/designing-for-code-reading)」（2026-09-30）。

| シグナル | 見るもの | 偽陽性の主な形 |
| --- | --- | --- |
| design-contract-removed | 削除行のガード節・throw・assert 等（契約の弱体化） | 検証の移設・例外型の変更（意図的な契約変更） |
| design-side-effect-write | 追加行の this/self/globalThis 等への代入 | コンストラクタの初期化、意図的な状態更新 |
| design-unchecked-arithmetic | 追加行に算術・parse があり同じ hunk にガードがない | ガードが hunk 外（呼び出し元・上位バリデータ）にある |
| design-stringly-typed | 文字列リテラルとの比較による状態・種別の判別 | typeof や環境変数の慣用的な比較 |
| design-leaky-abstraction | 4段以上のプロパティ連鎖 | 慣用的な名前空間アクセス |

いずれも**非必須**のシグナルで、欠陥の検出ではありません。design シグナルが付いた候補は「人間の判断」軸が引き上げられ、`human_review` ルートに載りやすくなります（ガード削除は「失敗時の影響」も引き上げます）。テストファイルは対象外です。契約の「不在」そのものは字句では検出できないため、関数全体の目視確認（設計レビュー用スキル `design-for-reading-review`）と併用してください。

## 6. 設定と再順位付け

```bash
node dist/cli.js init --out ./review-radar.config.json
```

`weights`、`thresholds`、`pathRules`、`exclude`、取得上限、API予算などを編集できます。`pathRules`と`exclude`の配列は追記ではなく**置換**です。既定ルールを残す場合は、出力された完全な設定を編集してください。

```bash
node dist/cli.js scan --repo /path/to/your-repo \
  --config ./review-radar.config.json --out ./review-output
```

採点後に**重みだけ**を変更する場合は、追加API呼び出しなしで順位を変えられます。その他の設定が保存済みレポートと違うとエラーになります。

```bash
node dist/cli.js rerank --report ./review-output/report.json \
  --config ./review-radar.config.json --out ./reranked-output
```

閾値・パス規則・対象範囲・モデルを変更する場合は`scan`を再実行してください。再順位付けは新しいreport IDを発行します。フィードバックを新旧レポートに自動で付け替えることはしません。

## 7. 人間の確認結果を蓄積する

`report.html`の各カード末尾のID、または`report.json`の`candidates[].id`を使います。

```bash
node dist/cli.js feedback \
  --report ./review-output/report.json \
  --unit 実際の候補ID \
  --outcome spec_decision --minutes 12 \
  --note '再送時の仕様を担当者と確定した' \
  --out ./review-output/feedback.jsonl

node dist/cli.js evaluate \
  --report ./review-output/report.json \
  --feedback ./review-output/feedback.jsonl \
  --top 5 --out ./review-output/evaluation.json
```

outcomeは`critical_fix`、`bug_fix`、`spec_decision`、`design_decision`、`cosmetic`、`no_action`、`insufficient_context`です。同じreport・候補の複数記録は最新を採用します。未確認や材料不足を「問題なし」とは数えません。

評価は、ラベル付与率、ラベル済み上位候補の有用率、観測した重要事例の上位への集中、確認時間、下位監査の状況です。**未確認の真の欠陥が分からないため、真のRecallとは表示しません。** 同梱デモ・初期運用データから削減効果を推定しないでください。

下位から決定的ハッシュで最大3件を監査候補として示します。毎回同じ候補になり得る簡易方式であり、統計的に設計された無作為試験ではありません。

## 8. エージェント・CIからの利用

`skills/review-radar/SKILL.md`と`docs/AGENT-INTEGRATION.md`を同梱しています。Claude Code / Codex向けのコピー先と呼び出し手順を記載しています。ユーザー環境へのインストールやChatGPT Workへの登録は行っていません。

終了コードは次のとおりです。

- `0`: コマンドが正常終了した。レビュー合格・安全ではない。
- `1`: 設定・Git・入力などの致命的なエラー。
- `2`: Jevの未採点がある（API障害・予算切れ）。
- `3`: `--fail-on-required`指定時に、必須確認、材料未解析、または対象CIの失敗がある。

`--fail-on-required`では除外ファイルや未追跡の残存も未解析に含むため、意図的な除外があっても止まり得ます。初期導入は助言表示のみを推奨します。自動承認・PRへの自動コメント機能はありません。

## 9. 開発・検証

```bash
# 配布済みdistをテスト。npm install不要
node --test tests/*.test.mjs

# TypeScriptを変更して開発する場合のみ
npm install
npm test
```

実行時のnpm依存はゼロです。開発依存はTypeScriptとNode型定義だけです。この環境ではnpmレジストリへ接続できず、既存のコンパイラ・型定義でビルドしました。ロックファイルを生成しておらず、npm installを使う再現ビルドは未検証です。詳細は`docs/VALIDATION.md`に記載しています。

## 初版の限界

履歴はbase時点のファイル履歴を最大40件参照するだけです。学習済み欠陥予測、RankNet、Learning to Defer、厳密な信頼度較正、レビュー時間最適化は未実装です。フィードバックは保存・集計までで、自動追加学習はしません。

依存・テストの収集は同名テスト候補と相対importに限定します。TypeScript path alias、動的依存、完全な呼び出しグラフ、業務仕様の自動取得、GitHub / Linear / Slack連携は未実装です。巨大な差分は取得上限で中断・未解析扱いになります。

本ツールはサンドボックスではありません。Gitの設定・フィルタなどが処理に影響するため、**信頼できるローカルリポジトリで実行してください。** 詳細は`docs/SECURITY.md`を確認してください。

## 関連資料

- `docs/ARCHITECTURE.md` — 処理・採点・データ構造
- `docs/SECURITY.md` — 外部送信とローカル情報の保護
- `docs/VALIDATION.md` — 実際に試した範囲と未検証の範囲
- `docs/SOURCES.md` — 実装時に参照した公開仕様

MIT License.
