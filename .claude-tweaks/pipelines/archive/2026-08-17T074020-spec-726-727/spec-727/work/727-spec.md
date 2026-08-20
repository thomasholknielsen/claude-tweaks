---
record: 727
origin: human
ceremony: fast-lane
grants: []
surface: backend
---
# 727: blast-radius globToRegExp: `**` never crosses a path segment — under-matches merge-sensitive-paths and docs/REGISTRY.md auto-detect

Defer-reason: pre-existing-outside-diff

Surface: backend

Origin: wrap-up Docs curation row (registry-overlap scan) from #677

## Current State

`bin/lib/issues/blast-radius.js`'s `globToRegExp` expands `*` to `[^/]*` and has no `**` case, so a `**` in a pattern matches at most one path segment — it never crosses a `/`. Measured on #677's diff (28 files): `classifyDiffFiles(files, ['skills/**'])` → `[]` although 12 `skills/**/*.md` files changed; `['bin/**']` → `['bin/hooks.js']` only, missing 4 `bin/lib/issues/*.js` files. Two consumers read this function:

- `/claude-tweaks:wrap-up`'s Docs curation row (`skills/wrap-up/docs-health-integration.md` D0) scores `docs/REGISTRY.md` Auto-detect patterns with it. `docs/plugin-structure.md` (`skills/**`, `bin/**`), `docs/hooks.md` (`bin/lib/hooks/**`) and `docs/releasing.md` (`bin/lib/release/**`) therefore score 0 on any nested change and are never picked for review — `docs/plugin-structure.md` scored 0 on a diff that changed 12 skill files and 4 issue-driver modules.
- `/claude-tweaks:assess-agent-autonomy`'s `merge-check` (`skills/assess-agent-autonomy/merge-check.md`) reads the same function against the `merge-sensitive-paths` policy key. A project that writes `src/auth/**` in `policy.yml` — the natural glob spelling — gets no floor trip on `src/auth/session/token.ts`. That is a silent under-detection on a safety floor.

Patterns that name a filename segment after the wildcards (`skills/**/SKILL.md`, `skills/_shared/*.md`) happen to work; bare-`**`-terminal ones do not.

## Deliverables

- [ ] `bin/lib/issues/blast-radius.js` `globToRegExp`: `**` matches zero or more path segments (`**/` → `(?:.*/)?`, a trailing `/**` → `(?:/.*)?`, a lone `**` → `.*`); single `*` stays segment-bound. Keep every other existing behavior byte-identical.
- [ ] `tests/bin-lib/issues/blast-radius.test.js` (or the existing test file for this module): `**` cases — `skills/**` matches `skills/backlog/overview-mode.md`; `bin/lib/hooks/**` matches `bin/lib/hooks/deep/x.js`; `src/**/*.test.js` matches nested tests; `*` still does not cross `/`; the merge-sensitive-paths shape (`src/auth/**`) trips on a nested file. Add a discrimination check that fails on the current implementation before the fix.
- [ ] Verify no consumer relied on the old narrow behavior: grep `merge-sensitive-paths` fixtures in `tests/` and `docs/REGISTRY.md` patterns; run the wrap-up engine's Docs-row scope resolution against a fixture diff to confirm `docs/plugin-structure.md` now scores nonzero for a nested `skills/` change.
- [ ] `docs/REGISTRY.md`: no pattern rewrite needed once the matcher is fixed — leave the `**` patterns as written (that is the point of fixing the matcher rather than the patterns).

## Acceptance Criteria

1. `node -e` over `classifyDiffFiles([{path:'skills/backlog/overview-mode.md'},{path:'bin/lib/issues/record.js'}], ['skills/**','bin/**'])` returns both files as `isSensitive: true`.
2. `src/auth/**` marks `src/auth/session/token.ts` sensitive; `src/auth/*` still does not.
3. The new tests fail on the pre-fix `globToRegExp` and pass after; `npm test` green.

## Technical Approach

Tokenise the glob left-to-right: `**/` and `/**` and bare `**` become the multi-segment classes above; `*` → `[^/]*`; `?` → `[^/]`; escape everything else. Anchor `^…$` as today. Two callers, one function — no signature change.

## Gotchas

- Widening the matcher widens the `merge-check` floor: a `merge-sensitive-paths` pattern that under-matched before will trip more often after — that is the intended correction, but the release note should say so.
- The wrap-up Docs row's proposed alternative (rewriting `docs/REGISTRY.md` patterns to `skills/*/*.md`, `bin/lib/*/*.js`, …) was declined at #677's Review Console in favour of this root-cause fix — do not do both.

