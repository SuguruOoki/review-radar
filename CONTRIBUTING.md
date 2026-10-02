# Contributing

Thanks for considering a contribution. Review Radar is deliberately small: lexical checks and honest reporting, no auto-approval, no network by default.

## Before you start

- Open an issue first for anything larger than a typo, so intent is visible before code.
- Read [docs/VALIDATION.md](docs/VALIDATION.md) to see what is and is not verified, and [docs/SECURITY.md](docs/SECURITY.md) for the trust boundary.

## Development setup

Node.js 22+ and Git are the only requirements. The repository ships the built `dist/`, and tests run against it.

```bash
npm test          # tsc build + node --test tests/*.test.mjs
node dist/cli.js demo --out demo-output
```

Code layout:

- `src/rules.ts` — signals, focus, score axes, routing
- `src/context.ts` — hunk splitting and evidence collection
- `src/jev.ts` — opt-in Jev / TypeSafe scoring client
- `src/scanner.ts` / `src/report.ts` — pipeline and report formats
- `tests/*.test.mjs` — bundled-test suite (unit, Git integration, CLI, mocks)

Commit the compiled `dist/` together with source changes; tests run against it.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, ...).
- New signals must be non-mandatory unless a human gate is clearly required, must carry a note stating a match is not a defect, and need direction-specific tests including false-positive cases.
- Claims in README and docs must match actual behavior — quote real output, and update [docs/VALIDATION.md](docs/VALIDATION.md) when verification changes.
- Do not weaken the trust boundary: no auto-approval, no executing changed code, no sending anything without an explicit consent flag.

## High-impact help wanted

- English report template (i18n) — the report text is currently Japanese; see the issue tracker.
- Calibration of weights and thresholds against recorded outcomes (`feedback` + `evaluate`).
