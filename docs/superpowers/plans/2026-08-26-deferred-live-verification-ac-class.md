# Deferred-Live-Verification AC Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document, in `_shared/auto-mode-contract.md`, a general class of acceptance criterion — one whose own verification is a real, side-effecting, hard-to-reverse action against shared state (a live PR/merge/delete cycle, an irreversible external API call) — that an autonomous run must always defer to the closing summary's Manual Steps table rather than execute inline, citing #683's AC4 as the worked example, and wire the deferral mechanism through a new `reason-not-auto` qualifier in `_shared/ledger-format.md`.

**Architecture:** Two small, coupled prose edits. (1) `_shared/auto-mode-contract.md`'s `### Never-reversible (auto-FORBIDDEN, regardless of mode)` list — already the canonical home for "the pipeline must never do X automatically" rules — gets one new bullet naming the class, generalized past the worktree/PR/merge example, and pointing at the ledger mechanism used to defer it. (2) `_shared/ledger-format.md`'s `Required for ops-phase items` qualifier table — already the mechanism `handoff-template.md`'s "Manual Steps Required" table reads from (populated from ledger entries with phase `ops`) — gets a new `live-verification` row so a build classifying this class of AC has a qualifier to cite. A new conformance test pins both additions, following this repo's existing pattern of grepping a named section of a `_shared/*.md` file rather than asserting on the whole file (see `tests/auto-mode-terminal-next-actions.test.js`).

**Tech Stack:** Markdown prose (no executable logic — CLAUDE.md's Philosophy: "no display-only workarounds," but this record is a documentation addition by its own Technical Approach, not new mechanized behavior). `node --test` for the pinning conformance test.

**Spec:** `.claude-tweaks/pipelines/2026-08-26T212441-record-769/work/769-spec.md` (materialized from GitHub issue #769) — this plan implements its Deliverables/Acceptance Criteria in full; the spec travels with this plan, executors read both.

## Global Constraints

- `_shared/auto-mode-contract.md` is at 39861 bytes against the repo's 40960-byte (40 KB) per-sub-file context-cost ceiling (`plugin/bin/lib/skill-audit/context-cost.js`'s `CEILING_BYTES`) — only 1099 bytes of headroom. The new bullet MUST measure under ~900 bytes UTF-8 to leave real margin, not graze the ceiling. Measure with `wc -c` (or a `Buffer.byteLength` check) before committing the edit.
- `_shared/ledger-format.md` (26473 bytes) has ample headroom — no size constraint there.
- The documented rule must be general (any live, hard-to-reverse, shared-state-affecting verification), not scoped narrowly to worktree/PR/merge cycles specifically (spec AC3) — #683's AC4 is cited as the worked example, not the definition.
- Do not restate the rule in `build/SKILL.md` — the spec's Deliverables accept `_shared/auto-mode-contract.md` alone ("or") as the single documented home; every other skill already cites that contract rather than duplicating its semantics (CLAUDE.md's Cross-references convention).

---

### Task 1: Document the deferred-live-verification AC class and its ledger qualifier

**Files:**
- Modify: `plugin/skills/_shared/auto-mode-contract.md` (`### Never-reversible (auto-FORBIDDEN, regardless of mode)` list, currently ending `- Deleting specs` at line 154)
- Modify: `plugin/skills/_shared/ledger-format.md` (`Required for \`ops\`-phase items` qualifier table, currently ending with the `auth-not-configured` row)
- Test: `tests/deferred-live-verification-ac-class.test.js` (new file)

**Interfaces:**
- Consumes: nothing new — pure prose additions to existing files, no code exports.
- Produces: nothing new — no function signatures. The `live-verification` string is the qualifier value future `ops`-phase ledger entries for this class cite; the test below pins that this exact string exists as a `reason-not-auto` qualifier value.

- [ ] **Step 1: Write the failing test**

Create `tests/deferred-live-verification-ac-class.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'auto-mode-contract.md'),
  'utf8',
);
const LEDGER_FORMAT = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'ledger-format.md'),
  'utf8',
);

function neverReversibleSection() {
  const start = CONTRACT.indexOf('### Never-reversible (auto-FORBIDDEN, regardless of mode)');
  const end = CONTRACT.indexOf('## What `auto` silences', start);
  assert.notStrictEqual(start, -1, 'Never-reversible heading present');
  assert.ok(end > start, 'section delimited by the What auto silences heading');
  return CONTRACT.slice(start, end);
}

function requiredForOpsSection() {
  const start = LEDGER_FORMAT.indexOf('Required for `ops`-phase items');
  assert.notStrictEqual(start, -1, 'Required for ops-phase items heading present');
  return LEDGER_FORMAT.slice(start);
}

test('auto-mode-contract.md names the deferred-live-verification AC class as never-reversible', () => {
  const section = neverReversibleSection();
  assert.match(section, /live[, ].*side-effecting.*hard-to-reverse/i);
  assert.match(section, /acceptance criterion/i);
  assert.match(section, /#683/, 'cites #683 as the worked example');
  assert.match(section, /reason-not-auto: live-verification/);
});

test('the documented rule generalizes past the worktree\\/PR\\/merge example (spec AC3)', () => {
  const section = neverReversibleSection();
  // Must name at least one non-PR/merge example of the class, not just the worked example.
  assert.match(section, /irreversible external API call/i);
});

test('_shared/auto-mode-contract.md stays within the context-cost ceiling with headroom', () => {
  const CEILING_BYTES = 40 * 1024;
  const bytes = Buffer.byteLength(CONTRACT, 'utf8');
  assert.ok(bytes <= CEILING_BYTES, `auto-mode-contract.md is ${bytes} bytes, over the ${CEILING_BYTES} ceiling`);
});

test('ledger-format.md defines the live-verification reason-not-auto qualifier', () => {
  const section = requiredForOpsSection();
  assert.match(section, /`live-verification`/);
  assert.match(section, /#683/, 'qualifier row cites #683 as the worked example');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/deferred-live-verification-ac-class.test.js`
