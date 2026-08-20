# Specify `next`: headless selection form + shared headless-self-report extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `next` first-argument form to `/claude-tweaks:specify` — the headless-safe unit a scheduled Routine fires — mirroring `/claude-tweaks:dispatch`'s `next` form, and extract dispatch's headless self-report contract into `_shared/` so both consumers cite one copy.

**Architecture:** A new mode file (`plugin/skills/specify/next-mode.md`) implements select-one/claim/shape/release/self-report, entered via a new `### Resolve the input` case in `plugin/skills/specify/SKILL.md`. Shaping itself is unchanged — `next-mode.md` hands the selected record to the existing `shaping-mode.md` under the `--chained` headless posture. `plugin/skills/dispatch/headless-self-report.md` is extracted to `plugin/skills/_shared/headless-self-report.md` so both `dispatch/SKILL.md` and `specify/next-mode.md` cite the same contract.

**Tech Stack:** Markdown skill files (this plugin's content layer), `node --test` for the conformance suite. No new runtime dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044958-spec-967-968-969-970/spec-967/work/967-spec.md` (record #967)

## Global Constraints

**Acceptance Criteria (verbatim from spec):**
1. `plugin/skills/specify/SKILL.md` names `next` in its `argument-hint` and documents it in `## Input` as the headless Routine-fired form with the flag-rejection rule.
2. `plugin/skills/specify/next-mode.md` exists and states: the eligibility predicate (open, not `ready`, not `needs:definition`, not `parked`, not `parent-issue`, unclaimed), priority-then-age single selection, the zero-eligible clean no-op, claim-time live re-read with clean-no-op on contest/ineligibility, release-on-every-path claim handling, the `github-issues`-only Preflight hard stop, and self-report on Preflight and shaping-stage failure.
3. `plugin/skills/_shared/headless-self-report.md` exists; `dispatch/SKILL.md` and `specify/next-mode.md` both cite it; no full restatement of the contract remains in either skill.
4. The new conformance test pins AC 1-3 and fails when a citation is removed (verify once by reverting during development).
5. `npm test` passes.

**Gotchas (verbatim from spec):**
- `github-issues`-only is structural, not policy: the claim protocol depends on GitHub's RBAC + atomic content writes. Copy dispatch's Preflight posture verbatim in spirit, including "the absence of a human to hand this off to is not license to do the work in their place."
- The eligibility predicate excluding `needs:definition` is load-bearing: #968's guard stamps that label to route un-shapeable records out of this queue; if `next` selected them, every firing would re-process the same stuck record. `parked` is excluded for the same reason from the other direction — a human deliberately deferred it; unattended shaping must not un-defer it.
- The zero-eligible exit's lack of a durable trace means a silently broken eligibility query looks identical to an empty queue. This is accepted, mirroring dispatch — the independent queue surfaces (`/tidy`, `/help`) are the cross-check; do not add a per-firing heartbeat report.
- A `next` firing with nothing eligible must NOT file a self-report — an empty queue is the steady state, not a failure.
- Open #316 also edits `skills/specify/` files — check for collisions before merging (`git log --all --oneline -- plugin/skills/specify/` / `gh pr list --search "specify"` before finalizing; do not block on it).
- `specify/SKILL.md` byte ceiling: measure `wc -c` headroom before adding the `next` documentation; if headroom is thin, keep the `## Input` documentation to one tight paragraph and put detail in `next-mode.md`.

**Non-Goals (verbatim from spec — do not implement):**
- No batch or drain form — `next` never shapes more than one record per firing.
- No interaction with the comma-list batch grammar (#762 owns that consolidation).
- No framing-check guard and no `shaped:headless` provenance — #968 delivers those.
- No `local-files` headless support — `next` is `work-backend: github-issues` only.
- No routine template or fleet row (#970).

---

## Task 1: Extract `_shared/headless-self-report.md` and migrate `dispatch/SKILL.md`

**Files:**
- Create: `plugin/skills/_shared/headless-self-report.md`
- Modify: `plugin/skills/dispatch/SKILL.md` (Preflight section, headless self-report paragraph — lines ~61-63 as of this plan's authoring)
- Delete: `plugin/skills/dispatch/headless-self-report.md` (its content moves to the shared file — see "Genericization" below)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `plugin/skills/_shared/headless-self-report.md` — the shared fragment every headless-selection-form Preflight cites for its failure-self-report procedure. Task 3 (`next-mode.md`) cites this file's path directly: `` `_shared/headless-self-report.md` ``.

**Genericization.** The current `plugin/skills/dispatch/headless-self-report.md` is dispatch-specific in exactly these spots — parameterize each on extraction:
- Its title and intro paragraph name "Dispatch" and "`/claude-tweaks:dispatch`'s Preflight" — generalize to "the calling skill's Preflight" with a `{caller}` placeholder the citing skill fills in (e.g. "Dispatch" or "Specify").
- The label `by:dispatch` (used for the dedup search filter, the bootstrap `LABELS_JSON` origin label, and the `gh issue create --label by:dispatch` calls) — generalize to `by:{caller}` (e.g. `by:dispatch`, `by:specify`). The origin-label description text ("Origin: self-filed by /claude-tweaks:dispatch on a headless self-report trigger") likewise parameterizes on `{caller}`.
- The marker comment `<!-- dispatch-preflight-marker: {failing-check-name} -->` (used both to file and to dedup-search) — generalize to `<!-- {caller}-preflight-marker: {failing-check-name} -->` so dispatch's and specify's self-reports never collide on the same marker namespace.
- The dedup lookup tmp file paths (`/tmp/dispatch-selfreport-issues.json`, `/tmp/dispatch-selfreport-lookup.json`) — generalize to `/tmp/{caller}-selfreport-issues.json` / `/tmp/{caller}-selfreport-lookup.json` so two callers running self-report checks in the same session (unlikely but not impossible) never clobber each other's scratch files.
- The "Title" line (`"Dispatch headless self-report: {failing-check-name}"`) — generalize to `"{Caller} headless self-report: {failing-check-name}"` (capitalized caller name).

Everything else in the file is already generic: the "Resolved build" line format, the `findByMarker`/`dedup-lookup.js` usage, the `work-types: native` vs `work-types: labels` branch, the "Recording the build on a deduplicated re-file" section, the MCP path note, and the "No `ready`/`auto:build` on the filed issue" rule. Carry all of it verbatim, substituting only the `{caller}`-parameterized spots above.

Read the current `plugin/skills/dispatch/headless-self-report.md` in full before writing the extraction (it is 83 lines) — this task description summarizes what changes; the unlisted content (the exact `gh issue create` invocations, the exact dedup node snippet, the exact "Ordering" paragraph) carries over unchanged except for the substitutions named above.

**Steps:**

- [ ] **Step 1: Write `plugin/skills/_shared/headless-self-report.md`**

  Copy `plugin/skills/dispatch/headless-self-report.md`'s full content, applying every `{caller}`/`by:{caller}`/marker-namespace substitution listed above. Add a one-line header note (after the title, before "Ordering") naming both current consumers: "Consumers: `/claude-tweaks:dispatch` Preflight (`{caller}` = `dispatch`), `/claude-tweaks:specify` `next-mode.md` Preflight (`{caller}` = `specify`)." Keep the "Ordering" section's description of *when* this procedure runs generic — it already describes "before the stop it accompanies," which needs no caller-specific rewording.

- [ ] **Step 2: Update `dispatch/SKILL.md`'s Preflight section to cite the shared file**

  Replace the sentence `read \`headless-self-report.md\` in this skill's directory and follow it, then stop` with `read \`_shared/headless-self-report.md\` in this skill's directory and follow it (caller = \`dispatch\`), then stop`. Leave the surrounding paragraph (the "Headless self-report (`next` form only)" text) otherwise unchanged.

- [ ] **Step 3: Update the second citation site in `dispatch/settle-and-merge.md`**

  `dispatch/headless-self-report.md`'s own text (line 11) says: "`dispatch/settle-and-merge.md`'s Settle procedure invokes this file directly from inside that Task call when `DISPATCH_HEADLESS=1` was set." Grep `plugin/skills/dispatch/settle-and-merge.md` for `headless-self-report.md` and update that reference to `_shared/headless-self-report.md` (caller = `dispatch`) the same way.

- [ ] **Step 4: Delete `plugin/skills/dispatch/headless-self-report.md`**

  Per the spec's Deliverables: "Expected end state: `dispatch/headless-self-report.md` is deleted; it survives only if the extraction finds genuinely dispatch-specific parameterization... and in that case the PR names what stayed and why." The genericization above covers every dispatch-specific spot found — delete the file. `git rm plugin/skills/dispatch/headless-self-report.md`.

- [ ] **Step 5: Repo-wide citation sweep**

  `grep -rn "headless-self-report" plugin/ docs/ tests/` — confirm every remaining reference points at `_shared/headless-self-report.md`, not the deleted `dispatch/headless-self-report.md` path. Fix any missed reference (e.g. `docs/skill-graph.md` if it names this file — check and update if so).

- [ ] **Step 6: Commit**

  ```bash
  git add plugin/skills/_shared/headless-self-report.md plugin/skills/dispatch/SKILL.md plugin/skills/dispatch/settle-and-merge.md
  git rm plugin/skills/dispatch/headless-self-report.md
  git commit -m "Extract dispatch's headless self-report contract into _shared/ — specify next (#967) needs a second consumer"
  ```

## Task 2: `specify/SKILL.md` — add `next` to argument-hint and `## Input`

**Files:**
- Modify: `plugin/skills/specify/SKILL.md`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task only documents the form; Task 3 implements it).
- Produces: the `### Resolve the input` case-0 entry point (`next`) that Task 3's `next-mode.md` is reached from. Task 3's implementer reads this task's added case text to confirm the routing contract it must satisfy.

**Steps:**

- [ ] **Step 1: Measure byte headroom**

  ```bash
  wc -c plugin/skills/specify/SKILL.md
  ```

  Check this project's SKILL.md byte ceiling (grep `docs/skill-authoring.md` or `docs/donts.md` for the ceiling value if not already known from context). If headroom is thin (per the spec's Gotchas), keep this task's `## Input` addition to one tight paragraph and rely on `next-mode.md` (Task 3) for procedural detail — do not restate the 8-step procedure here.

- [ ] **Step 2: Update the frontmatter `argument-hint`**

  Current (line 4):
  ```
  argument-hint: "<#N[,#M...]|#A-#B|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
  ```
  New — add `next` as an alternative first-argument value (mirrors dispatch's `argument-hint: "[next|#N[,#M...]] ..."` pattern at `plugin/skills/dispatch/SKILL.md:4`):
  ```
  argument-hint: "<next|#N[,#M...]|#A-#B|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
  ```

- [ ] **Step 3: Add `next` to the `## Input` prose**

  Immediately after the `## Input` heading's opening paragraph (before the "Comma-list batch form" paragraph, so `next` reads as a first-argument alternative alongside the record-reference/design-doc-path/topic shapes already described there), add:

  ```markdown
  **`next` (headless-safe form).** The unit a scheduled Routine fires — mutually exclusive with every other first-argument shape. Selects, claims, and shapes exactly one eligible unshaped backlog record per firing; zero eligible records is a cheap no-op. `work-backend: github-issues` only (see `next-mode.md`'s Preflight). `phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected with a one-line notice when combined with `next` — this form takes no modifiers. See `next-mode.md` in this skill's directory for the full procedure.
  ```

- [ ] **Step 4: Add the `### Resolve the input` case**

  Insert as the new **case 0** (checked before case 1's record-reference check, since `next` is a bare literal token that would otherwise fail every existing case's pattern match harmlessly, but ordering it first keeps the resolution order self-documenting):

  ```markdown
  0. **Literal `next`** — the headless-safe form (see `## Input` above). Read `next-mode.md` in this skill's directory and follow it in full. This case ignores `phase-N`/`--surface`/`--granularity`/`--chained` if present — see that file's own flag-rejection step. `next-mode.md` is fully self-contained; when it completes, this skill's turn is over (its own Preflight/no-op/failure paths each end the invocation; there is no `## Next Actions` render for a headless firing — see `next-mode.md`'s own posture, mirroring `dispatch/SKILL.md`'s "nobody is present to answer" rule).
  ```

  Renumber nothing else — the existing cases 1-5 keep their numbers; `next` is case 0 precisely so no renumbering ripples through the rest of the file (every existing cross-reference to "case 1" through "case 5" elsewhere in this file and in `docs/` stays correct).

- [ ] **Step 5: Add one example line to the "Phase target examples" block**

  After the existing `/claude-tweaks:specify #142` example line, add:
  ```
  /claude-tweaks:specify next                                      → headless: shape exactly one eligible backlog record, or no-op if none eligible
  ```

- [ ] **Step 6: Verify headroom didn't regress**

  ```bash
  wc -c plugin/skills/specify/SKILL.md
  ```
  Confirm still under the project's SKILL.md byte ceiling (Step 1's measured value).

- [ ] **Step 7: Commit**

  ```bash
  git add plugin/skills/specify/SKILL.md
  git commit -m "Add next form to /claude-tweaks:specify — argument-hint, Input docs, resolve-input case 0"
  ```

## Task 3: `specify/next-mode.md` — the full headless selection procedure

**Files:**
- Create: `plugin/skills/specify/next-mode.md`

**Interfaces:**
- Consumes: `_shared/headless-self-report.md` (Task 1, cited for the Preflight-failure and shaping-stage-failure self-report paths), `_shared/record-queue-fetch.md`'s `work-backend` resolution + faceted fetch pattern (read, not modified), `_shared/issue-claims.md`'s claim/release/reading-claim-state operations (read, not modified), `shaping-mode.md`'s existing entry point (read, not modified — confirm its exact invocation shape under `--chained` before writing the "Shape" step below).
- Produces: nothing new consumed by a later task in this plan — this is the terminal file for spec #967. (Spec #968's guard inserts between claim and shape in a *later*, separate spec/build — not this task.)

**Before writing:** read `plugin/skills/specify/shaping-mode.md` in full to confirm exactly how a headless/`--chained` shaping invocation is entered today (dispatch/SKILL.md's `next`-mode doesn't shape directly — it's this file's only precedent for "claim then hand off to shaping"). Confirm the literal invocation this file should use for "hand the claimed record to shaping-mode.md under the `--chained` headless posture" — likely `Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")` per `SKILL.md`'s own Component-Skill Contract section (`Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")` is the documented invocation for `/capture`'s born-ready chain — confirm whether `next-mode.md` should route through that same external re-invocation, or call `shaping-mode.md`'s procedure directly in-process since it's already inside the `specify` skill). Prefer the in-process route (read `shaping-mode.md`'s procedure and follow it directly, passing the already-claimed, already-fetched record) over a recursive `Skill()` call, since `next-mode.md` already holds everything shaping mode needs and a recursive external invocation would re-fetch the record and re-run Preflight-adjacent work redundantly. State whichever choice is made as a one-line rationale at the top of the "Shape" step below.

**Steps:**

- [ ] **Step 1: Write the file header and Preflight section**

  ```markdown
  # Specify — `next` mode (headless selection form)

  Entered from `SKILL.md`'s `### Resolve the input` case 0 (the literal `next`
  first argument). The headless-safe unit a scheduled Routine fires — mirrors
  `/claude-tweaks:dispatch`'s `next` form (`dispatch/SKILL.md` Step 3)
  end-to-end: same ranking definition, same zero-eligible no-op posture, same
  claim/release discipline. Shaping itself is unchanged: this file hands the
  selected record to `shaping-mode.md` exactly as a `--chained` invocation
  does — no shaping logic is duplicated here.

  ## Flag rejection

  `phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected
  with a one-line notice when combined with `next` on the command line: "next
  takes no modifiers — {flag} ignored." This form always resolves
  `Design-intent: none` internally (mirroring `--chained`'s own headless
  default) without prompting, since a headless firing has nobody to answer
  Step 2.5c's design-intent question. Report the rejection notice, then
  proceed with `next`'s own procedure below — a rejected flag is a warning,
  never a hard stop.

  ## Preflight

  Read the project's `work-backend` config key (`_shared/work-record.md`'s
  Config keys table). **`work-backend: local-files`** — report that headless
  shaping is `github-issues` only (the claim protocol depends on GitHub's
  RBAC + atomic content writes, not a policy choice) and **stop this turn
  completely**: do not shape, claim, write, edit, or create any file; do not
  run any test or git-committing command. This holds with no exception when
  no interactive human is present to receive it: the absence of a human to
  hand this off to is not license to do the work in their place — it means
  the claim mechanism this protocol depends on is unavailable, so the correct
  behavior is to stop, not proceed. This stop is not superseded by this
  project's own auto-mode or hands-off-pipeline conventions — those govern a
  pipeline run already authorized to proceed; Preflight decides whether new
  work may start at all, which under `local-files` it explicitly cannot.

  **Headless self-report.** Before stopping on this Preflight failure, or on
  any post-claim shaping-stage failure below, read `_shared/headless-self-report.md`
  and follow it (`{caller}` = `specify`), then stop. It never softens the
  stop — it only leaves a durable GitHub trace, deduplicated against any
  existing open report so repeated firings don't re-file. A zero-eligible
  exit or a contested-claim exit (below) is NOT a failure and files nothing.
  ```

- [ ] **Step 2: Write the Eligibility query section**

  ```markdown
  ## Eligibility query

  Per `_shared/record-queue-fetch.md`'s `work-backend: github-issues` fetch:
  open records carrying none of `ready`, `needs:definition`, `parked`,
  `parent-issue`, and holding no live claim per `_shared/issue-claims.md`'s
  Reading claim state.

  ```bash
  gh issue list --state open --json number,title,labels,createdAt --limit 500 \
    | node -e "
      const records = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const EXCLUDE = new Set(['ready', 'needs:definition', 'parked', 'parent-issue']);
      const eligible = records.filter((r) =>
        !r.labels.some((l) => EXCLUDE.has(l.name))
      );
      console.log(JSON.stringify(eligible));
    " > /tmp/specify-next-candidates.json
  ```

  Then filter out any record already carrying a live or stale-but-unbroken
  claim — read each candidate's claim state per `_shared/issue-claims.md`'s
  "Reading claim state" section (`state: 'live'` excludes it; `'absent'`,
  `'tombstone'`, and `'stale'` — the last reclaimed at claim time in Step 4
  below, not here — do not).
  ```

- [ ] **Step 3: Write the Selection section, mirroring dispatch's ranking exactly**

  Mirror `dispatch/SKILL.md`'s Step 3 `next`-ranking node script exactly (priority:high > priority:medium > priority:low > unprioritized, oldest `createdAt` first within band), substituting dispatch's group-representative selection (which operates over file-overlap groups) for a flat per-record selection since `next-mode.md` picks one record, not one group:

  ```markdown
  ## Selection

  Exactly one record, by dispatch's own ranking (`dispatch/SKILL.md` Step 3):
  `priority:high` > `priority:medium` > `priority:low` > unprioritized,
  oldest `createdAt` first within each band.

  ```bash
  node -e "
    const RANK = { high: 0, medium: 1, low: 2 };
    const bandOf = (r) => {
      const p = r.labels.find((l) => l.name.startsWith('priority:'));
      return p ? RANK[p.name.slice('priority:'.length)] : 3;
    };
    const candidates = require('/tmp/specify-next-candidates.json');
    const ranked = candidates.slice().sort((a, b) =>
      bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt));
    console.log(JSON.stringify(ranked.length ? ranked[0] : null));
  " > /tmp/specify-next-pick.json
  ```

  ## Zero eligible

  A `null` result in `/tmp/specify-next-pick.json` (no candidates after Step
  2's filter, or Step 2's initial fetch was empty): report "nothing eligible
  this firing" and exit cleanly — no self-report, no notification. The
  firing's own session transcript line is the only trace, deliberately
  (mirrors dispatch's "Zero eligible groups" posture) — `/claude-tweaks:tidy`
  and `/claude-tweaks:help` surface queue state independently on their own
  cadence.
  ```

