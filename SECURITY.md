# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's
[private vulnerability reporting](../../security/advisories/new) for this
repository, rather than opening a public issue. Include reproduction steps
and the affected version/commit.

## Automated coverage

- **Dependabot** (`.github/dependabot.yml`): weekly npm (`apps/web`) and
  GitHub Actions dependency updates. Every dependency PR runs the full CI
  gate (`.github/workflows/ci.yml`); none are auto-merged.
- **CodeQL** (`.github/workflows/codeql.yml`): static analysis for the
  JavaScript/TypeScript codebase on push to `master`, on pull requests, and
  weekly.
- **Secret scanning** (`.github/workflows/secret-scan.yml`): gitleaks on push
  to `master` and on pull requests.
- **`npm audit --audit-level=high`**: part of the CI web job; fails the
  build on a high/critical advisory in production dependencies.
