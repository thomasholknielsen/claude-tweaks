# /help policy mode (record #534) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `policy` mode to `/claude-tweaks:help` — one gather pass (`--all` + `auditPolicy()`), a four-section render under an explicit "Render contract" heading, and a validated Next Actions apply path to `.claude-tweaks/policy.yml`.

**Architecture:** One new lazy-loaded mode file (`skills/help/policy.md`) owns everything; `SKILL.md`/`reference-card.md`/`plugin-structure.md` each get one row. Deterministic-data-first: sections 1/2/4 are pure transformations of `--all` + `auditPolicy` output; judgment lives only in section 3.

**Tech Stack:** Markdown skill prose; consumes #533's shipped `--all` (verified this run: `{value, source, summary, category, tier, type, default}` on all keys) and `auditPolicy(repoRoot)` (`{unrecognizedKeys, invalidValues, migratableKeys, renamedKeys}`).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T074746-spec-533-534-536/spec-534/work/534-spec.md`

## Global Constraints

- Read `docs/skill-authoring.md` before writing (mandatory for `skills/**` edits): `${CLAUDE_PLUGIN_ROOT}` is a model-resolved placeholder (keep that spelling in prose; never hardcode a path); `argument-hint` stays quoted; skill references in actionable text use the fully-qualified `/claude-tweaks:{skill}` form.
- Exactly ONE `AskUserQuestion` call in the whole mode (the Next Actions apply) — AC 6.
- Never restate a default, precedence rule, or lever count in prose — every value/source/default renders from `--all` output; "every lever", never a literal count.
- Carried rulings from #533's build (bind this mode's prose):
  - Enum option lists for apply-option descriptions are read from `POLICY_KEYS` in `bin/lib/policy-schema.js` (the same pinned source — reading it is not a restatement; hardcoding a list is).
  - `integration-model` has `default: null` in `--all` but always resolves (forge detection) — its default cell renders as `computed (forge detection)`, never "no default".
  - Three categories currently hold zero core keys — section 1 renders only categories that HAVE set levers, and section 4's collapsed count makes empty-category noise structurally impossible; state this in the mode file so the render never emits empty category headings.
- `auditPolicy` returns FOUR lists — the spec names three (`invalidValues`, `unrecognizedKeys`, `migratableKeys`); the shipped function also returns `renamedKeys` (deprecated-alias lines). Section 2 renders it as a fourth list when non-empty (expand-only over the spec — it is audit data a config-review surface must not hide), and the all-empty "none" line covers all four.
- New file `skills/help/policy.md` must stay well under the 40,960-byte sub-file ceiling (target < 12 KB — it is one mode, not a book). `skills/help/SKILL.md` is at 10,732 bytes — one table row + hint edit adds trivially; no ceiling risk.

---

### Task 1: Author `skills/help/policy.md`

**Files:**
- Create: `skills/help/policy.md`

**Interfaces:**
- Produces: the "Render contract" heading + four numbered sections #536 will cite by path.

- [ ] **Step 1: Write the mode file with exactly this structure**

Required headings and content (author the connecting prose; every structural element below is binding):

1. **Title + one-line purpose** (`# Help — Policy Mode`): the standing answer to "how is this project configured, and what should I change?".
2. **`## Gather`** — the exact invocations:
   - `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --all` → the full config JSON (each key: `{value, source, summary, category, tier, type, default}`).
   - `node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.argv[1])))" "$(git rev-parse --show-toplevel)"` → `{unrecognizedKeys, invalidValues, migratableKeys, renamedKeys}`.
   - A note that the snapshot from `--all` is held for the whole mode run — the apply path's revert reads prior values from THIS snapshot, never by re-reading the file after writing.
   - Section 3's three named probes, each with its skip-on-absence rule (probe fails or `gh` absent → that signal's judgment is skipped): `git remote -v` (forge presence vs unset `integration-model`); `gh issue list --label auto:build --state open --limit 1 --json number` (standing grants vs `autonomy`); `ls .claude-tweaks/pipelines/` (recent pipeline activity vs `project.maturity`). State: this signal list is the v1 set, extensible by editing this file's prose — no schema change, no new-issue ceremony.
