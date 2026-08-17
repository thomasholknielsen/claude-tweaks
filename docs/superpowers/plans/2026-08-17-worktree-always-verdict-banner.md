# Plan: restate `worktree.always`'s removal condition against the running build, add a session-start verdict banner (#682)

## Problem

`skills/_shared/policy-deprecations.md`'s `worktree.always` entry and ADR 0014 both say
the transitional twin can be deleted once the **installed** build's `plugin.json`
version clears the #602 release. `claude plugin update` moves the install pointer
immediately but the *running* session keeps whatever build it started with
(`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` is the running build — the same
rule `[IL-89]` already states for version fields elsewhere). In the incident session,
`claude plugin update` ran mid-session, the twin line was deleted (satisfying the
literal "installed build" wording), and the *running* 6.87.0 hook — which only reads
the old `worktree.always` spelling — silently resolved the gate OFF. A `git push
origin main` from the shared checkout then succeeded, and the session mis-attributed
the success to the #537 commit allowlist (which explicitly never covers `push`).

Two independent things are wrong: the removal condition is worded against the wrong
build, and nothing tells the operator what the gate actually resolved to before they
act on that (wrong) belief.

## Reference: this repo's own bug class

Per project memory `silent-fallback-masks-bugs` and this record's own Gotchas: "this
defect class *is* two readers disagreeing" — do not add a second `policy.yml` parser
to `session-start.js`. There must be exactly one resolver
(`bin/lib/policy.js`) and both the enforcement gate and the announcement banner call it.

## Task 1 — `bin/lib/policy.js`: expose the resolver, keep `isWorktreeAlwaysOn` a thin wrapper

Read the current file in full first (it's short, ~86 lines) — `rawValue(parsed, key)`
already does the alias-aware lookup `isWorktreeAlwaysOn` uses; `RENAMED_KEYS` (from
`./policy-schema`) has one entry `{ key: 'worktree.always', replacedBy:
'worktree-always', migrate: (value) => value }`.

Add:

```js
// { on: boolean, matchedKey: 'worktree-always' | 'worktree.always' | null } — the
// same alias-aware lookup isWorktreeAlwaysOn already did, now exposing WHICH key
// resolved it. session-start.js's verdict banner and this gate must never disagree,
// so both call this — see docs/incident-log.md IL-133.
function resolveWorktreeAlways(repoRoot) {
  const parsed = parsePolicy(repoRoot);
  if (Object.prototype.hasOwnProperty.call(parsed, 'worktree-always')) {
    return { on: parsed['worktree-always'] === 'true', matchedKey: 'worktree-always' };
  }
  const alias = RENAMED_KEYS.find((entry) => entry.replacedBy === 'worktree-always');
  if (alias && Object.prototype.hasOwnProperty.call(parsed, alias.key)) {
    return { on: alias.migrate(parsed[alias.key]) === 'true', matchedKey: alias.key };
  }
  return { on: false, matchedKey: null };
}

function isWorktreeAlwaysOn(repoRoot) {
  return resolveWorktreeAlways(repoRoot).on;
}
```

Replace the existing `isWorktreeAlwaysOn` body with the one-line wrapper above.
Confirmed by grep (`rawValue` appears nowhere else in this file or its callers):
`rawValue` was `isWorktreeAlwaysOn`'s only caller — delete `rawValue` too, its logic
now lives inline in `resolveWorktreeAlways`. Leaving it in place would be dead code
this repo's own conventions don't tolerate (CLAUDE.md: delete unused code rather than
leave a renamed/orphaned shim). Its explanatory comment block (lines ~27-39) documenting
the alias precedence rule should move to `resolveWorktreeAlways` — that rationale
(new NAME wins whenever present, old name contributes only when new is absent,
identity-migration assumption) still applies and a future reader needs it there, not
nowhere.

Export `resolveWorktreeAlways` alongside the existing three exports.

**Do not touch `pre-tool-use.js`** — it already calls `isWorktreeAlwaysOn`, which keeps
working identically through the new thin wrapper. No caller-side change needed there.

## Task 2 — `bin/lib/hooks/session-start.js`: the verdict banner

Read the file's existing last `try { ... } catch { /* best-effort */ }` block (the one
containing `wtDetect.findPolicyFile` / `policy.isWorktreeAlwaysOn` / the worktree-setup
nudge). Extend it — do not add a new top-level try block, reuse this one so the
`repoInfo` git-fork happens once, not twice:

