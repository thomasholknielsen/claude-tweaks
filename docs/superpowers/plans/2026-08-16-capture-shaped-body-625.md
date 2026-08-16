# Capture Shaped-Body Branch (#625) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/capture` a shaped-body branch — detection by what is supplied, never by who invoked: a body carrying `## Current State`, `## Deliverables`, and exactly one of `## Acceptance Criteria`/`## Open Question` (non-empty, no placeholder markers) composes via `specShapedBody`, gets judged `risk:*`/`size:*`, files `ready`, and skips the 5-line cap and #575's chain (nothing left to shape). `needs:definition` judgment runs first and wins. `--defer-reason=` is required exactly when the filing is a deferral (an `Origin:` line, or any `--source`). Both CLAUDE.md copies' no-implicit-deferrals bullet names the shaped-body + Defer-reason requirement. Plus the #624 carry-forwards: flip the pass-through sentences to the real flag and fix `deferral-gate.md`'s stale placement clause.

**Architecture:** One new section in `capture/SKILL.md` (26.7→~28 KB, well under 40 KB) plus flag-table rows — the branch points at Backend Selection's existing filing step with its own values rather than duplicating filing blocks. The `ready` decision is recorded as deliberate (born-ready-by-construction reasoning, not a trust verdict; the human gate stays `refine`). AC 1–3 are live-invocation checks verified here by **composition probes + prose trace** (a live filing would pollute the real tracker; the eval harness is the right future home) — deviation stated in the PR body; AC 4 uses its own read-the-text option.

