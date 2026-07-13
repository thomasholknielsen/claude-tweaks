# Unified work record on GitHub Issues — design

**Date:** 2026-07-13
**Status:** validated (brainstorm complete, user-approved section by section)
**Scope:** full redesign of how the plugin creates, matures, authorizes, dispatches, and closes units of work. Migration is deliberately out of scope for this document (design clean, migrate later) — a sketch is included at the end as input to the eventual migration plan.

## Problem

The plugin's GitHub-issues integration grew in three separate tracks, each with its own vocabulary, lifecycle, and config surface:

1. **Health findings** — code-health / harness-health / journey-health file issues → `tier:*` authorization gate (`/triage`) → claim → `/flow` → close-via-merge. journey-health sits outside the gate entirely (its issues are never pulled by triage).
2. **Captured work** — `/capture` and `/tidy`'s Defer action write `backlog`-labelled issues (or local files, per `backlog-backend`) with `backlog:category-*` / `parked` labels, no authorization gate, routed via challenge/brainstorm/specify.
3. **Ad hoc** — a human files a raw issue, or points `/specify` at any `#N` directly.

On top of that, defined work lives in a **second ID space** (`specs/NN-*.md`) stitched to the first by frontmatter. The stitching is the tell: of the spec template's 10 frontmatter fields, 4 exist only to link the two records (`recon-issue`, `recon-fingerprint`, `recon-was-parked`, `code-health-effort`) and 4 re-implement native GitHub machinery by hand (`status`, `progress`, `blocked-by`, `tier`) — a shadow issue tracker in YAML. Queue state consequently lives in up to three homes; this repo itself currently has stale legacy backlog files (`specs/INBOX.md`, `specs/DEFERRED.md`) alongside an empty `specs/backlog/` and live issues — drift in the plugin's own repo.

Costs: humans and agents carry three mental models; every consumer re-learns the stitching; `/tidy` and `/help` re-implement issue tracking over markdown; label conventions are inconsistent (`risk-low` vs `code-health:effort-low` vs `tier:approved`).

## Decisions (brainstorm outcomes)

| # | Decision | Rationale |
|---|---|---|
| 1 | Full redesign; design clean, migrate later | Target state first, unconstrained by live labels |
| 2 | **Origin ≠ type.** Type = native GitHub Issue Types; origin = provenance labels | `/capture` is a *mechanism*, not a work type — it can capture bugs, features, chores alike |
| 3 | **Origin-agnostic gate** — any record is eligible for authorization once ready | Eligibility follows readiness, not who filed it. journey-health joins the same pipeline |
| 4 | **The issue IS the work record** (Model A) — sub-issues for decomposition, spec files only as ephemeral build materializations; two storage drivers | 8/10 frontmatter fields dissolve or go native; one ID space; the queue lives where humans look |
| 5 | Authorization = **two stackable grants** (`auto:build`, `auto:merge`), absence = not authorized | Names exactly what is granted; failure handling becomes plain revocation |
| 6 | Design narrative → **parent issue body** after decomposition; ADRs remain the durable rationale home; the brainstorm's design-doc file is still deleted after decomposition | Program context one click from every work item; consistent with existing scaffolding philosophy |
| 7 | Vocabulary: **backlog** (absence of stage labels), **parked**, **ready**. The words "inbox"/"deferred" never name concepts. `bot:*` replaces `status:*`. "Health skills," never "watchdogs" | Retired terminology stays retired; prefixes encode ownership |
| 8 | **Labels are projection, not truth** (named invariant) | Machine truth = body structure, claim refs, merge history; every autonomous action re-verifies truth |
| 9 | **Triage/dispatch split** into separate skills; dispatch is a thin queue-protocol wrapper; **drain mode rejected** (context rot) | Authorize and consume are different roles; throughput = cadence × `next`, never batch size inside one session |
| 10 | Native Issue Types with **`type:*` label fallback** probed at init | Issue Types are org-level; personal-account repos may lack them |

