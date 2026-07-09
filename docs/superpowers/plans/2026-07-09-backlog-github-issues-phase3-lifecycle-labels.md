# Backlog on GitHub Issues — Phase 3: Lifecycle Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the lifecycle gap the design doc's "Lifecycle labels" section identifies: `parked` must be removed when a parked issue is promoted into a spec (else `/tidy`'s scan keeps re-surfacing it as still-parked while it's actively being built), and restored if that spec is later declined or abandoned before merge (else the issue goes dark — unlabeled, not closed, invisible to the backlog scan). A new `status:in-progress` label makes claimed-and-building issues visible in GitHub's own UI, mirroring the `refs/claims/issue-<n>` ref lock that is otherwise invisible outside `gh api`.

**Architecture:** Four substantive tasks plus a closing version-bump/sweep task. Task 1 adds `status:in-progress` at claim acquisition (the one existing claim-acquiring consumer: `flow/from-code-health.md` Step 2.5) and documents its lifecycle in `_shared/issue-claims.md`. Task 2 adds the `recon-was-parked:` spec frontmatter field and wires `parked`-removal into both places a `parked` issue gets promoted into a spec: `/specify`'s direct single-issue path (Resolve-the-input case 1) and `flow/from-code-health.md`'s batch path. Task 3 wires the reverse — `status:in-progress` removal and conditional `parked` restoration — into every place a claim gets released: `wrap-up/cleanup-procedures.md` Section E (single-spec), its duplicate in `flow/multispec-review-console.md` (two spots), and a third site this plan's research found that the original design's own pending-task list omitted: `flow/from-code-health.md`'s "declined at review console" release, which is a normal, agent-automated, every-run code path (not a rare edge case) and would otherwise leave every declined parked-issue permanently unparked. Task 4 adds `/tidy` Step 4.7's two defense-in-depth backstop checks (per the design doc, matching the shape of the already-drafted-but-unbuilt `agent:go` missed-removal backstop in `specs/INBOX.md`) and fixes the now-stale "Phase 3 scope — not yet implemented" note in `/tidy`'s Promote row. Task 5 bumps the plugin version and sweeps the repo for any remaining stale references.

No task touches `bin/lib/`. Every mutation in this phase is a reversible label add/remove or a frontmatter stamp — the codebase's Action Vocabulary atomicity rule (staged/never-autonomous execution) governs `gh issue close`/`gh pr close`-class actions, not simple label edits, which this codebase already executes directly and unstaged (see `/tidy`'s existing Defer action). All four pure-JS modules this feature already has (`bin/lib/issues/backlog.js`, `bin/lib/issues/claims.js`) are reused completely unchanged.

**Tech Stack:** Markdown (skill prose), `gh` CLI (including `gh issue view --json closedByPullRequestsReferences` for cross-referencing linked PRs — the issue-side mirror of `closingIssuesReferences`, which `_shared/github-pr-scan.md` already reads from the PR side). No new dependencies, no new tests (no new pure code this phase).

## Global Constraints