**Tech Stack:** Markdown skill files; Node 18+ conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-625/work/625-spec.md`

## Global Constraints

- **Post-#575/#624 tree.** Backend Selection's chain-exception paragraph ("One exception, off by default…") is the merged #575 text — the shaped branch's skip note anchors on it. The three pass-through sentences to flip live where #621/#624 left them — find every one with `grep -rn "arrives with #625\|#625's flag arrives\|arrives later" skills/` and flip all hits.
- Detection is content-keyed: split `$BODY` on line-anchored `## ` headings; shaped when `## Current State`, `## Deliverables`, and exactly one of `## Acceptance Criteria`/`## Open Question` are present, each followed by non-empty content, and none of the three placeholder markers appears anywhere; text before the first heading becomes `header`. A body with the headings that fails the check falls through to the stub branch with one line saying why.
- Precedence: `needs:definition` first (never requires a reason; `--defer-reason=` still rendered if supplied) → the deferral check (`Origin:` line in the text OR any `--source` value → `--defer-reason=` required; missing → stop and report, file nothing — the same hard gate #622's console enforces; a `Defer-reason: {value}` line already in the idea text counts as supplied, validated the same way) → scoring + `ready`.
- The stub branch is byte-untouched: Entry Format, the 5-line cap, the routing prompt, and #575's chain all keep their current text for unshaped input.
- `ready` and `needs:definition` never coexist; the shaped branch never emits `parked`.
- Both CLAUDE.md copies change together; the bullet stays two sentences; `tests/claude-md-budget.test.js` stays green.
- `docs/skill-graph.md`: verify no new edge is needed (the producers' Capture edge exists) — do NOT edit unless an edge is genuinely missing; record the verification.
- Commits: imperative, `refs #625`, `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk` trailer. No version bump. Work from the worktree; verify `pwd`/`git rev-parse --show-toplevel`; stage specific files; policy hook may refuse compound Bash — run singly. Full `npm test` only in Task 4.

---

### Task 1: `skills/capture/SKILL.md` — the Shaped-body branch

**Files:** Modify `skills/capture/SKILL.md` (Input flags table, Workflow step 1 row, Backend Selection chain paragraph, new section after Backend Selection, Entry Format hard-cap note, anti-pattern row)

- [ ] **Step 1: Input table rows.** After the `--needs-definition` row, add:

```markdown
| `--defer-reason=<value>` | One of `DEFER_REASONS` (`bin/lib/issues/record.js`; vocabulary in `_shared/deferral-gate.md`). **Required** when the filing is a deferral — the body carries an `Origin:` line, or any `--source` was given (a producer's Capture route); missing then → stop and report, file nothing. Optional otherwise. A `Defer-reason: {value}` line already inside the idea text counts as supplied (validated the same way). See the Shaped-body branch below. |
| `--risk=<low\|medium\|high>` / `--size=<low\|medium\|high>` | Shaped-body branch only: override the self-judged scoring — same auto/headless rationale as `--type=`. Ignored on the stub branch (a fresh capture is never scored). |
| `--origin="<text>"` | Shaped-body branch only: an `Origin:` provenance line for the composed body (producers' Capture routes pass their own). Its presence makes the filing a deferral (see `--defer-reason=`). |
```

- [ ] **Step 2: New section** — insert immediately after the `## Backend Selection` section (before `## Entry Format`):

````markdown
## Shaped-body branch

**Detection is by what is supplied, never by who invoked.** Split `$BODY` on line-anchored `## ` headings. The body is **shaped** when it contains `## Current State`, `## Deliverables`, and exactly one of `## Acceptance Criteria` / `## Open Question`, each followed by non-empty content, and none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names appears anywhere. Anything before the first heading becomes `header` (e.g. `Origin:`/`Trigger:` lines the caller supplied). A body that has the headings but fails the check falls through to the stub branch below with one line saying why. A human who pastes a shaped body takes this branch too; a human typing a short idea still gets the 5-line stub and today's behavior.

On match, skip Entry Format's stub assembly and its 5-line cap, and run this precedence:

1. **Judging Definition first — and it wins.** `needs:definition` (judged, or `--needs-definition`, or an `## Open Question` section present) → compose via `specShapedBody` with `openQuestion`, `filedBy: 'capture'`, footer `_Filed by \`capture\` via specShapedBody._`, and file with `needs:definition`, no `ready`, no scoring (an undecided record is never born-ready). `--defer-reason=` is **not** required here — a needs-you record is not a deferral; when supplied it is still rendered via `provenance.deferReason`.
2. **The deferral check.** The filing is a deferral when the body carries an `Origin:` line (content signal) **or** any `--source` value was given — the rule keys on "any `--source`", not named producers. A deferral with no `--defer-reason=` and no `Defer-reason:` line in the text → **stop and report the missing reason; file nothing** (the same hard gate `wrap-up/refused-proposals.md` enforces at the console). This is the one deliberate content-keyed exception where invoker identity enters (`--source` as the headless-caller equivalent of the `Origin:` content signal), named as such.
3. **Score and file born-ready.** Judge `risk`/`size` per `_shared/work-record.md`'s Scoring axis (or take `--risk=`/`--size=` overrides), compose via `specShapedBody({ header, currentState, deliverables, acceptanceCriteria, filedBy: 'capture', provenance: { origin: <the `--origin=` text or the body's own Origin: line — never duplicated>, deferReason }, footer: '_Filed by \`capture\` via specShapedBody._' })`, and file via Backend Selection's existing filing step with `recordPayload({ …, origin: 'capture', risk, size, ready: true, deferReason })` — `ready` regardless of the autonomy ceiling.

**Decision (recorded, not an omission):** `ready` on this branch follows from the born-ready rule's own reasoning — a `specShapedBody`-composed, scored body is structurally what health skills file, and they are `ready` by construction — not from a trust verdict; the human gate stays the grant at `refine`, and the trust ledger's `producer:capture` class grades outcomes post-hoc. Self-judged scoring is likewise deliberately unconditional (the same judgment `/specify` shaping mode makes).

**Skips on this branch:** the `gh issue list`/git-log trust fetch and #575's chain-into-`/claude-tweaks:specify` step never run — the record is already the shape that chain exists to produce. Presentation line: `Added: '{title}' (Type: {t}, Definition: clear, shaped — risk:{r} size:{s}, ready)`.
````

- [ ] **Step 3: Backend Selection anchor.** In the "One exception, off by default." paragraph, after `At \`supervised\`, the default and the state of any repo that has not opted in, this never fires and the paragraph above holds unchanged.` append: ` A filing that took the Shaped-body branch (below) never chains either — there is nothing left to shape.`

