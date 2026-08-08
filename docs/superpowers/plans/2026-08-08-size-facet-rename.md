# Rename the effort: Record Facet to size: — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the work-record facet `effort:` (task size) to `size:` across labels-handling code, the local-files driver, every live `facets.effort` consumer, and the prose that names the facet — leaving "effort" to mean reasoning depth exclusively (spec: `#217`, materialized at `.claude-tweaks/pipelines/2026-08-08T163319-spec-216-217-218/spec-217/work/217-spec.md`).

**Architecture:** Emit-side switches wholesale to `size` (labels `size:*`, frontmatter `size:`, param `size`); read-side is dual (`size` wins over `effort` when both present) and **permanent** — other projects' records keep `effort:*` labels forever, so the fallback is cross-project support with a major-version removal condition, not a transitional shim.

**Tech Stack:** Node 18+ built-ins; `node --test`.

## Global Constraints

- Worktree anchor: before every commit, `pwd` and `git rev-parse --show-toplevel` must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/model-profile-strategy-design`.
- Commits: `{Verb} {what} — {detail}`, ending `refs #217` (never a closing keyword). Stage named files only; `git diff --cached --name-only` before each commit.
- `size:*` wins over `effort:*` when both present — in `parseRecordFacets` AND `local-store.js`'s frontmatter parse. Both fallbacks carry the same comment: `// Read-side effort:* fallback — PERMANENT cross-project support (other repos' records keep effort:* labels); removable only at a major version that drops pre-rename repo support. [IL-85]`
- `review-effort`, `review-effort-floor`, and the resolver's effort axis are reasoning-depth vocabulary and are NEVER renamed. The `bin/lib/model-profiles/` module is out of scope entirely.
- **Deferred, not in any task** (controller executes later, tracked in the run ledger): the live `gh label edit` renames (at branch-finish, so `main`'s readers aren't broken mid-run) and the CHANGELOG note (at release).
- IL-105: every new discriminating assertion demonstrated red before shipping (scratch-copy negation or equivalent). IL-62: expected values derived independently, not from the implementation.

---

### Task 1: record.js — parse, emit, classification key

**Files:**
- Modify: `bin/lib/issues/record.js` (EFFORT_LABEL_RE ~61, CLASSIFICATION_SCORING ~80-81, recordPayload param ~104/117/128-130, parseRecordFacets ~236-238, comments ~71-75/101/175)
- Modify: `bin/lib/issues/tests/record.test.js` (+ `bin/lib/issues/tests/facet-shape.test.js` if it names the facet — check)

**Interfaces:**
- Consumes: nothing new.
- Produces: `recordPayload({..., size})` emitting `size:{tier}` labels (the `effort` param name is REMOVED — callers updated in Tasks 3-4; `/specify`/prose callers in Task 5); `parseRecordFacets` returns `facets.size` (never `facets.effort`), reading `size:*` primary and `effort:*` fallback, size wins; `CLASSIFICATION_SCORING` values become `{risk, size}`.

- [ ] **Step 1: Write the failing tests** — in `record.test.js`, add/adjust: `parseRecordFacets(['size:high'])` → `{size:'high'}`; `parseRecordFacets(['effort:high'])` → `{size:'high'}` (fallback); `parseRecordFacets(['size:low','effort:high'])` → `{size:'low'}` (size wins); `recordPayload({size:'low', ...})` labels include `size:low` and never `effort:low`; `CLASSIFICATION_SCORING.additive` deep-equals `{risk:'low', size:'low'}`. Run the file — new assertions fail (existing ones referencing `effort` will too; migrate them to `size` in the same edit, keeping their scenarios intact).
- [ ] **Step 2: Implement** — add `SIZE_LABEL_RE = /^size:(.+)$/`; keep `EFFORT_LABEL_RE` for the fallback with the permanent-comment above; `parseRecordFacets`: try size first, else effort, assign to `facets.size`; `recordPayload`: param `size`, `oneOf('size', size, TIERS)`, emit `size:${size}` (emission-order comment updated); `CLASSIFICATION_SCORING` keys `effort` → `size`; sweep the file's own comments.
- [ ] **Step 3: Run** `node --test bin/lib/issues/tests/record.test.js` → PASS. Then run the whole `bin/lib/issues/tests/` dir — OTHER suites will break (backlog, ranking, local-store, provenance/record-buckets if they name the facet): that is Tasks 2-3's work; list the failing files in your report, do NOT fix them here.
- [ ] **Step 4: Commit** `Rename record facet parse/emit to size — permanent effort read-fallback — refs #217` (record.js + its own test files only).

