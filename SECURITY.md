# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.3.x   | Yes                |
| 0.2.x   | Security fixes only |
| < 0.2   | No                 |

## Reporting a Vulnerability

**Do not report security issues through public GitHub Issues.**

### Preferred: GitHub Private Vulnerability Reporting

Use GitHub's [private vulnerability reporting](https://github.com/ZySec-AI/codebase/security/advisories/new).
This creates a private advisory visible only to maintainers.

### Alternative

Open a [security advisory draft](https://github.com/ZySec-AI/codebase/security/advisories) directly
or contact the maintainers via GitHub.

## What to Include

- Type of issue (path traversal, command injection, credential leak, etc.)
- Full path of the affected source file(s) with line numbers
- Steps to reproduce the vulnerability
- Proof-of-concept or example (if available)
- Potential impact assessment

## Response Timeline

| Milestone          | Target             |
|--------------------|--------------------|
| Acknowledgment     | 48 hours           |
| Triage             | 5 business days    |
| Fix / mitigation   | 30 days            |
| Public disclosure  | 90 days after report |

We follow coordinated disclosure. Please allow us to release a fix before
disclosing publicly.

## Scope

**In scope:** This repository and official releases on npm (`codebase-ai`).

**Out of scope:** Vulnerabilities in upstream dependencies — report those
to the relevant maintainers directly.

## Security Design Notes

- `codebase server` is a **local-only developer tool**. It binds to `localhost`
  and is not intended to be exposed to the internet. Do not run it in
  production environments or expose its port publicly.
- All subprocess calls use `execFile` (no shell interpolation) to prevent
  command injection.
- The npm package ships zero production dependencies.

## Safe Harbor

Security research conducted in good faith under this policy is considered
authorized. We will not pursue legal action against reporters who follow
these guidelines.