- [ ] **Step 4: Entry Format hard-cap note.** In the `### Hard cap: ~5 lines per entry` section, after its existing text ending `don't overthink — capture the essence.` append one sentence: ` The cap governs the stub branch only — a supplied shaped body (see Shaped-body branch above) is exempt by design.`

- [ ] **Step 5: Anti-pattern reword.** Replace the row:

```markdown
| Writing a full spec as a backlog record | Backlog records are for half-formed ideas; a full spec belongs in `specs/` where `/build` and `/flow` can act on it |
```

with:

```markdown
| A *human brain-dump* growing past 5 lines to dodge the cap | Half-formed thinking that needs length needs `/superpowers:brainstorming`, not a longer stub. A supplied spec-shaped body is different — that is the Shaped-body branch's intended input, filed born-ready |
```

- [ ] **Step 6: Workflow row.** In the Workflow table's step 1 row, after `per Backend Selection below;` insert `a spec-shaped `$BODY` takes the Shaped-body branch (files scored + `ready`, skips the cap and the chain);`.

- [ ] **Step 7: Verify** — `grep -c "Shaped-body branch" skills/capture/SKILL.md` ≥ 4; `grep -c -- "--defer-reason=" skills/capture/SKILL.md` ≥ 2; `grep -c "Hard cap: ~5 lines" skills/capture/SKILL.md` = 1; `wc -c skills/capture/SKILL.md` < 40960.

- [ ] **Step 8: Commit** — `git add skills/capture/SKILL.md`; message: `Add capture's Shaped-body branch — content-keyed detection, needs:definition-first precedence, required defer reason on deferrals, born-ready by construction with recorded decision, refs #625` + trailer.

---

### Task 2: matrix row + both CLAUDE.md copies

**Files:** Modify `skills/_shared/work-record.md` (`/capture` row), `skills/init/claude-md-template.md` (~line 150), `CLAUDE.md` (~line 60)

