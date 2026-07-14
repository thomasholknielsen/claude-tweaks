# Spec 23: Docs Consolidation, Cross-Reference Sweep, Major Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep every remaining cross-reference onto the unified-record vocabulary, update user-facing docs (README, reference card, context flow, CLAUDE.md rows, the lifecycle diagram), confirm/delete the compat modules, bump to **6.0.0** with the marketplace mirror.

**Architecture:** Sweep FIRST (it generates the real worklist), fix, then docs, then version. The sweep hunts structural patterns, not just literal tokens.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel`.
- **Sweep exclusion set (self-exclusion lesson — the sweep's own instructions quote retired text):** `specs/*.md` (the 11 program specs legitimately describe retirements), `docs/superpowers/specs/` (historical design docs), `docs/superpowers/plans/2026-07-14-spec-*.md` (this program's plans quote before/after), `docs/plans/2026-07-14-unified-work-record-ledger.md` (run ledger), `.claude-tweaks/`, `.superpowers/`, `.git/`.
- **No live gh writes:** spec 23 "files gaps as new records, not fixed inline" — but work-record creation is never-silenced; STAGE any proposed record as `{run-dir}/staged/spec23-record-{slug}.md` (run dir: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-07-14T020251-spec-13-14-15-16-17-18-22-19-20-21-23/spec-23/staged/`) for console approval. Never `gh issue create`/`close` in this spec.
- CLAUDE.md edits are DESCRIPTIVE rows only (Structure/sub-files/Don'ts/Backlog-integration *description*) — the `backlog-backend: github-issues` VALUE stays (migration later). Every Don'ts row edit preserves the rule's lesson.
- No emojis (diagram HTML included); commit style; plain subjects.
- ACs 1-6 = completion contract.

---

### Task 1: The retirement sweep (repo-wide) + structural-pattern sweep + fixes

The load-bearing task. Record the exact commands + final outputs in the report (AC 1 requires the command set written down and the final run returning only annotated compat/migration hits).

**Literal-token passes** (case-insensitive, across `skills/ bin/ README.md CLAUDE.md docs/` minus the exclusion set):
```bash
EXC='--exclude-dir=.git --exclude-dir=.claude-tweaks --exclude-dir=.superpowers'
grep -rin $EXC "tier:approved\|tier:fast-track\|tier:needs-review\|status:in-progress\|status:blocked\|backlog:category\|inboxIssuePayload\|recon-issue\|recon-fingerprint\|specs/backlog" skills/ bin/ README.md CLAUDE.md docs/ | grep -v "docs/superpowers/specs/" | grep -v "docs/superpowers/plans/2026-07-14-spec-" | grep -v "docs/plans/2026-07-14-unified"
grep -rin $EXC "risk-low\|risk-medium\|risk-high\|effort-low\|effort-medium\|effort-high" skills/ bin/ | ...same excludes...   # hyphen scoring
grep -rin $EXC "WORK_TYPES_NATIVE\|triage-retry-ceiling\|triage-fast-track-" skills/ bin/ README.md CLAUDE.md docs/ | ...    # retired aliases (NOTE: dispatch/SKILL.md's legacy-alias NOTE line is the one sanctioned mention)
grep -rinw $EXC "inbox\|deferred" skills/ bin/ README.md docs/ | ...   # bare words as concept names (INDEX.md's own text + capture's single alias sentence are sanctioned; judge each hit)
grep -rn "INDEX.md" skills/ | ...   # only legacy-alias-guarded mentions may remain
```
**Config-key consistency:** every `work-types`/`work-links`/`work-backend` occurrence uses those exact spellings + value enums; the `by:*` family = exactly 4 members everywhere enumerated.
**Structural passes** (grep-able shapes, not keywords):
```bash
grep -rn "Write\|create" skills/ --include="*.md" -l | xargs grep -ln "specs/" | ...   # (a) prose writing NEW files into specs/ outside local-store paths — inspect each
grep -rn "gh issue list\|gh issue view\|gh issue edit\|gh issue create" skills/ | grep -- "--label\|--add-label\|--remove-label"   # (b) every label named must be in work-record.md's taxonomy (+sanctioned diagnostics + type:*)
grep -rn "^tier:\|^status:\|^progress:\|^blocked-by:" skills/ --include="*.md" -A0   # (c) frontmatter lists with retired spec-era keys outside local-store's documented set
```
**Known worklist seeds (fix in this task):** `skills/ledger/resolve-gate.md` (specs/backlog + Stage vocabulary → staged work records / console approval — Phase 2/3 dispositions retarget; mechanics unchanged); `skills/_shared/auto-mode-contract.md` reflect keep-route row (run-ledger item 1 / M1: "files as a record" → "stages a record proposal for the Review Console"); `skills/help/reference-card.md:162` (specs/backlog doctrine line — vocabulary only; T2 does the full catalog update); health-skill SKILL.mds' "mid-run" → "mid-flow" (3 files, matches work-record.md's canonical wording); body-footer uniformity (run-ledger item 6: `_Filed by /code-health._` → `_Filed by \`/claude-tweaks:code-health\`._` in `bin/lib/code-health/issue-payload.js` v2 + its tests).
- Fix every defect found; annotate every sanctioned survivor (legacy-read compat lines get `legacy` comments where missing; migration-note lines confirmed singular per file).
- Resolve run-ledger item 1 (M1) → fixed with commit ref.
- Verify: re-run the full pass — output ONLY sanctioned hits (list them in the report verbatim); npm test.
- Commit: `Run the 6.0 retirement sweep — retarget resolve gate, reflect routing, and residual vocabulary`

### Task 2: README + reference-card + context-flow + CLAUDE.md rows

- README: lifecycle/artifact sections → record spine (backlog → ready → authorized → building → closed), two drivers, `/dispatch` in the catalog, "Migrating from 5.x" stub (names what the later migration plan covers: live tier:*/status:*/backlog-label records, specs/backlog files, CLAUDE.md flag values), changelog entry for 6.0.0.
- reference-card.md (single source of truth): add `/dispatch`; retarget `/specify`/`/flow`/`/triage`/`/tidy` descriptions; record vocabulary.
- context-flow.md: artifact flow onto records (F11: :52 stale pointer dies).
- CLAUDE.md: Structure tree + skill-count updates (add `skills/dispatch/`, count 28→29); sub-files table rows for changed skills (+ flow's `materialize.md`; specify's template rename; triage/tidy/help/init row descriptions); `## Backlog integration` section description → "work-backend (legacy alias backlog-backend, value migration pending)" — VALUE line unchanged; Don'ts rows naming retired mechanisms reworded to preserve each lesson (INBOX/specs-backlog/tier examples get record-era equivalents).
- Catalog↔README sync rule satisfied both ways (AC 2 — diagrams agree).
- Verify: `grep -n "dispatch" README.md skills/help/reference-card.md skills/help/context-flow.md | head -6`; the retirement greps stay clean on the four files; npm test (statusline/docs tests may pin README content — update same-task).
- Commit: `Consolidate user-facing docs onto the unified record — README, reference card, context flow, CLAUDE.md rows`

