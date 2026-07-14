# Spec 20: Executors — /flow, /build, /wrap-up on Materialized Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One new step, zero changes below it: materialize the record into `{run-dir}/work/{n}-spec.md` at build start; everything downstream (writing-plans, execution, verification, review) consumes that file as it consumed a spec. `/flow`/`/build` take `#N` (+`#A,#B`) as primary input; `/wrap-up` reads the materialized header instead of `recon-*` frontmatter; leftovers become staged records.

**Architecture:** The materialization step lives ONCE in a new `skills/flow/materialize.md`, referenced by `/flow` and `/build`. The header is a pinned `---`-delimited frontmatter block reusing retired spec-template key spellings so downstream diffs are minimal. **Every header field has a named reader** (cross-file promise rule) — the table below is normative.

## The pinned header format (single definition — materialize.md owns it)

```markdown
---
record: {n}
origin: {code-health|harness-health|journey-health|capture|human}
risk: {low|medium|high}            # omitted when unscored
effort: {low|medium|high}          # omitted when unscored
grants: [build, merge]             # as held at materialization time; may be [build] or []
fingerprint: {fp}                  # omitted when none
surface: {web|mobile|desktop|backend|infra}
design-intent: {value}             # omitted for backend/infra
parked-at-shaping: true            # omitted unless the record was parked when shaped
---
{record body verbatim}
```

| Field | Named reader |
|---|---|
| `record` | `/wrap-up` close-via-merge carrier (`Fixes #{n}`) + Section E claim release |
| `origin` | `/wrap-up` summary/Review Console display (provenance line) |
| `risk` | Review Console display; future gate re-checks |
| `effort` | `/build` effort-based model-tier selection (replaces `code-health-effort`) |
| `grants` | Snapshot for audit; `/wrap-up`'s auto-merge check RE-READS LIVE LABELS before any merge (truth, not projection) — state this |
| `fingerprint` | Audit snapshot / dedup cross-reference |
| `surface` | `/claude-tweaks:design` wrapper Layer-2 detection (via /build Common Step 1.7 and /flow polish phase) |
| `design-intent` | design wrapper polish-mode intent-driven dispatch |
| `parked-at-shaping` | `/wrap-up` Section E release-with-abandon restores `parked` |

`surface`/`design-intent` values are LIFTED from the record body's `Surface:`/`Design-intent:` metadata lines (spec 17's wire format). Materialized files live under the run dir — committed as audit trail, never gitignored.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel`.
- **Legacy alias is load-bearing:** numeric spec-file input (`/flow 42`, `/build 42` reading `specs/42-*.md`) SURVIVES as a documented legacy alias while `specs/*.md` files exist (one-line compat note per file). The materialization path is PRIMARY; the file path is the alias. Do not delete the spec-file path.
- Materialization hard gate: an unshaped record body (per `_shared/work-record.md`'s spec-shaped definition) STOPS with "run `/claude-tweaks:specify #{n}` first" — this replaces flow Step 2.4's committed-file gate and Step 2.7's design-doc rejection AT THE RECORD LEVEL (both survive for the legacy spec-file alias).
- `/flow` issue-mode's internal `/specify #{issue}` derivation call is DELETED (AC 2) — records arrive pre-shaped; `/flow #A,#B` multi-record maps onto the existing `multi-spec.md` shared-worktree mechanics keyed by record ids.
- `/wrap-up`: Section E mechanics unchanged (ownership via `${CLAIM_RUN_ID:-$(basename "$PIPELINE_RUN_DIR")}` — keep exact); label ops renamed to `bot:*`; grant-removal-on-success row per issue-claims.md; carrier-commit path GUARDED on "materialized header present" (pure-local runs with no record must survive).
- Leftover routing: residue sections become records via `recordPayload` — NO `by:*` label (origin = the filing skill; wrap-up is a side effect), body line `Origin: wrap-up leftover from #{n}`, `parked: true` + trigger when one exists; in auto mode they are STAGED (not created) and the Review Console approves each per-item (never-silenced work-record creation row); `specs/backlog` references → 0 (AC 5).
- F10 inventory (this spec's scope): `skills/flow/manifesto.md`, `skills/design/modes/polish.md`, `skills/design/modes/survey.md` + the design read-path (`frontend-detection.md`, `command-map.md`, `modes/test.md`, `SKILL.md` where they read "spec frontmatter") — all now read the materialized header (or the record body-metadata lines when no run dir exists).
- F11 inventory (this spec's share): wrap-up (SKILL.md:320,335,412; cleanup-procedures.md:16-38,100,158,229; review-console.md:13), flow (worktree-merge.md:39; multispec-review-console.md:81,131,143; SKILL.md:46), build (SKILL.md:188; build-options.md:80) — every recon-*/INDEX/Step-8/"Frontmatter reference" mention dies or retargets.
- ACs 1-6 are the completion contract. Vocabulary sweep rule per touched file. No emojis. Tests updated same-task where they pin content.
- multispec-review-console.md's `tier:approved|tier:fast-track` label-removal steps (lines ~134,146) → grant-removal (`auto:build`/`auto:merge`) — spec 18/19 renamed the vocabulary; the console's flow-owned steps must match issue-claims.md's release-triggers table.