- No new npm runtime dependencies.
- No `bin/lib/` changes in this phase. `bin/lib/issues/claims.js` (`claimPayload`/`releasePayload`/`claimStatus`) and `bin/lib/issues/backlog.js` (`classifyBacklogIssue` et al.) are reused exactly as they already exist from Phases 1–2 — this phase's new mutations are plain `gh issue edit --add-label`/`--remove-label` calls, not payload-builder calls.
- New label: `status:in-progress`. Description: `"Claimed and being built by an autonomous claude-tweaks run — see _shared/issue-claims.md"` (90 characters — GitHub's label API rejects descriptions over 100 characters with an HTTP 422; keep any future edit to this string under that cap). Bootstrap with the same check-then-create pattern used everywhere else in this codebase: `gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || gh label create "$LABEL" --description "$DESCRIPTION"`.
- New spec frontmatter field: `recon-was-parked:`. Only ever written as `true`; there is no explicit `false` — absence means "not applicable," the same missing-field convention `design-intent:`, `recon-issue:`, `recon-fingerprint:`, and `code-health-effort:` already use.
- Every label mutation added in this phase (`status:in-progress` add/remove, `parked` remove/restore) is **best-effort and non-blocking**: on `gh` failure, log a warning and continue — never fail the claim, the release, or the pipeline over a label edit. This is a deliberate, stated tradeoff: Task 4's two backstop checks exist specifically to catch a mutation that silently failed, so best-effort-with-a-backstop is the intended design, not a gap.
- `status:in-progress` only ever gets added by an actual claim-acquiring consumer. Per `_shared/issue-claims.md`'s existing "Non-consumers (deliberate)" note, `/specify`'s direct single-issue path and interactive `/build` do not claim issues — this phase does not change that. The only claim-acquisition call site today is `flow/from-code-health.md` Step 2.5.
- **Three release call sites need the new removal/restoration logic, not two.** The design doc's own "Lifecycle labels" table names only `wrap-up/cleanup-procedures.md` Section E and its duplicate in `flow/multispec-review-console.md`. This plan's research (reading `flow/from-code-health.md` end to end before writing Task 3) found a third, independent release call site: the "declined at review console" release inside `flow/from-code-health.md`'s own "Close-the-loop (Review Console)" section, which deletes the ref and posts a release comment directly — it does not delegate to Section E's procedure. Declining a brief at the console is a normal, expected, agent-automated outcome on every multi-issue `/flow` run (not a rare failure edge case), so leaving it untouched would mean every declined parked-issue silently loses its `parked` label on the common path, not just a rare one. Task 3 updates all three sites. This is exactly the "cross-file promise with no consumer" failure pattern this repo's own CLAUDE.md warns against — caught here during plan research rather than by a later whole-branch review, per the CLAUDE.md lesson on verifying producer/consumer shape across files before considering a design's task list complete.
- `skills/flow/failure-cards.md`'s "Release claims" option (the offered-not-automatic release surfaced when a pipeline stops at a gate) is deliberately **out of scope** for this phase. It is a rare, user-run manual command (`gh api -X DELETE ...`), not an agent-automated code path — Task 4's backstop checks are its safety net by design, per the design doc's own framing ("Missed restoration (defense-in-depth) | flagged, not auto-fixed").
- `recon-was-parked: true` is written **regardless of whether the `parked`-removal `gh` call actually succeeded** — the frontmatter stamp and the mutation are independent; stamping unconditionally is what lets Task 4's backstop check detect a removal that silently failed. Do not make the stamp conditional on mutation success.
- Do not reference the dated design doc path (`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`) from any shared contract file (`_shared/issue-claims.md`, `spec-template.md`) — those files must stay self-contained; design docs are not guaranteed to persist.

---

### Task 1: `status:in-progress` label — add at claim acquisition, document the lifecycle

**Files:**
- Modify: `skills/flow/from-code-health.md`
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: nothing new — reuses the existing `$ISSUE` shell variable already in scope at Step 2.5's claim-acquisition point.
- Produces: the `status:in-progress` label lifecycle other tasks depend on (Task 3 removes it at release; Task 4's backstop checks reference it).

- [ ] **Step 1: Add the label-add block to Step 2.5**

Current text in `skills/flow/from-code-health.md` (the full claim-acquisition step):

```markdown
   - **Any other failure:** drop the brief, log, continue — partial batch over hung batch.

   If every brief is dropped, stop and report: "All pulled code-health issues are claimed by other
   runs — nothing to build. Stale claims are recoverable via /claude-tweaks:tidy (Step 4.7)."
```

Replace with:

```markdown
   - **Any other failure:** drop the brief, log, continue — partial batch over hung batch.

   **Add the `status:in-progress` label** whenever a claim is freshly held this step (the 201
   case above, or the stale-claim break-and-recreate case above) — a visibility mirror of the
   ref lock, not part of the lock itself:

   ```bash
   gh label list --search status:in-progress --json name -q '.[].name' | grep -qx status:in-progress || \
     gh label create status:in-progress --description "Claimed and being built by an autonomous claude-tweaks run — see _shared/issue-claims.md"
   gh issue edit "$ISSUE" --add-label status:in-progress
   ```

   Best-effort: on failure, log a warning and continue — the ref is the actual lock, and
   `/tidy` Step 4.7 has a backstop check for a label that never got applied.

   If every brief is dropped, stop and report: "All pulled code-health issues are claimed by other
   runs — nothing to build. Stale claims are recoverable via /claude-tweaks:tidy (Step 4.7)."
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Document the label's lifecycle in `_shared/issue-claims.md`**

Current text (end of the "## The mirror" section, immediately before "## Reading claim state"):

```markdown
Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`, or the
routine's run id when headless); `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity
`record-worktree` stamps. If the comment post fails after the ref succeeds, the claim stands:
retry once, warn, proceed.

## Reading claim state
```

Replace with:

```markdown
Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`, or the
routine's run id when headless); `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity
`record-worktree` stamps. If the comment post fails after the ref succeeds, the claim stands:
retry once, warn, proceed.

## The status label

`status:in-progress` is a second, purely cosmetic visibility layer on top of the ref lock — a
label so the claim shows up in GitHub's own issue list/board UI, not just via `gh api
git/matching-refs/claims/`. It carries no locking semantics: the ref claim/release is atomic
regardless of whether the label add/remove succeeds.

- **Added** alongside claim acquisition — bootstrap-then-add, the same check-then-create
  pattern every label in this codebase uses (see `flow/from-code-health.md` Step 2.5, the one
  claim-acquiring consumer today).
- **Removed** alongside claim release — every release removes it, regardless of outcome
  (`wrap-up/cleanup-procedures.md` Section E, its duplicate in
  `flow/multispec-review-console.md`, and the declined-at-console release in
  `flow/from-code-health.md`).
- Best-effort in both directions: a failed add/remove never blocks the claim, the release, or
  the pipeline. `/tidy` Step 4.7 flags an issue that still carries the label with no active
  claim as a backstop.
- Generic to the protocol, like the ref/comment mechanism above — any future claim consumer
  gets this for free, not just backlog-originated issues.

## Reading claim state
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Verify against this repo's real GitHub backend**

This repo already has a real GitHub remote. Confirm the bootstrap command is syntactically
correct and creates the real label (safe, idempotent — this label is genuinely useful for this
repo going forward, matching Phase 2's precedent of creating `backlog`/`backlog:category-*` for
real during its own Task 2 verification):

```bash
gh label list --search status:in-progress --json name -q '.[].name' | grep -qx status:in-progress || \
  gh label create status:in-progress --description "Claimed and being built by an autonomous claude-tweaks run — see _shared/issue-claims.md"
gh label list --search status:in-progress --json name,description
```

Expected: prints `status:in-progress` with the non-empty description above. Do **not** run
`gh issue edit --add-label` against a real issue here — that would mutate real issue state
outside of an actual claim; the label bootstrap is the verifiable side effect for this task.

- [ ] **Step 4: Commit**

```bash
git add skills/flow/from-code-health.md skills/_shared/issue-claims.md
git commit -m "Add status:in-progress label at claim acquisition, document its lifecycle"
```

---

### Task 2: `recon-was-parked:` frontmatter field — remove `parked` at promotion

**Files:**
- Modify: `skills/specify/spec-template.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/flow/from-code-health.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `recon-was-parked: true` spec frontmatter (Task 3's release-time restoration logic and Task 4's backstop check both read this field via `grep`).

- [ ] **Step 1: Add the frontmatter field to the spec template**

Current text in `skills/specify/spec-template.md`:

```markdown
recon-issue: {GitHub issue number, only when derived from one — omit otherwise}
recon-fingerprint: {fingerprint marker from the issue body, when present — omit otherwise}
code-health-effort: {low | medium | high — only when derived from a code-health issue carrying a code-health:effort-<tier> label; omit otherwise}
---
```

Replace with:

```markdown
recon-issue: {GitHub issue number, only when derived from one — omit otherwise}
recon-fingerprint: {fingerprint marker from the issue body, when present — omit otherwise}
code-health-effort: {low | medium | high — only when derived from a code-health issue carrying a code-health:effort-<tier> label; omit otherwise}
recon-was-parked: {true — only when the source issue carried the `parked` label at ingestion time; omit otherwise, there is no explicit false}
---
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Document the field in the frontmatter reference table**

Current text in `skills/specify/spec-template.md`:

```markdown
| Field | Meaning | Consumer |
|-------|---------|----------|
| `recon-issue:` | The GitHub issue number to close when this spec's work merges | `/wrap-up` cleanup item 8 (issue-claim release, `cleanup-procedures.md` Section E) checks for this field's presence; cleanup item 5 (`cleanup-procedures.md` Section C) stamps the `Fixes #{issue}` closing-keyword carrier commit when it's present |
| `recon-fingerprint:` | The finding's fingerprint at issue-filing time, for future reverse-reconciliation (comparing against a freshly recomputed fingerprint to tell whether the flagged code has since changed) | Not yet consumed by any skill — write-only today; `recon-issue:` alone is sufficient for closure |
| `code-health-effort:` | The judged fix-cost tier from the originating code-health finding | `/claude-tweaks:build` Common Step 2 reads it to select the per-task implementer model tier (low→Fast, medium→Standard, high→Capable) when invoking `/superpowers:subagent-driven-development` |

Omit all three fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report pulled via `--from-label`) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment.
```

Replace with:

```markdown
| Field | Meaning | Consumer |
|-------|---------|----------|
| `recon-issue:` | The GitHub issue number to close when this spec's work merges | `/wrap-up` cleanup item 8 (issue-claim release, `cleanup-procedures.md` Section E) checks for this field's presence; cleanup item 5 (`cleanup-procedures.md` Section C) stamps the `Fixes #{issue}` closing-keyword carrier commit when it's present |
| `recon-fingerprint:` | The finding's fingerprint at issue-filing time, for future reverse-reconciliation (comparing against a freshly recomputed fingerprint to tell whether the flagged code has since changed) | Not yet consumed by any skill — write-only today; `recon-issue:` alone is sufficient for closure |
| `code-health-effort:` | The judged fix-cost tier from the originating code-health finding | `/claude-tweaks:build` Common Step 2 reads it to select the per-task implementer model tier (low→Fast, medium→Standard, high→Capable) when invoking `/superpowers:subagent-driven-development` |
| `recon-was-parked:` | Whether the source issue carried the `parked` label at ingestion time (removed at promotion — see "Restore-on-promotion bookkeeping" in this skill's `SKILL.md` Step 3, and its batch-path equivalent in `flow/from-code-health.md` Step 3) | The claim-release restoration steps (`wrap-up/cleanup-procedures.md` Section E, its `flow/multispec-review-console.md` duplicate, and the declined-at-console release in `flow/from-code-health.md`) restore `parked` on the issue iff this is `true` and the release outcome is not `merged:`/`pr-opened:` |

Omit all four fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report pulled via `--from-label`) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment. `recon-was-parked:` is additionally omitted whenever the source issue never carried `parked` in the first place — code-health-originated issues, inbox-stage promotions, or an issue promoted directly by number that was never triaged to parked.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Wire the mutation + stamp into `/specify`'s direct single-issue path**

Current text in `skills/specify/SKILL.md` (Step "Resolve the input", case 1 — this is one long paragraph; match it exactly):

```markdown
1. **GitHub issue reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`. Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels`. Treat the issue's title + body as the design doc content — code-health-filed issues are already `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so this needs near-zero translation; a human-filed issue without that shape still works, just with more editorializing in Step 2. Extract the fingerprint marker from the body if present (`<!-- code-health-fingerprint: ([^\s>]+) -->` — same regex as `bin/lib/issues/ingest.js`'s `FP_RE`). Also extract effort from the issue's labels if a `code-health:effort-<tier>` label is present (`low|medium|high`; absent for non-code-health issues). Carry `{issueNumber, fingerprint, effort}` forward to Step 3, which stamps `recon-issue:` (and `recon-fingerprint:`/`code-health-effort:`, when present) frontmatter on the generated spec — this is what lets `/wrap-up`'s close-via-merge, issue-claim-release, and `/build`'s effort-based model-tier selection all engage. (This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
```

Replace with:

```markdown
1. **GitHub issue reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`. Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels`. Treat the issue's title + body as the design doc content — code-health-filed issues are already `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so this needs near-zero translation; a human-filed issue without that shape still works, just with more editorializing in Step 2. Extract the fingerprint marker from the body if present (`<!-- code-health-fingerprint: ([^\s>]+) -->` — same regex as `bin/lib/issues/ingest.js`'s `FP_RE`). Also extract effort from the issue's labels if a `code-health:effort-<tier>` label is present (`low|medium|high`; absent for non-code-health issues). Also note whether the fetched `labels` include `parked` — Step 3's Rules use this to remove the label and stamp `recon-was-parked: true` on the generated spec. Carry `{issueNumber, fingerprint, effort, wasParked}` forward to Step 3, which stamps `recon-issue:` (and `recon-fingerprint:`/`code-health-effort:`/`recon-was-parked:`, when present) frontmatter on the generated spec — this is what lets `/wrap-up`'s close-via-merge, issue-claim-release, and `/build`'s effort-based model-tier selection all engage. (This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Add the Rules bullet that performs the mutation and stamp**

Current text in `skills/specify/SKILL.md` (the last two Rules bullets in Step 3):

```markdown
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
- **Flag high-effort code-health issues for possible decomposition** — when `code-health-effort: high` would be stamped, add a note to the generated spec's Overview section (e.g. "Originating finding was judged high-effort — consider whether this should decompose into multiple specs rather than one oversized unit.") rather than silently producing a single spec that may be too large for `/superpowers:writing-plans` to size well. This is a surfaced consideration, not an automatic split — the human or a later `/specify` pass decides.
```

Replace with:

```markdown
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
- **Restore-on-promotion bookkeeping for a promoted `parked` issue** (Resolve-the-input case 1 only) — when `wasParked` from Step 1 is true: remove `parked` now (`gh issue edit {n} --remove-label parked`) and write `recon-was-parked: true` on the generated spec. Write the field regardless of whether the removal call succeeded — best-effort, log a warning and continue on failure; `/tidy` Step 4.7's backstop check catches a removal that silently failed. Omit the field entirely when `wasParked` is false — there is no explicit `false` value.
- **Flag high-effort code-health issues for possible decomposition** — when `code-health-effort: high` would be stamped, add a note to the generated spec's Overview section (e.g. "Originating finding was judged high-effort — consider whether this should decompose into multiple specs rather than one oversized unit.") rather than silently producing a single spec that may be too large for `/superpowers:writing-plans` to size well. This is a surfaced consideration, not an automatic split — the human or a later `/specify` pass decides.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Wire the same mutation + stamp into the batch path**

Current text in `skills/flow/from-code-health.md`:

```markdown
3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number`, `fingerprint`, and (when present) `effort` forward as spec frontmatter
   (`recon-issue: <number>`, `recon-fingerprint: <fp>`, `code-health-effort: <tier>`) so wrap-up
   can close the issue on merge and `/build` can select the model tier for this spec's
   implementer dispatches. When `effort` is `high`, also carry forward the same
   possible-decomposition note `/specify`'s own Rules section describes for its direct-issue path.
```

Replace with:

```markdown
3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number`, `fingerprint`, and (when present) `effort` forward as spec frontmatter
   (`recon-issue: <number>`, `recon-fingerprint: <fp>`, `code-health-effort: <tier>`) so wrap-up
   can close the issue on merge and `/build` can select the model tier for this spec's
   implementer dispatches. When `effort` is `high`, also carry forward the same
   possible-decomposition note `/specify`'s own Rules section describes for its direct-issue path.

   **Parked-issue promotion.** Check the raw issue's labels (already fetched in Step 1 — reuse
   the `byNumber` lookup pattern from the effort-extraction snippet above) for `parked`. When
   present: remove it now (`gh issue edit "$ISSUE" --remove-label parked`) and additionally stamp
   `recon-was-parked: true` on the generated spec — the same mutation and field `/specify`'s own
   Step 3 Rules perform for its direct single-issue path, applied here for the batch path. Write
   the field regardless of whether the removal call succeeded — best-effort, log a warning and
   continue on failure; `/tidy` Step 4.7's backstop check catches a removal that silently failed.
   Omit the field when the issue never carried `parked`.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 6: Verify the labels-array shape assumption**

This repo currently has zero GitHub issues (`gh issue list --state all` returns `[]`) and its
existing PRs carry no labels either, so there is no live sample in this repo to check the
labels shape against. Confirm the assumption a different way — `gh issue view`/`gh issue list
--json labels` is REST-API-backed and its documented JSON shape for `labels` is always an array
of full label objects (`[{"name": "...", "color": "...", ...}, ...]`), never bare strings:

```bash
gh issue view --help | grep -A2 '\-\-json'
```

Expected: the `--json` flag help text lists `labels` as an available field (confirms the field
name is correct); the object-array shape itself is standard, documented `gh` CLI/GitHub REST
API behavior, not something that varies per-repo. Do **not** run `gh issue edit` against a real
issue here — there is no real issue in this repo to safely mutate.

- [ ] **Step 7: Commit**

```bash
git add skills/specify/spec-template.md skills/specify/SKILL.md skills/flow/from-code-health.md
git commit -m "Add recon-was-parked frontmatter field; remove parked at promotion (direct + batch paths)"
```

---

### Task 3: Restore `parked` and remove `status:in-progress` at claim release (three sites)

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md`
- Modify: `skills/flow/multispec-review-console.md`
- Modify: `skills/flow/from-code-health.md`

**Interfaces:**
- Consumes: `status:in-progress` (Task 1), `recon-was-parked:` frontmatter (Task 2).
- Produces: nothing new for later tasks — Task 4's backstop checks are independent detection logic, not a consumer of this task's mutation code.

- [ ] **Step 1: Extend `wrap-up/cleanup-procedures.md` Section E**

Current text (steps 6–7 of Section E, the last two steps):

```markdown
6. **Remove the dispatch label** when the outcome was `merged:` or `pr-opened:` and the issue
   carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` (reversible; log to
   `decisions.md`). Leave the label on `abandoned:` — it is the standing retry request. Skip
   silently when the label is absent.
7. Log each release to `decisions.md` (status `AUTO`, reason string as detail).
```

Replace with:

```markdown
6. **Remove the dispatch label** when the outcome was `merged:` or `pr-opened:` and the issue
   carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` (reversible; log to
   `decisions.md`). Leave the label on `abandoned:` — it is the standing retry request. Skip
   silently when the label is absent.
7. **Remove `status:in-progress`; restore `parked` if applicable.** Always remove
   `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`) —
   best-effort, log a warning and continue on failure. Then, only when the outcome reason is
   `abandoned: spec {spec}` (i.e. NOT `merged:`/`pr-opened:`) AND the spec's frontmatter carries
   `recon-was-parked: true`: restore `parked` — bootstrap the label if missing (same
   check-then-create pattern as `backlog`), then `gh issue edit "$ISSUE" --add-label parked`.
   Skip restoration silently when `recon-was-parked` is absent, or when the outcome was
   `merged:`/`pr-opened:` (the spec shipped or is under review — the issue should stay
   unparked). Best-effort — on failure, log a warning and continue; `/tidy` Step 4.7's backstop
   check catches a restoration that silently failed.
8. Log each release, `status:in-progress` removal, and `parked` restoration to `decisions.md`
   (status `AUTO`, reason string as detail).
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Duplicate the extension in `flow/multispec-review-console.md`'s "On approval" path**

Current text:

```markdown
7. Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Skip briefs already released at console decline. Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
8. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
9. Archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included)
```

Replace with:

```markdown
7. Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Skip briefs already released at console decline. Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
8. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
9. **Remove `status:in-progress`; restore `parked` if applicable**, per `wrap-up/cleanup-procedures.md` Section E: always remove `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}` (not `merged:`/`pr-opened:`) AND the spec's frontmatter carries `recon-was-parked: true`, restore `parked` (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, log and continue on failure either way. Log each removal/restoration to `decisions.md`.
10. Archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included)
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Duplicate the extension in `flow/multispec-review-console.md`'s "On override" path**

Current text:

```markdown
6. Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Skip briefs already released at console decline. Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
7. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
8. Archive the parent run dir
```

Replace with:

```markdown
6. Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Skip briefs already released at console decline. Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
7. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
8. **Remove `status:in-progress`; restore `parked` if applicable**, per `wrap-up/cleanup-procedures.md` Section E: always remove `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}` (not `merged:`/`pr-opened:`) AND the spec's frontmatter carries `recon-was-parked: true`, restore `parked` (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, log and continue on failure either way. Log each removal/restoration to `decisions.md`.
9. Archive the parent run dir
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Extend the declined-at-console release in `flow/from-code-health.md`**