3. **`## Render contract`** — open with the stability sentence: "The four numbered sections below — their headings, order, and data sources — are the stable surface `skills/init/policy-review.md` consumes (#536); changing any of them requires updating that citation in the same change." Then the four sections:
   - **`### 1. Set levers`** — only keys with `source ≠ default`, grouped by `category` (render only categories that have at least one such key; a fully-default config renders the single line "No levers diverge from defaults."). Row form: `` `{key}` — {value} ({source}) · default: {default} `` — with the `integration-model` special case: its default cell renders `computed (forge detection)`. All values verbatim from the `--all` snapshot.
   - **`### 2. Issues`** — from `auditPolicy()`: `invalidValues` (each with the schema default the value silently degrades to — the `expected` entry's `default`), `unrecognizedKeys`, `migratableKeys` (each with its `alsoInPolicy` remedy: false → "move it to policy.yml", true → "delete the dead CLAUDE.md copy"), and `renamedKeys` (each with its `replacedBy` + `suggestedValue`). When ALL lists are empty, render exactly one line — `Policy config issues: none` — never silently skipped; otherwise render each non-empty list.
   - **`### 3. Notable defaults`** — core-tier keys still on `source: default` where an available probe signal argues otherwise. One line per finding: lever + proposed value + why (e.g. unset `integration-model` + a GitHub remote → propose `pr-first`; `autonomy: supervised` + standing `auto:*` grants → propose reviewing the ceiling; `project.maturity: greenfield` + a populated pipelines dir → propose a later stage). Advanced-tier keys are never "notable". Zero available signals → render "No notable defaults — no project signals available." (never silence). Each finding's summary text comes from the key's own `summary` field in the snapshot — never re-derived.
   - **`### 4. Advanced tier`** — one collapsed line: `{N} advanced levers on defaults — say "show advanced" to expand.` ({N} computed from the snapshot at render time). On the user saying "show advanced": render the advanced-tier keys grouped by category with `` `{key}` — {value} ({source}) — {summary} `` rows, in-conversation, no new `AskUserQuestion`.
4. **`## Next Actions (apply path)`** — the mode's ONE `AskUserQuestion` call (`multiSelect: true`): options = the top recommended edits from section 3, **capped at 3**, ranked core-tier severity first (section 3's listing order), plus a "No changes" option; each option's `description` carries the exact `key: value` line that would be written and, for enum keys, the full value list read from `POLICY_KEYS` in `bin/lib/policy-schema.js` (the pinned source — never a hardcoded list). Recommendations beyond the cap stay visible in section 3's rendered list with an "ask to apply" note — never dropped. "Show advanced" is section 4's in-conversation affordance, never an option here. Then the apply semantics, verbatim requirements:
   - Per-key, in selection order: validate each approved value via `resolveValue(key, raw)` (a `node -e` one-liner against `bin/lib/policy-schema.js`) BEFORE writing its line to `.claude-tweaks/policy.yml`; a rejected value → report that key, continue the rest.
   - After the batch: ONE `auditPolicy()` re-run. Any NEW issue names the offending key, reverts that key's line to its prior value **from the gather snapshot**, and reports. No edit is described as confirmed until the re-audit is clean.
   - **#537 pre-check fallback** (before offering apply options at all): when the snapshot's `worktree.always` is `true` AND the session is in a main checkout (`git rev-parse --git-dir` equals `git rev-parse --git-common-dir`), the write path is gate-denied — render the recommendations as paste-ready `printf '%s\n' "{key}: {value}" >> .claude-tweaks/policy.yml`-style commands instead of the AskUserQuestion apply options. Pre-check, not try/catch. The fallback paragraph cites #537 as its removal condition.
5. **`## Anti-Patterns`** table (3-5 rows): restating a default in prose instead of rendering the snapshot; re-reading policy.yml to discover a prior value after writing; offering apply options without the #537 pre-check; hardcoding an enum's value list; adding a second `AskUserQuestion`.

- [ ] **Step 2: Verify**

Run: `wc -c skills/help/policy.md` → < 40950 (target < 12000)
Run: `grep -c "Render contract" skills/help/policy.md` → ≥ 1
Run: `grep -c "AskUserQuestion" skills/help/policy.md` → confirm every mention describes the single Next Actions call (manual read; AC 6)
Run: `grep -n "claude-tweaks:" skills/help/policy.md` → every skill reference in actionable text fully-qualified

- [ ] **Step 3: Commit**

```bash
git add skills/help/policy.md
git commit -m "Add /help policy mode file: gather, render contract, validated apply path — refs #534"
```

---

### Task 2: Wire the mode — SKILL.md row, reference-card row, plugin-structure row

**Files:**
- Modify: `skills/help/SKILL.md` (Input table + `argument-hint`)
- Modify: `skills/help/reference-card.md` (one argument row)
- Modify: `docs/plugin-structure.md` (help sub-file table row)

**Interfaces:**
- Consumes: Task 1's file name (`policy.md`).

- [ ] **Step 1: SKILL.md** — frontmatter `argument-hint` becomes `"[status|commands|policy|<topic>] [--budget <n>]"`. In the `## Input` table, insert this row between the `commands` row and the `*spec number or topic*` row (so it matches before the bare-topic fallthrough):

```markdown
| `policy` | Policy configuration review — skips Section 1's cheat sheet and Section 2's status scan; read `policy.md` in this skill's directory and follow it (gather, render contract, apply path) |
```

Also add the skip marker to sections 1 and 2's italic skip lines: Section 1's becomes *(Skip if `$ARGUMENTS` = `status` or `policy`)*; find Section 2's equivalent skip condition line and add `policy` the same way (read the file to get its exact current text first).

- [ ] **Step 2: reference-card.md** — find the arguments/utility table listing `/claude-tweaks:help` variants (read the file first; follow its existing row format) and add one row for `/claude-tweaks:help policy` — "Grouped policy-config review with audit issues, notable defaults, and validated apply".

- [ ] **Step 3: plugin-structure.md** — in the per-skill sub-file table's help rows, add `policy.md` — "Policy mode: gather, four-section render contract, validated apply path" (follow the exact format of the neighboring help sub-file rows — read them first).

- [ ] **Step 4: Verify**

Run: `grep -c "policy" skills/help/SKILL.md` → ≥ 3 (hint + row + skip lines)
Run: `grep -c "policy.md" docs/plugin-structure.md` → 1
Run: `wc -c skills/help/SKILL.md` → < 40950

- [ ] **Step 5: Commit**

```bash
git add skills/help/SKILL.md skills/help/reference-card.md docs/plugin-structure.md
git commit -m "Wire /help policy mode: Input row, argument hint, reference card, structure table — refs #534"
```

---

### Task 3: Verification sweep

- [ ] **Step 1: AC greps** (each expected non-zero unless stated):
- `grep -c "Render contract" skills/help/policy.md` → 1+ (AC 1)
- `grep -n "policy" skills/help/SKILL.md` — row present before the topic row, hint updated (AC 2, manual read)
- `grep -c "#537" skills/help/policy.md` → ≥ 1 (fallback + removal condition)
- `grep -c "Policy config issues: none" skills/help/policy.md` → 1 (AC 4)

- [ ] **Step 2: Full suite (central — the controller runs it; note here for the record)** — `npm test` must pass (AC 7).