```js
try {
  if (wtDetect.findPolicyFile(ctx.cwd)) {
    const { repoRoot, isLinkedWorktree } = wtDetect.repoInfo(ctx.cwd);
    if (repoRoot) {
      const { on, matchedKey } = policy.resolveWorktreeAlways(repoRoot);
      parts.push(
        `claude-tweaks: worktree-always: ${on ? 'ON' : 'OFF'} (${matchedKey ? `matched key: ${matchedKey}` : 'no key'})`,
      );
      if (on && !isLinkedWorktree) {
        parts.push(
          'claude-tweaks: this project requires an isolated worktree for all work ' +
            '(policy: worktree-always in .claude-tweaks/policy.yml). Before making any edits, ' +
            'invoke /superpowers:using-git-worktrees to set one up, then follow ' +
            "`_shared/worktree-setup.md`'s post-creation catch-up before any other action.",
        );
      }
    }
  }
} catch { /* best-effort */ }
```

The verdict line is unconditional (ON or OFF, printed whenever a policy file was
found and `repoRoot` resolved) — it is NOT gated on `isLinkedWorktree` the way the
existing nudge is. Silent (no line at all) when `wtDetect.findPolicyFile` finds
nothing, matching the existing fast-reject comment already in this block ("if no
policy.yml exists anywhere in the ancestor chain, skip forking git entirely"). A
throw anywhere in this block (malformed file, fs error) falls through to the
existing `catch { /* best-effort */ }` — no line, no crash — this is the "never break
a session" invariant Task 4's malformed-file test case pins.

**Verify no second parse was introduced**: `grep -n "policy\." bin/lib/hooks/session-start.js`
after your edit should show only `policy.resolveWorktreeAlways` (this block) — no
`fs.readFileSync(... 'policy.yml' ...)` or similar direct read anywhere in this file.

## Task 3 — Prose: `policy-deprecations.md`, ADR 0014, `docs/incident-log.md`, `docs/hooks.md`

**`skills/_shared/policy-deprecations.md`** — the `worktree.always` entry (grep
`## \`worktree.always\`` to find it), specifically its "Removal condition" line
(currently: "...which happens once the installed build's `plugin.json` version is at
or above the release that shipped #602"). Replace "installed build's `plugin.json`
version" with "the **running** build's `plugin.json` version
(`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`)", and add: the twin must be
deleted in a **fresh session** started on a build at or above that release — never
mid-session after `claude plugin update`, since the running session keeps whatever
build it started with regardless of where the install pointer moves. Cite the new
`docs/incident-log.md` entry (Task 3 below assigns its number) by tag.

Do not touch the entry's shared-predicate paragraph (line 5, "Every entry shares one
predicate form...") — the record's own Technical Approach explicitly calls this out as
unchanged; every other entry cites it and a rewording there is out of scope.

**`docs/decisions/0014-hook-read-key-renames-carry-a-transitional-twin.md`** — line 17
(grep `installed build's`) carries the same wrong wording; apply the identical fix
(running build + fresh session + cite the new IL tag).

**`docs/incident-log.md`** — append a new entry. The file's current last entry is
`## IL-132`; this is `## IL-133`. Title in the file's existing style (a compressed
causal clause, not a restatement of the record title):

```
## IL-133 — A transitional twin's removal condition was keyed on the installed build, so `claude plugin update` mid-session let its deletion silently disable a push-time gate
```

Body: 2-3 paragraphs in the file's established style (see `## IL-132` immediately
above for the shape: what happened with dates/commits where known, why every existing
check missed it, the generalizable rule). Source the narrative from this record's own
"Original request" section (Repro steps, Expected vs. actual) verbatim where useful —
don't re-invent the incident's facts. Name: the session that hit this, what actually
happened (twin deleted, gate silently OFF, push succeeded, wrong attribution to the
#537 allowlist), and the generalizable rule (a hook-read policy key's removal
condition must always be phrased against the *running* build, since `claude plugin
update` only moves an install pointer — the pattern applies to any future transitional
twin, not just this one).

**`docs/hooks.md`** — find wherever this file documents `session-start.js`'s tiered
try/catch posture or its `additionalContext` outputs (grep `session-start` or
`worktree-always`), add one line/bullet documenting the new verdict-banner line and
its silent-on-absence / silent-on-malformed behavior.

## Task 4 — `tests/hooks-session-start.test.js`