Current text:

```markdown
   The console also lists the claims this run holds (`refs/claims/issue-{issue}` per brief).
   Completed specs release after the consolidated console's branch finish (see
   `multispec-review-console.md`), which then executes `/wrap-up` cleanup item 8's Section E
   procedure once per run; in the rare single-spec wrap-up path (no `MULTISPEC_REVIEW_DEFER`),
   item 8 runs in wrap-up Step 10 directly. For briefs the user **declines** at
   the console, release immediately after the ownership check (`_shared/issue-claims.md`,
   "Release triggers") (reason `declined at review console`): delete the ref and
   post the release comment generated by `releasePayload` — see "Release triggers" in
   `_shared/issue-claims.md`.
```

Replace with:

```markdown
   The console also lists the claims this run holds (`refs/claims/issue-{issue}` per brief).
   Completed specs release after the consolidated console's branch finish (see
   `multispec-review-console.md`), which then executes `/wrap-up` cleanup item 8's Section E
   procedure once per run; in the rare single-spec wrap-up path (no `MULTISPEC_REVIEW_DEFER`),
   item 8 runs in wrap-up Step 10 directly. For briefs the user **declines** at
   the console, release immediately after the ownership check (`_shared/issue-claims.md`,
   "Release triggers") (reason `declined at review console`): delete the ref and
   post the release comment generated by `releasePayload` — see "Release triggers" in
   `_shared/issue-claims.md`. Also remove `status:in-progress`
   (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort) and, when the spec
   `/specify` derived for this brief (Step 3) carries `recon-was-parked: true`, restore `parked`
   (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, the
   same conditional restoration `wrap-up/cleanup-procedures.md` Section E performs for an
   `abandoned:` outcome (a decline is never `merged:`/`pr-opened:`, so restoration here is
   unconditional whenever `recon-was-parked: true`). Log both to `decisions.md`.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Verify the reason-string conditional logic reads correctly**

This step is prose-only — there is no live release to trigger in this repo (no claim is
currently held). Re-read all three edited passages end to end and confirm: (a) the condition
for restoring `parked` is identical in all three places (`recon-was-parked: true` AND reason is
not `merged:`/`pr-opened:`), (b) `status:in-progress` removal is unconditional in all three
places, (c) none of the three passages reference the dated design doc path (per Global
Constraints).

```bash
grep -n "status:in-progress\|recon-was-parked" skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md skills/flow/from-code-health.md
```

Expected: matches in all three files, each showing the removal/restoration logic just added.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md skills/flow/from-code-health.md
git commit -m "Remove status:in-progress and restore parked on claim release (all three release sites)"
```