### Task 3: Regenerate `docs/diagrams/github-issues-lifecycle.html`

- Same self-contained conventions as the current file (read it first: foreignObject text wrapping, theme variables, no external resources): the new model — spine (BACKLOG→READY→AUTHORIZED→BUILDING→CLOSED with parked/not-planned/bot:blocked exits), six axes, grants, `/capture`+health+`/specify`+`/triage`+`/dispatch`+`/flow` tracks, label reference table from work-record.md's taxonomy (≤100-char descriptions).
- AC 3 greps: contains `auto:build`/`auto:merge`/`bot:`/`ready`/`parked`; zero `tier:`/`status:`/`backlog`-label vocabulary.
- Verify + commit: `Regenerate the work-record lifecycle diagram — spine, six axes, grants, dispatch`

### Task 4: Compat-module check + ledger staging

- `grep -rn "require.*ingest\|require.*backlog" bin/ skills/ tests/ --include="*.js" --include="*.md"` — enumerate callers of `bin/lib/issues/ingest.js` + `backlog.js` outside their own tests. If ZERO: `git rm` both modules + their test files; re-run npm test. If callers remain: document each in the report + stage a record proposal.
- Stage run-ledger item 7 as a record proposal: write `{run-dir}/spec-23/staged/spec23-record-grouping-widening.md` (Title/Type/Labels/body per leftover-staging format — recordPayload-compatible; body cites grouping.js's bare-label check + the by:* widening + test).
- Ledger: item 7 open → the console decides (leave open; note the staged proposal in Resolution column as "staged: spec23-record-grouping-widening.md — console decides").
- Verify + commit: `Delete caller-free compat modules and stage the grouping-widening record proposal` (or document-only commit if callers remain).

### Task 5: Version 6.0.0 + marketplace mirror + final ACs

- Fetch-first: `git fetch origin main && git log --oneline -3 origin/main -- .claude-plugin/plugin.json` — if a bump landed upstream, renumber accordingly (6.0.0 unless someone claimed it).
- `.claude-plugin/plugin.json`: version → `6.0.0`; description updated to the record model if warranted. `package.json` version too (it exists and says 4.18.0 — align it; note: it's the test-harness manifest).
- Marketplace mirror: check `ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace/.claude-plugin/marketplace.json"` — if present, edit `plugins[].version` → 6.0.0 + description aligned, commit in THAT repo (in-command `cd`; the session's EnterWorktree-first state satisfies the policy-gate workaround) — but do NOT push. If absent, stage the exact edit as `{run-dir}/spec-23/staged/marketplace-mirror.md` (AC 4 allows it).
- Final ACs 1-6 re-run (incl. AC 6: /dispatch Relationship rows bidirectional spot-check) + full npm test.
- Commit: `Bump to 6.0.0 — unified work record on GitHub Issues`