### Task 2: local-store.js — frontmatter key

**Files:**
- Modify: `bin/lib/issues/local-store.js` (~7 header comment, ~102 parse, ~169 serialize)
- Modify: `bin/lib/issues/tests/local-store.test.js`

**Interfaces:**
- Consumes: Task 1's convention (size wins on dual-read).
- Produces: `facets.size` serialized as `size:` frontmatter; parse reads `size:` primary, `effort:` fallback (same-precedence, same permanent comment).

- [ ] **Step 1: Tests** — round-trip: `writeRecord`/`createRecord` with `facets:{size:'medium'}` serializes a `size: medium` line and re-reads to `facets.size === 'medium'`; a hand-written record file with only `effort: high` parses to `facets.size === 'high'`; a file with both lines parses size's value. Run → RED (migrate existing effort-named assertions in the same edit).
- [ ] **Step 2: Implement** — parse both keys (size assigned after effort so it wins, or guarded), serialize only `size:`; update the header-comment facet list.
- [ ] **Step 3: Run** the file → PASS. **Step 4: Commit** `Rename local-store frontmatter facet to size — refs #217`.

### Task 3: backlog.js + ranking.js consumers

**Files:**
- Modify: `bin/lib/issues/backlog.js` (~33/40 scored gate, ~67/71 cleanup lane), `bin/lib/issues/ranking.js` (~7/18-20/57)
- Modify: `bin/lib/issues/tests/backlog.test.js`, `bin/lib/issues/tests/ranking.test.js`

**Interfaces:**
- Consumes: `facets.size` from Task 1/2.
- Produces: `SIZE_ORDER` / `sizeBandOf` (renamed from `EFFORT_ORDER`/`effortBandOf`) in ranking.js; backlog's scored gate reads `r.facets.risk && r.facets.size`, cleanup lane filters `r.facets.size === 'low'`.

