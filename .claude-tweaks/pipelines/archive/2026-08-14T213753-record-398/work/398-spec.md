---
record: 398
origin: capture
risk: low
size: low
ceremony: standard
grants: [build, merge]
surface: backend
---
# 398: Fold /version into /help

Surface: backend

## Current State

`/version` is the lowest-signal skill in the corpus: 88 lines / 4.7KB to read `plugin.json`; degree 2 in the skill graph, 7 cross-references in 5 files, zero eval scenarios, zero README mentions. Its one nontrivial flag (`--min <semver>` compat check) has no caller anywhere in the repo. `/help` already surfaces version-aware command syntax. `bin/lib/hooks/skill-invocation.js` uses `/claude-tweaks:version` as its doc-comment example of qualified invocation; `tests/changelog-coverage.test.js` and `tests/skill-invocation.test.js` mention it.

## Deliverables

- `/help` prints the installed version, resolved from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — preserving the resolution rule the version skill documents (never install metadata; that rule encodes a recorded lesson and must survive the move).
- Retire `skills/version/`; update the ~10 referencing files: `init/input-grammar.md`, `init/SKILL.md`, `docs-health/judge-procedure.md`, `help/reference-card.md`, `help/context-flow.md`, `docs/getting-started.md`, `docs/skill-graph.md`, `docs/plugin-structure.md`, the hooks doc-comment example, and the two tests.
- Drop `--min` entirely — no caller exists, `/help` does not inherit it.

## Acceptance Criteria

- `/help` output includes the installed version; grep shows no surviving `/claude-tweaks:version` invocation outside CHANGELOG / incident-log (output shown).
- `tests/skill-invocation.test.js` and `tests/changelog-coverage.test.js` updated and green; the hooks example swapped to another qualified skill name.
- `/help` workflow diagrams and the skill count stay consistent (CLAUDE.md rule: diagrams list all skills).

## Technical Approach

Move the plugin-root version-resolution paragraph into help's reference card first (expand), repoint the referencing files, then delete the skill (contract).

## Gotchas

- `docs-health/judge-procedure.md` cites `/version` in its freshness-check context — confirm what it actually uses it for and repoint to the /help equivalent rather than deleting the mention.
- The description row disappears from #394's trim list — sequence-aware but harmless in either order (dispatch grouping serializes).

## Original request

Fold /version into /help

**Related:** none

Context: Bloat audit: lowest-signal skill in the corpus (degree 2, 88 lines to read plugin.json, zero evals, zero README mentions); its only nontrivial flag (--min semver) has no caller anywhere in the repo.

Scope: /help prints the installed version inline; remove the skill, its description, and its diagram/reference rows; ~10 referencing files.