## The model

### Spine

Every unit of work — health finding, captured item, human-filed issue — is one record walking one lifecycle:

```
 BACKLOG ─────────► READY ──────────► AUTHORIZED ────────► BUILDING ─────────► CLOSED
 (open, no          (`ready`:          (auto:build,         (claim ref +        (merge commit
  stage labels;      body is spec-      optionally           bot:in-progress;    "Fixes #N";
  any origin,        shaped and         auto:merge —         spec materialized,  claim released;
  any type)          agent-sized)       human-granted,       ephemeral)          reason: completed)
    │                    ▲              interactive only)       │
    │  challenge /       │                                      │ failure: release claim,
    │  brainstorm /      │ /specify stamps                      │ revoke auto:merge, retry
    │  refine — body     │ when shaping                         ▼
    │  edits + comments  │ completes                     bot:blocked at retry
    │                    │                               ceiling + notification
    ├─► parked (postponed; milestone = time trigger,
    │   watched-paths = touch trigger — /tidy wakes them)
    └─► closed not-planned (wontfix / duplicate / absorbed into #M)
```

Decomposition is native: a big ask becomes a **parent issue** (body = design summary: problem, chosen approach, key decisions, why alternatives lost) with spec-shaped **sub-issues** as leaves, ordered by native blocked-by dependencies. Only leaves ever get `ready`; parents are grouping shells that close when their children do. Tasks never become issues — they stay checklists inside bodies (GitHub renders them as live progress).

Health-skill records are **born ready**: they are agent-sized and spec-shaped by construction, so they skip maturation and appear directly in the triage worklist.

### Axes

| Axis | Mechanism | Owner |
|---|---|---|
| Type (bug/feature/task…) | Native Issue Types; `type:*` label fallback where unavailable | Filer, at filing |
| Origin (provenance) | `by:code-health` `by:harness-health` `by:journey-health` `by:capture`; absence = human-filed | Filer, at filing; immutable; nothing reads it mechanically |
| Scoring (gate inputs) | `risk:low\|medium\|high` `effort:low\|medium\|high` | Health skills at filing; `/specify` for anything unstamped |
| Stage (maturation) | absence = backlog; `parked`; `ready` | Maturation skills |
| Authorization | `auto:build` `auto:merge` | **Humans, interactive only** |
| Bot state (operational) | `bot:in-progress` `bot:blocked` | Claim/dispatch machinery only |

Plus: `wontfix` (human-set suppression; health skills respect it on re-filing) and optional `priority:high|medium|low` (humans only, absence = unprioritized, never required by any flow).

**17 core labels** (4 origin + 6 scoring + 2 stage + 2 authorization + 2 bot + `wontfix`), plus the 3 optional `priority:*`. Producer detail labels (`code-health:<criterion>`) may remain as optional diagnostics; harness-health's additive/restructural classification folds into `risk:*` (additive → `risk:low`) instead of being a producer-specific label the gate must know about.

### Permission matrix (the collaboration contract)

| Actor | Adds | Removes | Never touches |
|---|---|---|---|
| Human (triage+ role) | anything | anything | — |
| Health skills | `by:*`, `risk:*`, `effort:*`, Type, `ready` (born-ready) | — (respects `wontfix`) | `auto:*`, `bot:*`, `parked` |
| `/capture` | `by:capture`, Type | — | scoring, stage, `auto:*` |
| `/specify` | `ready`, `risk:*`/`effort:*` if unstamped; sub-issues; body shaping | `parked` (on promotion) | `auto:*`, `bot:*` |
| `/triage` (human present) | `auto:*` per human confirmation | `ready` (flag back to backlog, with comment) | — |
| `/dispatch` / `/flow` / `/wrap-up` | `bot:*` | `bot:*`; `auto:merge` (failure downgrade); `auto:*` (retry ceiling) | granting `auto:*` |
| `/tidy` | `parked`, `priority:*` | `parked` (evidence tier) | `auto:*` |

