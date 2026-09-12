# Fact-Pack "The Shape" Drift Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix an overclaiming statement in `.claude/skills/run-directory-fact-packs/SKILL.md` so it accurately describes the `--only <probe,...>` flag as `wrap-up-pack.js`/`pack.js`-only, not shared by `flow-preflight.js`.

**Architecture:** Single-file prose edit — two sentences in one markdown skill file. No code changes, no tests.

**Tech Stack:** Markdown.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T221724-record-2056/work/2056-spec.md` (materialized from GitHub issue #2056)

## Global Constraints

- Single-file, prose-only change — no behavioral/code edits.
- Preserve the file's existing voice and formatting conventions (bold lead-ins on bullets, em-dash asides).

---

### Task 1: Scope the `--only` bullet and soften the "agree on every rule below" claim

**Files:**
- Modify: `.claude/skills/run-directory-fact-packs/SKILL.md` (intro paragraph, ~line 12; "The shape" section's `--only` bullet, ~line 35)

**Interfaces:**
- Consumes: nothing (prose-only)
- Produces: nothing (prose-only)

**Verified against current HEAD (2026-09-11):**
- `plugin/bin/wrap-up-pack.js`'s `USAGE` is `'usage: wrap-up-pack.js --run <dir> [--json <path>] [--only <probe,...>]'`.
- `plugin/bin/lib/wrap-up/pack.js`'s `gatherPack` filters `PROBE_NAMES` by an `only` param.
- `plugin/bin/flow-preflight.js`'s `USAGE` is `'usage: flow-preflight.js --run <dir> --steps <a,b,c> [--json <path>]'` — no `--only`.
- `plugin/bin/lib/flow/preflight.js`'s `gatherPreflight` builds `probes` and runs `Promise.all(names.map(...))` over **every** key of `probes` unconditionally — `steps` is recorded into the output pack's `steps` field only, never used to filter which probes run.

- [ ] **Step 1: Edit the intro paragraph**

In `.claude/skills/run-directory-fact-packs/SKILL.md`, find this sentence (currently the last sentence of the intro paragraph, right before "Read both before writing a third."):

```
Two are shipped — `plugin/bin/lib/wrap-up/pack.js` + `plugin/bin/wrap-up-pack.js`
(wrap-up Phases 3-4, eight probes) and `plugin/bin/lib/flow/preflight.js` +
`plugin/bin/flow-preflight.js` (`/flow`'s second call) — and they agree on every rule below.
Read both before writing a third.
```

Replace the "and they agree..." sentence with a softened claim that names the one exception:

```
Two are shipped — `plugin/bin/lib/wrap-up/pack.js` + `plugin/bin/wrap-up-pack.js`
(wrap-up Phases 3-4, eight probes) and `plugin/bin/lib/flow/preflight.js` +
`plugin/bin/flow-preflight.js` (`/flow`'s second call) — and they agree on every rule below
except selective-probe filtering (see the `--only` bullet).
Read both before writing a third.
```

- [ ] **Step 2: Edit the `--only` bullet in "The shape" section**

Find this bullet:

```
- **`--only <probe,...>`** so a consumer that needs one field does not pay for eight.
```

Replace it with a version scoped to the two CLIs that actually implement it:

```
- **`--only <probe,...>`** so a consumer that needs one field does not pay for eight —
  `wrap-up-pack.js`/`pack.js` only; `flow-preflight.js` has no `--only` flag, and
  `flow/preflight.js`'s `gatherPreflight` computes every probe unconditionally regardless of
  `--steps` (its own parse-error text calls `--steps` "metadata — every field is computed
  regardless"), since `/flow`'s second call always needs the full set.
```

- [ ] **Step 3: Read the file back and confirm both edits landed correctly**

Run: `grep -n "agree on every rule below\|only <probe" .claude/skills/run-directory-fact-packs/SKILL.md`
Expected: the intro line now reads "...agree on every rule below except selective-probe filtering (see the `--only` bullet)." and the `--only` bullet now includes the `wrap-up-pack.js`/`pack.js`-only scoping text.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/run-directory-fact-packs/SKILL.md
git commit -m "Fix run-directory-fact-packs: scope --only claim to wrap-up-pack.js/pack.js

refs #2056"
```
