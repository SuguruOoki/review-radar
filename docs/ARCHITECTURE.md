# Architecture — v0.1.0

## Responsibility boundary

```
CLI + validated configuration
  → Git snapshot (pinned revisions / staged / worktree)
  → Diff hunks + deleted lines + bounded evidence collection
  → Non-compensatory mandatory rules
  → Local heuristic axes OR Jev typed questions
  → Deterministic score + route + ordering
  → HTML / Markdown / JSON
  → Human labels + descriptive evaluation
```

The implementation instantiates the rubric-and-abstention proposal. It does not implement a trained defect predictor, a learned ranking model, a human-performance model, or statistical selective-risk guarantees.

## Modules

| Module | Responsibility |
| --- | --- |
| `git.ts` | Ref pinning, raw NUL-delimited Git output, diff parsing, bounded source access, snapshot consistency |
| `context.ts` | Hunk candidates, diff/before/after/spec/test/dependency evidence, visible omissions |
| `rules.ts` | Mandatory path / lexical signals, local axes, fixed review questions, scoring and routing |
| `jev.ts` | Question construction, HTTPS client, strict response validation, budgets, cache, typed results |
| `scanner.ts` | Pipeline orchestration, CI revision checks, failure accounting, report lineage |
| `report.ts` | Escaped static HTML, Markdown, JSON |
| `feedback.ts` | Append-only human outcomes and descriptive metrics |
| `cli.ts` | Arguments, consent preflight, exit statuses and re-ranking |

## Semantic scoring contract

Each eligible candidate gets one request with five `score` questions and four `choice` questions. The score axes are impact, verification gap, human judgment, boundary changes, and novelty. Choice questions assess verification status, context sufficiency, review focus, and a grounded evidence ID (or no evidence).

Question IDs are bookkeeping; full meaning is in the question instructions. Independent concrete criteria are included in every Score. Repository content is explicitly declared untrusted data, not executable instructions. Jev chooses among real evidence IDs; it does not author line numbers or free-form findings.

The model's Score answer must agree with the supplied probability distribution, within the response validator's tolerance. Invalid shapes, nonfinite values, probability inconsistencies, unknown candidates and incomplete responses fail the candidate closed. Absence of usable test evidence does not become a statement that tests do not exist.

## Scoring and routing

```
knownWeight = sum(weights of non-null axes) / sum(all weights)
priority = 100 × sum(weight × non-null axis value) / sum(known weights)
```

When all axes are unknown, priority is null. Required-review signals are applied separately and cannot be canceled by weights. Routing order is: mandatory review; failure/context/information uncertainty; high score or high human-judgment axis; normal review candidate. Sorted output puts mandatory before prioritized, context-needed, then normal candidates. This means route is not simply a threshold over the overall score.

Uncertainty uses the maximum normalized entropy across usable score axes and the four auxiliary Choice answers. Selected Choice answers also have low-confidence/context/evidence checks. This is a conservative operational rule, not a calibrated abstention guarantee. Prompt agreement and confidence are never treated as independently verified correctness.

## Evidence and limits

Evidence IDs are scoped to one candidate: `E0` is the diff; before/after, supplied specification and related files receive further IDs. The diff carries original Git hunk headers. Deleted-only content points to the base side, not nonexistent lines in the head.

Source collection is bounded and does not execute imports or tests. Related-file lookup is intentionally shallow (relative imports and same-name test candidates). Alias resolution, AST semantics, transitive dependency closure and exact line coverage are not implemented. Truncation and file/patch/unit limits remain visible.

## Caching and identity

The request cache key contains the complete redacted request payload and endpoint/protocol version. The payload includes evidence, question criteria and model. Weights are applied outside Jev and do not require a new model judgment. Default TTL is 24 hours and can be disabled with `--no-cache`.

Cache files store responses, not request code or API keys. Responses still require normal validation when read. `jev-latest` may refer to a changed server model; use a fixed supported model name and no-cache for rigorous experiments.

Report IDs incorporate the diff fingerprint, candidate axes/routes/evidence, configuration and CI. Live and cached copies of the same evaluation share the same report-ID inputs. Re-ranking emits a new report ID and does not silently relabel old feedback.

## Data for future learning

Feedback outcomes distinguish critical fixes, bug fixes, specification/design decisions, cosmetic changes, no action and insufficient context. Evaluation only counts the latest label per report and candidate, keeps missing labels unknown, and reports audit coverage. The observed concentration of known important cases is not true recall.

Before adding learning, collect first-snapshot features, independently reviewed outcomes and reviewer time; split by time and PR; audit lower-ranked candidates; separate candidate-generation misses from ranking mistakes. No automatic training job exists in v0.1.0.
