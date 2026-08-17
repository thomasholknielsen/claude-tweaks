# Criteria: Privacy / PII Handling

Shared, criteria-only fragment — what to flag in code that touches personally identifiable information. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s privacy-pii judgment lens (frontend, backend, and data areas touching user data). Confidence floor: `high` — privacy findings have regulatory and reputational consequences; do not file speculative findings.

## What to flag

- **PII logged:** fields that are structurally PII (email, phone, full name, IP address, SSN, date of birth, precise location, device identifiers) passed to a logger, analytics call, or error tracking SDK without redaction or masking.
- **PII in URLs:** user identifiers or PII embedded in URL paths or query parameters that will appear in access logs and browser history.
- **Retention without purpose:** PII stored in a database column, cache, or queue message with no TTL, no expiry, and no evident business need for indefinite retention.
- **Missing consent gate:** a feature that collects behavioral data, location, or health information with no consent check visible in the code path.
- **PII transmitted over HTTP (not HTTPS):** only flag when the code explicitly constructs an HTTP URL for a call that carries PII in the body.
- **Oversharing in API responses:** a response serializer that includes PII fields (e.g., password hash, full SSN) that the caller does not need, based on what the endpoint's stated purpose is.

## What NOT to flag

- Internal service-to-service calls where both ends are controlled and trusted (not user-facing).
- PII in test fixtures that use clearly fake data (e.g., `test@example.com`, `555-1234`).
- Speculative privacy concerns without a concrete code path where real PII flows.
- Compliance concerns (GDPR, CCPA) that require business-level judgment — flag only the concrete code pattern, not the regulatory question.

## Severity calibration

- **high** — PII logged at a level that reaches a third-party log aggregator or is included in error reports sent externally; PII persisted without any retention limit; or PII transmitted in a URL that will be logged server-side.
- **medium** — an API response including unneeded sensitive fields.
- **low** — a minor over-inclusion (e.g., user ID in a URL parameter when it is already in the auth context).
