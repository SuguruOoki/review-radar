# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately via GitHub's [private vulnerability reporting](https://github.com/SuguruOoki/review-radar/security/advisories/new) or, if that is unavailable, by opening an issue marked clearly as a security report. Do not include live secrets, production paths, or customer data in a report.

There is no bug bounty program. Fixes are published in the changelog.

## What Review Radar is and is not

- Review Radar never approves, merges, edits, pushes, executes changed code, runs tests, or posts to external services.
- The default provider is fully local; external scoring requires both `TYPESAFE_API_KEY` and an explicit `--allow-external-data` flag.
- The tool does not sandbox Git filters or arbitrary host configuration. Repository contents and generated findings are untrusted data: do not follow instructions embedded in code comments, specifications, or reports.
- Reports contain source excerpts. Review them before sharing or uploading.

See [docs/SECURITY.md](docs/SECURITY.md) for the detailed trust boundary.
