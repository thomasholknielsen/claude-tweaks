# Routine Indirection Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the documentation and cross-reference surfaces for the routine-prompt-indirection change (#528/#529) — skill-graph edges verified against the merged tree, plugin-structure rows, routine SKILL.md anti-pattern rewrite, CLAUDE.md Cloud-parity phrase — and run the retired-vocabulary negative sweep with posted evidence.

**Architecture:** Docs-only; the tree is authoritative over the spec's expectations ("where they disagree, the tree wins"). #528 already landed minimal catalog entries (skill-graph section, reference-card row incl. `<skill> [args...]` Takes, context-flow row, getting-started mention) under a completeness-test ruling — Task 1 verifies/expands rather than creates. Step 0 pre-check already ran in-run (both prerequisites built on this same shared branch): `skills/routine-kickoff/SKILL.md` exists; `grep -l "^prompt:" skills/*/routine-template.yml` → no matches.

**Tech Stack:** Markdown; `find`+`xargs grep` sweep (never bare recursive grep — .gitignore masking); `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T062945-spec-276-528-529-530/spec-530/work/530-spec.md` (materialized record #530)

## Global Constraints

- Ceremony fast-lane. Every relationship stated once in `docs/skill-graph.md` — no reciprocal restatement in any SKILL.md; do not add routine-kickoff mentions into each health skill's section.
- CLAUDE.md edits stay short (rule + brief why); keep the `[IL-117]` citation intact.
- `tests/bin-lib/skill-audit/anti-patterns.test.js` pins a corpus row count over `skills/*/SKILL.md` — row REWRITES keep the count stable; if any row is added or removed, re-derive the count by running the parser and append a provenance entry per that file's own convention. Either way, append a one-line changelog note for the rewritten-row narrative (the file's convention).
- Sweep with `find . -type f \( -name "*.md" -o -name "*.js" -o -name "*.yml" \) | xargs grep` from the worktree root, excluding by justification (never silently): `.git/`, `node_modules/`, `.claude-tweaks/pipelines/` (run-dir/spec artifacts are historical records — includes this run's own materialized specs), `docs/incident-log.md` + `docs/donts.md` (historical citations, never reworded), `.superpowers/` (gitignored SDD scratch, deleted at wrap-up), `docs/superpowers/plans/` (this run's executed plans — deleted/archived at wrap-up cleanup; justify per hit). One positive control per token before trusting any zero.
- Sweep facts already established in-run (verify, don't re-derive blindly): `RESOLVED_PROMPT` **survives** as the assembly variable by design (per #529 Task 2's report) — it is NOT a retired token; `{{TARGET_BRANCH}}` legitimately survives in schema/create-and-update/status/SKILL.md/guided-creation/integration-branch as substitution mechanics and about-references.
- Commits: `{Verb} {what} — {detail}`, `refs #530`.

---

### Task 1: Cross-reference surfaces (skill-graph, plugin-structure, routine SKILL.md, CLAUDE.md)

**Files:**
- Modify: `docs/skill-graph.md` (`## routine-kickoff` section + `## routine` section preamble-era edges)
- Modify: `docs/plugin-structure.md` (directory-tree/table rows)
- Modify: `skills/routine/SKILL.md` (Anti-Patterns rows ~109-111 + any preamble-era phrasing elsewhere in the file)
- Modify: `CLAUDE.md` (Cloud parity phrase)
- Possibly modify: `tests/bin-lib/skill-audit/anti-patterns.test.js` (provenance note; count re-derive only if row count changes)

**Interfaces:**
- Consumes: the merged tree's actual content — read `skills/routine-kickoff/SKILL.md` and `skills/_shared/routine-template-schema.md`'s kernel section IN FULL before writing any edge; derive edges from what they say.

- [ ] **Step 1: docs/skill-graph.md**

