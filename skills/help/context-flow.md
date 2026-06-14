# Context Flow Between Skills

How data and context pass between skills in the workflow lifecycle.

## The Mechanism: Durable Artifacts

Skills communicate through **files on disk** — not through session state, environment variables, or in-memory data. Each skill reads artifacts produced by upstream skills and writes artifacts consumed by downstream skills.

This design means:
- **Context survives across sessions** — you can run `/capture` today and `/challenge` tomorrow
- **Context is inspectable** — artifacts are markdown files you can read and edit
- **Context is explicit** — if a skill needs input, it reads a specific file

## Artifact Flow

```
INBOX item          ──→ Brief               ──→ Design Doc          ──→ Spec              ──→ Code + Journey
specs/INBOX.md         docs/plans/*-brief.md   docs/superpowers/specs/*-design.md  specs/NN-*.md         src/ + docs/journeys/
  /capture               /challenge              /superpowers:brainstorming            /specify              /build
                                                                         ↓                     ↓
                                                                   (deletes brief           Deferred items
                                                                    + design doc)           specs/DEFERRED.md
```

```
Code + Journey ──→ Story YAML     ──→ Test (mechanical gate)  ──→ Review (analytical)       ──→ Learnings Routed    ──→ Clean Slate
src/ + journeys    stories/*.yaml     types + lint + tests + QA     code + visual + coverage       CLAUDE.md updates       (spec + plans + ledger deleted)
  /build             /stories           /test                         /review                         /wrap-up
             (auto in /flow          Sets TEST_PASSED=true      Gates on TEST_PASSED            ↕                       ↑
              when UI changed;       (QA when stories exist)    Journey-story coverage       Open Items Ledger
              ingests journeys       journey={name} filter      (browser review)             (tracks findings across phases)
              for story design)
```

## What Each Skill Reads and Writes

| Skill | Reads | Writes | Deletes |
|-------|-------|--------|---------|
| `/init` | `~/.claude/plugins/`, entire codebase, CLAUDE.md, config files, git state | `specs/`, `docs/plans/`, `docs/journeys/`, `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/INDEX.md`, CLAUDE.md, `.claude/skills/*.md`, `.claude/rules/`, `docs/journeys/*.md` | — |
| `/capture` | — | `specs/INBOX.md` (append) | — |
| `/challenge` | `specs/INBOX.md` | `docs/plans/*-brief.md` | — |
| `/superpowers:brainstorming` | `docs/plans/*-brief.md` | `docs/superpowers/specs/*-design.md` | — |
| `/specify` | `*-design.md`, `*-brief.md`, `specs/INDEX.md` | `specs/NN-*.md`, `specs/INDEX.md` | `*-design.md`, `*-brief.md`, INBOX entry |
| `/build` | `specs/NN-*.md`, `docs/plans/*.md` | Code, plan files, ledger items. Invokes `/journeys` for journey files and `/simplify` for code cleanup. Worktree mode also produces transient worktree directories and feature branches. | — |
| `/journeys` | Changed files (from parent or git diff), `docs/journeys/*.md` | `docs/journeys/*.md` | — |
| `/simplify` | Changed files (from parent or git diff) | Simplified code (in-place) | — |
| `/deepen` | Changed files / spec scope, module call sites | Depth refactors (in-place) or staged candidates; ledger items (phase `deepen`) | — |
| `/reflect` | Changed files, review summary (in full mode), ledger | Ledger items (phase depends on invoker: `review/hindsight`, `wrap-up`, or `reflect`) | — |
| `/test` | CLAUDE.md (for commands), `stories/*.yaml` (in qa/all mode) | `TEST_PASSED=true`, QA report (when stories exist), `docs/plans/*-ledger.md` (QA findings and observations) | — |
| `/test` (qa mode) | `stories/*.yaml`, `stories/auth.yml` (for auth profile resolution) | `screenshots/qa/report.json`, `screenshots/qa/report.md`, `TEST_PASSED=true`, `docs/plans/*-ledger.md` (QA findings and observations) | — |
| `/browse` | — | `screenshots/browse/` | — |
| `/research` | Web sources (built-in `/deep-research` or `WebSearch`/`WebFetch`) | `.claude-tweaks/research/[YYYY-MM-DD]-[slug]/` (`report.md` + `sources.json`) | — |
| `/stories` | Existing `stories/*.yaml`, `stories/auth.yml` (for auth profiles), `docs/journeys/*.md` (for journey-aware generation), site via `/browse`, component source files (for source analysis) | `stories/*.yaml` (with `source_files:` and `journey:` fields), `stories/auth.yml` (created on first auth detection) | — |
| `/review` | Code (via git diff), `specs/NN-*.md`, `docs/journeys/*.md`, `stories/*.yaml` (for journey-story coverage), `TEST_PASSED` from /test, ledger (including QA entries with phase `test/qa`), QA screenshots + page inventories (for UX analysis lens) | Review summary, ledger items. Invokes `/reflect` (hindsight mode), `/simplify`, and `/visual-review`. | — |
| `/visual-review` | Running app (via browser), `docs/journeys/*.md` (journey mode), QA data (optional enrichment), source files (for reconnaissance) | Visual review report, journey file updates, `screenshots/` | — |
| `/wrap-up` | `specs/NN-*.md`, review output, plan files, ledger, `.claude/skills/*.md` (relevant skills from ledger entries) | CLAUDE.md updates, skill updates, `DEFERRED.md`, `docs/decisions/*.md` (ADRs, Step 6.3). Invokes `/reflect` (full mode). | Spec file, plan files, ledger |
| `/tidy` | All artifacts | Cleanup actions | Stale artifacts |

