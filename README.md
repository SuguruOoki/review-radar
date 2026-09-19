# Review Radar

Evidence-grounded human code-review triage, with optional Jev / TypeSafe scoring.

**[日本語の導入ガイド](README.ja.md)**

Node.js 22+ and Git are required. Runtime npm dependencies: none. Compiled JavaScript is included.

```sh
node dist/cli.js demo --out ./demo-output
node --test tests/*.test.mjs
```

The tool does not approve changes, execute the changed application or tests, modify the target repository, or post to external services. Live Jev scoring requires `TYPESAFE_API_KEY` and explicit `--allow-external-data`. Scores are uncalibrated priorities, not defect probabilities. Actual live Jev connectivity and real-world review effectiveness have not been verified.