Expected: FAIL — every assertion referencing new content (`live-verification`, `#683` in the Never-reversible section, the qualifier row) fails because neither file has been edited yet. The ceiling test passes already (current byte count is under ceiling) — that's expected; it's a regression guard for Step 3, not a red/green signal for this task.

- [ ] **Step 3: Add the Never-reversible bullet to `auto-mode-contract.md`**

In `plugin/skills/_shared/auto-mode-contract.md`, find the `### Never-reversible (auto-FORBIDDEN, regardless of mode)` list. It currently ends:

```markdown
- Deleting specs

## What `auto` silences
```

Change to:

```markdown
- Deleting specs
- Executing a live, side-effecting, hard-to-reverse action against shared state solely to verify an acceptance criterion — a real PR/merge/branch-delete cycle, an irreversible external API call, or anything similarly destructive taken just to prove the AC — defer it instead to the closing summary's Manual Steps table (an `ops` ledger entry, `reason-not-auto: live-verification` — `_shared/ledger-format.md`'s Required-for-ops table). Worked example: #683's AC4 asked for a live create-worktree/commit/PR/merge/teardown cycle against the actual repo; deferred rather than executed mid-pipeline.

## What `auto` silences
```

Before saving, measure the new bullet's byte size in isolation to confirm the Global Constraints budget:

```bash
python3 -c "
s = '''- Executing a live, side-effecting, hard-to-reverse action against shared state solely to verify an acceptance criterion — a real PR/merge/branch-delete cycle, an irreversible external API call, or anything similarly destructive taken just to prove the AC — defer it instead to the closing summary'\'\''s Manual Steps table (an \`ops\` ledger entry, \`reason-not-auto: live-verification\` — \`_shared/ledger-format.md\`'\'\''s Required-for-ops table). Worked example: #683'\'\''s AC4 asked for a live create-worktree/commit/PR/merge/teardown cycle against the actual repo; deferred rather than executed mid-pipeline.'''
print(len(s.encode('utf-8')))
"
```

Expected: prints `607` (well under the ~900-byte target and the 1099-byte headroom).

- [ ] **Step 4: Add the `live-verification` qualifier row to `ledger-format.md`**

In `plugin/skills/_shared/ledger-format.md`, find the `Required for \`ops\`-phase items` qualifier table. It currently ends:

```markdown
| `auth-not-configured` | A CLI exists but credentials aren't set up on this machine. After the user runs the login command, the item should be re-triaged — it often becomes auto-executable. |

Items without a `reason-not-auto` qualifier are classification errors
```

Change to:

```markdown
| `auth-not-configured` | A CLI exists but credentials aren't set up on this machine. After the user runs the login command, the item should be re-triaged — it often becomes auto-executable. |
| `live-verification` | The AC's own verification is itself a real, side-effecting, hard-to-reverse action against shared state (a live PR/merge/delete cycle, an irreversible external API call) — never executed inline during an autonomous run to prove the AC; deferred here instead. See `_shared/auto-mode-contract.md`'s Never-reversible list. Worked example: #683's AC4 (a live worktree/PR/merge/teardown cycle). |

Items without a `reason-not-auto` qualifier are classification errors
```

- [ ] **Step 4.5: Renumbering-completeness check — confirm no other list restates the qualifier enum**

`ledger-format.md`'s Required-for-ops table is an enumerated structure and this task adds a
row to it, so per `plan-authoring-checks.md`'s renumbering-completeness check, search for the
affected fact in three independent forms before treating the addition as complete:

```bash
grep -rn "reason-not-auto" plugin/ docs/superpowers/plans/2026-08-26-deferred-live-verification-ac-class.md
grep -rn "no-cli.*requires-judgment\|requires-judgment.*requires-signoff" plugin/skills/
grep -rn "four qualifier\|four values\|four reason" plugin/skills/
```

Expected finding: `plugin/skills/specify/spec-template.md:206` restates the qualifier list verbatim as `(no-cli, requires-judgment, requires-signoff, auth-not-configured)` in its Manual Steps facets-table row. **Do not add `live-verification` there** — that row specifically describes values a spec *author* proactively writes into a record's own Manual Steps section, classified at build start (Step 2.5); `live-verification` is discovered later, at AC-verification time inside the build itself (not something a spec author declares upfront), so it is a deliberately different, narrower list. No other restatement of the qualifier enum exists in `plugin/` or `docs/`. If a future grep on this same task finds a different restatement, add the row there too rather than assuming this note still covers it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/deferred-live-verification-ac-class.test.js`
Expected: PASS — all four tests green.

- [ ] **Step 6: Run the full auto-mode-contract.md-adjacent regression suite**

Run: `node --test tests/auto-mode-terminal-next-actions.test.js tests/auto-mode-flow-two-stop-budget.test.js tests/capture-absorb-default.test.js tests/flow-run-dir-anchoring.test.js tests/manifesto-lever-conformance.test.js tests/deferral-gate-conformance.test.js tests/staged-patch-contract.test.js`
Expected: PASS — every existing test that reads `auto-mode-contract.md` or `ledger-format.md` still passes; the new bullet/row did not shift any section boundary or byte-count assertion those tests depend on.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/_shared/auto-mode-contract.md plugin/skills/_shared/ledger-format.md tests/deferred-live-verification-ac-class.test.js
git commit -m "Document deferred-live-verification AC class in auto-mode-contract.md

refs #769"
```