- [ ] **Step 1: `/capture` row.** In the row starting `| **\`/capture\`** |`, change the Adds cell from `\`by:capture\`, Type (\`type:*\` only when \`work-types: labels\`), \`needs:definition\` (content judgment at filing time — see Judging Definition in \`capture/SKILL.md\`)` to `\`by:capture\`, Type (\`type:*\` only when \`work-types: labels\`), \`needs:definition\` (content judgment at filing time — see Judging Definition in \`capture/SKILL.md\`); \`risk:*\`, \`size:*\`, \`ready\` (**only** on the Shaped-body branch — structural check passed, \`needs:definition\` false, \`via specShapedBody\` footer present — see \`capture/SKILL.md\`)`; and in the Never cell, change the leading `scoring, \`parked\`, \`auto:*\`, \`bot:*\`, and \`ready\` — always, at every ceiling.` to `\`parked\`, \`auto:*\`, \`bot:*\` — always; scoring and \`ready\` on any **stub** filing, at every ceiling (the Shaped-body branch is the sole exception, per Adds).` (Keep the rest of the Never cell — the #575 chain sentence — unchanged.)

- [ ] **Step 2: both bullets.** In `skills/init/claude-md-template.md` AND `CLAUDE.md`, replace (identical text in both):

```markdown
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record (via `/claude-tweaks:capture`) with scope and context. Never silently skip work or leave TODO comments without a corresponding backlog record.
```

with:

```markdown
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record via `/claude-tweaks:capture` — with a spec-shaped body (Current State / Deliverables / Acceptance Criteria) and a `Defer-reason:` from `_shared/deferral-gate.md` when an agent holds the context, since an agent that holds it files it shaped; a stub is for a human typing an idea. Never silently skip work or leave TODO comments without a corresponding backlog record.
```

(Note: CLAUDE.md's copy says "TODO comments" — match each file's own literal text when replacing; the template and repo copy are currently identical.)

- [ ] **Step 3: Verify** — `grep -n "spec-shaped body" skills/init/claude-md-template.md CLAUDE.md` matches the bullet in both; `node --test tests/claude-md-budget.test.js` → `# fail 0`.

- [ ] **Step 4: Commit** — `git add skills/_shared/work-record.md skills/init/claude-md-template.md CLAUDE.md`; message: `Authorize capture's shaped-branch scoring and ready in the matrix; the no-implicit-deferrals bullet names the spec-shaped body and Defer-reason in both CLAUDE.md copies, refs #625` + trailer.

---

### Task 3: #624 carry-forwards — flip the pass-throughs, fix the placement clause

**Files:** Modify every file `grep -rn "arrives with #625\|#625's flag arrives\|arrives later" skills/` hits (expected: `skills/review/step3-routing.md`, `skills/reflect/full-mode.md`, and possibly `skills/reflect/SKILL.md`), plus `skills/_shared/deferral-gate.md`

- [ ] **Step 1: Flip each pass-through.** For each hit, rewrite the clause so the Capture hand-off names the real interface — e.g. step3-routing's `Invoke \`/claude-tweaks:capture\` with the finding text carrying a \`Defer-reason: {value}\` line (a caller-side pass-through convention — capture's own \`--defer-reason=\` flag arrives with #625), and pass \`--needs-definition\` when the finding names an open choice.` becomes `Invoke \`/claude-tweaks:capture\` with the shaped body and \`--defer-reason={value} --source review\` (capture's Shaped-body branch — \`capture/SKILL.md\`), plus \`--needs-definition\` when the finding names an open choice.` Adapt the same shape per file (`--source reflect` for reflect's), preserving each sentence's surrounding structure. No hit may retain "arrives with #625"/"arrives later" phrasing.

- [ ] **Step 2: `deferral-gate.md` placement clause (M6).** In "## Where the reason lives", replace:

```markdown
- **Directly-created records**: the first line of the body, followed by a blank line (`recordPayload`'s `deferReason` inserts it there when the body does not already carry one).
```

with:

```markdown
- **Directly-created records**: a `Defer-reason: {value}` line in the body, located **by key** (`recordPayload`'s match-or-throw and `clearsFloor` both read it wherever it sits). A composer-composed body (`specShapedBody`) places it in the provenance block — after `header`/`Origin:`, before `## Current State`; a bare `recordPayload({deferReason})` on a body without the line inserts it as the first body line.
```

- [ ] **Step 3: Add capture to the gate's consumer list** — in `deferral-gate.md`'s consumer list, add `- \`skills/capture/SKILL.md\` (Shaped-body branch — \`--defer-reason=\` validation and the deferral check)` after the browser-review line.

- [ ] **Step 4: Verify** — `grep -rn "arrives with #625\|#625's flag arrives\|arrives later" skills/` → no matches (check each remaining hit isn't an unrelated phrase before editing); `grep -c "capture/SKILL.md" skills/_shared/deferral-gate.md` ≥ 1.

- [ ] **Step 5: Commit** — `git add` the touched files; message: `Flip the Capture pass-throughs to capture's real --defer-reason interface and fix deferral-gate's placement clause for composer bodies, refs #625` + trailer.

---

### Task 4: Conformance + probes + full suite + skill-graph verification

**Files:** Modify `tests/deferral-gate-conformance.test.js`

- [ ] **Step 1: Append:**

```js
// --- #625: capture's shaped-body branch ---

test('capture/SKILL.md carries the Shaped-body branch, the flag, and still the 5-line cap', () => {
  const c = read('skills/capture/SKILL.md');
  assert.ok(c.includes('Shaped-body branch'));
  assert.ok(c.includes('--defer-reason='));
  assert.ok(c.includes('Hard cap: ~5 lines'));
});

test('both CLAUDE.md copies name the spec-shaped body in the no-implicit-deferrals bullet', () => {
  for (const rel of ['skills/init/claude-md-template.md', 'CLAUDE.md']) {
    const bullet = read(rel).split('\n').find((l) => l.includes('**No implicit deferrals.**'));
    assert.ok(bullet, rel);
    assert.ok(bullet.includes('spec-shaped body'), rel);
    assert.ok(bullet.includes('Defer-reason'), rel);
  }
});

test('no Capture pass-through still defers to a not-yet-landed #625 flag', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('arrives with #625') || c.includes("#625's flag arrives")) offenders.push(path.relative(REPO_ROOT, p));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'skills'));
  assert.deepEqual(offenders, []);
});

// AC 1's label/body shape, verified by composition probe (a live filing would
// pollute the real tracker — deviation stated in the PR body).
test('a shaped-branch born-ready filing composes the exact labels and body AC 1 names', () => {
  const { specShapedBody: ssb, recordPayload: rp } = require('../bin/lib/issues/record.js');
  const body = ssb({
    header: '', currentState: 'c', deliverables: 'd', acceptanceCriteria: 'a',
    filedBy: 'capture', provenance: { deferReason: 'tangential' },
    footer: '_Filed by `capture` via specShapedBody._',
  });
  const p = rp({ title: 't', body, type: 'task', origin: 'capture', risk: 'low', size: 'medium', ready: true, deferReason: 'tangential' });
  assert.deepEqual(p.labels, ['by:capture', 'risk:low', 'size:medium', 'ready']);
  assert.strictEqual((p.body.match(/^Defer-reason: tangential$/gm) || []).length, 1);
  assert.ok(p.body.includes('via specShapedBody'));
});
```

- [ ] **Step 2: Run** — `node --test tests/deferral-gate-conformance.test.js tests/claude-md-budget.test.js` → `# fail 0`.
- [ ] **Step 3: Skill-graph verification (no edit expected)** — `grep -n "capture" docs/skill-graph.md | head` and confirm the producers' Capture-route edges already exist (review → capture, reflect → capture); record the finding in your report. Edit ONLY if an edge is genuinely absent.
- [ ] **Step 4: Full suite** — `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/625-npm-test.log 2>&1`; grep the `# tests/# pass/# fail` lines → `# fail 0` (baseline 3940; isolate any failure). Run spec AC 5's greps.
- [ ] **Step 5: Commit** — `git add tests/deferral-gate-conformance.test.js`; message: `Pin #625's shaped-body branch — capture section + flag, both CLAUDE.md bullets, no stale pass-throughs, born-ready label probe, refs #625` + trailer.

---

## Self-review

- **Spec coverage:** D1 (branch section: detection, precedence, decision, skips, presentation) → T1; D2 (decision recorded) → T1 Step 2's Decision paragraph; D3 (`--defer-reason=` semantics) → T1 Steps 1–2; D4 (matrix row) → T2 Step 1; D5 (both bullets) → T2 Step 2; D6 (conformance) → T4; D7 (skill-graph verify) → T4 Step 3. Carry-forwards: pass-through flips + M6 + capture in the gate's consumer list → T3.
- **AC mapping:** AC 1 → T4's probe (deviation stated); AC 2/3 → prose-trace (precedence text in T1 Step 2 exactly encodes them) + the probe covers AC 1's label shape — the stop-and-report path is prose (T1 Step 2 item 2 states it verbatim); AC 4 → the read-the-text option (stub branch byte-untouched — T1 touches only the listed anchors); AC 5 → T4 Steps 2+4.
- **Anchors verified against the live post-#624 tree:** the flags table, the chain-exception paragraph's closing sentence, the hard-cap heading, the anti-pattern row, the `/capture` matrix row cells, both bullets (byte-identical), the pass-through grep hits, and deferral-gate's placement bullet.
- **Placeholders:** none. **Token consistency:** footer string `_Filed by \`capture\` via specShapedBody._` identical in T1, T2's row condition, and T4's probe; the presentation line matches the spec's verbatim.