---

### Task 4: `/tidy` Step 4.7 backstop checks + Promote row fix

**Files:**
- Modify: `skills/tidy/scan-procedures.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: `recon-was-parked:` frontmatter (Task 2), `status:in-progress` label (Task 1), the release-time behavior (Task 3) that these checks exist to backstop.
- Produces: nothing for later tasks — this is the last substantive task.

- [ ] **Step 1: Add the two backstop checks to Step 4.7**

Current text in `skills/tidy/scan-procedures.md` (the end of Step 4.7, immediately before "## Step 4.8"):

```markdown
Releasing = delete the ref + post the release comment generated by `releasePayload`
(reason `swept: stale claim` or `swept: issue closed`). Releases execute only after Step 6
batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] refs/claims/issue-{n} — {status} — {recommendation}`

## Step 4.8: Audit GitHub PRs and Issues
```

Replace with:

```markdown
Releasing = delete the ref + post the release comment generated by `releasePayload`
(reason `swept: stale claim` or `swept: issue closed`). Releases execute only after Step 6
batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] refs/claims/issue-{n} — {status} — {recommendation}`

### Backstop: missed `parked` restoration

Find specs still on disk that were promoted from a `parked` issue but never got the
restoration finished — a defense-in-depth flag for a mutation that silently failed at claim
release (Phase 3), same shape as the already-drafted `agent:go` missed-removal backstop in
`specs/INBOX.md`. Both checks below are flagged only — recommendations execute after Step 6
batch approval, same as every other Step 4.7 mutation.

