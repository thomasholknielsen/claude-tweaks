---
record: 599
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: design-critique-dispatch:decisions-pushback-routing-code-findings-feed-polish-as-cont
blocked-by: [598]
surface: backend
---
# 599: Decisions pushback routing — code findings feed polish as context, decisions findings staged for the Review Console

Surface: backend

## Overview

Route the two kinds of craft-critic findings the review-mode dispatch (#598) produces (`target: code` and `target: decisions`) to where each belongs, closing the critique → fix loop for code and giving `DESIGN.md` pushback a human-facing home without ever writing `DESIGN.md`:

- **`code`** findings enter the polish cache as `source: "craft-critic"` and are **inlined into polish's refinement-set dispatch prompts** as "known craft issues" — context alongside the design-craft principles polish already assembles. Never command selection, never staged. In a `/flow` run this makes critique → polish → re-verify fully automatic; the existing re-verify gate and one-cycle cap contain it exactly as they contain every polish edit.
- **`decisions`** findings **never** enter the polish cache. They are staged to `{run-dir}/staged/` as proposals whose `Remedy:` line names the upstream command, surface at the Wrap-Up Review Console, and render in standalone `/review`'s Design Quality section under a "Decisions" heading. `DESIGN.md` is upstream-owned; this plugin never writes it — the same never-`--fix` discipline `doctor` honors.

Build honors the decisions (writing dispatches keep `design-craft.md`'s authority rule unchanged); review challenges them; a human decides. Review-time only — no `/tidy`-time whole-`DESIGN.md` critique in this design.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No change to Step 3.8's dispatch, the findings template, or `craft_critics` (#598).
- No new command mapping — a `craft-critic` finding never selects an Impeccable command; polish's suggestion-driven dispatch stays keyed on `audit` findings' `suggestion` field only.
- No `/tidy` `doctor` change; no whole-`DESIGN.md` critique.
- No writes to `DESIGN.md`, the sidecar, or any Impeccable artifact, under any condition.
- Standalone `/review` `decisions` findings are **intentionally non-persistent** — rendered in the summary and nowhere else. A human reading a standalone review acts on the `Remedy:` line or not; there is no run dir to stage into and no backlog record is auto-filed. Accepted tradeoff, not a gap.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #598 | Review-mode Step 3.8 critic dispatch + normalization + `craft_critics` | must land first — this record consumes the `source: "craft-critic"`, `provider` (including the reserved value `wrapper`), and `target` fields it introduces. #598 **drops** any row whose `Target` is not exactly `code`/`decisions`, so every `craft-critic` finding this record sees has one of the two values — no third state to handle |

## Current State

- `skills/design-wrapper/modes/review.md` Step 5 — writes the audit cache to `docs/plans/YYYY-MM-DD-{feature}-audit.json` (fallback `docs/plans/audit-{spec-slug}.json`), filter `source === "audit"`, with the explicit rule "never 'everything that isn't critique'." Cache shape `{spec, written_at, findings: [{id, source, file, category, severity, message, suggestion}]}`. The whole file is **overwritten** on each `review` invocation for the same spec.
- `skills/design-wrapper/modes/polish.md` — Step 3 reads the cache (staleness rule: older than the branch's latest commit → skip suggestion-driven); Step 4 refinement set (`polish`/`clarify`/`harden` + job-statement suffix), each command dispatched **once over the full resolved file list**; Step 5 suggestion-driven dispatch keyed on `suggestion`, with `kind: "manual-only"` and `kind: "unclassified"` staging into `staged_suggestions`; Output block documents `staged_suggestions` and `decision_summary` (one string per polish invocation). Its craft-context assembly for the refinement dispatch is cited from `design-craft.md` (via `skills/flow/polish-execution.md`).
- `skills/flow/polish-execution.md` — writes one `{run-dir}/staged/polish-suggestion-{n}.md` per `staged_suggestions` entry, branching on `kind`, plus a `STAGED` line per entry.
- `skills/review/SKILL.md` Step 6.5 + `skills/review/review-summary-template.md` "Design Quality" section — renders wrapper findings; `finish_review.keep` renders above the table; skip reason in footer.
- `skills/wrap-up/review-console.md` — reads every file under `staged/` generically.

## Deliverables

- [ ] `modes/review.md` Step 5: change the cache filter to `source === "audit" || (source === "craft-critic" && target === "code")` and keep the "never everything-that-isn't-critique" sentence; cached `craft-critic` entries carry `id: craft-{provider}-{n}` (1-based per provider, **reset on every cache write** — the file is overwritten per invocation), `provider`, `target: "code"`, `suggestion: null`. State explicitly that `target: "decisions"` entries are excluded from the cache and why.
- [ ] `modes/review.md` new **Step 5.5: Stage decisions findings** (runs only when `$PIPELINE_RUN_DIR` is set): for each `target: "decisions"` finding, write one file to `{run-dir}/staged/` containing provider, file, severity, message, evidence, and a `Remedy:` line. **Filename and idempotency:** the wrapper nudge (`provider: wrapper`) always writes `design-decision-nudge.md` (fixed name, overwritten — this is the nudge's whole de-dupe mechanism, per #598); every other decisions finding writes `design-decision-{n}.md` where `n` is 1-based per Step 5.5 invocation, and before writing, an existing `design-decision-*.md` in this run dir with identical `provider` + `file` + `message` is overwritten in place rather than a new number allocated (dedupe by content, so a re-review after polish's re-verify cycle never duplicates). **Remedy is mechanical, keyed on `provider`, not on message text:** `provider: wrapper` → `Remedy: /claude-tweaks:design-wrapper explore` (no scope); every other provider → `Remedy: /impeccable:impeccable document` (upstream's own DESIGN.md editor — the one command that can address silence or a weak decision on any sub-topic). No layout classification. Log one `STAGED` line per file to `decisions.md`. When `$PIPELINE_RUN_DIR` is unset (standalone `/review`), stage nothing — the findings render in the summary (below) instead. Return gains `decisions_staged: <int>` (omitted when zero).
- [ ] `modes/polish.md`: (a) Step 3 documents the widened cache (audit + craft-critic code findings; the same staleness rule covers both — no separate path); (b) new explicit **three-way consumption table** — `audit` + `suggestion` → suggestion-driven dispatch (unchanged); `audit` + `null` → `kind: "unclassified"` staged observation (unchanged); `craft-critic` (`target: code` only) → **inlined into each refinement-set dispatch prompt** as a "Known craft issues (from review-time critics)" block — filtered to findings whose `file` is in that dispatch's target file list, at most 15 rows highest severity first plus a `+N more` line when exceeded, each row `file`, `severity`, `message` verbatim; a sibling block beside the assembled design-craft principles, never a replacement (the authority rule stays intact); never selects a command, never staged, never counted in `commands_invoked`; (c) `decision_summary` gains a trailing clause `; craft-context: {N} critic findings inlined` when N > 0, where N is the **run-total of distinct cached `craft-critic` findings that were inlined into at least one refinement dispatch** (emitted once per polish invocation, as `decision_summary` already is); (d) an Anti-Patterns row: deriving a command from a `craft-critic` finding (it has no `suggestion` by construction; keyword-mapping was retired).
- [ ] `skills/flow/polish-execution.md`: one sentence noting the refinement dispatch's assembled context now also carries the cached `craft-critic` code findings, per `modes/polish.md`'s three-way table — no new staging kind, no new file writes.
- [ ] `skills/review/review-summary-template.md` Design Quality section: render `craft-critic` `code` findings in the existing table with a `Source` value of `critic:{provider}`; render `decisions` findings in a sub-heading **Decisions** beneath the table — **omitted entirely when there are none** (same omit-when-empty convention as the skip-reason footer) — each with its `Remedy:` line, prefaced by one sentence: "These challenge the project's DESIGN.md, not the diff — the wrapper never edits DESIGN.md; act on the remedy or decline." The remedy commands are ordinary user-invoked upstream/wrapper commands and need no run context. `skills/review/SKILL.md` Step 6.5's return-handling table gains the `decisions_staged` note (staged when in a run; rendered when standalone).
- [ ] `skills/design-wrapper/SKILL.md` Anti-Patterns: one row — writing a `decisions` finding into the polish cache or letting polish act on it (`DESIGN.md` is upstream-owned; a human decides at the Console).

## Acceptance Criteria

1. `grep -n 'source === "audit" || (source === "craft-critic" && target === "code")' skills/design-wrapper/modes/review.md` returns the Step 5 filter line.
2. `grep -n "design-decision-nudge.md\|design-decision-{n}" skills/design-wrapper/modes/review.md` shows both filename rules, the content-dedupe rule, and the `$PIPELINE_RUN_DIR`-set condition; `grep -n "decisions_staged" skills/design-wrapper/modes/review.md` shows it in the Output block.
3. `grep -n "Remedy:" skills/design-wrapper/modes/review.md` shows exactly the two provider-keyed remedies and no message-text classification (`grep -n "layout/composition" skills/design-wrapper/modes/review.md` returns nothing).
4. `grep -n "Known craft issues" skills/design-wrapper/modes/polish.md` shows the inlined block with the per-dispatch file filter and the 15-row cap, and the three-way consumption table is present with `craft-critic` → context, never command.
5. `grep -n "craft-context" skills/design-wrapper/modes/polish.md` shows the `decision_summary` clause with N defined as run-total.
6. `grep -n "Decisions" skills/review/review-summary-template.md` shows the sub-heading with the "never edits DESIGN.md" sentence and the omit-when-empty rule.
7. `grep -rn "gh issue edit\|writeFileSync.*DESIGN.md" skills/design-wrapper/modes/review.md skills/design-wrapper/modes/polish.md` shows no write to `DESIGN.md`; the only `document` mention is inside the `Remedy:` string.
8. `npm test` passes.
9. `git diff --stat` touches only: `skills/design-wrapper/modes/review.md`, `skills/design-wrapper/modes/polish.md`, `skills/design-wrapper/SKILL.md`, `skills/flow/polish-execution.md`, `skills/review/SKILL.md`, `skills/review/review-summary-template.md`.

## Technical Approach

Prose-procedure edits. The cache filter is one expression; the staging block mirrors `polish-execution.md`'s existing per-entry `staged/` write pattern with the provider-keyed remedy; polish's three-way table is a small addition beside its Step 5 `kind` table; the summary template gains one sub-heading.

### Data / API Surface

- Audit cache: `findings[]` may now carry `source: "craft-critic"`, `provider`, `target: "code"`, `id: craft-{provider}-{n}`.
- Review return: optional `decisions_staged: <int>`.
- Polish `decision_summary`: optional trailing `; craft-context: {N} critic findings inlined`.
- Staged files: `{run-dir}/staged/design-decision-nudge.md` (fixed) and `{run-dir}/staged/design-decision-{n}.md`.

### Key Files

- `skills/design-wrapper/modes/review.md` — Step 5 filter, Step 5.5 staging, Output block
- `skills/design-wrapper/modes/polish.md` — Step 3 note, three-way table, refinement prompt block, `decision_summary`, Anti-Patterns
- `skills/design-wrapper/SKILL.md` — one Anti-Patterns row
- `skills/flow/polish-execution.md` — one sentence
- `skills/review/SKILL.md` — Step 6.5 return-handling note
- `skills/review/review-summary-template.md` — Decisions sub-heading

### Package Dependencies

None.

## Gotchas

- Polish's cache staleness rule (Step 3: cache older than the branch's latest commit → skip) applies to the widened cache too — a stale `craft-critic` finding is skipped along with stale audit findings; do not add a separate staleness path.
- The refinement-set dispatch already inlines craft principles per `design-craft.md`; the "Known craft issues" block is a *sibling* block in the same prompt, not a replacement — keep the authority rule (decisions win) intact in what the executing agent receives.
- `staged/` filenames must not collide with `polish-suggestion-{n}.md` — hence the distinct `design-decision-` prefix; the Review Console reads all files generically.
- Standalone `/review` (no run dir) has nowhere to stage — render, don't stage; never invent a mid-flow prompt for it.
- The `Remedy:` line names an *upstream* command for a human to run; the wrapper must never invoke `/impeccable:impeccable document` itself (that writes `DESIGN.md`).
- Remedy selection was deliberately made provider-keyed rather than message-classified — a prose classifier would be re-derived differently by every implementer; `document` is upstream's one editor for `DESIGN.md` and covers every decisions finding a critic can raise.

<!-- work-fingerprint: design-critique-dispatch:decisions-pushback-routing-code-findings-feed-polish-as-cont -->
