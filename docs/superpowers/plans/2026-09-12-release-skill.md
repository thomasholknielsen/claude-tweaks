# `/claude-tweaks:release` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/claude-tweaks:release` — a skill that drives a release: reads the preflight pack, runs the whole-branch review before any bump, renders one console, executes through the engine `integration-model` selects, verifies the result landed, and closes out the shipped records' bookkeeping — with `--dry-run`, `--as {version}` and a HARD-GATE-guarded `--train`.

**Architecture:** `plugin/skills/release/SKILL.md` (8-part structure, Steps 1–8 with `--train` semantics) plus three lazy-loaded sub-files — `console.md` (Step 4), `execute.md` (Steps 5–6), `bookkeeping.md` (Step 7). Two small code changes make the prose executable: `/claude-tweaks:review` gains a `base:{ref}` scope token (Step 3's whole-branch review), and `bin/lib/issues/local-store.js` gains a `shipped` facet line (Step 7 under local-merge). Registrations: the `train` row in `_shared/autonomy-ceiling.md`, the two HARD-GATEs in `_shared/auto-mode-contract.md`'s registry, the `## release` section in `docs/skill-graph.md`, the consumer-table row in `_shared/integration-model.md`, and the three catalog surfaces `tests/skill-catalog-completeness.test.js` pins (help reference card, help context-flow table, getting-started). One conformance test pins the fully-qualified reference form inside this skill's own files.

**Tech Stack:** Markdown skill prose per `docs/skill-authoring.md`; Node built-ins; `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2256/work/2256-spec.md` (record #2256). Design doc Phase 5: `git show f92db978c:docs/superpowers/specs/2026-09-11-release-skill-design.md`.

## Global Constraints

- Every `SKILL.md` follows `docs/skill-authoring.md`'s 8-part structure; the canonical Interaction-style directive verbatim (pinned by `tests/skill-conventions.test.js`); `description` ≤ 260 chars; `argument-hint` mirrors `## Input`; file ≤ 40 KB.
- Skill references inside actionable text use the fully-qualified `/claude-tweaks:{skill}` form; `${CLAUDE_PLUGIN_ROOT}` for plugin binaries.
- The whole-branch review runs before any bump on every path including `--train` (stance 8, `[IL-97]`); `review: blocking` and a major bump (effective, post-`--as`) are HARD-GATEs that stop regardless of mode.
- Read-only until Step 5; every action Step 5–7 takes is logged per `_shared/auto-decision-log.md`; nothing is rendered from an unverified premise (#680).
- Node built-ins only; house style; commits `{Verb} {what} — {detail}, refs #2256`; trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`; plain single git commands; never stash/reset/checkout ./clean.

## Rulings

1. **`/review` gains a `base:{ref}` token** (Input rule 9) — scope is the first-parent diff `{ref}..origin/{integration-branch}`; Step 1 (spec compliance) is skipped for lack of a spec; effort derives from the diff heuristic unless a token is given. Registered in `argument-hint` and the `## Input` restatement line (the two mirrors #679 names).
2. **Catalog surfaces are in scope** — `tests/skill-catalog-completeness.test.js` fails a new skill missing from `skills/help/reference-card.md`, `skills/help/context-flow.md`'s Artifact Flow table and `docs/getting-started.md`; one row/line each lands here. `/help`'s workflow diagrams and README's lifecycle diagram stay unit 7's (#2257) — not pinned by tests.
3. **The two HARD-GATEs are registered** in `_shared/auto-mode-contract.md`'s "HARD-GATE / BLOCKED / STOP conditions" row (the strict rule forbids unregistered mid-flow stops) — `Extend:`, one clause.
4. **The run directory** is resolved per `_shared/pipeline-run-dir.md` (`PIPELINE_RUN_DIR`, else the most recent matching dir, else `hooks.js resolve-run-dir --spec-slug release --standalone release --create`); the pack, the decisions log, `release-held.md` and staged findings live there. `release-held.md` is written through `stage-item.js --id release-held` (it lands at `staged/release-held.md`).
5. **`shipped: v{version}`** is a first-class local-record facet: `local-store.js` parses `shipped: <value>` and serializes it after `closed-at:`; a record closes (`closeRecord`) and gets `shipped` set in one write.
6. **Release-PR polling** (`--as`) reads `gh pr view {n} --json title,headRefOid` every 20 s, 15 attempts; re-rendered means the title carries the effective version.
7. **Verify (Step 6)** under pr-first: tag on origin (`git ls-remote --tags origin v{version}`), `gh release view v{version}`, then the `release: published` workflow run via `gh run list --event release --json status,conclusion,name,url --limit 20`, bounded 15 × 20 s — missing after the bound, or `conclusion` not `success`, is the named partial state; under local-merge the engine's own exit code is the verdict (`5` = hook failed after the tag; `1` = a named partial state, quoted verbatim).
8. **The shipped set** is the `(#N)` suffixes of the pack's `unreleased.value.commits[].subject`; commits without a suffix render in an "unattributed commits" row; the conventional `(#N)` suffix is what the merge-time composer (#2251) writes.
9. **`--train` refusal** reads `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" release-train` and `… autonomy`; refused unless `true` and `unattended`; the run then behaves exactly as on-demand and logs `train: refused — autonomy {value}` (or `release-train false`).
11. **The description-corpus ceiling rises for the 36th skill** — `DESCRIPTION_TOTAL_CEILING_CHARS` 7,900 → 8,200 in `plugin/bin/lib/skill-audit/context-cost.js`, the precedent the file's own comment records for each new skill (Task 3's description is exactly 260 chars, keywords intact — nothing to trim without weakening selection).
13. **A fifth summary outcome, `failed`** — Step 5 attempted and landed nothing with no HARD-GATE fired (engine exit `1` nothing-written or `4` collision, a forge-refused merge, a `Release-As:` re-render past its bound). `HELD` means a gate fired before Step 5; `PARTIAL` means the release exists; neither describes a plain failure, and folding it into either renders a false row (#680).
12. **The conformance scanner exempts section literals** — `## /release` (the decisions-log heading) and `--section "/release"` are not skill references; Task 3 confirmed no bare invocation reference exists.
10. **A journey** `docs/journeys/release-a-version-2256.md` is written at the build's Common Step 6 (the design's Phase 6 names `release-a-version.md` as unit 7's replacement for `release-a-plugin-version.md`; the multi-spec suffix keeps the two apart until then).

---

### Task 1: `/claude-tweaks:review base:{ref}` — whole-branch scope

**Files:**
- Modify: `plugin/skills/review/SKILL.md:4` (`argument-hint`), the `## Input` restatement line and rule list (after rule 8)
- Modify: `plugin/skills/review/code-mode-steps.md:19-24` (Step 1 skip clause), `:104-107` (Step 2 base resolution)
- Test: `tests/review-base-ref-scope.test.js`

**Interfaces:**
- Produces: the token `base:{ref}` accepted anywhere among the other tokens; `{base}` = `{ref}`, `{branch}` = `origin/{integration-branch}`; Step 1 skipped ("no spec — base-ref scope"); everything from Step 1.5 on unchanged.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
// tests/review-base-ref-scope.test.js (#2256) — /claude-tweaks:review accepts a
// `base:{ref}` scope token (the whole-branch review /claude-tweaks:release's Step 3
// runs before any bump): the three surfaces that list accepted arguments agree,
// and code-mode-steps.md's Step 1/Step 2 name the token's effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'skills', 'review', 'SKILL.md'), 'utf8');
const STEPS = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'skills', 'review', 'code-mode-steps.md'), 'utf8');

test('argument-hint lists base:<ref>', () => {
  const hint = /^argument-hint:\s*"(.*)"$/m.exec(SKILL);
  assert.ok(hint, 'argument-hint present');
  assert.match(hint[1], /base:<ref>/);
});

test('the ## Input section carries a numbered rule for base:{ref} naming the first-parent scope', () => {
  const input = SKILL.slice(SKILL.indexOf('## Input'), SKILL.indexOf('## Code-Mode Procedure'));
  assert.match(input, /^9\. \*\*`base:\{ref\}`\*\*/m);
  assert.match(input, /first-parent/);
  assert.match(input, /origin\/\{integration-branch\}/);
  assert.match(input, /\/claude-tweaks:release/);
});

test('code-mode-steps: Step 1 skips on a base:{ref} scope, Step 2 resolves {base} from it', () => {
  const step1 = STEPS.slice(STEPS.indexOf('## Step 1: Spec Compliance'), STEPS.indexOf('## Step 1.5'));
  assert.match(step1, /base:\{ref\}/);
  const step2 = STEPS.slice(STEPS.indexOf('## Step 2: Identify What Changed'), STEPS.indexOf('### Merge-Provenance Check'));
  assert.match(step2, /base:\{ref\}/);
  assert.match(step2, /--first-parent/);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/review-base-ref-scope.test.js` — Expected: FAIL (`base:<ref>` absent from the hint).

- [ ] **Step 3: Implement** — three prose edits:

`plugin/skills/review/SKILL.md` line 4 becomes:

```
argument-hint: "[<spec-number>|<file-path>...|base:<ref>|visual <url-or-description>|journey:<name>|discover] [full] [low|medium|high|xhigh|max]"
```

In `## Input`, extend the restatement sentence (`… = spec number, file paths, mode, effort tier, or visual review target.`) to `… = spec number, file paths, a `base:{ref}` scope, mode, effort tier, or visual review target.` and append after rule 8:

```
9. **`base:{ref}`** (e.g. `/claude-tweaks:review base:v1.2.0`, `base:v1.2.0 high`) — a whole-branch scope: every first-parent commit from `{ref}` to `origin/{integration-branch}` (the integration branch per `_shared/integration-branch.md`, fetched first), spanning many already-merged PRs. Mode: code. No spec exists to check, so Step 1 is skipped; Step 2's `{base}` is `{ref}` and `{branch}` is `origin/{integration-branch}` (the first-parent walk, never `--merges` exclusion — every squash-merged PR is one commit on that line); effort derives from the diff heuristic unless rule 8's token is given. This is the pre-bump gate `/claude-tweaks:release` Step 3 runs (design stance 8, `[IL-97]`) — findings stage per `_shared/staged-patch.md` exactly as on a spec review, and Step 7's summary records the tier.
```

`plugin/skills/review/code-mode-steps.md` Step 1 — after the fast-lane skip paragraph add: `Skip it too on a `base:{ref}` scope (Input rule 9): no spec exists to verify — proceed to Step 1.5 with "no spec — base-ref scope" in Step 7's summary.` Step 2 — after the `{base}` resolution paragraph add: `On a `base:{ref}` scope, `{base}` is the given ref and `{branch}` is `origin/{integration-branch}`; the change set is `git log --first-parent {base}..{branch}` / `git diff {base}..{branch}` — the first-parent line of the integration branch, so each squash-merged PR is one commit and a `--no-ff` merge counts once.`

- [ ] **Step 4: Run** — `node --test tests/review-base-ref-scope.test.js tests/skill-conventions.test.js tests/skill-catalog-completeness.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add plugin/skills/review/SKILL.md plugin/skills/review/code-mode-steps.md tests/review-base-ref-scope.test.js` / `git commit -m "Give /claude-tweaks:review a base:{ref} whole-branch scope — the pre-bump gate /claude-tweaks:release runs, refs #2256"` + trailer.

---

### Task 2: `shipped` facet in the local record store

**Files:**
- Modify: `plugin/bin/lib/issues/local-store.js:53-54` (defaults), `:132-133` (parse), `:216-217` (serialize), `:255-266` (`closeRecord` → accept `{ shipped }`)
- Test: `tests/bin-lib/issues/local-store.test.js` (append)

**Interfaces:**
- Produces: `facets.shipped: string|null` (round-trips as a `shipped: v1.3.0` frontmatter line after `closed-at:`); `closeRecord(filePath, { shipped } = {})` sets `closed`, `closedAt` and `shipped` in one write; `markShipped(filePath, version)` sets `shipped` without closing.

- [ ] **Step 1: Append the failing tests** (read the file's existing helpers first — reuse its fixture writer)

```js
test('shipped facet: absent by default, round-trips as a frontmatter line after closed-at, and closeRecord can set it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-store-shipped-'));
  const filePath = path.join(dir, '21-ship.md');
  writeRecord(filePath, { title: 'Ship', body: 'b', facets: { type: 'feature' } });
  assert.strictEqual(readRecord(filePath).facets.shipped, null);
  closeRecord(filePath, { shipped: 'v1.3.0' });
  const text = fs.readFileSync(filePath, 'utf8');
  assert.match(text, /^closed: true$/m);
  assert.match(text, /^shipped: v1\.3\.0$/m);
  assert.ok(text.indexOf('closed-at:') < text.indexOf('shipped:'), 'shipped follows closed-at');
  const back = readRecord(filePath);
  assert.strictEqual(back.facets.shipped, 'v1.3.0');
  assert.strictEqual(back.facets.closed, true);
  const open = path.join(dir, '22-open.md');
  writeRecord(open, { title: 'Open', body: 'b', facets: { type: 'bug' } });
  markShipped(open, 'v1.3.0');
  assert.deepStrictEqual([readRecord(open).facets.shipped, readRecord(open).facets.closed], ['v1.3.0', false]);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/bin-lib/issues/local-store.test.js` — Expected: FAIL (`markShipped is not a function` / `shipped` undefined).
- [ ] **Step 3: Implement** — the test file's `require` line gains `markShipped`; defaults gain `shipped: null`; parse gains `if ((m = /^shipped:\s*(\S+)$/.exec(line))) { facets.shipped = m[1]; continue; }`; serialize gains `if (facets.shipped) lines.push(`shipped: ${facets.shipped}`);` directly after the `closed-at:` push; `closeRecord(filePath, { shipped = null } = {})` spreads `...(shipped ? { shipped } : {})` into the facets it writes; new `function markShipped(filePath, version) { const record = readRecord(filePath); writeRecord(filePath, { title: record.title, body: record.body, facets: { ...record.facets, shipped: version } }); }` exported alongside (`module.exports` gains `markShipped`). Keep the header comment's facet list in sync (it enumerates the local-only facets).
- [ ] **Step 4: Run** — `node --test tests/bin-lib/issues/*.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add plugin/bin/lib/issues/local-store.js tests/bin-lib/issues/local-store.test.js` / `git commit -m "Add a shipped facet to local records — the release skill's local-merge bookkeeping line, refs #2256"` + trailer.

---

### Task 3: `plugin/skills/release/SKILL.md`

**Files:**
- Create: `plugin/skills/release/SKILL.md` (target 18–26 KB; hard ceiling 40 KB)

**Interfaces:**
- Produces: the skill's frontmatter, `## Input` grammar, Steps 1–8 with the `--train` semantics, the Component-Skill Contract and Anti-Patterns; cites `console.md` (Step 4), `execute.md` (Steps 5–6), `bookkeeping.md` (Step 7) by "read `{file}` in this skill's directory now".
- Consumes: `plugin/bin/release-preflight.js` (#2255 — `--run <dir>`, exit 0/2/3, the pack's fields), `plugin/bin/release-local.js` (#2254 — exits 0/1/2/3/4/5), `/claude-tweaks:review base:{ref}` (Task 1), `_shared/pipeline-run-dir.md`, `_shared/auto-decision-log.md`, `_shared/staged-patch.md`, `_shared/integration-model.md`, `_shared/github-write-transport.md`, `_shared/autonomy-ceiling.md`.

- [ ] **Step 1: Write the file.** Every section below is required, in this order, with these literals.

1. Frontmatter:

```yaml
---
name: release
description: Use to cut a release — reads the preflight fact pack, runs the whole-branch review before any bump, renders one console, merges the release PR (pr-first) or runs the local engine (local-merge), verifies the tag and hook landed, and closes out the shipped records. Keywords - release, tag, changelog, release-please, release train, Release-As.
argument-hint: "[--dry-run] [--train] [--as <version>] [--allow-blocking]"
---
```

(The description must stay ≤ 260 characters — count it; trim the keyword list first if over.)

2. The canonical Interaction style directive, verbatim (copy it from `plugin/skills/review/SKILL.md` line 6).

3. `# Release — Drive a Release Through Whichever Engine the Project Uses` + one line: it drives a release rather than implementing one; `Lifecycle: /claude-tweaks:wrap-up → **/claude-tweaks:release** (on demand, suggested, or the train)`. No fenced diagram.

4. `## When to Use` — five bullets: unreleased conventional commits on the integration branch; `/claude-tweaks:wrap-up`/`/claude-tweaks:flow` recommended it; the release train Routine fires (`--train`); a `Release-As:` override is needed (`--as`); the user says "cut a release", "ship it", "tag a version".

5. `## Input` — `` `$ARGUMENTS` is parsed as `[--dry-run] [--train] [--as <version>] [--allow-blocking]` `` then a table: `--dry-run` (Step 5 is a no-op — no merge, no tag; Step 3 still runs and stages; Step 7 does not run); `--train` (Step 4 never interactive; HARD-GATEs stage `release-held.md` and exit `HELD`; refused unless `release-train: true` and `autonomy: unattended`); `--as <version>` (the `Release-As:` override — a strict semver, validated `^\d+\.\d+\.\d+$`; the effective version for every later gate); `--allow-blocking` (a human who has read the finding overrides `review: blocking` — never honoured under `--train`). Combinations: `--train --dry-run` is refused as contradictory (usage line, exit).

6. `## Step 0: Run directory and engine` — resolve the run dir per `_shared/pipeline-run-dir.md` (the exact `resolve-run-dir` snippet `/claude-tweaks:wrap-up` uses, with `--spec-slug release --standalone release --create` as the fallback, writing `run-state.json` `{"status":"active","createdBy":"release-standalone"}`); every later step's log lines go to `{run-dir}/decisions.md` under `## /release` via `node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "{run-dir}" --section "/release" …`. The engine is read from the pack (Step 1), never re-detected — cite `_shared/integration-model.md`'s Consumer table.

7. `## Step 1: Preflight fact pack` — run `node "${CLAUDE_PLUGIN_ROOT}/bin/release-preflight.js" --run "{run-dir}"`; exit 2/3 → report the stderr line and stop (nothing rendered); read `{run-dir}/release-preflight.json`. Table of the eight fields and what each does when `ok: false`: `engine` → stop ("integration-model unresolved — set it in `.claude-tweaks/policy.yml`"); `lastTag` → continue (first release; base per the pack's `proposedVersion.base`); `unreleased` → stop; `proposedVersion` → Step 2's path when its error names `nothing to release`, else stop; `releasePr` (pr-first) → stop before Step 5 with the error, Steps 2–4 still run; `ciTip` → render as `unknown` in the console, never green; `openReleasePrConflict` → treat as `true` (a human edit cannot be ruled out) and say so; `hook` → render `unknown`. Log `AUTO … Step 1: pack at {path}: engine {value}, lastTag {tag|none}, unreleased {n}, proposed {version|degraded: reason}`.

8. `## Step 2: Nothing to release` — when `unreleased.value.commits` is empty, or `proposedVersion.error` starts with `nothing to release`: print one line — `release: nothing to release since {lastTag|the first commit} ({n} commit(s), none feat/fix/breaking{; N unconventional})` — log it, and stop. No console. When every commit is unconventional, the line reads `no conventional commits since {lastTag}` (run ledger row 86).

9. `## Step 3: Whole-branch review (before any bump)` — invoke `/claude-tweaks:review base:{lastTag}` (or `base:{root-commit}` when `lastTag` degraded — the pack's `unreleased.value.since` is `null`; use `$(git rev-list --max-parents=0 origin/{branch} | tail -1)`), passing `$PIPELINE_RUN_DIR={run-dir}` so its findings stage into this run's `staged/`. After it returns, read `{run-dir}/decisions.md`'s `## /review` block: any confirmed `critical`/`high` finding (a `Reproduction: … Confirmed` line at those severities, or a `Routing:` line staging a `review-{n}.patch` at those severities) marks `review: blocking`; anything else `review: clean` or `review: findings (n medium/low, staged)`. Log the verdict. **This step has no skip path — not `--dry-run`, not `--train`, not `--allow-blocking`** (stance 8, `[IL-97]`).

10. `## Step 4: Console` — read `console.md` in this skill's directory now.

11. `## Step 5: Execute` and `## Step 6: Verify` — read `execute.md` in this skill's directory now.

12. `## Step 7: Bookkeeping` — read `bookkeeping.md` in this skill's directory now (skipped under `--dry-run`).

13. `## Step 8: Summary and Next Actions` — one summary block: `release: {version} — {released | dry-run | HELD | PARTIAL}` plus the shipped-record count and the engine; Next Actions as plain markdown: **`/claude-tweaks:backlog overview`** (recommended), `/claude-tweaks:help`. Omit Next Actions when invoked by a parent (`$PIPELINE_RUN_DIR` set by a parent, or `--source` given).

14. `## --train semantics` — the paragraph from the spec: never interactive; before Step 5, a major bump (effective version) or `review: blocking` stages `release-held.md` (`node "${CLAUDE_PLUGIN_ROOT}/bin/stage-item.js" --run "{run-dir}" --id release-held --file {composed file}` — content: the gate, the version, the blocking findings' paths) and exits 0 with `HELD` in Step 8's summary; a Step 6 miss after Step 5 landed is `PARTIAL` (never `HELD`); refusal per ruling 9 with the exact log line `train: refused — autonomy {value}` / `train: refused — release-train {value}`. Cite `_shared/autonomy-ceiling.md`'s `train` row.

15. `## Component-Skill Contract` — parents: `/claude-tweaks:wrap-up` (suggested tier), the release train Routine (#2258); `$PIPELINE_RUN_DIR` signal, `--source <parent>` fallback; omit Next Actions when parented.

16. `## Anti-Patterns` table (`| Pattern | Why It Fails |`), at least: bumping a manifest by hand; running the engine without the review; treating a missing hook run as success; rendering the release row from an unverified premise (#680); honouring `--allow-blocking` under `--train`; reading `integration-model` afresh instead of the pack.

- [ ] **Step 2: Verify the shape** — `wc -c plugin/skills/release/SKILL.md` (< 40,960); `node -e "const t=require('fs').readFileSync('plugin/skills/release/SKILL.md','utf8');const d=/^description: (.*)$/m.exec(t)[1];console.log(d.length)"` (≤ 260); `node --test tests/skill-conventions.test.js` — the directive and structure checks must pass (the catalog test will still fail until Task 7 — expected).
- [ ] **Step 3: Commit** — `git add plugin/skills/release/SKILL.md` / `git commit -m "Add /claude-tweaks:release SKILL.md — preflight, pre-bump review, console, engine dispatch, verify, bookkeeping, --train, refs #2256"` + trailer.

---

### Task 4: `plugin/skills/release/console.md` (Step 4)

**Files:**
- Create: `plugin/skills/release/console.md`

- [ ] **Step 1: Write the file** — sections:

`# Release Console — Step 4` + purpose line. `## Inputs` (the pack, Step 3's verdict, the arguments). `## The table` — exactly these rows, in order, rendered as a two-column `| Row | Value |` table:
- `Engine` — `pr-first (release-please)` / `local-merge (bin/release-local.js)`.
- `Since` — `{lastTag}` or `first release`.
- `Records shipped` — one line per `(#N)` suffix in `unreleased.value.commits[].subject`, joined to the record's title and type via `gh issue view N --json title,labels` (pr-first, batched — one call per record, `_shared/github-write-transport.md`'s read mapping) or the local record file (local-merge); duplicates collapsed; a commit whose subject carries no `(#N)` is listed under `Unattributed commits` (sha7 + subject) — never dropped.
- `Proposed bump` — `{proposedVersion.value.version} ({part}) — driven by {sha7} {subject}` where the driving commit is the first breaking commit, else the first `feat`, else the first `fix`; with `--as`, `{effective} (Release-As override; commits alone justify {part})`.
- `Review` — `blocking ({n} critical/high — staged/review-*.patch)` / `clean` / `findings ({n} staged)`.
- `CI on tip` — from `ciTip`: `{state} ({success}/{total}{, tipBehind: local origin/{branch} is behind})` / `n/a` / `unknown (error)`.
- `Release PR` — `#{number} {state} {mergeable}` / `none` / `unknown`; plus `human-edited: yes` when `openReleasePrConflict` is `true` or degraded.
- `Hook configured` — presence only: `yes (release: published workflow)` / `yes (release-hook)` / `no` / `unknown` — distinct from Step 6's post-execution verification, say so in the row's own note.
- `Overrides` — `--as {version}` / `--allow-blocking` / `none`.

`## Gates` — the two HARD-GATEs, evaluated on the effective version: (1) `review: blocking` unless `--allow-blocking` (never under `--train`); (2) a major bump (`effective.major > lastTag.major`, or any first release whose effective version is ≥ 1.0.0 with no tag — say why: a first tag is a public contract). Under `--train`: stage `release-held.md` and exit `HELD` (Step 8). Otherwise, in `auto`/headless: stop with the console rendered and the one-line reason — these stops are registered HARD-GATEs (`_shared/auto-mode-contract.md`), not new mid-flow stops; in `interactive`: one `AskUserQuestion` — `Proceed (Recommended when the finding is read)` / `Stop`.

`## Auto mode` — the console renders read-only and proceeds (no `AskUserQuestion`) except at the two gates. `## Log lines` — `AUTO {time} — Step 4: console rendered — {version} ({part}), {n} records, review {verdict}, hook {value}. Reversibility: n/a.`; `STAGED {time} — Step 4: HARD-GATE {which} — release held. Stage path: staged/release-held.md. Reversibility: high.`

- [ ] **Step 2: Commit** — `git add plugin/skills/release/console.md` / `git commit -m "Add the release console — records shipped, the driving commit, review verdict, CI, hook presence, the two HARD-GATEs, refs #2256"` + trailer.

---

### Task 5: `plugin/skills/release/execute.md` (Steps 5–6)

**Files:**
- Create: `plugin/skills/release/execute.md`

- [ ] **Step 1: Write the file** — sections:

`# Execute and Verify — Steps 5–6`. Opening sentence cites `_shared/integration-model.md`'s Consumer table: this file routes on the `integration-model` value the pack carries (`engine`), never re-detected (`tests/integration-model.test.js`'s consumer-citation scan requires the citation).

`## Step 5: Execute` — `--dry-run`: log `AUTO … Step 5: dry-run — no merge, no tag` and go to Step 8 (skipping 6 and 7). Otherwise:
- **pr-first**: precondition `releasePr` is a PR (else stop: `no open release PR — release-please has not rendered one; check the workflow`). With `--as {version}`: `git commit --allow-empty -m "chore: release {version}" -m "Release-As: {version}"` on the integration branch, `git push origin {branch}`, then poll `gh pr view {n} --json title,headRefOid` every 20 s up to 15 attempts until the title contains `{version}`; past the bound log and report `partial: override pushed, PR not re-rendered — release-please has not re-rendered PR #{n}; recover: wait for the release-please run, then re-run /claude-tweaks:release` and stop (no merge of a stale render). Then `gh pr merge {n} --squash` (its subject is release-please's own `chore(main): release X.Y.Z`; the composer is not involved). MCP-only sandbox (no `gh`): stop at the console and print the merge as a paste-ready command (`_shared/github-write-transport.md` has no merge mapping — the Review Console's posture).
- **local-merge**: `node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js"` with `--as`? No — the engine has no `--as`; a `Release-As` under local-merge is applied by the skill setting the version the engine would compute: **not supported in this unit** — under local-merge `--as` is refused with `--as is pr-first only (release-local.js derives the version from history); use a breaking commit or a manual tag` (document as a known gap, ledger it). Exit codes: `0` released → Step 6; `3` nothing to release (Step 2 should have caught it — report and stop); `4` collision → report the engine's stderr verbatim and stop; `1`/`5` → the engine's stderr already names the partial state and the recovery command — quote it verbatim into the summary as `PARTIAL`, log, and continue to Step 6 only for `5` (the tag landed; Step 7 still applies) — for `1` stop.
Log every subprocess: `AUTO … Step 5: {command} → exit {code}`.

`## Step 6: Verify` — after Step 5 landed (pr-first merge, or engine exit 0/5):
- Tag: `git ls-remote --tags origin v{version}` non-empty (pr-first: release-please tags on the merge — poll with the same 15 × 20 s bound; local-merge: immediate).
- GitHub Release (pr-first only): `gh release view v{version} --json url,isDraft`.
- Hook: pr-first — `gh run list --event release --json status,conclusion,name,url,headSha --limit 20` filtered to runs created after the merge, polled 15 × 20 s; verdict `hook: ok (name, url)` when `conclusion == success`; `hook: failed (name, url)` when concluded otherwise; `hook: missing after 5 min` when none appears — the last two are partial states: `PARTIAL: v{version} is tagged and released but the release: published hook {failed|did not run}; recover: {gh run rerun {id} | check the workflow's release: published trigger}`. local-merge — the engine's exit `5` IS the hook failure (its stderr carries the recovery command); exit 0 means the hook (if any) ran.
Every miss is reported as a named partial state with its recovery command; never rendered as a clean release. Log `AUTO … Step 6: tag {found|missing}, release {url|n/a}, hook {ok|failed|missing|n/a}`.

- [ ] **Step 2: Commit** — `git add plugin/skills/release/execute.md` / `git commit -m "Add the release execute and verify steps — release-please merge with Release-As polling, the local engine's exit codes, bounded hook verification, refs #2256"` + trailer.

---

### Task 6: `plugin/skills/release/bookkeeping.md` (Step 7)

**Files:**
- Create: `plugin/skills/release/bookkeeping.md`

- [ ] **Step 1: Write the file** — `# Bookkeeping — Step 7`; skipped under `--dry-run` (nothing shipped yet). Inputs: the shipped set (console row) and the Release URL (Step 6; local-merge: `none`). For each record: **pr-first / github-issues** — through `_shared/github-write-transport.md`'s mapping: comment (`gh issue comment N --body-file {file}` — body `Shipped in v{version} — {release url}`; MCP `add_issue_comment`), then close if still open (`gh issue close N --reason completed`; MCP `issue_write` state change). **local-merge / local-files** — `node -e "require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js').closeRecord(process.argv[1], { shipped: process.argv[2] })" {record file} v{version}` for an open record, `markShipped` for an already-closed one (Task 2's API). One log line per record: `AUTO … Step 7: #N — commented Shipped in v{version}{, closed}. Reversibility: high.`; a failed write is logged `AUTO … Step 7: #N — {op} failed: {message}` and the loop continues (never abort the release's bookkeeping on one record). A summary line: `bookkeeping: {n} records commented, {m} closed, {k} failed`.

- [ ] **Step 2: Commit** — `git add plugin/skills/release/bookkeeping.md` / `git commit -m "Add the release bookkeeping step — Shipped-in comments and closes through the write transport, shipped facets for local records, refs #2256"` + trailer.

---

### Task 7: Registrations — ceiling row, HARD-GATE registry, skill graph, consumer table, catalog surfaces

**Files:**
- Modify: `plugin/skills/_shared/autonomy-ceiling.md` (the ceiling table — one `train` row after the `unattended` row's table, or a sentence in the `unattended` cell; keep the table shape)
- Modify: `plugin/skills/_shared/auto-mode-contract.md:206` (the HARD-GATE row — append `/release Step 4's two gates (review: blocking, a major bump — release/console.md)`)
- Modify: `docs/skill-graph.md` (new `## release` section, alphabetically between `## reflect` and `## research`)
- Modify: `plugin/skills/_shared/integration-model.md` (Consumer table row: `/claude-tweaks:release` (`release/execute.md`) | Routing Step 5 to `gh pr merge` (pr-first) or `bin/release-local.js` (local-merge))
- Modify: `plugin/skills/help/reference-card.md` (row), `plugin/skills/help/context-flow.md` (Artifact Flow row), `docs/getting-started.md` (one paragraph in the skill list, after `/claude-tweaks:wrap-up`'s)

- Modify: `plugin/bin/lib/skill-audit/context-cost.js` (`DESCRIPTION_TOTAL_CEILING_CHARS` — raise for the 36th skill exactly as the comment above it records the previous raise; the corpus is 8,131 chars after Task 3 against a 7,900 ceiling — set 8,200 and extend the comment with `#2256: +release`)

- [ ] **Step 1: Run the catalog test to see the failures** — `node --test tests/skill-catalog-completeness.test.js tests/integration-model.test.js tests/skill-graph-table-structure.test.js tests/bin-lib/skill-audit/context-cost.test.js` — Expected: FAIL on the missing section/rows and the description-corpus ceiling.
- [ ] **Step 2: Edit** — the `## release` section:

```
## release

| Target | Relationship |
|---|---|
| `/review` | Step 3 runs `/claude-tweaks:review base:{lastTag}` — the whole-branch review before any bump (stance 8, `[IL-97]`); a confirmed critical/high finding marks the run `review: blocking`. |
| `bin/release-preflight.js` | Step 1's fact pack (#2255): engine, last tag, unreleased commits, proposed version, release PR, CI on the tip, human-edited release PR, hook presence — read from `{run-dir}/release-preflight.json`. |
| `bin/release-local.js` | Step 5's local-merge engine (#2254); its exit codes 0/1/3/4/5 are the skill's verdicts. |
| `_shared/staged-patch.md` | Step 3's review findings stage through it, never a bespoke mechanism. |
| `_shared/auto-decision-log.md` | Every Step 5–7 action writes one entry under `## /release`. |
| `_shared/github-write-transport.md` | Step 7's record comments and closes (pr-first), MCP-mapped for gh-absent sandboxes; Step 5's merge has no MCP row — the skill stops at the console with a paste-ready command there. |
| `_shared/integration-model.md` | Step 5 routes on the pack's `engine`, never re-detected (Consumer table row). |
| `_shared/autonomy-ceiling.md` | `--train` reads the `train` row — merge/tag minor and patch at `unattended`; never a major, a blocking review, or past a hook failure. |
```

The reference-card row (copy the table's column order from line 27): `| `/claude-tweaks:release` | Drive a release — preflight pack, pre-bump whole-branch review, one console, release-please merge or the local engine, verify, bookkeeping; `--train` for the unattended tier | `[--dry-run] [--train] [--as <version>] [--allow-blocking]` |`. The context-flow row (copy the Artifact Flow table's column order from line 73): `| `/release` | `release-preflight.json`, `decisions.md` (review verdict), the integration branch's first-parent history | A merged release PR or a `chore(release)` commit + tag, `Shipped in v{version}` comments/closes (`shipped:` lines for local records), `staged/release-held.md` under `--train` |`. The getting-started paragraph (match line 54/74's shape): `**`/claude-tweaks:release`** — Drives a release: reads the preflight fact pack, runs the whole-branch review before any bump, renders one console, merges the release-please PR (pr-first) or runs `bin/release-local.js` (local-merge), verifies the tag and the publish hook landed, and comments/closes the shipped records. `--train` is the unattended tier's on-schedule form, held on a major bump or a blocking review.`

- [ ] **Step 3: Run** — the three tests above plus `node --test tests/skill-conventions.test.js tests/autonomy-ceiling*.test.js tests/auto-mode-contract*.test.js` (whichever exist — `ls tests | grep -i "autonomy\|auto-mode"` first) — Expected: PASS.
- [ ] **Step 4: Commit** — all six files / `git commit -m "Register /claude-tweaks:release — autonomy train row, HARD-GATE registry, skill graph, integration-model consumer row, catalog surfaces, refs #2256"` + trailer.

---

### Task 8: Conformance test for the fully-qualified reference form

**Files:**
- Test: `tests/release-skill-reference-form.test.js`

- [ ] **Step 1: Write the test** — scans every `plugin/skills/release/*.md`: inside actionable text (the body of every `## Step` section and the `## Step 8` Next Actions block — a section-slicing helper like `tests/feedback-next-actions-plain-markdown-conformance.test.js`'s `section()`), a bare `/release` or `/{skill}` reference to any shipped skill (from `listSkillDirs` in `plugin/bin/lib/skill-audit/skill-catalog.js`) not prefixed by `/claude-tweaks:` is a failure; descriptive prose (the Lifecycle line, `## When to Use`, Anti-Patterns) is exempt per `docs/skill-authoring.md`; two literals are never references and must be exempt: the decisions-log section heading `## /release` (and its `--section "/release"` argument) and a `/release` inside a fenced code block or backticks that names a log-section, not a skill invocation — the scanner treats a `/{skill}` immediately preceded by `--section "` or `## ` as a section literal. Expose the scanner as a function and assert it on two inline fixtures: `'## Step 1\nRun /release now.\n'` → one violation naming `/release`; `'## Step 1\nRun /claude-tweaks:release now.\n'` → none (AC 7).
- [ ] **Step 2: Run** — `node --test tests/release-skill-reference-form.test.js` — Expected: PASS on the shipped files and the fixtures.
- [ ] **Step 3: Commit** — `git add tests/release-skill-reference-form.test.js` / `git commit -m "Pin the fully-qualified reference form inside the release skill's actionable text, refs #2256"` + trailer.

---

## Self-Review

**Spec coverage:** SKILL.md → T3; console.md → T4; execute.md → T5; bookkeeping.md → T6; Steps 1/2/3/6/8 → T3 (+T5 for 6); `--train` → T3/T4; autonomy row → T7; skill-graph section → T7; conformance test → T8; `/review` base-ref prerequisite (Current State) → T1; local `shipped:` line → T2; `execute.md`'s integration-model citation → T5 + T7's consumer row. ACs 1–9 are prose-verified against the fixture scenarios in the whole-branch review (a skill has no runnable acceptance suite; AC 7 is T8's fixture); the reviewer walks AC 1/2/3/8/9 through the prose against the two engines.

**Placeholder scan:** every literal command, log-line format, table row and gate wording is stated; the two `Extend:`-style edits (auto-mode-contract, autonomy-ceiling) name their exact target row.

**Type consistency:** `closeRecord(filePath, { shipped })`/`markShipped` (T2) match T6's invocations; the pack's field names (T3, T4) match #2255's `pack.js`; `base:{ref}` (T1) matches T3's Step 3 invocation; the `train` row wording matches SKILL.md's `--train` section.
