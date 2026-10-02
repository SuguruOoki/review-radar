# Validation record

## v0.2.1 (2026-10-03)

- **macOS 実測（Apple Silicon, Node 24.18.1）**: `doctor` / `demo` pass。`node --test tests/*.test.mjs` **89 passed / 0 failed**（v0.1.0 では macOS の `/var` → `/private/var` 祖先シンボリックリンク拒否により integration 系 12 件が失敗していた。出力先の検査を葉のみに限定して解消）。
- **CI（GitHub Actions, test.yml）**: ubuntu-latest / macos-latest × Node 22 / 24 の 4 ジョブすべて green（PR #2 マージ後の main で確認）。
- Synthetic demo: **10 review units, 3 mandatory-review candidates, 0 external API requests**。design レンズの例（ガード節削除・副作用・深いプロパティ連鎖）が `人間レビューを優先` ルートで報告されることを確認。
- `examples/demo/` の report.html / report.md / report.json / preview.png を v0.2.1 で再生成。
- **Jev 実 API との接続テストは未実施のまま**（API キーなし）。ループバック互換エンドポイント経由のスコアリングのみ mock で検証。

## v0.1.0 (2026-09-19)

Validation date: September 19, 2026, Japan time.

### Executed

- TypeScript compilation with `strict`, `noUnusedLocals` and `noUnusedParameters` enabled.
- **66 Node.js tests passed, 0 failed, 0 skipped.** Includes unit tests, synthetic Git integration, CLI subprocesses and a full pipeline with a mock Jev HTTP response.
- Synthetic demo: **9 review units, 3 mandatory-review candidates, 0 external API requests**. This is an intentionally designed fixture, not a performance benchmark.
- Chromium rendering of the exact generated HTML through Playwright's `set_content`: desktop 1440×1080 and mobile 390×844. Nine cards; required-review filter returns three; billing search returns one; empty state and evidence toggle work; no horizontal page overflow; no JavaScript errors or external requests were observed.
- The container browser blocks `file://` navigation by administrator policy. Rendering used the unchanged HTML contents rather than a file URL; opening the file in Safari/macOS was not tested.

Test coverage includes deletion-only changes and original line references, removal of authorization guards, unusual path names, staged versus worktree versus pinned commits, untracked files, binary/symlink/mode-only handling, relevant-test and dependency collection, visible limits and exclusions, CI revision mismatch, mandatory-rule preservation, unknown verification, malformed model responses, invalid probability distributions, retries and attempt budgets, cache identity/invalidation, consent and missing-key errors, HTML escaping and route controls, feedback accounting and weights-only re-ranking.

### Environment

- Linux x86_64; Node.js v22.16.0; Git 2.47.3.
- TypeScript 5.8.3 from the preinstalled compiler.
- Preinstalled `@types/node` 25.1.0 used through a local development-only symlink for this build; the symlink and `node_modules` are NOT distributed.
- `package.json` declares TypeScript 5.8.3 and `@types/node` 22.15.30 for future development installs. The registry was unreachable from this environment, so installing those declared versions and generating a lockfile were not verified. Running the bundled JavaScript needs no npm installation.

### Not verified / not implemented

- **No live Jev / TypeSafe API call:** no API key was available. The transport and response contract were checked against public official documentation and tested with mock responses. Actual API compatibility, latency, token cost and semantic quality require a limited, explicitly authorized live trial.
- No actual user's repository, GitHub PR, Linear issue or production code was analyzed.
- No installation on the user's Mac, Claude Code, Codex or ChatGPT Work was performed.
- No remote GitHub workflow ran. The supplied workflow is a template for this project's bundled tests, not a deployed PR integration.
- No macOS/Windows/Safari compatibility run, statistical calibration, causal review-time experiment, trained defect predictor, learned ranker or Learning-to-Defer model.
- No audit proving full secret removal, prompt-injection resistance or sandbox isolation.

### Reproduce locally

From the extracted `review-radar` directory:

```sh
node dist/cli.js doctor
node --test tests/*.test.mjs
node dist/cli.js demo --out ./demo-output
```

The exact TAP output is bundled at `docs/test-results.tap`; the browser checks are summarized in `examples/demo/browser-validation.json`. These are validation artifacts from this build, not evidence of behavior in the user's environment.
