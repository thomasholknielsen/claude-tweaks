# Help — Policy Mode

The standing answer to "how is this project configured, and what should I change?" — run by `/claude-tweaks:help` on the `policy` argument. Lazy-loaded from `SKILL.md`.

## Gather

Run once, at the start of the mode, and hold the results for the rest of this run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --all
```

Returns the full config JSON — one entry per key: `{value, source, summary, category, tier, type, default}`.

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.argv[1])))" "$(git rev-parse --show-toplevel)"
```

Returns `{unrecognizedKeys, invalidValues, migratableKeys, renamedKeys}`.

**The `--all` snapshot is held for the whole mode run.** Every render below reads from this one snapshot, never a re-run. The apply path's revert (`## Next Actions` below) reads a key's prior value from THIS snapshot too — never by re-reading `.claude-tweaks/policy.yml` after a write, since a write may have already landed other keys' lines by the time a revert is needed.

Section 3 below argues from three probes, run once here alongside the two calls above. Each carries its own skip-on-absence rule — a failing probe or absent `gh` means that probe's judgment is skipped for this run, not retried, not substituted:

- `git remote -v` — forge presence, argues against an unset `integration-model`.
- `gh issue list --label auto:build --state open --limit 1 --json number` — standing grants, argues against the `autonomy` ceiling. Skip if `gh` is absent or the call fails.
- `ls .claude-tweaks/pipelines/` — recent pipeline activity, argues against `project.maturity`. Empty or missing directory is a valid "no activity" result, not a failure.

This three-probe list is the v1 signal set. Extending it is a prose edit to this file's Section 3 below — no schema change, no new-issue ceremony.

## Render contract

The four numbered sections below — their headings, order, and data sources — are the stable surface `skills/init/policy-review.md` consumes (#536); changing any of them requires updating that citation in the same change.

### 1. Set levers

Only keys with `source ≠ default`, grouped by `category` (render only categories that have at least one such key). A fully-default config renders the single line `No levers diverge from defaults.` instead of any table.

Row form, one per key, all values verbatim from the `--all` snapshot:

```
`{key}` — {value} ({source}) · default: {default}
```

**`integration-model` special case:** when it appears in this section (i.e. `source: policy`, someone set it explicitly), its default cell renders `computed (forge detection)` instead of the schema's literal `default` — the real default is `detectIntegrationModel()`'s forge-detection result, not a static value.

### 2. Issues

From the held `auditPolicy()` result:

- **`invalidValues`** — each entry, with the schema default the value silently degrades to (the entry's own `expected.default`).
- **`unrecognizedKeys`** — each key name.
- **`migratableKeys`** — each entry, with its remedy from `alsoInPolicy`: `false` → "move it to policy.yml", `true` → "delete the dead CLAUDE.md copy".
- **`renamedKeys`** — each entry, with its `replacedBy` and `suggestedValue`.

When ALL four lists are empty, render exactly one line: `Policy config issues: none` — never silently skipped. Otherwise render each non-empty list (omit only the empty ones).

### 3. Notable defaults

Core-tier keys still on `source: default` where an available probe signal (Gather, above) argues otherwise. Advanced-tier keys are never "notable" — this section is core-tier only.

One line per finding: lever + proposed value + why. For example: an unset `integration-model` plus a GitHub remote → propose `pr-first`; `autonomy: supervised` plus standing `auto:*` grants → propose reviewing the ceiling; `project.maturity: greenfield` plus a populated pipelines directory → propose a later stage.

Each finding's summary text comes from the key's own `summary` field in the snapshot — never re-derived or paraphrased.

Zero available signals (every probe skipped or none argued against a default) → render `No notable defaults — no project signals available.` — never silently skipped.

### 4. Advanced tier

One collapsed line, `{N}` computed from the snapshot at render time:

```
{N} advanced levers on defaults — say "show advanced" to expand.
```

On the user saying "show advanced": render the advanced-tier keys still on `source: default`, grouped by `category`, in-conversation, no new `AskUserQuestion`:

```
`{key}` — {value} ({source}) — {summary}
```

## Next Actions (apply path)

**#537 pre-check fallback (run BEFORE offering apply options at all):** check the held snapshot's `worktree.always` value and the session's checkout:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
```

When `worktree.always` is `true` AND the two paths are equal (a main checkout, not a linked worktree), the write path is gate-denied — this is a pre-check, not a try/catch around a failed write. In that case, skip the `AskUserQuestion` below entirely and instead render each of section 3's recommendations as a paste-ready command:

```bash
printf '%s\n' "{key}: {value}" >> .claude-tweaks/policy.yml
```

This fallback's removal condition is #537 — once that lands, re-check whether the gate still blocks a main-checkout write before keeping this branch.

**Otherwise**, the mode's ONE `AskUserQuestion` call (`multiSelect: true`):

- Options: the top recommended edits from section 3, **capped at 3**, ranked in section 3's own listing order (core-tier severity first), plus a "No changes" option.
- Each option's `description` carries the exact `key: value` line that would be written. For an enum key, also list every legal value — read live from `POLICY_KEYS` in `bin/lib/policy-schema.js` (the pinned source of truth; never a hardcoded list in this file or the rendered option).
- Recommendations beyond the cap of 3 are never dropped — they stay visible in section 3's rendered list, tagged with an "ask to apply" note.
- "Show advanced" is section 4's own in-conversation affordance, not an option here — it never appears in this question.

**Apply semantics**, once options are approved:

1. Per key, in the user's selection order: validate the approved value before writing its line to `.claude-tweaks/policy.yml`.

   ```bash
   node -e "const {resolveValue}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(resolveValue(process.argv[1], process.argv[2])))" "{key}" "{raw-value}"
   ```

   `resolveValue` coerces silently to the schema default on an invalid value — parse the output and compare its parsed value against `{raw-value}`: a mismatch means the value was rejected. (JSON.stringify quotes string/enum values while booleans/integers are unquoted, so parse before comparing.) A rejected key is reported (key + rejected value) and its line is never written; continue validating and writing the rest of the batch.

2. After the whole batch has been written: re-run the exact `auditPolicy()` call from Gather, ONCE. Any issue that is NEW relative to the Gather-time snapshot names the offending key, reverts that key's line in `.claude-tweaks/policy.yml` to its prior value **from the Gather snapshot** (never by re-reading the file), and reports the revert. No edit is described as confirmed to the user until this re-audit comes back clean.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|---------------|
| Restating a default value in prose instead of rendering the `--all` snapshot | The snapshot is the ground truth; a hand-typed default drifts from the schema silently. |
| Re-reading `policy.yml` to discover a key's prior value after writing | The apply path may have already written other keys' lines; only the Gather-time snapshot holds the true "before" state for revert. |
| Offering apply options without running the #537 pre-check first | A main-checkout write under `worktree.always: true` is gate-denied — presenting options that will fail wastes the user's selection. |
| Hardcoding an enum's legal value list in an option description | `POLICY_KEYS` is the pinned source; a hardcoded copy goes stale the moment a value is added or removed there. |
| Adding a second `AskUserQuestion` call anywhere in this mode | The mode has exactly one — the capped Next Actions call; "show advanced" and the #537 fallback are both in-conversation renders, not questions. |
