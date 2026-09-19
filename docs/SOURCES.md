# Implementation references

Public provider and agent documentation consulted on September 19, 2026 (Japan time). API contracts and agent discovery paths may change; verify them when upgrading.

## TypeSafe / Jev

- Official skill: https://raw.githubusercontent.com/typesafe-ai/skills/main/skills/typesafe-ai/SKILL.md
- HTTP API: https://docs.typesafe.ai/api
- Score: https://docs.typesafe.ai/primitives/score
- Choice: https://docs.typesafe.ai/primitives/choice
- Composite scoring: https://docs.typesafe.ai/patterns/composite-scoring
- Models: https://docs.typesafe.ai/models

The live client targets `POST https://api.typesafe.ai/v1/systemone` with Bearer authentication and typed questions. The public specification was read; no live API call was verified in this build environment. This repository is independent and is not an official TypeSafe product.

## Agent and CI documentation

- Codex skill documentation: https://developers.openai.com/codex/skills
- Claude Code skills: https://code.claude.com/docs/en/skills
- GitHub checkout action: https://github.com/actions/checkout
- GitHub setup-node action: https://github.com/actions/setup-node

The supplied Review Radar skill is project-specific guidance. It does not replace or claim to install the official TypeSafe skill, and is not a registered ChatGPT Work plugin.

## Research boundary

The preceding design discussion motivated rubric-based scoring, just-in-time defect prediction, ranking, selective prediction, and learning to defer. This implementation makes no claim to reproduce published benchmark results. Only the explicit rubric, operational abstention rules, and a feedback/evaluation scaffold are implemented. No cited research dataset or trained model is bundled.