**The security boundary in one sentence:** `auto:*` labels are only ever *added* by an interactive human session (enforceable because GitHub restricts labelling to triage+ collaborators, with label events as audit trail); machinery may only *remove* them. `auto:merge` is additive on top of `auto:build` — the gate always grants both together; `auto:merge` alone is inert (dispatch queries `auto:build` only).

**Invariant — labels are projection, not truth.** Machine truth lives in body structure, claim refs, and merge history; labels are the human-readable projection. Every autonomous action re-verifies truth before acting: the gate re-checks body shape despite `ready`; dispatch re-checks the claim ref despite `bot:in-progress`. New skills must follow this rule.

### Native machinery replacing hand-rolled state

| Was | Becomes |
|---|---|
| `status:`/`progress:` frontmatter | Issue state + checkbox progress rollup |
| `blocked-by:` frontmatter + Prerequisites table | Native blocked-by dependencies |
| `tier:` frontmatter, `specs/INDEX.md` tiers | `priority:*` (optional) |
| `recon-issue`/`recon-fingerprint`/`recon-was-parked`/`code-health-effort` frontmatter | Gone — nothing to stitch |
| Spec-number ID space | Issue numbers (`/flow #42,#45`) |
| `specs/INDEX.md` | Nothing — the index is a live query |
| `backlog` + `backlog:category-*` labels | Gone (state is absence; Type covers the split) |
| Time-triggered parking | Milestones (unchanged) |
| Close semantics | Native reasons: `completed` (merge) / `not planned` (wontfix, duplicate, absorbed) |

## Record store

One flag, `work-backend: github-issues | local-files` (CLAUDE.md `## Backlog integration` section, replacing `backlog-backend` — now governs **all** work records). Set by `/init` (recommend `github-issues` when remote + authenticated `gh` detected), re-asked by Update-Mode on drift. Both drivers implement one contract: create (idempotent), read, query by facet, update body, set/remove labels per the permission matrix, link parent/child + dependencies, close with reason.

**`github-issues` driver.** Records are issues; Types, sub-issues, dependencies, milestones, close reasons, checkbox progress are native. Labels bootstrapped lazily from one shared `LABELS_JSON` (`_shared/label-bootstrap.md`). Claims stay `refs/claims/issue-<n>` with the `bot:in-progress` mirror. Idempotency: every programmatic creation (health skills *and* `/specify` decomposition) embeds `<!-- work-fingerprint: … -->` in the body; readers accept the legacy `code-health-fingerprint` marker during the migration window. A partially-failed multi-record creation resumes by querying fingerprints and creating only what's missing.

**`local-files` driver.** Records are `specs/{n}-{slug}.md` — deliberately today's path and shape. Frontmatter carries what GitHub would provide natively: `type`, `parent`, `blocked-by`, `stage` (absent = backlog | `parked` | `ready`), `grants: [build, merge]` (recorded for isomorphism and later Sync to GitHub — no headless consumer reads it locally), `origin`, `risk`, `effort`, optional `priority`, `unsynced` (fallback writes). Closure = file deletion; git history is the archive. IDs allocate max+1.

**Honest boundary:** headless autonomous dispatch is **github-issues only**. The `auto:*` gate rests on GitHub RBAC and the claim protocol on atomic ref creation; a local file carries neither a trustworthy human signature nor a cross-session lock. `local-files` repos get the full lifecycle minus unattended dispatch: capture, shaping, manual `/build`/`/flow`, close-on-merge all work.

**Materialization.** At build start the record is materialized into `{run-dir}/work/{n}-spec.md` — issue body + generated header (id, origin, grants held at dispatch time), or a copy of the local file. Everything downstream (`/superpowers:writing-plans`, `/build`, `/review`) consumes this file exactly as it consumes a spec today — zero change below the materialization line. Side benefit: the run dir's audit trail preserves the spec as it was at build time. Once materialized, an in-flight build no longer depends on GitHub availability; the closing keyword acts at push time.

