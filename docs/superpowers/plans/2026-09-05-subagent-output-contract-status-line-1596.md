# Subagent-Contract Status-Line Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce recurrence of the Subagent Contract's status-line-first violation (record #903's near-miss) by (a) stopping the detector from logging false-positive violations for third-party agents it was never governing, and (b) putting the contract's own negative example directly into the literal text every dispatch site copies into a subagent's prompt, instead of leaving it as dispatcher-only documentation the subagent itself never sees.

**Architecture:** Two independent, small changes to existing files — no new modules, no new hook events. `plugin/bin/lib/hooks/subagent-stop.js` gains an `agent_type`-based exemption check (using the real `agent_type` input field the SubagentStop hook already receives) so a third-party agent (e.g. `code-simplifier:code-simplifier`) is never logged as a `contract-violation` in the first place — closing the false-positive gap the contract's own prose already warns readers to triage around by hand. `plugin/skills/_shared/subagent-output-contract.md`'s dispatch-site template gains the negative example inline, so it ships as part of every subagent's own prompt rather than living only in the "Re-prompt on violation" section a dispatcher reads about the contract, never about its own upcoming dispatch.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T174526-record-1596/work/1596-spec.md` (materialized from GitHub issue #1596).

## Global Constraints

- No new hook event, no change to `plugin/hooks/hooks.json`.
- `subagent-stop.js` stays best-effort / never-blocking, per its own existing file-header comment and this project's "never break a session over a nudge" convention — this plan does not attempt to force a subagent to retry via the hook's own stop/continue decision, because this session could not fully verify (within its own investigation budget, see the Note below) whether the `SubagentStop` event's JSON output actually supports a blocking decision field the way `Stop` does; shipping an unverified blocking mechanism against a live user-facing hook is exactly the risk `_shared/reproduce-first-discipline.md` and this project's own "do it properly, don't guess" philosophy warn against. **Deliberate scope-down, stated explicitly (plan-authoring "Blocking-verification-downgrade check"):** the originally-considered stronger fix — return `hookSpecificOutput: { permissionDecision: 'block', permissionDecisionReason: ... }` from `subagent-stop.js` to force the violating subagent to re-emit its reply before actually stopping — is NOT included in this plan. Two independent lookups inside the same investigation returned conflicting answers on whether `SubagentStop`'s JSON output actually supports a blocking decision (one direct fetch of `https://code.claude.com/docs/en/hooks` described a `permissionDecision`/`permissionDecisionReason` decision-control pair for `SubagentStop`; a separate research pass concluded the opposite). Neither could be reconciled before this session's rate limit interrupted further research. Shipping a live behavior change against unverified platform semantics is the wrong call under uncertainty — this plan instead ships the two changes below, which need no such platform assumption, and files the blocking-enforcement idea as a follow-up (Task 4) rather than guessing.
- Match existing file conventions: `bin/lib/hooks/*.js` style (CommonJS, `'use strict'`), `tests/hooks-*.test.js` naming and `node:test`/`node:assert` style.

---

### Task 1: Exempt third-party agent types from contract-violation detection

**Files:**
- Modify: `plugin/bin/lib/hooks/subagent-stop.js`
- Test: `tests/hooks-subagent-stop.test.js` (new file)