Read the existing file first (it already tests this hook — find the existing
worktree-always nudge tests to place the new ones near them, and to copy its fixture
conventions: how a fake `ctx`/temp `policy.yml`/temp repo root gets constructed).

**Fix a real regression this change causes in an EXISTING test, before adding any new
ones.** `'worktree-always nudge is absent when the session is already inside a linked
worktree'` (grep for that exact test name) calls `withPolicy(project, 'worktree-always:
true\n')` then asserts `assert.doesNotMatch(additionalContext, /worktree-always/)`. Once
Task 2 lands, the verdict banner fires unconditionally whenever a policy file exists —
including inside a linked worktree, where only the *nudge* (not the banner) is
suppressed — so `additionalContext` now legitimately contains the substring
`worktree-always` (from the verdict line itself) even though the nudge is correctly
absent. Update this test's assertion: keep proving the *nudge* text is absent (match on
something nudge-specific, e.g. `/using-git-worktrees/` or `/requires an isolated
worktree/`, via `doesNotMatch`), and add a new positive assertion that the verdict line
IS present and reads `ON (matched key: worktree-always)` (the policy is genuinely on;
only the nudge is suppressed by `isLinkedWorktree`). Do not weaken the test by just
deleting the `doesNotMatch` line — replace it with the more specific one.

The other existing test using this pattern, `'worktree-always nudge is absent when
policy is off'`, creates no `policy.yml` at all (no `withPolicy` call), so
`wtDetect.findPolicyFile` finds nothing and no verdict line fires either — that one
needs no change, confirm this by reading it rather than assuming.

Add the six fixture cases from the spec's Deliverables, each asserting the exact
`additionalContext` line text (not just "contains ON" — match the literal format from
Task 2):

1. Old key only (`worktree.always: true`) → line reads `...ON (matched key: worktree.always)`.
2. New key only (`worktree-always: true`) → line reads `...ON (matched key: worktree-always)`.
3. Both keys present → line reads `...ON (matched key: worktree-always)` (new wins,
   matching `resolveWorktreeAlways`'s precedence — same precedence
   `bin/resolve-policy.js`'s `resolvePolicyKeys` already documents for this class of
   alias).
4. Neither key present (policy.yml exists but has some other key, or is empty) →
   line reads `...OFF (no key)`.
5. No `policy.yml` anywhere in the ancestor chain → no verdict line in
   `additionalContext` at all (assert the string doesn't contain `worktree-always:`).
6. Malformed `policy.yml` (whatever `parseFlatLines`/`readPolicyFile` can't handle,
   or simulate a throw from `wtDetect.repoInfo`/`policy.resolveWorktreeAlways` if
   that's easier to construct) → no verdict line, and the hook does not throw
   (`run(ctx)` returns normally).

Also add a direct unit test for `bin/lib/policy.js`'s new `resolveWorktreeAlways`
export (old-key/new-key/both/neither → correct `{on, matchedKey}` pairs) — the
session-start tests above are integration-level; a direct unit test on the resolver
itself is cheaper to keep green as the file evolves. Put it in whichever test file
already covers `bin/lib/policy.js` (grep `isWorktreeAlwaysOn` across `tests/` to find
it) rather than creating a new file for one function.

## Acceptance mapping (materialized spec's 4 ACs)

1. Task 3 (`policy-deprecations.md` + ADR 0014 wording, both cite the new IL tag).
2. Task 2 (banner sourced from `policy.resolveWorktreeAlways`, one call site).
3. Task 4 (six fixture cases + malformed-file no-throw).
4. Task 3 (`docs/hooks.md` + `docs/incident-log.md`) + `npm test` at the end.

## Non-goals

- Do not re-add the `worktree.always` transitional-twin line to this repo's own
  `.claude-tweaks/policy.yml` — it was already deleted in the incident session, this
  repo's running build is long past #602's release by now (v6.89.0), and re-adding a
  stale twin is not what this record asks for; the record fixes the *documentation*
  of the removal condition and adds the *general* safety-net banner, for the benefit
  of every other project carrying a similar transitional twin in the future.
- Do not widen the #537 commit allowlist to cover `push` — the Gotchas note explicitly
  rules this out; the incident's push was legitimate (verified fast-forward, green
  CI), the defect is the gate resolving OFF unnoticed, not the allowlist's scope.
- No change to `pre-tool-use.js`'s own logic beyond the transparent benefit of
  `isWorktreeAlwaysOn` now being a thin wrapper over the shared resolver.
