# Criteria: Security Logic

Shared, criteria-only fragment — logic-level security defects, not static analysis findings or dependency vulnerabilities. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s security-logic judgment lens. Confidence floor: `high` — do not file speculative security findings.

This fragment is for what a careful security reviewer would catch by reading the code, not what a linter reports.

## What to flag

- **Broken access control:** an action that should require authorization is reachable without it (missing auth check, IDOR via predictable IDs, a role check that is bypassed by a URL parameter).
- **Trust boundary violations:** data from an untrusted source (user input, URL params, headers, third-party webhooks) used in a sensitive operation (DB query, file path, system command, HTML output) without validation or escaping.
- **Authentication logic defects:** comparison of tokens or signatures that is not constant-time (timing oracle), password reset flows that accept any token regardless of expiry or binding, session IDs that are not rotated on privilege change.
- **Insecure direct use of cryptographic primitives:** rolling a custom hash function, using a deprecated algorithm (MD5, SHA-1 for integrity), predictable IVs, reused nonces.
- **Dangerous defaults in security-relevant configuration:** CORS set to `*` on a credentialed endpoint, `httpOnly`/`secure` flags absent from session cookies, `eval` or `Function()` on user-supplied strings.

## What NOT to flag

- Findings that are purely static-analysis output (missing sanitization on a path that never reaches the DOM, a library version with a CVE that does not apply to how the library is used).
- "Could be improved" without a concrete attack path.
- Speculative injection risks without a route through the code where attacker-controlled input reaches the sink.

## Severity calibration

- **high** — broken auth or direct data exposure exploitable without authentication; exploitable after authentication; or a logic defect that enables privilege escalation.
- **medium** — a security misconfiguration that reduces defense-in-depth but is not directly exploitable.
- **low** — a minor hardening gap (missing `HttpOnly` on a non-session cookie).