## Open Items Ledger

The open items ledger (`docs/plans/YYYY-MM-DD-{feature}-ledger.md`) is a transaction log that tracks findings and operational tasks across pipeline phases. Created by `/flow` at pipeline start (or by `/build` when running standalone), it persists across all phases until `/wrap-up` resolves every item and deletes the file.

Unlike conversation context, the ledger survives context window compression — it's a file, not a message. This prevents findings from one phase being lost before a later phase can act on them.

## Pipeline Run Directory (v4.6+, auto/hybrid mode)

In auto/hybrid mode, each `/flow` invocation creates a per-run directory at `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`:

| File | Written by | Read by |
|---|---|---|
| `config.yml` | `/flow` Step 3 (Pipeline Config Manifesto) | Every downstream skill — policy lookup for scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness |
| `decisions.md` | Every skill that auto-resolves a decision (per `_shared/auto-decision-log.md`) | `/wrap-up` Step 8.6 (Wrap-Up Review Console) |
| `staged/*.patch` and `staged/*.md` | Skills that defer decision-worthy items | `/wrap-up` Step 8.6 |

The directory is **collision-safe** across parallel agents (multiple `/flow` runs in the same checkout each get their own `{ISO-timestamp}-{spec-slug}` directory). Downstream skills locate the active run via the `PIPELINE_RUN_DIR` env var or by selecting the most recent matching directory.

After successful pipeline closure, `/wrap-up` Step 10 moves the directory to `.claude-tweaks/pipelines/archive/{run-id}/` — preserving the audit trail without polluting the active workspace.

## Within-Session Context

When skills run in sequence within the same session (via `/flow` or manual chaining), conversation context supplements the artifact flow:

- `/flow` explicitly passes build output to review and review output to wrap-up
- The open items ledger carries forward across phases as a file — independent of conversation context
- Manual chaining (running `/review` after `/build` in the same session) inherits conversation context naturally

## Cross-Session Context

When skills run in separate sessions, only the durable artifacts carry context:

- Start `/build 42` today — artifacts are written to disk
- Start `/review 42` tomorrow — reads spec and git diff, no session dependency

This is why every skill writes its output to files, not just to the conversation.

## The No-Drop Rule

Every artifact that a skill produces must be consumed by a downstream skill or explicitly resolved:

- Specs are deleted by `/wrap-up` after completion
- Design docs and briefs are deleted by `/specify` after absorption into specs
- Plans are deleted by `/wrap-up` after the work is done
- Ledger files are deleted by `/wrap-up` after all items are resolved
- INBOX items are promoted, merged, or explicitly kept by `/tidy`
- Deferred items have triggers that re-activate them when conditions are met

Nothing silently accumulates. If an artifact exists, a skill is responsible for it.