```bash
grep -l "^recon-was-parked: true$" specs/*.md 2>/dev/null | while read -r spec; do
  n=$(grep -m1 "^recon-issue:" "$spec" | sed 's/^recon-issue: *//')
  [ -z "$n" ] && continue
  gh issue view "$n" --json state,labels,closedByPullRequestsReferences
done
```

(`closedByPullRequestsReferences` is a native `gh issue view --json` field — no raw GraphQL
needed; the issue-side mirror of `closingIssuesReferences`, which `_shared/github-pr-scan.md`
already reads from the PR side via `gh pr view --json`.)

For each result: flag as a likely missed restoration when the issue is `OPEN`, its labels do
not include `parked`, `closedByPullRequestsReferences` is empty (no linked PR, open or
merged), and it has no active claim (cross-reference against this step's own claim listing
above — `claimed && !stale` for `refs/claims/issue-{n}`). Recommend the same
`gh issue edit {n} --add-label parked` command the release step itself would run.

→ Collect each as: `[claim] issue #{n} — spec {spec} has recon-was-parked: true, no parked
label, no active claim, no linked PR — likely missed parked restoration`

### Backstop: missed `status:in-progress` removal

```bash
gh issue list --label status:in-progress --state open --json number,title -q '.[] | "\(.number) \(.title)"'
```