---

### Task 1: `skills/flow/materialize.md` (new) + `skills/flow/SKILL.md`

- Create materialize.md: resolution (`gh issue view {n} --json number,title,body,labels,url` / `local-store.js` readRecord), the shape hard gate, the pinned header block + reader table (copy from this plan), the lift rule for Surface/Design-intent lines, multi-record layout (per-record file in the same run dir; `multi-spec.md` per-spec subdirs keyed by record id), the legacy spec-file alias note, "committed as audit trail, never gitignore".
- SKILL.md: Input section → `#N` / `#A,#B` primary (+ legacy numeric alias line); Step 2.4/2.7 note the record-level replacement (legacy path keeps them); delete the `/specify #{issue}` derivation prose (AC 2 grep); Step 4 build invocation passes the materialized file; Relationship rows (triage/dispatch/specify/materialize.md); `recon-`/INDEX refs → 0.
- Verify: `grep -n "specify #{issue}\|specify \"#" skills/flow/SKILL.md` → 0 workflow matches; `grep -c "materialize.md" skills/flow/SKILL.md` ≥ 2; `grep -n "recon-" skills/flow/SKILL.md` → 0; header-block greps on materialize.md (`record:`, `parked-at-shaping:`, reader table present).
- Commit: `Add flow materialization — records resolve to run-dir spec files, #N primary input`

### Task 2: flow sub-files (multi-spec.md, steps-and-gates.md, worktree-merge.md, failure-cards.md, manifesto.md, multispec-review-console.md)

- multi-spec.md: record-id keying (`spec-{N}` subdirs → record ids; branch naming), vocabulary; CLAIM_RUN_ID row survives verbatim in mechanics.
- steps-and-gates.md: issue-reference section → record references (no /specify call); polish decision tree unchanged.
- worktree-merge.md :39 recon reference dies; close-via-merge merge-commit path reads the materialized header's `record`.
- failure-cards.md: release-offer wording → grants/bot vocabulary.
- manifesto.md (F10): design-intent lever reads the record's body-metadata / materialized header, not spec frontmatter; per-spec preview table's Surface source likewise.
- multispec-review-console.md: tier-label steps → grant removal (auto:build/auto:merge) per issue-claims.md's table; :81,131,143 recon/spec-file refs retarget to the materialized header / record ids.
- Verify: `grep -rn "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/flow/` → 0; `grep -rn "tier:approved\|tier:fast-track\|status:in-progress\|status:blocked" skills/flow/` → 0 (migration notes excepted, prefer 0); `grep -n "spec frontmatter" skills/flow/manifesto.md` → 0.
- Commit: `Retarget flow sub-files at materialized records — grants vocabulary, header reads`

### Task 3: build files (SKILL.md, build-options.md, design-prebuild.md, architecture-alignment.md, plan-audit.md, worktree-setup.md, failure-recovery.md — the frontmatter-reading spots)