- [ ] **Step 4: Write the Claim section**

  ```markdown
  ## Claim

  Re-read the selected record's live labels immediately before claiming — the
  Eligibility query snapshot (Step above) is stale by definition by the time
  Selection picks a winner:

  ```bash
  gh issue view {n} --json labels -q '[.labels[].name]'
  ```

  If the re-read shows the record no longer eligible (now carries `ready`,
  `needs:definition`, `parked`, or `parent-issue`) — exit as a clean no-op
  for this firing. No same-firing re-selection; the next firing picks up
  (dispatch's no-retry posture, mirrored exactly).

  Otherwise, claim it per `_shared/issue-claims.md`'s "The lock": read the
  claim blob, classify with `classifyClaimBlob`, and write create-only
  (`'absent'`) or conditionally (`'tombstone'`/`'stale'`). If the write is
  contested (`'live'`, or a write rejection) — exit as a clean no-op for this
  firing, same as an ineligible re-read. This is not a failure; file no
  self-report.

  `runId` for this claim is this firing's own resolved run directory
  identity (`_shared/pipeline-run-dir.md`'s standalone-auto resolution —
  `specify` is not yet on that file's allowlist; add it there as part of this
  task if the allowlist check would otherwise reject a standalone `next`
  firing — verify against `_shared/pipeline-run-dir.md`'s current allowlist
  before writing this line, and adjust the allowlist file too if a firing
  needs to be added).
  ```

  **Note for the implementer:** the parenthetical above about the
  `pipeline-run-dir.md` allowlist is a real open question — read that file's
  current allowlist during implementation and either confirm `specify` (or a
  `next`-mode-specific entry) is already permitted, or add it as part of this
  task's diff. Do not skip this check; an unresolvable run directory would
  make the claim's `runId` unavailable.