For each result, cross-reference against this step's own claim listing above: flag as a likely
missed removal when the issue carries `status:in-progress` but has no active claim
(`claimed && !stale`) for its number. Recommend the same
`gh issue edit {n} --remove-label status:in-progress` command the release step itself would run.

→ Collect each as: `[claim] issue #{n} — status:in-progress present, no active claim — likely
missed status:in-progress removal`

## Step 4.8: Audit GitHub PRs and Issues
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Fix the stale Promote row in `tidy/SKILL.md`**

Current text (the Promote row of the Action Vocabulary table):

```markdown
| **Promote** | Ready for the brainstorm → specify pipeline | `local-files`: tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX. `github-issues`: no mutation — the open issue is already the durable pointer; recommend `/claude-tweaks:specify #{n}` directly (existing issue-ingestion path). Removing `parked` at promotion (and restoring it on decline) is Phase 3 scope — not yet implemented. | No (file, stays tagged) / No (issue, stays open) |
```

Replace with:

```markdown
| **Promote** | Ready for the brainstorm → specify pipeline | `local-files`: tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX. `github-issues`: no mutation here — the open issue is already the durable pointer; recommend `/claude-tweaks:specify #{n}` directly (existing issue-ingestion path). `/specify` itself removes `parked` (if present) and stamps `recon-was-parked: true` on the generated spec at spec-write time (Step 3) — see `spec-template.md`'s frontmatter reference; restoration on decline/abandon happens later, at claim release (`_shared/issue-claims.md`, `wrap-up/cleanup-procedures.md` Section E). | No (file, stays tagged) / No (issue, stays open — mutation deferred to `/specify`) |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Verify the `gh issue view` field combination against real data**

