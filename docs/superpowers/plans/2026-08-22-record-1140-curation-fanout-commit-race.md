# Record #1140: Curation Fan-Out Commit Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the shared-git-index race among wrap-up's parallel curation judges structurally — judges never run git mutations; the controller commits every applied finding serially and is the only writer of `findings[].commit` — and pin the contract with a conformance test.

**Architecture:** The spec's option (a)/(b) hybrid: fan-out (and singleton) dispatch prompts forbid judge-side `git add`/`git commit`; an auto-apply-eligible finding is a working-tree edit whose payload names its `targetPath` with `commit` absent; after all payloads return (and after the existing shadow sweep), a new controller-side **serial-commit pass** audits each applied finding (`git status --porcelain` on its `targetPath` must show a real edit; a judge-filled `commit` is a payload violation), commits exactly that file, and fills `commit` before piping to `record`. Prose-only change across `curation-engine.md` §3/§4 and `skill-curation.md`, pinned by new tests in the existing `tests/curation-judge-stagepath.test.js`.

**Tech Stack:** Markdown skill prose + `node --test` prose-pin conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1140/work/1140-spec.md`

## Global Constraints

- All work happens in the shared multi-spec worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177` on branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there first.
- Commit messages: `{Verb} {what} — {detail}` imperative, body ends `refs #1140` (never closes/fixes).
- `plugin/skills/wrap-up/curation-engine.md` sits at 21,409 bytes against the 40 KB sub-file ceiling — additions below add well under 3 KB; do not restructure existing sections.
- `tests/curation-judge-stagepath.test.js` already pins §4's structure (paragraph markers `**Judge self-verification` and `**Post-fan-out shadow sweep`, and slicing from `## 4. Parallel dispatch`) — the new paragraph must not break those existing assertions: insert it BEFORE the `**Judge self-verification of \`stagePath\`` paragraph and keep both existing bold paragraph headers byte-identical.
- Only `skill-curation.md` among the judge files instructs a judge-side commit today (verified: `docs-health-integration.md` and `journey-curation.md` route all findings through the Review Console and never instruct a judge commit) — do not invent edits for those two files; the engine-level dispatch rule covers them.
- `bin/lib/wrap-up/engine-record.js` validates `action` ∈ {applied, staged} but never requires `commit` (verified) — no code change needed for the contract; the controller filling `commit` post-hoc is already valid.

### Task 1: Prose — the no-judge-git rule, serial-commit pass, and contract updates