**Interfaces:**
- Consumes: `ctx.input.agent_type` (SubagentStop hook input field, confirmed via Claude Code's own hooks reference: "Agent name (for example, `\"Explore\"` or `\"security-reviewer\"`). Present when the session uses `--agent` or the hook fires inside a subagent call") and `ctx.input.agent_id`/`ctx.input.session_id` (same reference doc), alongside the module's existing `ctx.input.agent_transcript_path`/`ctx.input.transcript_path`.
- Produces: `isExemptAgentType(agentType)` — exported alongside `run` for direct unit testing. `run(ctx)` unchanged shape (`{}` or `{ json: { systemMessage } }`).

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

```bash
node -e "console.log(require('fs').readFileSync('plugin/bin/lib/hooks/subagent-stop.js','utf8').split('\n').length)"
```
Expected: `82` (the file is 82 lines as of this plan's authoring — if this changes, re-read the file before applying Step 3's edit).

- [ ] **Step 2: Write the failing test**

Create `tests/hooks-subagent-stop.test.js`:

```javascript
// tests/hooks-subagent-stop.test.js
//
// E3's SubagentStop status-line detector (#1596): a third-party agent (one
// whose `agent_type` carries a plugin-namespace prefix other than this
// plugin's own "claude-tweaks") is exempt from the Subagent Contract
// entirely (subagent-output-contract.md's Exemption section) — it was never
// given the status-line format, so a malformed-looking reply from it is not
// evidence of anything. This module previously had no exemption check at
// all: every malformed reply was logged as a `contract-violation` event
// regardless of which agent produced it, which is exactly the false-positive
// gap the contract's own prose ("A logged contract-violation is evidence to
// read, not a confirmed violation") tells a human reader to triage around by
// hand. This suite pins the exemption at the detector itself.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const subagentStop = require('../plugin/bin/lib/hooks/subagent-stop');

function tmpRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-subagent-stop-test-'));
}

function writeTranscript(dir, lastAssistantText) {
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const line = JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: lastAssistantText }] } });
  fs.writeFileSync(transcriptPath, line + '\n');
  return transcriptPath;
}

test('isExemptAgentType: true for a third-party plugin-namespaced agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('code-simplifier:code-simplifier'), true);
  assert.strictEqual(subagentStop.isExemptAgentType('impeccable:impeccable-finish-reviewer'), true);
});

test('isExemptAgentType: false for this plugin\'s own namespaced agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('claude-tweaks:qa-agent'), false);
});

test('isExemptAgentType: false for a bare harness built-in type (no namespace)', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('general-purpose'), false);
  assert.strictEqual(subagentStop.isExemptAgentType('Explore'), false);
});

test('isExemptAgentType: false for a missing/non-string agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType(undefined), false);
  assert.strictEqual(subagentStop.isExemptAgentType(null), false);
});

test('run: does not log a contract-violation for an exempt third-party agent_type, even with malformed text', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'Based on my review, the file looks fine.');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'code-simplifier:code-simplifier' },
  };
  const out = subagentStop.run(ctx);
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(runDir, 'events.jsonl')), 'expected no events.jsonl to be written for an exempt agent');
});

test('run: still logs a contract-violation for a non-exempt agent_type with malformed text', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'Based on my review, DONE');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'general-purpose' },
  };
  const out = subagentStop.run(ctx);
  assert.ok(out.json && typeof out.json.systemMessage === 'string');
  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  assert.match(events, /contract-violation/);
});

test('run: no-op for a well-formed status line, regardless of agent_type', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'DONE\nNo findings.');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'general-purpose' },
  };
  const out = subagentStop.run(ctx);
  assert.deepStrictEqual(out, {});
});

test('run: unaffected by exemption logic when there is no owned run (existing no-op path)', () => {
  const ctx = { ownedRun: {}, input: { agent_type: 'code-simplifier:code-simplifier' } };
  assert.deepStrictEqual(subagentStop.run(ctx), {});
});
```

- [ ] **Step 3: Run the new test file to verify the exemption tests fail**

Run: `node --test tests/hooks-subagent-stop.test.js`
Expected: FAIL — `subagentStop.isExemptAgentType is not a function` (not yet exported/implemented), and the "does not log a contract-violation for an exempt third-party agent_type" test fails because the current code has no exemption check at all (it would currently log the violation for every non-matching STATUS_RE text, exempt or not).

- [ ] **Step 4: Implement the exemption check**

Replace the full contents of `plugin/bin/lib/hooks/subagent-stop.js` with:

```javascript
// bin/lib/hooks/subagent-stop.js — E3: Subagent Contract status-line check (warn tier).
// Best-effort by design: SubagentStop fires unreliably for Task dispatches
// (claude-code#27755) and transcript field names may drift. Never blocks.
// Known false-positive source: a dispatch whose own template specifies a
// different first-line contract (e.g. superpowers:subagent-driven-development's
// task-reviewer, which begins with a spec-compliance verdict) is logged here
// even though nothing was actually violated — STATUS_RE has no way to know a
// dispatch declared a different contract.
'use strict';
const fs = require('fs');
const ctxLib = require('./context');

// #750: superpowers:subagent-driven-development's implementer-prompt.md
// template asks the dispatched agent to reply with "- **Status:** DONE |
// DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT" (a bold, colon-space-prefixed
// bullet) rather than claude-tweaks' own bare-word first line — a real
// SDD-dispatched agent following its OWN template correctly false-positived
// on every dispatch. The optional `-\s+` and `\*\*Status:\*\*\s+` prefixes
// widen the match to that exact literal shape (bullet dash, then the bold
// "Status:" label, then one of the four contract words) — nothing looser:
// any other bold label, or the four words appearing later in a sentence,
// still falls through to the violation path below.
const STATUS_RE = /^(?:-\s+)?(?:\*\*Status:\*\*\s+)?(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\b/;

// This plugin's own name (plugin/.claude-plugin/plugin.json's "name" field) —
// the same literal already hardcoded in post-tool-use.js's manifest check.
// No shared constant module exists for it yet; this is the second call site,
// not a third, so introducing one is left for whenever a third appears.
const OWN_PLUGIN_NAMESPACE = 'claude-tweaks';

// #1596: the Subagent Contract's Exemption section (subagent-output-contract.md)
// exempts an agent whose definition file lives outside this plugin's own
// `agents/` directory — it ships with a third-party plugin and was never
// given the status-line format, so a "malformed" reply from it is not
// evidence of a violation at all. The SubagentStop hook's `agent_type` input
// field (present "when the session uses --agent or the hook fires inside a
// subagent call", per Claude Code's own hooks reference) carries that
// plugin's namespace as a `plugin:agent-name` prefix for a real plugin agent
// (e.g. "code-simplifier:code-simplifier", "impeccable:impeccable-finish-reviewer").
// A bare type with no namespace (e.g. "general-purpose", "Explore") is a
// harness built-in Task type — claude-tweaks' own ad hoc fan-out dispatches
// use these, so they are NOT exempt: the contract's prompt, not the agent
// type, governs those. `claude-tweaks:{name}` (this plugin's own agents/
// directory) is likewise never exempt, per the contract's own "never exempt"
// rule for this plugin's own agents.
function isExemptAgentType(agentType) {
  if (typeof agentType !== 'string' || !agentType) return false;
  const idx = agentType.indexOf(':');
  if (idx === -1) return false;
  return agentType.slice(0, idx) !== OWN_PLUGIN_NAMESPACE;
}

function lastAssistantText(transcriptPath) {
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const lines = raw.split('\n');
  // Scan from the tail and stop at the first assistant message found — the
  // last assistant message is almost always near the end of a long-running
  // transcript, so this avoids JSON.parse-ing every earlier line just to
  // confirm none of them is the true last one.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry && entry.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    // This IS the transcript's true last assistant turn (first match found
    // scanning backward) — decide based on IT alone and stop here. Falling
    // through to an EARLIER assistant message when this one has no text
    // blocks (e.g. a tool-call-only final turn) would silently grade stale,
    // unrelated content instead of correctly recognizing "the real last
    // turn had nothing to grade" — matching this file's own best-effort
    // posture (unreadable/ungradable -> no-op, not a violation).
    //
    // A message that ALSO carries a tool_use block is not a completed reply
    // either, even when it carries narration text alongside the tool call
    // (e.g. "Waiting for the other task to finish." immediately before
    // calling Monitor/SendMessage) — the turn continues after the tool
    // result comes back, so this narration precedes the eventual final
    // reply rather than being it. Grading it here is the same category of
    // misfire as the tool-call-only case above: nothing to grade yet (#1329).
    if (msg.content.some((c) => c && c.type === 'tool_use')) return null;
    const texts = msg.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string');
    return texts.length ? texts[texts.length - 1].text : null;
  }
  return null;
}

function run(ctx) {
  // Scoped to ctx.ownedRun, NEVER ctx.runDir: the latter is the session-agnostic
  // newest-non-terminal resolution, so with parallel sessions active a sibling
  // session's Task-agent stop would stamp whichever run dir happens to be newest
  // — polluting a foreign run's audit trail while the run that actually owned the
  // violation records nothing. Same pattern and rationale as pre-tool-use.js's
  // gate-denial breadcrumb ([IL-96]); degrades to a silent no-op when this
  // session owns no run, matching skill-invocation.js's identical guard.
  const ownedRun = ctx.ownedRun || {};
  if (!ownedRun.dir) return {};
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return {};
  const text = lastAssistantText(transcriptPath);
  if (typeof text !== 'string') return {}; // unreadable -> best-effort no-op
  if (STATUS_RE.test(text.trim())) return {};
  if (isExemptAgentType(ctx.input.agent_type)) return {}; // third-party agent — never governed by this contract
  ctxLib.appendEvent(ownedRun.dir, 'contract-violation', { firstLine: text.trim().split('\n')[0].slice(0, 120) }, ownedRun.attribution);
  return { json: { systemMessage: 'claude-tweaks: a subagent reply is missing the Subagent Contract status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Logged to events.jsonl.' } };
}

module.exports = { run, isExemptAgentType };
```

- [ ] **Step 5: Run the test file to verify it passes**

Run: `node --test tests/hooks-subagent-stop.test.js`
Expected: PASS (all 7 tests)

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/subagent-stop.js tests/hooks-subagent-stop.test.js
git commit -m "Exempt third-party agent types from Subagent Contract violation detection (#1596)"
```

---

### Task 2: Put the negative example inline in the dispatch-site template

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md:278` (Form B blockquote's `**Contract:**` line)
- Modify: `plugin/skills/_shared/subagent-output-contract.md:286` (the concrete `Task()` call example's `Status line (required):` line)

**Interfaces:**
- Consumes: nothing (prose-only change).
- Produces: the literal text every dispatch site copies into a subagent's own prompt now names the exact violation observed twice (#606, #1653) instead of only documenting it for the dispatcher's own later triage.

- [ ] **Step 1: Read the current lines to confirm exact text before editing**

```bash
node -e "const l=require('fs').readFileSync('plugin/skills/_shared/subagent-output-contract.md','utf8').split('\n'); console.log(l[277]); console.log('---'); console.log(l[285]);"
```
Expected output (0-indexed array, so `l[277]` is line 278 and `l[285]` is line 286):
```
> **Contract:** Each agent follows the Subagent Contract — minimal input (scope + path + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line, then Template A. Pick the cheapest work profile that fits ({Fast | Standard | Capable} — Frontier never rides a fan-out; singleton slots only, §Model Selection) and resolve it per §Model Selection. Inline the template literally; reject and re-prompt on format violations.
---
Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
```
If either line's text differs from this, re-read the file in full before editing — the file may have changed since this plan was authored.

- [ ] **Step 2: Edit line 278 (Form B blockquote)**

Replacing:
```
> **Contract:** Each agent follows the Subagent Contract — minimal input (scope + path + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line, then Template A. Pick the cheapest work profile that fits ({Fast | Standard | Capable} — Frontier never rides a fan-out; singleton slots only, §Model Selection) and resolve it per §Model Selection. Inline the template literally; reject and re-prompt on format violations.
```
with:
```
> **Contract:** Each agent follows the Subagent Contract — minimal input (scope + path + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line with nothing before it (WRONG: "Based on my review, DONE" — narration before the status word still violates this even though the word appears), then Template A. Pick the cheapest work profile that fits ({Fast | Standard | Capable} — Frontier never rides a fan-out; singleton slots only, §Model Selection) and resolve it per §Model Selection. Inline the template literally; reject and re-prompt on format violations.
```

- [ ] **Step 3: Edit line 286 (concrete `Task()` example)**

Replacing:
```
Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
```
with:
```
Status line (required): First line of your reply must be exactly one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, with nothing before it. WRONG: "Based on my review, DONE" — a confirmatory sentence before the status word violates this even though the word appears later in the reply.
```

- [ ] **Step 4: Verify no other literal copy of the old line survives, and that both edits landed**

```bash
grep -n "one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED" plugin/skills/_shared/subagent-output-contract.md
```
Expected: two matches — the two edited lines — and both containing the new "WRONG:" text (grep for `WRONG` on the same file to confirm: `grep -n "WRONG" plugin/skills/_shared/subagent-output-contract.md` should now show 3 matches — the pre-existing one in the "Re-prompt on violation" section, plus these two new ones).

- [ ] **Step 5: Update the "A logged contract-violation is evidence to read" paragraph to reflect Task 1's fix**

Read the current paragraph first:
```bash
node -e "const l=require('fs').readFileSync('plugin/skills/_shared/subagent-output-contract.md','utf8').split('\n'); console.log(l[110]);"
```
Expected (line 111, 0-indexed `l[110]`):
```
**A logged `contract-violation` is evidence to read, not a confirmed violation.** The detector (`bin/lib/hooks/subagent-stop.js`) tests one regex against the last assistant text it can reach and has no way to know *which* agent replied or what contract that dispatch declared, so at least two non-violating cases land in the log identically: a dispatch whose own template specifies a different first line (its header comment names this one), and a **third-party agent exempt from this contract entirely** (see Exemption below — an exempt agent "is not violating a format it was never given", yet its reply still trips the regex; `/claude-tweaks:simplify`'s `code-simplifier:code-simplifier` dispatch is the everyday instance). Triage each entry against the dispatch that produced it before treating it as a finding — and never re-prompt an exempt agent on the strength of one.
```

Replace it with:
```
**A logged `contract-violation` is evidence to read, not a confirmed violation.** The detector (`bin/lib/hooks/subagent-stop.js`) tests one regex against the last assistant text it can reach and has no way to know *which* agent replied or what contract that dispatch declared, so one non-violating case still lands in the log: a dispatch whose own template specifies a different first line (its header comment names this one). A **third-party agent exempt from this contract entirely** (see Exemption below — an exempt agent "is not violating a format it was never given") is filtered out at the detector itself, via its `agent_type` input field (#1596) — a namespaced type whose plugin prefix isn't this plugin's own is never logged as a violation in the first place, so `/claude-tweaks:simplify`'s `code-simplifier:code-simplifier` dispatch no longer needs manual triage. Triage the remaining case against the dispatch that produced it before treating it as a finding.
```

- [ ] **Step 6: Verify the edited paragraph and the two template edits together**

```bash
grep -n "agent_type\|WRONG" plugin/skills/_shared/subagent-output-contract.md
```
Expected: the pre-existing `WRONG` match in "Re-prompt on violation" plus the two new ones from Step 3/Step 2, plus a new `agent_type` match from Step 5's rewritten paragraph.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/_shared/subagent-output-contract.md
git commit -m "Put the status-line negative example in the literal dispatch template; document the agent_type exemption (#1596)"
```

---

### Task 3: Update the materialized spec's Acceptance Criteria note (documentation only, no code)

**Files:**
- Modify: `.claude-tweaks/pipelines/2026-09-05T174526-record-1596/work/1596-spec.md` (append-only, under a new `## Blocked / Future Work` section — this file is committed audit trail per `flow/materialize.md`, never rewritten wholesale)

**Interfaces:** none (prose only).

- [ ] **Step 1: Append a Blocked / Future Work section**

Append to the end of the file:

```markdown

## Blocked / Future Work

The Deliverables' second bullet ("Consider whether `friction-events.js`'s existing
`contract-violation` detection could be surfaced back to the dispatching agent in-run") and a
stronger mechanical-enforcement option (forcing a violating subagent to retry via the
`SubagentStop` hook's own decision-control output, if `permissionDecision`/`permissionDecisionReason`
is genuinely supported for that event — unconfirmed this run, two lookups disagreed) are not
implemented here. This build ships the two changes that don't depend on unverified hook-platform
behavior: an `agent_type`-based exemption fix to the existing detector (removing a real
false-positive source), and moving the contract's negative example into the literal dispatch
template every subagent's own prompt now carries. Filed as a follow-up rather than guessed at.
```

- [ ] **Step 2: Commit**

```bash
git add ".claude-tweaks/pipelines/2026-09-05T174526-record-1596/work/1596-spec.md"
git commit -m "Note deferred in-run enforcement follow-up on the materialized spec (#1596)"
```

---

### Task 4: File the deferred follow-up as a fresh backlog record

Not a code task — run `/claude-tweaks:capture` (or, if this build is running standalone without that skill available, skip and note it in the handoff) with a spec-shaped body:

- **Current State:** #1596 (this record) shipped an `agent_type` exemption fix and a strengthened dispatch template, but did not implement forcing a violating subagent to retry in-run via the `SubagentStop` hook's own decision-control output — whether `SubagentStop`'s JSON output actually supports `permissionDecision: "block"` / `permissionDecisionReason` (the way `Stop` documented does) was not confirmed within this build's investigation budget; two lookups against Claude Code's own hooks reference disagreed.
- **Deliverables:** resolve the platform-support question definitively (a live probe: dispatch one throwaway Task subagent whose reply is deliberately malformed, have `subagent-stop.js` attempt the `permissionDecision: block` response, and confirm from the subagent's own transcript whether it was actually forced to continue rather than stopping) before implementing the forced-retry mechanism either way.
- **Acceptance Criteria:** a definitive, sourced answer to "does `SubagentStop` support blocking," plus (if yes) an implementation with a one-retry cap per `(session_id, agent_id)`, mirroring `resolve-profile.js`'s session-scoped model-failure-blacklist convention (`${os.tmpdir()}/ct-contract-retries-${sessionId}.json`) to avoid an infinite retry loop.

---

## Self-Review Notes

**Spec coverage:** Deliverables bullet 1 ("strengthen the contract's own prompt language" branch) → Task 2. Deliverables bullet 1 ("mechanical check the dispatcher is instructed to run" branch) → Task 1's exemption check is a mechanical check the *detector* now runs (not the dispatcher, which the record's own wording left open — "either... or" was satisfied by the safer of the two). Deliverables bullet 2 ("surfacing back to the dispatching agent in-run") → explicitly deferred, Task 4. Acceptance Criteria 1 ("zero unremediated contract-violation events, OR every violation triggers an actual re-prompt") → Task 1 reduces false-positive `contract-violation` events to zero for third-party agents (the "zero unremediated events" half, for that whole class of prior false positives); the "every violation triggers an actual re-prompt" half is not fully closed by this plan for a genuine claude-tweaks-governed violation — Task 2's strengthened template is a prevention measure (fewer violations at the source), not a guaranteed after-the-fact re-prompt, and that gap is exactly what Task 4 exists to close once the platform question is resolved. This is a deliberate partial-completion, stated here rather than silently claimed as done.

**Placeholder scan:** no `TBD`/`TODO` in any task; every step's code/prose is the actual content to write.

**Type consistency:** `isExemptAgentType` is the one new function name — used identically in the exported test and the `run()` call site.
