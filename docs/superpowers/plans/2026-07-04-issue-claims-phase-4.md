# Issue Claims Phase 4 (Dispatch + Policy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issues become a dispatch queue: `agent:eligible` is the maintainer's authorization signature autonomous runs require, `agent:go` is the standing dispatch request a scheduled cloud routine picks up (`/routine create flow`), and `--from-milestone <m>` joins the selector family.

**Architecture:** One small module addition (`requireLabels` AND-filter in `ingest.js`); a "Dispatch authorization" section in the claims contract (label = triage-permission signature, closing the prompt-injection hole); a `--require-eligible` flag + milestone selector in the issue-batch procedure; and `skills/flow/routine-template.yml` following recon's template precedent so the dispatcher is instantiated with the existing `/routine` mechanism — no new scheduling machinery.

**Tech Stack:** Node 18+ (CommonJS), `node --test`, GitHub CLI, routine-template YAML (`skills/_shared/routine-template-schema.md`), markdown skill files.

**Spec:** `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md` — "Phase 4 — Dispatch + policy".

## Global Constraints

- `bin/lib/` modules never call the network; recon's `pull-issues-v2.test.js` stays unchanged and green.
- **Authorization gate:** autonomous (headless/routine) runs only build issues carrying `agent:eligible` — applying a label requires triage permission, so the label is a maintainer's signature; headless agents building arbitrary issue content is a prompt-injection surface. Interactive runs are unrestricted (the user is present to decide). The shipped routine template ALWAYS passes `--require-eligible`; projects relax it only by editing their instantiated routine's prompt.
- **`agent:go` semantics:** label = standing request, claim = in flight. The label persists until *successful* wrap-up (a failed run retries next firing once its claim ages out); removal on success is a reversible write, logged to `decisions.md`. The agent never adds `agent:go` or `agent:eligible` itself.
- Claiming (Step 2.5) still applies to every selector; the dispatcher adds nothing to claim mechanics.
- Templates never contain `environment_id` or repo URLs (routine anti-pattern).
- No emojis; `npm test` green at every commit. Known load flake: `tests/statusline.test.js` "render under 500ms" — if it alone fails, re-run that file in isolation and report both results.
- Version bump: `.claude-plugin/plugin.json` `5.6.0` → `5.7.0`, CLAUDE.md intro `(v5.6.0)` → `(v5.7.0)` (Task 5 only).
- Commit style: `{Verb} {what} — {detail}`.

---

### Task 1: Module — `requireLabels` AND-filter

**Files:**
- Modify: `bin/lib/issues/ingest.js`
- Test: `bin/lib/issues/tests/ingest.test.js`

