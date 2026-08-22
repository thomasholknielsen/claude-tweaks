---
record: 916
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 916: Deduplicate policy-config resolution between resolve-policy.js and blast-radius-cli.js

Origin: spec #888 review (3e Architecture)
Defer-reason: genuinely-larger

## Current State

`plugin/bin/lib/blast-radius-cli.js`'s `resolveConfig()` reimplements the exact resolution pathway `plugin/bin/resolve-policy.js`'s `main()` already owns: resolve repo root via `git rev-parse --show-toplevel` (falling back to `process.cwd()` on failure), read `.claude-tweaks/policy.yml`, read an optional `{runDir}/config.yml` overlay, then call `bin/lib/policy-schema.js#resolvePolicyKeys`. Both files independently implement the same read-fail-safe-vs-fail-loud judgment calls (`resolve-policy.js`'s `readFileSafe` swallows ENOENT only; `blast-radius-cli.js`'s `defaultReadFile`/`resolveConfig` were just hardened to do the same, refs #888). This is a real, verified duplication (confirmed by direct read of both files during #888's Step 3 review), not a false positive.

## Deliverables

- [ ] Extract a shared `resolvePolicyConfig({ git, readFile, runDir, keys })` (or equivalent) helper — likely into `bin/lib/policy-schema.js` alongside `resolvePolicyKeys`, since that's already the shared dependency both CLIs import.
- [ ] `plugin/bin/resolve-policy.js`'s `main()` and `plugin/bin/lib/blast-radius-cli.js`'s `resolveConfig()` both call the shared helper instead of each reimplementing root/file resolution.
- [ ] No behavior change at either CLI's boundary — same stdout/stderr/exit-code contracts, same test suites green.

## Acceptance Criteria

- [ ] `tests/bin-lib/resolve-policy.test.js` (or equivalent) and `tests/bin-lib/blast-radius-cli.test.js` both pass unchanged against the refactored shared helper.
- [ ] `git grep` for the root-resolution + policy.yml/config.yml read pattern shows exactly one implementation, not two.

_Filed by `review` via specShapedBody._
