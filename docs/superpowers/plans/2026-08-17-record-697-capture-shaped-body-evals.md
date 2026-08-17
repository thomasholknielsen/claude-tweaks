# Eval Scenarios for capture's Shaped-body Branch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add executable eval-harness coverage for `/claude-tweaks:capture`'s Shaped-body branch (skills/capture/SKILL.md, shipped by #625), pinning AC 1-3 of #697 with live-invocation scenarios instead of the prose-trace-only coverage the #625 build shipped with.

**Architecture:** The eval harness (`evals/runner.js`) runs exactly one `skill_invocation.prompt` per scenario YAML file against a fixture repo, then checks mechanical assertions against the resulting fixture state. It has no mechanism for multiple sequential sub-invocations inside one scenario file (confirmed by reading `runner.js`'s `runResolvedScenario`: one `scenario.skill_invocation.prompt`, one fixture build, one assertion pass). #697's own Deliverables anticipated this ("If the harness cannot run three prompts in one scenario, split into three sibling scenarios sharing the fixture") — this plan takes that branch: three sibling scenario files, each its own fresh `init-baseline` fixture instance, each pinning one of AC 1-3.

**Tech Stack:** Node.js (`node --test`), the `evals/` harness (`runner.js`, `evals/assertions/*.js`), YAML scenario files, `js-yaml` (already a harness dependency).

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044452-record-697/work/697-spec.md` (materialized from GitHub issue #697)

## Global Constraints

- Scenarios use `fixture: { base: init-baseline }` (local-files backend — the only driver the eval harness can reach; no network, no live `gh` remote).
- Every scenario's `assertions:` block uses only harness-registered types: `file-exists`, `file-contains`, `dir-file-count`, `local-record-facet`, `tool-count` (`evals/assertions/index.js`'s `ASSERTIONS` registry) — no prose "the agent behaves well" assertions.
- Each scenario's `description:` field documents the deliberate wrong-behavior trace: which specific assertion would catch a reason-less filing, a stub fallback (unshaped detection), or a bogus scored value — matching the style of `evals/scenarios/wrap-up-refuses-reasonless-proposal.yaml` and `evals/scenarios/wrap-up-fix-now-not-file.yaml`.
- Validation is harness plumbing only (`cd evals && node --test tests/`) — the harness's own `node --test tests/*.test.js` suite uses fake `queryFn`s and does not execute a live, billed model run against these new scenario files; that stays manual/paid per #697's own Deliverables note.
- Record ids are deterministic per fresh fixture: `init-baseline`'s `specs/` directory does not exist before a scenario's own live run creates it, so `allocateId` (`bin/lib/issues/local-store.js`) assigns id `1` to the first (and, in the AC1/AC2 scenarios, only) record filed.
- Slugs are deterministic via `deriveSlug` (`bin/lib/issues/local-store.js`): lowercase, non-alphanumeric runs collapsed to `-`, trimmed, truncated to 60 chars. Scenarios pass an explicit `--title=` so the resulting filename is fully predictable rather than left to the model's own title choice.

---

### Task 1: AC1 scenario — shaped body + `--defer-reason=` files a scored, born-ready record

**Files:**
- Create: `evals/scenarios/capture-shaped-body-born-ready.yaml`

**Interfaces:**
- Consumes: `evals/fixtures/init-baseline` (existing fixture base, `work-backend: local-files`); `local-record-facet`/`file-exists`/`dir-file-count`/`tool-count` assertion types (`evals/assertions/index.js`).
- Produces: nothing consumed by a later task — sibling scenario, no shared state.

- [ ] **Step 1: Write the scenario file**

```yaml
name: capture-shaped-body-born-ready
description: >
  Runtime pin for #697 AC 1 (capture's Shaped-body branch, shipped by #625,
  skills/capture/SKILL.md "Score and file born-ready"): a shaped idea body
  (## Current State / ## Deliverables / ## Acceptance Criteria, all
  non-empty, no placeholder markers) passed with --defer-reason=tangential
  must file exactly one local-files record, scored and born-ready —
  by:capture equivalent (facets.origin = "capture"), risk/size stamped,
  facets.stage = "ready" (no human gate needed on this branch), and the
  composed body carrying the Defer-reason: line from the flag (specShapedBody
  renders it once, between provenance and ## Current State — see
  bin/lib/issues/record.js's specShapedBody and the unit-level composition
  probe at tests/deferral-gate-conformance.test.js's "a shaped-branch
  born-ready filing composes the exact labels and body AC 1 names", which
  pins the payload shape directly; this scenario pins the live end-to-end
  behavior that unit test cannot reach). The idea text describes a
  deliberately trivial, unambiguous one-line doc fix so self-judged
  risk/size land at low/low without ambiguity.
  Wrong-behavior trace: a build that took the STUB branch instead of
  detecting the shaped body would leave specs/1-fix-stale-blue-only-claim-in-example-note.md
  missing (file-exists fails) or file an unscored, non-ready record (the
  local-record-facet checks on stage/risk/size fail); a build that dropped
  the --defer-reason= value would leave the Defer-reason: line out of the
  body (file-contains fails); a build that filed a SECOND record (e.g. also
  writing a stub alongside the shaped one) fails the dir-file-count max: 1
  ceiling.
fixture:
  base: init-baseline
  seed:
    - files:
        docs/example-note.md: |
          # Example Note

          Widgets ship in blue only.
skill_invocation:
  prompt: >
    /claude-tweaks:capture "## Current State

    docs/example-note.md still says \"Widgets ship in blue only.\" That claim
    is stale — widgets now ship in multiple colors.


    ## Deliverables

    - [ ] Update docs/example-note.md so it no longer claims blue-only
    shipping.


    ## Acceptance Criteria

    1. docs/example-note.md does not contain the string \"blue only\"."
    --title="Fix stale blue-only claim in example note" --defer-reason=tangential
assertions:
  - type: file-exists
    path: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    shouldExist: true
  - type: local-record-facet
    recordPath: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    facet: "origin"
    equals: "capture"
  - type: local-record-facet
    recordPath: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    facet: "stage"
    equals: "ready"
  - type: local-record-facet
    recordPath: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    facet: "risk"
    equals: "low"
  - type: local-record-facet
    recordPath: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    facet: "size"
    equals: "low"
  - type: file-contains
    path: "specs/1-fix-stale-blue-only-claim-in-example-note.md"
    contains: ["Defer-reason: tangential"]
  - type: dir-file-count
    path: "specs"
    max: 1
  - type: tool-count
    max: 40
```

- [ ] **Step 2: Parse-check the YAML**

Run:
```bash
cd evals && node -e "const yaml=require('js-yaml'); const fs=require('fs'); const s=yaml.load(fs.readFileSync('scenarios/capture-shaped-body-born-ready.yaml','utf8')); if(!s.name||!s.fixture||!s.skill_invocation||!s.skill_invocation.prompt||!Array.isArray(s.assertions)||s.assertions.length===0) throw new Error('malformed scenario'); console.log('OK', s.name, s.assertions.length, 'assertions');"
```
Expected: `OK capture-shaped-body-born-ready 8 assertions` (verified live against the exact planned YAML content before dispatch; no throw).

- [ ] **Step 3: Run the harness plumbing suite**

```bash
cd evals && node --test tests/
```
Expected: all tests pass (the new file is inert to every existing test — none of them glob `scenarios/*.yaml` for this file specifically).

- [ ] **Step 4: Commit**

```bash
git add evals/scenarios/capture-shaped-body-born-ready.yaml
git commit -m "Add eval scenario pinning capture's shaped-body born-ready filing (AC 1) — refs #697"
```

---

### Task 2: AC2 scenario — shaped body with `## Open Question` + `--source` files `needs:definition`, no scoring

**Files:**
- Create: `evals/scenarios/capture-shaped-body-needs-definition.yaml`

**Interfaces:**
- Consumes: same fixture base and assertion types as Task 1. Independent scenario — no interface dependency on Task 1's file.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Write the scenario file**

```yaml
name: capture-shaped-body-needs-definition
description: >
  Runtime pin for #697 AC 2 (capture's Shaped-body branch, "Judging
  Definition first — and it wins", skills/capture/SKILL.md): a shaped idea
  body carrying ## Open Question in place of ## Acceptance Criteria, passed
  with --source reflect and NO --defer-reason=, must still file successfully
  with facets.needsDefinition = true and no scoring/ready — because the
  needs:definition branch is evaluated before the deferral check and takes
  precedence over it (a needs-you record is not a deferral, per SKILL.md's
  own "not required here" language), even though --source alone would
  normally make a shaped filing with no reason a hard stop (see AC 3's
  sibling scenario). This is the one case where the deferral gate's own
  hard-stop rule does NOT apply despite --source being present.
  Wrong-behavior trace: a build that let the --source deferral check run
  BEFORE the needs:definition check would stop and file nothing (dir-file-count
  max: 1 would still pass vacuously at 0, but the file-exists/local-record-facet
  checks below on the specific expected record would fail outright); a build
  that filed the record but also stamped it "ready" or scored it (treating
  needs:definition as compatible with born-ready) fails the stage/risk/size
  local-record-facet checks — an undecided record can never be
  simultaneously ready.
fixture:
  base: init-baseline
skill_invocation:
  prompt: >
    /claude-tweaks:capture "## Current State

    This fixture project's retry helper retries failed requests, but the
    backoff strategy has never been decided.


    ## Deliverables

    - [ ] Decide and document the retry backoff strategy.


    ## Open Question

    Should retries use a fixed delay or exponential backoff?"
    --title="Clarify retry backoff strategy" --source reflect
assertions:
  - type: file-exists
    path: "specs/1-clarify-retry-backoff-strategy.md"
    shouldExist: true
  - type: local-record-facet
    recordPath: "specs/1-clarify-retry-backoff-strategy.md"
    facet: "origin"
    equals: "capture"
  - type: local-record-facet
    recordPath: "specs/1-clarify-retry-backoff-strategy.md"
    facet: "needsDefinition"
    equals: true
  - type: local-record-facet
    recordPath: "specs/1-clarify-retry-backoff-strategy.md"
    facet: "stage"
    equals: "backlog"
  - type: local-record-facet
    recordPath: "specs/1-clarify-retry-backoff-strategy.md"
    facet: "risk"
    equals: null
  - type: local-record-facet
    recordPath: "specs/1-clarify-retry-backoff-strategy.md"
    facet: "size"
    equals: null
  - type: file-contains
    path: "specs/1-clarify-retry-backoff-strategy.md"
    contains: ["## Open Question"]
    absent: ["## Acceptance Criteria", "Defer-reason:"]
  - type: dir-file-count
    path: "specs"
    max: 1
  - type: tool-count
    max: 40
```

- [ ] **Step 2: Parse-check the YAML**

```bash
cd evals && node -e "const yaml=require('js-yaml'); const fs=require('fs'); const s=yaml.load(fs.readFileSync('scenarios/capture-shaped-body-needs-definition.yaml','utf8')); if(!s.name||!s.fixture||!s.skill_invocation||!s.skill_invocation.prompt||!Array.isArray(s.assertions)||s.assertions.length===0) throw new Error('malformed scenario'); console.log('OK', s.name, s.assertions.length, 'assertions');"
```
Expected: `OK capture-shaped-body-needs-definition 9 assertions` (no throw).

- [ ] **Step 3: Run the harness plumbing suite**

```bash
cd evals && node --test tests/
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add evals/scenarios/capture-shaped-body-needs-definition.yaml
git commit -m "Add eval scenario pinning capture's shaped-body needs:definition precedence (AC 2) — refs #697"
```

---

### Task 3: AC3 scenario — shaped body + `Origin:` line, no reason, files nothing and reports the gap

**Files:**
- Create: `evals/scenarios/capture-shaped-body-missing-reason.yaml`

**Interfaces:**
- Consumes: same fixture base and assertion types as Tasks 1-2. Independent scenario.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Write the scenario file**

```yaml
name: capture-shaped-body-missing-reason
description: >
  Runtime pin for #697 AC 3 (capture's Shaped-body branch, "The deferral
  check", skills/capture/SKILL.md): a shaped idea body whose header carries
  an Origin: line (a content signal that this filing is a deferral, per
  SKILL.md's deferral-check rule), with NO --defer-reason= flag and no
  Defer-reason: line in the body text, must file NOTHING and report the
  missing reason — the same hard gate wrap-up/refused-proposals.md enforces
  at the Review Console. Deliberately distinct from AC 1's scenario (which
  also carries a reason, supplied via the flag) and from AC 2's scenario
  (whose --source-triggered deferral check is pre-empted by the
  needs:definition branch) — this body has a normal ## Acceptance Criteria
  section (not ## Open Question), so it does NOT take the needs:definition
  branch, and the Origin: line's deferral requirement is the only thing
  standing between it and a born-ready filing.
  Wrong-behavior trace: a build that silently dropped the missing-reason
  hard stop and filed the record anyway (treating Origin: as decorative
  text rather than a provenance/deferral signal) leaves specs/ non-empty —
  caught directly by the dir-file-count max: 0 ceiling below, the same
  mechanism evals/scenarios/wrap-up-fix-now-not-file.yaml uses to catch a
  ledger item filed instead of fixed.
fixture:
  base: init-baseline
skill_invocation:
  prompt: >
    /claude-tweaks:capture "Origin: eval harness AC3 probe


    ## Current State

    This fixture project's search results list shows every result on one
    page, with no way to page through more than the first batch.


    ## Deliverables

    - [ ] Add pagination controls to the search results list.


    ## Acceptance Criteria

    1. The search results list paginates results instead of rendering every
    result on one page."
    --title="Add pagination to the search results list"
assertions:
  - type: dir-file-count
    path: "specs"
    max: 0
  - type: tool-count
    max: 30
```

- [ ] **Step 2: Parse-check the YAML**

```bash
cd evals && node -e "const yaml=require('js-yaml'); const fs=require('fs'); const s=yaml.load(fs.readFileSync('scenarios/capture-shaped-body-missing-reason.yaml','utf8')); if(!s.name||!s.fixture||!s.skill_invocation||!s.skill_invocation.prompt||!Array.isArray(s.assertions)||s.assertions.length===0) throw new Error('malformed scenario'); console.log('OK', s.name, s.assertions.length, 'assertions');"
```
Expected: `OK capture-shaped-body-missing-reason 2 assertions` (no throw).

- [ ] **Step 3: Run the harness plumbing suite**

```bash
cd evals && node --test tests/
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add evals/scenarios/capture-shaped-body-missing-reason.yaml
git commit -m "Add eval scenario pinning capture's shaped-body missing-reason hard stop (AC 3) — refs #697"
```

---

### Task 4: Final verification — full harness suite green with all three scenarios present

**Files:**
- None created or modified (verification-only task).

**Interfaces:**
- Consumes: the three scenario files from Tasks 1-3.
- Produces: nothing (terminal task).

- [ ] **Step 1: Run the full evals harness test suite with all three scenario files present**

```bash
cd evals && node --test tests/
```
Expected: exit code 0, all suites pass (matches #697's AC 1: `node --test "evals/tests/*.test.js"` from `evals/`).

- [ ] **Step 2: Confirm all three scenario files are present and each parses**

```bash
cd evals && node -e "const yaml=require('js-yaml'); const fs=require('fs'); for (const f of ['capture-shaped-body-born-ready.yaml','capture-shaped-body-needs-definition.yaml','capture-shaped-body-missing-reason.yaml']) { const s=yaml.load(fs.readFileSync('scenarios/'+f,'utf8')); console.log(f, '->', s.assertions.length, 'assertions'); }"
```
Expected: three lines, one per file, each reporting its assertion count with no error.

- [ ] **Step 3: No commit needed** — this task is verification-only; Tasks 1-3 already committed their own files.