Rewrite the `## routine-kickoff` section (currently #528's minimal placeholder with an "(inert at landing)" row) to real edges derived from the merged implementation. Expected shape (verify each against the files — the tree wins):

```markdown
## routine-kickoff

| Target | Relationship |
|---|---|
| every routine kernel | Invoked by the kernel's closing line (`Then: /claude-tweaks:routine-kickoff {kickoff}`) assembled by `/routine` from `skills/_shared/routine-template-schema.md`'s Standard prompt kernel — the only intended caller; the kernel's frozen-catalog fallback also reads this SKILL.md as raw prose |
| each routine-backed skill | Step 4 composes `/claude-tweaks:{first-token}` from the kickoff args and invokes it via the Skill tool; manual-execution fallback excluded for `dispatch`/`tidy` (work-claiming/deleting skills) |
| `bin/hooks.js reconcile` | Step 3 runs reconcile best-effort before the target invocation (pr-first: full convergence; local-merge: worktree reap only) |
```

Then update the `## routine` section's edges wherever they name the preamble mechanism (e.g. any "standard prompt preamble" wording → the kernel + kickoff assembly), verifying each edge's claim against the tree.

- [ ] **Step 2: docs/plugin-structure.md**

Add the `skills/routine-kickoff/` row to the skill table/tree (mark machine-invoked) and `tests/routine-kickoff.test.js` wherever sibling test files are listed. Read the file's structure first and match its format. Also check its routine-template description (if any) still matches the kickoff-field reality; fix if it names the prompt field.

- [ ] **Step 3: skills/routine/SKILL.md**

1. Rewrite the Anti-Patterns row "Editing the canonical preamble in `_shared/routine-template-schema.md` and treating the suite's green as confirmation" (~line 111, which also says "six templates" — wrong twice over: mechanism removed, count wrong) to the surviving hazard: a kernel edit without a `kernel_version` bump, or a template-field edit without a `template_version` bump — both review-discipline, per the schema's own prose; the suite pins presence/shape, never increments. Count templates at execution time (currently 7) or avoid a literal count per the cardinality rule.
2. Check the adjacent row (~line 110, "frozen copy of the old prompt") and any other preamble-era phrasing in the file; update wording to the kernel/kickoff reality while keeping each row's hazard true.
3. Do NOT add a routine-kickoff relationship into this file (skill-graph owns edges).

- [ ] **Step 4: CLAUDE.md**

In `## Cloud parity`, the phrase "the routine prompt preamble's self-heal fallback (#260)" → "the routine kernel's self-heal fallback (#260)" (the self-heal lives in the kernel after #529). Keep `[IL-117]` and the sentence's rule+why shape; touch nothing else.

- [ ] **Step 5: Verify + commit**

`node --test tests/bin-lib/skill-audit/anti-patterns.test.js tests/skill-catalog-completeness.test.js tests/research/cross-refs.test.js tests/routine-kickoff.test.js` — green (re-derive the anti-patterns count with provenance if it moved).

```bash
git add docs/skill-graph.md docs/plugin-structure.md skills/routine/SKILL.md CLAUDE.md
git commit -m "Close routine-indirection cross-reference surfaces — skill-graph edges, plugin-structure, anti-pattern rewrite, Cloud-parity phrase (refs #530)"
```

(add `tests/bin-lib/skill-audit/anti-patterns.test.js` to the stage list if touched)

---

### Task 2: Negative sweep + survivor fixes

**Files:**
- Possibly modify: any live file carrying a genuinely retired token (known candidates from #529's final review: `skills/init/bootstrap/step-14-cloud-routine-parity.md:226` — a now-dangling "standard preamble" section reference — and `:244` "prompt preamble" phrase; `tests/routine-template-parser.test.js` fixture comments using `prompt: >` wording, which stay but get an intent comment)
- Create: `.superpowers/sdd/2026-08-16-record-530-routine-indirection-docs/sweep-evidence.md` (the evidence file the closing comment is built from)

**Interfaces:**
- Consumes: Task 1's finished surfaces (sweep runs after them).

- [ ] **Step 1: Derive the token list**

Seed: `standard prompt preamble`, `prompt preamble`, `template.prompt`, `` prompt` field `` (template context), `canonical preamble`. Then read the merged `skills/routine/create-and-update.md` and `skills/routine/fleet.md` to derive the rest: confirm `RESOLVED_PROMPT` survives as the live assembly variable (NOT retired — record that determination in the evidence file); add any other retired phrase you find (e.g. "Standard prompt preamble" as a section name). If the merged files can't be located or vocabulary is ambiguous, STOP and report rather than sweeping a guessed list.

- [ ] **Step 2: Sweep**

Per token: `find . -type f \( -name "*.md" -o -name "*.js" -o -name "*.yml" \) -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.claude-tweaks/*" -not -path "./.superpowers/*" | xargs grep -l -i -- "TOKEN"` (case-insensitive, content-anchored; adjust per token). Record before-count. For each hit: fix it (retired vocabulary in live instruction/reference text), or justify it (excluded-by-purpose paths: docs/incident-log.md, docs/donts.md historical citations; docs/superpowers/plans/* this run's executed plans, deleted at wrap-up; deliberate historical fixture comments — add the intent comment to tests/routine-template-parser.test.js's fixtures noting the `prompt: >` wording is deliberately historical parser input). Then re-run for the after-count (0, or each survivor justified). One positive control per token (e.g. grep the token against a file known to contain it, such as the archived spec copy under .claude-tweaks/pipelines/ — command + hit shown) before trusting any zero.

- [ ] **Step 3: Evidence file**

Write `.superpowers/sdd/2026-08-16-record-530-routine-indirection-docs/sweep-evidence.md`: per token — the exact command, before count, after count, each survivor's path + justification; plus the RESOLVED_PROMPT not-retired determination and the token-derivation notes.

- [ ] **Step 4: Verify + commit**

`npm test > /tmp/530-sweep.log 2>&1` → `# fail 0` (grep the tail).

```bash
git add -A -- skills/ tests/ docs/
git status --short   # confirm only intended files staged; unstage anything unexpected
git commit -m "Sweep retired preamble vocabulary — fix live references, justify historical survivors (refs #530)"
```

(Skip the commit if the sweep changed nothing — evidence file is gitignored scratch.)