**Files:**
- Modify: `plugin/skills/wrap-up/curation-engine.md` (§4 new paragraph; §3 `findings[].commit` row; §3's applied-precondition follow-up sentence)
- Modify: `plugin/skills/wrap-up/skill-curation.md` (Staging step 2)

**Interfaces:**
- Produces: the literal §4 paragraph header `**No judge-side git mutations — the controller's serial-commit pass.**` (Task 2's test anchors on it), the reworded §3 commit row, and skill-curation.md's no-commit wording.

- [ ] **Step 1: Insert the §4 paragraph**

In `plugin/skills/wrap-up/curation-engine.md`, immediately BEFORE the paragraph starting `**Judge self-verification of \`stagePath\` (both branches).**`, insert this paragraph (one physical line, matching the file's one-paragraph-per-line convention), followed by a blank line:

```
**No judge-side git mutations — the controller's serial-commit pass.** Every dispatch prompt — the fan-out and the singleton alike — inlines this instruction verbatim: *never run `git add`, `git commit`, or any other git mutation; an auto-apply-eligible finding is made as a working-tree edit only, its payload names the edited file as `targetPath`, and its `commit` field is left absent — the controller commits.* The fan-out shares one worktree, so concurrent judge commits raced on the shared git index (#1140 — observed in run 2026-08-20T153031-spec-1065: a judge reported its edit "swept into a sibling's commit" with a fabricated hash while the edit sat uncommitted in the tree). After every payload has returned and the shadow sweep below has run, and **before any `record` call**, the controller runs the serial-commit pass, one finding at a time in worklist order, for each finding with `"action": "applied"`: (1) **audit** — `git status --porcelain -- {targetPath}` must show a real modification or new file; a finding claiming `applied` over a clean path, or arriving with a judge-filled `commit`, is a payload violation — re-prompt that judge once, and if the second payload still violates, downgrade the finding to `staged` when a staged artifact exists or drop it per the same unstaged discipline as `stagePath` above, logging `STAGED {time} — {row}: applied claim failed the commit audit ({reason}); {downgraded|dropped}. Reversibility: high.`; (2) **commit** — `git add {targetPath}` then `git commit` for exactly that file, one commit per finding, so the `SCANNED` line's `Reversibility: high (separate commit)` stays literally true; (3) **attribute** — write the resulting short hash into the payload's `findings[].commit`, and write the judge file's own `AUTO … commit: {hash}` log line now (the controller is the only party that ever knows the hash). One committer, serialized, creating every hash it records: an interleaved or swept commit is structurally impossible, and so is a fabricated attribution.
```

- [ ] **Step 2: Reword §3's `findings[].commit` contract row**

Replace the line:

```
| `findings[].commit` | applied findings | Short hash of the finding's own commit. Same rendering caveat. |
```

with:

```
| `findings[].commit` | applied findings | Short hash of the finding's own commit, written by the **controller's serial-commit pass** (section 4) after the payload returns — a judge never commits and never fills this field, and a judge-filled value is a payload violation the serial-commit pass rejects. Same rendering caveat. |
```

- [ ] **Step 3: Align the applied-precondition follow-up sentence**

In §3, replace the sentence:

```
Fail any one and the finding stages. An applied finding is committed on its own, which is what the `SCANNED` line's `Reversibility: high (separate commit)` asserts; its hash goes in `commit`.
```

with:

```
Fail any one and the finding stages. An applied finding is committed on its own — by the controller's serial-commit pass (section 4), never by the judge — which is what the `SCANNED` line's `Reversibility: high (separate commit)` asserts; the controller writes its hash into `commit`.
```

- [ ] **Step 4: Reword skill-curation.md's Staging step 2**

In `plugin/skills/wrap-up/skill-curation.md`, replace:

```
2. **Additive + reversibility:high + confidence:high** → auto-apply now. Commit. This rule applies whether or not a ledger entry seeded the change. Log entry:
```

with:

```
2. **Additive + reversibility:high + confidence:high** → auto-apply now: make the edit in the working tree only — never run `git add`/`git commit` (`curation-engine.md` section 4's serial-commit pass is the single committer; it audits the edit, commits it, and writes this log entry with the hash only it knows). This rule applies whether or not a ledger entry seeded the change. Log entry (written by the controller at commit time):
```

(The `AUTO … commit: {hash}` fenced log-entry block below it stays byte-identical.)

- [ ] **Step 5: Run the existing pins to confirm nothing broke**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/curation-judge-stagepath.test.js tests/staged-patch-contract.test.js tests/wrap-up-registry-pin.test.js 2>&1 | tail -8`
Expected: PASS, 0 failures (the insertion sits between existing anchored paragraphs and changes none of their text).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/skills/wrap-up/curation-engine.md plugin/skills/wrap-up/skill-curation.md && git commit -m "Close the curation fan-out git-index race — judges never commit, the controller does, serially

Concurrent apply-capable judges shared one worktree's git index and raced
their own commits (#1065's wrap-up produced a swept commit and a
fabricated hash). Dispatch prompts now forbid judge-side git mutations;
a new controller-side serial-commit pass audits each applied finding's
working-tree edit, commits it alone, and is the only writer of
findings[].commit — single committer, so interleaved commits and
fabricated attributions are structurally impossible.

refs #1140"
```

---

### Task 2: Conformance pins + full suite

**Files:**
- Modify: `tests/curation-judge-stagepath.test.js` (append one test block)

**Interfaces:**
- Consumes: Task 1's literal paragraph header `**No judge-side git mutations — the controller's serial-commit pass.**` and reworded rows.

- [ ] **Step 1: Write the failing pins**

Append to `tests/curation-judge-stagepath.test.js`:

```js
// #1140: concurrent fan-out judges raced their own `git add`/`git commit` on the shared
// worktree index (one judge's edit swept into a sibling's commit; a fabricated hash reported).
// The fix is structural: judges never mutate git — the controller's serial-commit pass is the
// single committer and the only writer of findings[].commit. These pins keep the three prose
// surfaces (the §4 rule, the §3 contract row, skill-curation's apply step) from drifting back.
test('curation-engine.md §4 forbids judge-side git mutations and documents the serial-commit pass with its audit', () => {
  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  const para = s4.slice(
    s4.indexOf('**No judge-side git mutations'),
    s4.indexOf('**Judge self-verification'),
  );
  assert.ok(para.length > 0, 'the no-judge-side-git paragraph exists, before the self-verification paragraph');
  assert.match(para, /never run `git add`, `git commit`/, 'the dispatch-prompt instruction forbids judge commits');
  assert.match(para, /serial-commit pass/, 'names the controller-side pass');
  assert.match(para, /git status --porcelain/, 'the commit audit checks the working tree');
  assert.match(para, /judge-filled `commit`.*payload violation|payload violation.*judge-filled `commit`/s, 'a judge-filled commit hash is a violation');
  assert.match(para, /one commit per finding/, 'commits stay per-finding (separate-commit reversibility)');
  assert.match(para, /before any `record` call/, 'the pass runs before record, so payloads carry final hashes');
});

test('curation-engine.md §3 commit row and applied-precondition name the controller as the only committer', () => {
  const row = ENGINE.split('\n').find((l) => l.startsWith('| `findings[].commit` |'));
  assert.ok(row, 'commit contract row present');
  assert.match(row, /controller/i, 'controller writes the field');
  assert.match(row, /judge never commits/i, 'judges never commit');

  assert.match(ENGINE, /committed on its own — by the controller's serial-commit pass \(section 4\), never by the judge/, 'applied-precondition follow-up names the controller');
});

test('skill-curation.md step 2 no longer instructs a judge-side commit', () => {
  const CURATION = fs.readFileSync(path.join(SKILLS, 'wrap-up', 'skill-curation.md'), 'utf8');
  assert.doesNotMatch(CURATION, /auto-apply now\. Commit\./, 'the old judge-commits wording is retired');
  assert.match(CURATION, /never run `git add`\/`git commit`/, 'states the no-judge-commit rule');
  assert.match(CURATION, /serial-commit pass/, 'cites the engine pass that commits instead');
  assert.match(CURATION, /written by the controller at commit time/, 'the AUTO log entry is controller-written (only it knows the hash)');
});
```

- [ ] **Step 2: Run to verify the pins pass against Task 1's text (and fail against pre-Task-1 text)**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/curation-judge-stagepath.test.js 2>&1 | tail -8`
Expected: PASS. Red-gate check for prose pins: run `git stash` is forbidden — instead verify each `assert.doesNotMatch`/`assert.match` targets text that Task 1 actually changed by grepping the Task 1 diff (`git show HEAD -- plugin/skills/wrap-up/skill-curation.md | grep "auto-apply now"` must show the old wording only as a `-` line). A pin that would also have passed against the OLD text is a broken pin — fix it before committing.

- [ ] **Step 3: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1140-full.txt 2>&1; tail -8 /tmp/1140-full.txt; grep "^not ok" /tmp/1140-full.txt`
Expected: 0 failures (a `resolvePrStateAsync` event-loop timing failure is a known machine-load flake — re-run `node --test tests/bin-lib/reconcile/pr-state.test.js` in isolation before treating it as real). Any OTHER prose-pin failure means an existing test pinned text Task 1 changed — fix Task 1's wording to satisfy the pin, never the pin.

- [ ] **Step 4: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add tests/curation-judge-stagepath.test.js && git commit -m "Pin the no-judge-commit rule and serial-commit pass — #1140's conformance half

refs #1140"
```

## Verification against Acceptance Criteria

- **AC1** (race structurally impossible, not advisory): single committer — dispatch prompts forbid judge git mutations, the controller serially commits and creates every hash it records; a judge-filled `commit` or clean-tree `applied` claim is rejected at the audit, closing the fabricated-attribution gotcha.
- **AC2** (documented + mechanical pin): §4 documents the mechanism; Task 2's three pins are the conformance half.
- **AC3**: Task 2 Step 3.

## Scope keywords:

serial-commit pass, No judge-side git mutations, findings[].commit, auto-apply now
