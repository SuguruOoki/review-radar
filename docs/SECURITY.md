# Security and privacy boundary

## What is and is not executed

The scanner runs Git commands and its own analysis code. It does not run the target application's code, test commands, package install scripts, migrations or build scripts. Git arguments are passed without a shell; external diffs and textconv are disabled, as are fsmonitor and hooks through command-local settings.

**This is not a sandbox.** Git itself, its installed binary, clean/process filters, environment/configuration, the local filesystem and the host OS remain part of the trust boundary. Analyze trusted local repositories. Use an isolated environment without secrets for untrusted repositories; do not assume `--provider heuristic` makes arbitrary Git configuration safe. The synthetic demo creates and commits only its own test content in a temporary directory.

## External API disclosure

No Jev request is made in heuristic or dry-run mode. A live scan requires BOTH `TYPESAFE_API_KEY` and `--allow-external-data`. Requests use a fixed HTTPS API endpoint and do not follow redirects. The scanner does not fetch URLs found in repository content, contact issue trackers, or post results.

The payload may contain changed lines, surrounding source, relative file paths, test and dependency excerpts, supplied specification text and supplied CI status. Do not use proprietary code without authorization. The API provider's retention and processing terms require separate review; this implementation makes no assertion about those terms.

## Secrets and report storage

Common secret paths (`.env`, keys, credential-like files) are blocked from model evidence. Common token/private-key patterns receive best-effort masking. This is NOT complete secret detection: arbitrary identifiers, business secrets and unrecognized formats can still be transmitted or saved. Inspect selected inputs and organizational policy before live use.

JSON, Markdown and HTML include source excerpts. Local cache files store only validated API responses; reports may also include raw model answers. Treat all outputs as confidential. Files are written with restrictive permissions where the OS supports them. Do not place them under a publicly served directory. The HTML uses no external assets and blocks network connections; text and paths are escaped and HTML execution attempts are tested.

Do not put API keys in config files, command arguments, documentation, screenshots, PR comments, agent context or Git history. This CLI reads the API key only from the environment and never prints it intentionally.

## Prompt injection and model errors

Repository comments, diffs, tests and specification text are untrusted content. The model receives explicit data-only instructions and constrained outputs. This reduces accidental instruction following but does not prove resistance to prompt injection. The model cannot execute tools through this API integration. Mandatory rules cannot be cleared by model output.

A syntactically valid answer may still be wrong. Missing context, low confidence, invalid responses, API failures and exhausted budgets do not authorize skipping review. There is no auto-merge, auto-approval or auto-fix mode.

## Budgets

`maxRequests` counts HTTP attempts including retries and limits concurrent shared usage. It is not a currency budget or a billing reconciliation tool. Timed-out requests may have been processed by the provider. The printed token totals include only usable API responses; compare actual billing separately. A request payload and response have size limits; excessive inputs fail or remain partial rather than silently being declared safe.

## CI use

Do not expose API secrets to untrusted pull-request code or use a privileged workflow to check out and execute such code. The included workflow only exercises this project's synthetic tests with no Jev credentials. It has not been installed or run in the user's GitHub account. Repository-specific PR automation and safe secret handling are left for an explicitly scoped integration.