- [ ] **Step 1: Tests** — migrate fixture keys to `facets.size`, AND add one test per file that routes through the REAL parser (`parseRecordFacets(['size:low', ...])` feeding the function under test) so a future parser-key change cannot pass on hand-built fixtures alone (the red-team's exact finding). Run → RED.
- [ ] **Step 2: Implement** the renames + comment sweep. **Step 3: Run** both files + record/local-store files → PASS. **Step 4: Commit** `Point backlog and ranking at facets.size with real-parser coverage — refs #217`.

### Task 4: Health payload call sites

**Files:**
- Modify: `bin/lib/code-health/issue-payload.js` (~67), `bin/lib/docs-health/issue-payload.js`, `bin/lib/harness-health/issue-payload.js`, `bin/lib/journey-health/issue-payload.js` (locate each `effort:` argument to `recordPayload` by grep)
- Modify: each module's `tests/issue-payload.test.js`

**Interfaces:**
- Consumes: Task 1's `recordPayload({size})`.
- Produces: call sites pass `size: finding.effort` — the judge-output field `finding.effort` (each health skill's own finding schema) is deliberately NOT renamed; only the record-param side changes. State this in a one-line comment at one call site per module.

- [ ] **Step 1: Tests** — update the four suites' `deepStrictEqual` label expectations `effort:*` → `size:*`. Run → RED. **Step 2: Implement** the four call-site changes. **Step 3: Run** all four suites + `bin/lib/issues/tests/` → PASS. **Step 4: Commit** `Pass size to recordPayload from the four health payload builders — refs #217`.

### Task 5: Prose sweep — skills

**Files:**
- Modify: `skills/_shared/work-record.md` (Scoring axis, label taxonomy, permission matrix), `skills/flow/materialize.md` (header field + reader table — the header line becomes `size: {low|medium|high}` and its reader row becomes "`size` | `/build` size-based profile selection"; add one clause: "pre-rename materialized files carry `effort:` — read it as `size` when `size:` is absent"), `skills/build/SKILL.md` (~184: bridge reads the header's `size:` field, low→Fast / medium→Standard / high→Capable; same fallback clause), `skills/backlog/SKILL.md`, `skills/assess-agent-autonomy/SKILL.md` (grant/ceremony read `risk:*`/`size:*`), `skills/specify/shaping-mode.md`, `skills/specify/record-creation.md` (stamping: `--label "size:$LEAF_SIZE"` forms), `skills/_shared/record-queue-fetch.md`, `skills/dispatch/SKILL.md`, `skills/_shared/label-bootstrap.md` (label pair enumerations if any name effort:*)
- Modify: `argument-hint` frontmatter of any swept skill whose `## Input` names the facet (grep after the sweep)

**Interfaces:** prose only; every facet-meaning "effort" becomes "size"; reasoning-depth "effort" (`review-effort*`, resolver/effort frontmatter, `effort:`-the-harness-key) untouched.

- [ ] **Step 1: Sweep** — per file, case-insensitive search for `effort` and judge each hit: facet-meaning → rename; reasoning-depth → keep. The bare-word restatements ("effort label", "effort tier", "effort-based", "effort band") are in scope (IL-40/IL-21).
- [ ] **Step 2: Verify per-file** — after editing each file, re-grep it for `effort` and confirm every remaining hit is reasoning-depth vocabulary; read edited sentences rendered (IL-27).
- [ ] **Step 3: Commit** `Sweep facet prose from effort to size across record-handling skills — refs #217`.

### Task 6: Diagram, acceptance greps

**Files:**
- Modify: `docs/diagrams/github-issues-lifecycle.html` (`effort:*` label rows ~291/510/633 and scoring prose)
- No other files — this task closes with the record's acceptance greps.

- [ ] **Step 1: Update the diagram's** `effort:low|medium|high` texts to `size:*` (rendered check: open the edited regions, confirm no tag structure broken).
- [ ] **Step 2: Acceptance greps** (record AC3), run with find+xargs, each demonstrated able to fail first (run them BEFORE Task 1 was merged — or against `git stash`-free `git show HEAD~N:` content — is impractical mid-branch; instead demonstrate red by running them with the exclusions removed and confirming the fallback lines appear):
  - `find skills bin tests docs -type f \( -name '*.md' -o -name '*.js' -o -name '*.html' \) -print0 | xargs -0 grep -niE 'effort:(low|medium|high)|facets\.effort|effort label|effort tier|effort-based|effort band' | grep -v "^docs/incident-log.md:" | grep -v "review-effort"` → remaining hits must be ONLY: the two permanent fallback lines + their tests, and this plan/materialized-spec (quote-the-old-state artifacts, IL-28).
  - Confirm `grep -c "size:" bin/lib/issues/record.js` ≥ 3.
- [ ] **Step 3: Run the full `bin/lib/issues/tests/` + the four health `tests/` dirs** once → all green. **Step 4: Commit** `Update the lifecycle diagram and close the size-rename sweep — refs #217`.

## Self-Review

1. **Spec coverage:** labels (deferred to branch-finish per controller adjudication — logged, ledger-tracked, AC1 verified then); record.js dual-read + emit (T1, AC2); consumers backlog/ranking + real-parser tests (T3); health payloads (T4); local-store (T2); prose sweep + argument-hints (T5); diagram + greps (T6, AC3); npm suite (AC4, run centrally); permanent-fallback comments (T1/T2, AC5 amended: removal condition is major-version, per the record's own revision).
2. **Placeholder scan:** clean.
3. **Type consistency:** `facets.size` everywhere post-rename; `finding.effort` (judge schema) deliberately retained at call sites with comment; `SIZE_ORDER`/`sizeBandOf` names consistent between T3's tests and implementation.