**Resilience (github driver).** Write-path failure → create the record as a local file with `unsynced: true`; `/tidy` offers Sync to GitHub (existing mechanism, generalized). Read-path failure has no fallback (accepted risk). Decomposition is parent-first, children-by-fingerprint — resumable, never duplicated.

## Roles: triage, dispatch, flow

```
/triage                       /dispatch                          /flow
human gate (interactive       queue consumer (headless-          pure executor (unchanged):
only): reviews ready          capable, thin): GET next            runs one record/group
records — any origin —        authorized unclaimed group →        it is handed
grants auto:*                 claim whole group → hand to
                              /flow → settle (release /
        writes ───────►       revoke / report) ──────────►
        the queue             never grants; only revokes
```

**`/triage`** — single-purpose, interactive-only. Pulls open `ready` ungranted records of any origin; batch table with mechanical recommendation from risk × effort (recommend `auto:merge` only for `risk:low` + `effort:low`); one AskUserQuestion confirm; grants. "Flag back" = remove `ready` + comment why. No scheduled existence, no headless mode.

**`/dispatch`** — the queue protocol wrapper: `select → claim group → invoke /flow → settle`. Three selection forms, same protocol underneath:

| Form | Selector | Use |
|---|---|---|
| `/dispatch` | Human picks — authorized queue rendered as batch table, pick one or more | Interactive choice |
| `/dispatch next` | System picks next group (priority if present, then oldest) | Scheduled routine; supervised "give me the next one" |
| `/dispatch #42` | Direct — a specific record | Straight from a `/triage` Next Action |

Rules: claim **all members of a file-overlap group** before starting (two overlapping `next` firings must not split a natural group into conflicting worktrees); concurrent firings are safe by the claim protocol (422 → skip, stale takeover per `_shared/issue-claims.md`). **No drain mode** — a session shepherding N pipeline runs accumulates context until it rots; throughput is cadence × `next`. The consolidated multi-group Review Console dies with drain. Failure ladder per group, in-session: release claim → revoke `auto:merge` if present → count attempts (comment-based, as today) → below ceiling: leave for next firing; at ceiling: remove `auto:*`, add `bot:blocked`, notify. Auto-merge gate for `auto:merge` runs keeps today's four layers (grant present at dispatch, scoring eligibility, runtime cleanliness — no review findings ≥ medium, blast-radius caps) and the branch-guarded merge procedure. Headless `auto:build`-only runs that finish park as pending-review with their branch; the rolling digest + notification surface them.

**`/flow` and `/build`** — unchanged in role. Take `#N` (or local id), materialize, execute. Multi-record: `/flow #42,#45`. Interactive `/build` still doesn't claim (single human, single session — as today).

**Routine story:** `/routine create dispatch` schedules `/dispatch next` on a cadence. Triage's routine template retires.

Config (CLAUDE.md / `policy.yml`): `dispatch-retry-ceiling` (default 3), `automerge-max-lines` (40), `automerge-max-files` (2), `dispatch-pick-max-concurrent` (3; interactive multi-pick only).

## Skill-by-skill consequences