- [ ] **Step 5: Write the Shape section**

  Per the "Before writing" note above this task: state the chosen invocation
  (in-process shaping-mode procedure vs. recursive `Skill()` call) as a
  one-line rationale, then write the section accordingly. Example shape
  (adjust to match whichever route was actually confirmed against
  `shaping-mode.md`'s real entry point):

  ```markdown
  ## Shape

  Hand the claimed record to `shaping-mode.md`'s procedure directly, under
  the same headless posture `--chained` uses: Step 2.5c's design-intent
  question resolves to `Design-intent: none` without prompting (already
  established in Flag rejection above), and no `## Next Actions` renders at
  the end (headless — nobody is present to answer it). Shaping mode's own
  `ready` stamp is what removes the record from future `next` eligibility —
  no extra state change is needed here.
  ```

- [ ] **Step 6: Write the Release section**

  ```markdown
  ## Release

  Release the claim (`_shared/issue-claims.md`'s release operation) on the
  success path AND on every failure path below this point — try/finally
  semantics: whatever happens during Shape, Release always runs before this
  procedure's turn ends. If the release write itself fails, do not retry
  in-firing — the claims contract's stale-claim TTL is the backstop
  (`/tidy`'s sweep eventually reclaims it).
  ```

- [ ] **Step 7: Write the Failure self-report section**

  ```markdown
  ## Failure self-report

  Any Preflight failure (Preflight section above), and any post-claim
  shaping-stage failure (Shape section above throwing or returning an error),
  files the shared headless self-report (`_shared/headless-self-report.md`,
  `{caller}` = `specify`) before stopping — deduplicated against any existing
  open report. A zero-eligible exit (Selection section) or a contested-claim
  exit (Claim section) is NOT a failure and files nothing.
  ```

- [ ] **Step 8: Self-review against the spec's AC 2 checklist**

  Re-read the completed file against spec #967's AC 2: "states: the
  eligibility predicate ..., priority-then-age single selection, the
  zero-eligible clean no-op, claim-time live re-read with clean-no-op on
  contest/ineligibility, release-on-every-path claim handling, the
  `github-issues`-only Preflight hard stop, and self-report on Preflight and
  shaping-stage failure." Confirm each clause has a corresponding section
  above; fix any gap before proceeding.

- [ ] **Step 9: Commit**

  ```bash
  git add plugin/skills/specify/next-mode.md plugin/skills/_shared/pipeline-run-dir.md
  git commit -m "Add specify/next-mode.md — headless selection/claim/shape/release procedure (#967)"
  ```

  (Include `pipeline-run-dir.md` in the add only if Step 4's allowlist check required a change to it.)

## Task 4: Conformance test pinning AC 1-3

**Files:**
- Create: `tests/specify-next-mode.test.js`
- Test: same file (this task is itself the test)

**Interfaces:**
- Consumes: the finished `plugin/skills/specify/SKILL.md` (Task 2), `plugin/skills/specify/next-mode.md` (Task 3), and `plugin/skills/_shared/headless-self-report.md` (Task 1) — reads their live prose, does not modify them.
- Produces: nothing consumed by a later task (last task in this plan).

**Before writing:** read one existing prose-pinning conformance test for the exact pattern this project uses (`node --test`, no external deps, reading a skill `.md` file's text and asserting on substrings/regexes) — `tests/batch-ref-argument.test.js` or `tests/tidy-report-rules.test.js` per the spec's Current State pointer. Match that file's structure (imports, `describe`/`test` shape, how it resolves the plugin skills directory path) exactly.

**Steps:**

- [ ] **Step 1: Read the reference test file**

  ```bash
  cat tests/batch-ref-argument.test.js
  ```
  Note: (a) how it imports `node:test`/`node:assert`; (b) how it resolves `plugin/skills/...` paths relative to the test file (likely `path.join(__dirname, '..', 'plugin', 'skills', ...)`); (c) whether it reads the file once at module scope or per-test.

- [ ] **Step 2: Write the failing test**

  Structure (adjust import/path-resolution style to match Step 1's reference exactly):

  ```js
  'use strict';
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const SPECIFY_SKILL = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'specify', 'SKILL.md'),
    'utf8'
  );
  const NEXT_MODE = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'specify', 'next-mode.md'),
    'utf8'
  );
  const DISPATCH_SKILL = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'SKILL.md'),
    'utf8'
  );

  test('SKILL.md argument-hint names next', () => {
    assert.match(SPECIFY_SKILL, /argument-hint:\s*"<next\|/);
  });

  test('SKILL.md documents next in ## Input', () => {
    assert.match(SPECIFY_SKILL, /\*\*`next`.*headless/i);
  });

  test('SKILL.md resolve-input has a next case with flag rejection', () => {
    assert.match(SPECIFY_SKILL, /Literal `next`/);
    assert.match(SPECIFY_SKILL, /next-mode\.md/);
  });

  test('next-mode.md states the eligibility predicate', () => {
    assert.match(NEXT_MODE, /`ready`/);
    assert.match(NEXT_MODE, /`needs:definition`/);
    assert.match(NEXT_MODE, /`parked`/);
    assert.match(NEXT_MODE, /`parent-issue`/);
  });

  test('next-mode.md states priority-then-age single selection', () => {
    assert.match(NEXT_MODE, /priority:high.*priority:medium.*priority:low/s);
  });

  test('next-mode.md states the zero-eligible clean no-op', () => {
    assert.match(NEXT_MODE, /nothing eligible this firing/);
  });

  test('next-mode.md states claim-time live re-read with clean no-op on contest', () => {
    assert.match(NEXT_MODE, /Re-read the selected record.*live labels/s);
    assert.match(NEXT_MODE, /clean no-op/);
  });

  test('next-mode.md states release-on-every-path claim handling', () => {
    assert.match(NEXT_MODE, /try\/finally/);
  });

  test('next-mode.md states the github-issues-only Preflight hard stop', () => {
    assert.match(NEXT_MODE, /work-backend: local-files/);
    assert.match(NEXT_MODE, /github-issues/);
  });

  test('next-mode.md states self-report on Preflight and shaping-stage failure', () => {
    assert.match(NEXT_MODE, /headless-self-report\.md/);
    assert.match(NEXT_MODE, /shaping-stage failure/);
  });

  test('_shared/headless-self-report.md exists and both consumers cite it', () => {
    const sharedPath = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'headless-self-report.md');
    assert.ok(fs.existsSync(sharedPath), 'expected plugin/skills/_shared/headless-self-report.md to exist');
    assert.match(DISPATCH_SKILL, /_shared\/headless-self-report\.md/);
    assert.match(NEXT_MODE, /_shared\/headless-self-report\.md/);
  });

  test('dispatch/headless-self-report.md no longer exists (extracted, not duplicated)', () => {
    const oldPath = path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'headless-self-report.md');
    assert.ok(!fs.existsSync(oldPath), 'expected dispatch/headless-self-report.md to be deleted after extraction');
  });
  ```

- [ ] **Step 3: Run it to verify it fails before Tasks 1-3 land**

  This task runs after Tasks 1-3 in execution order (per the plan's task sequence), so by the time this test is written, the files it checks should already exist. Verify the test suite is discriminating, not vacuous: temporarily revert one assertion's target (e.g. comment out the `next` case in `SKILL.md`) and confirm that specific test fails, then restore it. Per spec AC 4: "verify once by reverting during development."

  ```bash
  node --test tests/specify-next-mode.test.js
  ```
  Expected: all tests PASS against the Task 1-3 output. Then do the revert-and-confirm from AC 4 for at least one assertion per Task (three spot-checks: the `SKILL.md` argument-hint, the `next-mode.md` eligibility predicate, the `_shared/headless-self-report.md` existence check), restoring each after confirming its test goes red.

- [ ] **Step 4: Run the full suite**

  ```bash
  npm test
  ```
  Expected: PASS. Per spec AC 5.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/specify-next-mode.test.js
  git commit -m "Add conformance test pinning specify next form + shared headless-self-report (#967 AC 1-4)"
  ```

## Acceptance Criteria

- [ ] `plugin/skills/specify/SKILL.md` names `next` in its `argument-hint` and documents it in `## Input` as the headless Routine-fired form with the flag-rejection rule.
- [ ] `plugin/skills/specify/next-mode.md` exists and states: the eligibility predicate, priority-then-age single selection, the zero-eligible clean no-op, claim-time live re-read with clean-no-op on contest/ineligibility, release-on-every-path claim handling, the `github-issues`-only Preflight hard stop, and self-report on Preflight and shaping-stage failure.
- [ ] `plugin/skills/_shared/headless-self-report.md` exists; `dispatch/SKILL.md` and `specify/next-mode.md` both cite it; no full restatement of the contract remains in either skill.
- [ ] The new conformance test pins AC 1-3 and fails when a citation is removed (verified once by reverting during development).
- [ ] `npm test` passes.