- SKILL.md: Spec Step 1 accepts `#N` (materialize via materialize.md) with the legacy spec-file alias; Spec Step 2.5's ledger vocabulary fine; Common Step 2's `code-health-effort:` tier override → the header's `effort:` field (same tier mapping); Common Step 1.7 design pre-build reads header `surface`; :188 F11 ref dies; Relationship rows.
- build-options.md :80 F11 ref dies; input-resolution rules add `#N`.
- Sub-files: grep-driven — any `spec frontmatter`/`recon-`/`specs/NN` reads retarget to the materialized header/file.
- Verify: `grep -rn "recon-\|code-health-effort" skills/build/` → 0; `grep -n "effort:" skills/build/SKILL.md | head -3` (header read present); npm test tail.
- Commit: `Point build at materialized records — header effort tier, #N input`

### Task 4: wrap-up files (SKILL.md, cleanup-procedures.md, leftover-routing.md, review-console.md)

- cleanup-procedures.md: Section E reads `record:` from the materialized header (was recon-issue frontmatter); `${CLAIM_RUN_ID:-...}` resolution byte-preserved; `status:in-progress` label removal → `bot:in-progress`; grant-removal-on-success step (auto:build/auto:merge) replacing tier-label step; `parked` restore on `abandoned:` when header has `parked-at-shaping: true`; carrier commit (Section C) guarded on header-present; :16-38,100,158,229 F11 refs retarget.
- leftover-routing.md: full rewrite to staged records (recordPayload, no by:*, Origin: line, parked+trigger, STAGED in auto → console approves per-item; local driver via local-store); `specs/backlog` → 0 (AC 5).
- review-console.md :13 F11 ref; console reads staged leftover records for per-item approval; grant/bot vocabulary.
- SKILL.md :320,335,412 F11 refs; Section references consistent; spec lifecycle steps (mark complete / INDEX) → record close-via-merge framing with the legacy-alias note (INDEX updates stop; file deletion is migration's job — keep a one-line legacy note for spec-file-mode runs).
- Verify: `grep -rn "recon-\|specs/backlog\|status:in-progress\|status:blocked" skills/wrap-up/` → 0 (single legacy notes excepted per AC 1/4/5); `grep -n "parked-at-shaping" skills/wrap-up/cleanup-procedures.md` ≥ 1; `grep -n "bot:in-progress" skills/wrap-up/cleanup-procedures.md` ≥ 1; npm test tail.
- Commit: `Move wrap-up onto the materialized header — bot labels, grant removal, staged leftover records`

### Task 5: design read-path (F10) — skills/design/{SKILL.md,frontend-detection.md,command-map.md,modes/test.md,modes/polish.md,modes/survey.md}

- Layer-2 detection source: "spec frontmatter" → "the materialized header (`{run-dir}/work/{n}-spec.md`) — or, outside a pipeline run, the record body's `Surface:`/`Design-intent:` metadata lines". Spec-17's pointer fixes already updated the enum + section names in 4 of these files; this task moves the READ-PATH prose everywhere incl. modes/polish.md + modes/survey.md (the two F10 residuals).
- Verify: `grep -rn "spec frontmatter" skills/design/` → 0; `grep -rn "recon-\|specs/NN" skills/design/` → 0.
- Commit: `Move design wrapper reads onto the materialized header — F10 closed`

### Task 6: Spec-20 acceptance sweep

- ACs 1-6: `grep -rn "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/flow/ skills/build/ skills/wrap-up/` → 0 (single migration notes excepted); AC 2 grep; AC 3 (materialization exists ONCE as shared prose — `grep -rln "work/{n}-spec.md\|work/\${" skills/ | sort` shows materialize.md as the definition + referencers); AC 4 grep; AC 5 grep on leftover-routing; AC 6 npm test; F11 spot-checks (tidy's two hard dangling pointers are spec 21's — confirm NOT fixed here, still registered).
- Fix findings (spec-20 files only), re-run until clean. Commit only if fixes.