**Interfaces:**
- Consumes: existing `issuesToBriefs` (Phase 3).
- Produces: `issuesToBriefs({..., requireLabels?: string[]})` — when provided and non-empty, an issue passes only if it carries EVERY listed label (AND semantics, applied after the `label`/`numbers` filters). Absent/empty → no effect.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/ingest.test.js`:

```js
test('requireLabels demands every listed label (AND semantics)', () => {
  const briefs = issuesToBriefs({ requireLabels: ['agent:eligible'], issuesJson: [
    issue({ number: 1, labels: ['agent:go', 'agent:eligible'] }),
    issue({ number: 2, labels: ['agent:go'] }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('requireLabels combines with the label filter', () => {
  const briefs = issuesToBriefs({ label: 'agent:go', requireLabels: ['agent:eligible'], issuesJson: [
    issue({ number: 1, labels: ['agent:go', 'agent:eligible'] }),
    issue({ number: 2, labels: ['agent:eligible'] }), // lacks agent:go
    issue({ number: 3, labels: ['agent:go'] }),       // lacks agent:eligible
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('requireLabels absent or empty has no effect', () => {
  const all = issuesToBriefs({ issuesJson: [issue({ number: 1 })] });
  const empty = issuesToBriefs({ requireLabels: [], issuesJson: [issue({ number: 1 })] });
  assert.strictEqual(all.length, 1);
  assert.strictEqual(empty.length, 1);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test bin/lib/issues/tests/ingest.test.js`
Expected: FAIL — the first two new tests (all issues pass today); 9 existing pass.

- [ ] **Step 3: Implement**

In `bin/lib/issues/ingest.js`:
1. Change the destructuring to `function issuesToBriefs({ issuesJson = [], label, numbers, minSeverity, requireLabels } = {})`.
2. After the `if (label && !names.includes(label)) continue;` line, add:

```js
    if (requireLabels && requireLabels.length && !requireLabels.every((r) => names.includes(r))) continue;
```

3. Update the opts doc comment line to `// opts: { issuesJson = [], label?, numbers?, minSeverity?, requireLabels? }. Returns brief[]:`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (12 tests in ingest.test.js; recon suite untouched and green).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/ingest.js bin/lib/issues/tests/ingest.test.js
git commit -m "Add requireLabels AND-filter to ingestion — the agent:eligible authorization gate"
```

---

### Task 2: Contract — "Dispatch authorization" section

**Files:**
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: Task 1's `requireLabels` semantics.
- Produces: the section name Tasks 3-4 cite ("Dispatch authorization").

- [ ] **Step 1: Insert the section**

In `skills/_shared/issue-claims.md`, after the "## Close-via-merge" section and before "## Failure posture", insert:

```markdown
## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue
body is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**:

- `agent:eligible` — authorization. Autonomous (headless/routine) runs only build issues
  carrying it; they pass `--require-eligible` so ingestion filters on it (`requireLabels` in
  `bin/lib/issues/ingest.js`). Interactive runs are unrestricted — the user is present to
  judge each issue.
- `agent:go` — the standing dispatch request a scheduled dispatcher selects on
  (`--from-label agent:go`). Label = standing request, claim = in flight: the claim ref
  prevents double-dispatch across firings, and the label persists until *successful*
  wrap-up — a failed run retries at a later firing once its claim ages out. Removing
  `agent:go` on success is a reversible write, logged to `decisions.md`.

The agent never applies either label itself — that would forge the signature. The shipped
dispatcher template (`skills/flow/routine-template.yml`) always passes `--require-eligible`;
a project relaxes the gate only by editing its instantiated routine's prompt.
```

- [ ] **Step 2: Verify and commit**

Run: `grep -c "Dispatch authorization\|agent:eligible" skills/_shared/issue-claims.md` — Expected ≥ 4.
Run: `npm test` — Expected: PASS.

```bash
git add skills/_shared/issue-claims.md
git commit -m "Add dispatch authorization to the claims contract — labels are maintainer signatures"
```

---

### Task 3: Selectors — `--from-milestone` + `--require-eligible`

**Files:**
- Modify: `skills/flow/SKILL.md` (two Arguments rows + input-resolution item 5 + `<spec>` footnote)
- Modify: `skills/flow/from-recon.md` (syntax, Step 1 milestone variant, Step 2 snippet, flag doc)
- Modify: `skills/flow/steps-and-gates.md` (selector paragraph)

**Interfaces:**
- Consumes: Task 1's `requireLabels`, Task 2's section name.
- Produces: the flags Task 4's template prompt uses verbatim.

- [ ] **Step 1: flow SKILL.md**

1. Insert after the `--from-issues <n,...>` Arguments row:

```markdown
| `--from-milestone <m>` | No | **Alternative spec source.** Pull all open issues in milestone `<m>` and run them as an issue-sourced batch. Same claim/translation behavior as `--from-label`. Needs `gh`. See `from-recon.md`. |
| `--require-eligible` | No | **Issue-sourced batches only.** Keep only issues carrying the `agent:eligible` label — the authorization gate autonomous runs MUST pass (see "Dispatch authorization" in `_shared/issue-claims.md`). Interactive runs may pass it to preview what a dispatcher would build. |
```

2. In input-resolution item 5, change "`--from-recon` / `--from-label <label>` / `--from-issues <n,...>`" to "`--from-recon` / `--from-label <label>` / `--from-issues <n,...>` / `--from-milestone <m>`".
3. In the `<spec>` row footnote, change "(`--from-recon`, `--from-label`, or `--from-issues`)" to "(`--from-recon`, `--from-label`, `--from-issues`, or `--from-milestone`)".

- [ ] **Step 2: from-recon.md**

1. Syntax block: add the line `/claude-tweaks:flow --from-milestone <m>          [--min-severity high] [...same]` after the `--from-issues` line, and append `[--require-eligible]` to ALL FOUR selector lines' bracket lists.
2. H1 + intro: extend the selector enumeration with `--from-milestone <m>` (H1 stays as-is — three names plus "…" would churn every cross-reference; instead add to the intro sentence: "; `--from-milestone <m>` pulls a milestone's open issues").
3. Step 1: add the milestone variant to the command block:

```bash
# --from-milestone <m>:
gh issue list --milestone "<m>" --state open \
  --json number,title,body,labels --limit 100
```

4. Step 2: extend the `node -e` snippet's issuesToBriefs call with `requireLabels:process.argv[5]?process.argv[5].split(','):undefined` and a fifth positional `"<require-labels-csv-or-empty>"`; add after the call-signature sentence: "With `--require-eligible`, pass `agent:eligible` as the fifth argument — autonomous dispatch always does (see \"Dispatch authorization\" in `_shared/issue-claims.md`)."

- [ ] **Step 3: steps-and-gates.md**

In the issue-sourced spec source paragraph (retitled in Phase 3), extend the selector enumeration with `--from-milestone <m>` and add one sentence: "`--require-eligible` restricts any selector to `agent:eligible`-labelled issues — mandatory for autonomous dispatch."

- [ ] **Step 4: Verify and commit**

Run: `grep -c "from-milestone\|require-eligible" skills/flow/SKILL.md skills/flow/from-recon.md skills/flow/steps-and-gates.md` — Expected ≥ 3 / ≥ 4 / ≥ 2.
Run: `npm test` — Expected: PASS.

```bash
git add skills/flow/SKILL.md skills/flow/from-recon.md skills/flow/steps-and-gates.md
git commit -m "Add --from-milestone selector and --require-eligible gate — dispatch-ready ingestion"
```

---

### Task 4: The dispatcher — `skills/flow/routine-template.yml` + dispatch docs

**Files:**
- Create: `skills/flow/routine-template.yml`
- Modify: `skills/flow/from-recon.md` (new "Dispatch Configuration" section before Anti-Patterns)
- Modify: `skills/flow/SKILL.md` (relationship row), `skills/routine/SKILL.md` (relationship row)

**Interfaces:**
- Consumes: Task 3's flags; the routine template schema (`skills/_shared/routine-template-schema.md` — read it before writing the YAML).
- Produces: the template `/claude-tweaks:routine create flow` instantiates.

- [ ] **Step 1: Create `skills/flow/routine-template.yml`**

```yaml
template_version: 1
routine_name: flow-dispatch
prompt: "/claude-tweaks:flow --from-label agent:go --require-eligible auto worktree"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Edit, Write, Grep, Glob, Task]
mcp_connections: []
default_schedule:
  cron_expression: "0 4 * * 1-5"
  description: "weekday off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Headless issue dispatcher: each firing pulls open agent:go issues that also carry
  agent:eligible (the authorization gate — see "Dispatch authorization" in
  skills/_shared/issue-claims.md), claims them, and runs the standard issue-sourced batch.
  The claim ref makes overlapping firings harmless (a second firing skips claimed issues),
  and a failed run retries at a later firing once its claim ages out (TTL). agent:go is
  removed only after successful wrap-up. A firing with no eligible agent:go issues is a
  cheap no-op. Builder routine — unlike recon's report-only template it needs write tools.
```

Verify the field set against `skills/_shared/routine-template-schema.md` after writing — adjust names ONLY if the schema requires it (report any adjustment).

- [ ] **Step 2: Add "Dispatch Configuration" to `skills/flow/from-recon.md`**

Insert a new section after Step 5's block and before `## Anti-Patterns`:

```markdown
## Dispatch Configuration

`/flow` ships a routine template (`skills/flow/routine-template.yml`) that turns the issue
queue into a scheduled dispatcher: each firing runs
`/claude-tweaks:flow --from-label agent:go --require-eligible auto worktree` headless.
Instantiate it with:

```
/claude-tweaks:routine create flow
```

Add `--dry-run` to inspect the assembled configuration first (see `skills/routine/SKILL.md`).

**Label lifecycle (per "Dispatch authorization" in `_shared/issue-claims.md`):** a maintainer
applies `agent:eligible` (authorization) and `agent:go` (standing request). The dispatcher
claims what it builds — overlapping firings skip claimed issues — and after a spec's issue is
released with a `merged:`/`pr-opened:` outcome, remove the dispatch request:

```bash
gh issue edit "$ISSUE" --remove-label agent:go
```

Removal is reversible and logs to `decisions.md`. On failure, leave the label — the claim's
TTL is the retry pacing. The agent never ADDS either label.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics
> against the live account.
```

- [ ] **Step 3: Relationship rows (bidirectional)**

`skills/flow/SKILL.md` Relationship table, add:

```markdown
| `/claude-tweaks:routine` | `/routine create flow` instantiates `skills/flow/routine-template.yml` — the scheduled issue dispatcher (agent:go + agent:eligible → headless issue-sourced batch). |
```

`skills/routine/SKILL.md` Relationship table, add after the recon row:

```markdown
| `/claude-tweaks:flow` | `skills/flow/routine-template.yml` is the second consumer — a headless issue dispatcher; `/routine create flow` instantiates it. Unlike recon's report-only template it carries write tools. |
```

- [ ] **Step 4: Verify and commit**

Run: `grep -c "routine create flow" skills/flow/from-recon.md skills/flow/SKILL.md skills/routine/SKILL.md` — Expected ≥ 1 each.
Run: `node -e "const y=require('fs').readFileSync('skills/flow/routine-template.yml','utf8'); if(!/template_version/.test(y)) process.exit(1)"` — Expected: exit 0.
Run: `npm test` — Expected: PASS.

```bash
git add skills/flow/routine-template.yml skills/flow/from-recon.md skills/flow/SKILL.md skills/routine/SKILL.md
git commit -m "Ship the issue dispatcher — flow routine template with the agent:go/agent:eligible lifecycle"
```

---

### Task 5: Docs ripple + version 5.7.0

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.claude-plugin/plugin.json`
- Modify: `skills/help/reference-card.md` (the /flow row)
- Modify: `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing — closes the phase and the four-phase program.

- [ ] **Step 1: CLAUDE.md**

1. Intro `(v5.6.0)` → `(v5.7.0)`.
2. Skills-with-sub-files `flow` row: append `; --from-milestone + --require-eligible selectors; dispatch routine template (agent:go/agent:eligible lifecycle)` to the from-recon.md clause.

- [ ] **Step 2: README.md**

Extend the recon paragraph's Phase 3 sentence (ends "…arrive pipeline-ready.") with:

```markdown
Label an issue `agent:eligible` + `agent:go` and a scheduled dispatcher (`/routine create flow`) builds it hands-off — the labels are maintainer signatures, so drive-by issues can't dispatch themselves.
```

- [ ] **Step 3: reference-card**

In the `/flow` row, extend the issue-sourced clause to `--from-recon` / `--from-label <label>` / `--from-issues <n,...>` / `--from-milestone <m>` (+ `--require-eligible`).

- [ ] **Step 4: Design doc**

1. Under `## Phase 4 — Dispatch + policy`, add: `**Status: implemented in v5.7.0** (requireLabels gate, dispatch authorization contract, --from-milestone, --require-eligible, flow routine template).`
2. Change the document header's `**Status:** Approved design, pending implementation plan` to `**Status:** Implemented — all four phases shipped (v5.3.0-v5.7.0; Phase 3 shipped as v5.6.0 after a version collision with the PR-awareness release).`

- [ ] **Step 5: Version bump + verification**

`.claude-plugin/plugin.json`: `"5.6.0"` → `"5.7.0"`. Validate: `node -e "require('./.claude-plugin/plugin.json')"`.
Run: `npm test` — Expected: PASS.
Run: `grep -rn "agent:go" skills/ | wc -l` — Expected ≥ 6 (contract, from-recon dispatch section, template, README not counted here).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md .claude-plugin/plugin.json skills/help/reference-card.md docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md
git commit -m "Document the dispatch phase across consumers — bump to 5.7.0"
```

---

## Post-plan notes

- **Marketplace release**: one mirror to `5.7.0` covers phases 1-4 — user-driven.
- Deliberately NOT done: a `.claude-tweaks/policy.yml` reader for eligibility (YAGNI — the template's prompt is the policy surface, editable via `/routine`'s UPDATE workflow); webhook/Actions-triggered dispatch (the design marks polling as the honest version); auto-removing `agent:go` on `abandoned:` outcomes (leave-label = retry is the designed semantics).
- Coordination note for the user: the PR-awareness feature (5.5.0) gave `/tidy` a recon-issue audit (Step 4.8) — a future pass could teach it the `agent:go`/`agent:eligible` labels (e.g., flag eligible-but-never-dispatched issues). Out of scope here.