| Skill | Under the new model |
|---|---|
| Health skills | File records `by:*` + `risk:*`/`effort:*` + Type + spec-shaped body + fingerprint; born `ready`. journey-health joins the pipeline |
| `/capture` | Files a plain record: title, ≤5-line body, Type, `by:capture`. Routing prompt survives (challenge / brainstorm / keep / absorb into #M) |
| `/challenge` | Annotates the record via comments |
| `/specify` | The shaper: enriches body to spec shape; decomposes into parent (design summary) + leaf sub-issues + dependencies; stamps `ready`, scoring if unstamped; removes `parked` on promotion. Writes no spec files |
| `/triage` | Pure human gate (above) |
| `/dispatch` | New skill — queue consumer (above) |
| `/flow` `/build` | Materialize, then unchanged |
| `/wrap-up` | Close-via-merge `Fixes #N`; release claim; clear `bot:in-progress`; leftover routing files new records (backlog state) or parks them |
| `/tidy` | One record scan replaces backlog-file + specs-dir + gh-issue scans; parked-trigger wakes; unsynced sync; digest; evidence tier. INDEX-drift and legacy-file scans die with their structures |
| `/help` | Dashboard = live queries: counts by stage, grants, bot state, blocked |
| `/init` | Sets `work-backend`; bootstraps 17 labels; probes Issue Types (native vs `type:*` fallback) |
| `/routine` | `dispatch` template replaces triage's |

Code consequences: `tier.js` shrinks to risk × effort → recommendation; `ingest.js`/`backlog.js` merge into one record-payload module; `recon-*` plumbing through specify/build/wrap-up vanishes; `groupByFileOverlap` unchanged.

## What dissolves

`specs/` as a durable directory · `specs/INDEX.md` · the legacy backlog files (`specs/INBOX.md`, `specs/DEFERRED.md`) · `specs/backlog/` · the `backlog` and `backlog:category-*` labels · the `tier:*` ladder · 8 of 10 spec-frontmatter fields · the second ID space · `/specify`'s promote-then-delete choreography · `/tidy`'s unsynced-backlog special-casing (generalized to all records) · triage's headless mode and routine · the consolidated multi-group Review Console.

## Risks

| Risk | Mitigation |
|---|---|
| GitHub down = no queue ops (github driver) | Materialized specs keep in-flight builds immune; unsynced fallback covers writes; reads accepted as unavailable |
| Issue-body edit history weaker than git | Accepted; GitHub keeps body edit history; the at-build snapshot lands in the run dir |
| Issue Types are org-level | Init probe + `type:*` label fallback |
| Sub-issue API is newer surface | Fallback: parent reference in body + task-list; degrades gracefully |
| Multi-record creation not atomic | Fingerprint idempotency; parent-first, resume-by-query |
| Group-splitting race between concurrent `next` firings | Claim the whole overlap group before starting |
| Rework breadth (specify/build/flow/tidy/help/triage/dispatch/wrap-up) | Major version; phased build + migration; shared contracts land first |

## Migration sketch (input to a later plan — not designed here)

1. Mechanical relabel of live issues: `tier:approved`→`auto:build`; `tier:fast-track`→`auto:build`+`auto:merge`; `tier:needs-review`→remove + comment; `status:*`→`bot:*`; `backlog`→remove; `risk-*`/`effort-*`→colon forms; health-origin labels→`by:*`.
2. File the legacy backlog files' entries (`specs/INBOX.md`, `specs/DEFERRED.md`) as records; delete the files and `specs/backlog/`.
3. Delete `specs/INDEX.md`.
4. `backlog-backend` → `work-backend` in CLAUDE.md (init Update-Mode migrates).
5. Skills in dependency order: shared contracts (label taxonomy fragment, record-store fragment, issue-claims updates) → producers (health skills, capture) → shaper (specify) → gate + consumer (triage, dispatch) → executors (flow, build, wrap-up) → dashboards (tidy, help). Fingerprint readers accept both marker names throughout.

## Out of scope / future

- **Escalate-before-summon:** make the last retry a strategy change (fresh context, or one decomposition attempt) before `bot:blocked`. Noted, not designed.
- **GitHub Projects:** re-affirmed out (per the 2026-07-08 backlog design's analysis — no cross-repo use case).
- **AC-as-executable-checks:** specs already trend toward grep-able acceptance criteria; formalizing "AC SHOULD be mechanically checkable" would strengthen autonomous verification. Future refinement.