This repo has zero open GitHub issues, but issue and PR numbers share one sequence per repo, and
`gh issue view` resolves against either — number 1 in this repo is a merged PR, which is enough
to exercise the field combination end to end, read-only:

```bash
gh issue view 1 --json state,labels,closedByPullRequestsReferences
```

Expected: valid JSON with all three fields present, e.g.
`{"closedByPullRequestsReferences":[],"labels":[],"state":"MERGED"}` — confirms
`closedByPullRequestsReferences` is a real, valid `gh issue view --json` field (no raw GraphQL
needed) and that an empty array is exactly what "no linked PR" looks like in the response Step
1's backstop check parses. If issue/PR #1 doesn't exist in this repo by the time this task
runs, substitute any other real number from
`gh issue list --state all --limit 1 --json number -q '.[0].number'` (or the equivalent `gh pr
list` if that's also empty).

- [ ] **Step 4: Commit**

```bash
git add skills/tidy/scan-procedures.md skills/tidy/SKILL.md
git commit -m "Add /tidy Step 4.7 backstop checks for missed parked/status:in-progress lifecycle mutations"
```

---

### Task 5: Version bump + final consistency sweep

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Bump the plugin version**

Current text in `.claude-plugin/plugin.json`:

```json
  "version": "5.20.0",
```

Replace with:

```json
  "version": "5.21.0",
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Sweep for stale "Phase 3" references**

```bash
grep -rn "Phase 3 scope\|not yet implemented" skills/ | grep -v auto-decision-log.md
```

Expected: no output (the one match this phase set out to fix — `tidy/SKILL.md`'s Promote row —
was already resolved in Task 4). The `auto-decision-log.md` match is an unrelated, pre-existing
"planned — not yet implemented" note about archive compaction; exclude it, do not touch it.

- [ ] **Step 3: Sweep for any other reference to the three lifecycle labels that this phase may have missed**

```bash
grep -rln "status:in-progress" skills/
```

Expected: `skills/flow/from-code-health.md`, `skills/_shared/issue-claims.md`,
`skills/wrap-up/cleanup-procedures.md`, `skills/flow/multispec-review-console.md`,
`skills/tidy/scan-procedures.md` — five files, matching Tasks 1, 3, and 4's edits. If any
expected file is missing, one of the earlier tasks' edits did not land — investigate before
proceeding.

- [ ] **Step 4: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: `686 pass, 1 fail` (the pre-existing `tests/statusline.test.js` timing flake — see
`specs/DEFERRED.md`'s "Load-tolerant statusline perf assertion" entry; not introduced by this
phase, which touches no test files). If any other test fails, investigate before proceeding —
this phase should not change test results at all.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.21.0 — backlog lifecycle labels (parked restoration, status:in-progress)"
```

---

## Final Whole-Branch Review Focus

Beyond the standard whole-branch review, explicitly check:

1. **The three release sites stay in sync.** Diff the `status:in-progress` removal / `parked`
   restoration prose across `wrap-up/cleanup-procedures.md` Section E,
   `flow/multispec-review-console.md` (both spots), and `flow/from-code-health.md`'s
   declined-at-console block — the conditional logic must be identical in substance (even where
   wording necessarily differs, e.g. the decline path's restoration is unconditional rather than
   reason-gated, since a decline is never `merged:`/`pr-opened:`).
2. **The label-presence check in `/specify` and `flow/from-code-health.md` Step 3 assume the
   right `labels` shape.** Both read from `gh issue view`/`gh issue list --json labels`, which
   Task 2 confirmed is always an array of label objects (`[{name: "..."}, ...]`), never bare
   strings — confirm neither passage's "does `labels` include `parked`" check assumes a bare
   `string[]` instead.
3. **No new `gh issue close`/`gh pr close` call site was introduced** — every mutation this
   phase adds must be a reversible label add/remove or a frontmatter stamp, per Global
   Constraints.
