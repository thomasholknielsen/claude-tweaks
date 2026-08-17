# Harness Health — Memory-Specific Checks (`assetType: memory` targets)

Canonical home of the `memory`-target branch of the harness-health judge procedure. Split out
of `_shared/harness-health-analysis.md` — which keeps a `## Memory-Specific Checks` stub
pointing here — because a memory target skips that file's dimension check entirely, so loading
the whole judge procedure to run the mechanical checks below was pure waste. This file is
self-sufficient: a memory audit reads it and nothing else from that procedure.

**One consumer:** `/claude-tweaks:harness-health`'s Step 3, `target.kind === 'memory'` branch.
`/claude-tweaks:wrap-up`'s Skills curation row and `/claude-tweaks:init` Phase 3/6 are skill-only and never
pass a `memory` target, so neither ever reads this file.

## Finding fields for a memory finding

Emit each finding as a JSON object carrying the required fields every harness-health finding
carries: `kind: "patch"`, `target` (the memory file's id — its filename stem, from `MEMORY.md`'s
link), `assetType: "memory"`, `category` (`drift` | `template-conformance` | `best-practice` —
each check below names which one it produces), `classification` (`additive` | `restructural`),
`confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`,
`reason`, plus `section`, `oldString`, and `newString`. `oldString`/`newString` must be **exact,
unique, verbatim quotes** from the memory file, not paraphrased "Current/Proposed" prose — a
non-unique or paraphrased quote cannot be applied. Never set `intent: "remove"` on a memory
finding: removal is scoped to `assetType: "claude-md"` alone, and an empty `newString` anywhere
else is a validation error.

The full Finding Shape — every `assetType`, the `new-skill` kind, and the `intent: "remove"`
rules — is canonical in `_shared/harness-health-analysis.md`'s `## Finding Shape` section; the
block above is its memory-scoped subset, so check that section when either changes to keep the
two in sync. `bin/lib/harness-health/validate-finding.js` enforces the same shape as code.

## The checks

A `memory` target skips `_shared/harness-health-analysis.md`'s Step 2 dimension check entirely — its checks are narrower and more mechanical, closer in spirit to the `design-artifact` branch than to a full skill/rule/CLAUDE.md audit. `assetType` is `"memory"`; `target` is the memory file's id (its filename stem, from `MEMORY.md`'s link).

1. **Index line-length check.** Each `MEMORY.md` bullet line has a fixed 150-character budget — not project-configurable like `_shared/harness-health-analysis.md` Step 1's tiered line-budget check, since this is a cross-project harness convention rather than a per-project stylistic choice:
   ```bash
   awk '{ if (length($0) > 150) print NR": "length($0)" chars" }' MEMORY.md
   ```
   A flagged line is mechanical evidence for a `template-conformance` finding — tighten the index entry to a true one-line hook.
2. **Fact-currency check.** Read the memory file's full body and extract concrete, checkable claims: referenced file/skill paths, specific IDs, status words (`pending`, `shipped`, `scheduled`, `in progress`), dated claims. Verify each against current reality:
   - A referenced path/command is checked exactly the way `_shared/harness-health-analysis.md` Step 1's stale-example check does it, applied to this file's body instead of a skill's: `ls "<referenced-path>"` for a path; for a command, confirm it exists in `package.json` scripts, a `Makefile`, or as a known binary.
   - A status word (`pending`, `shipped`) is checked against `git log --oneline --grep` for the described change, or against whether the file/skill it predicts now actually exists.
   Where a claim genuinely cannot be checked mechanically, skip it — the same opportunistic-assist caveat `_shared/harness-health-analysis.md` Step 1 already states for its own checks 1-2. A contradicted claim is high-confidence evidence for a `drift` finding.
3. **Duplication-with-checked-in-content check.** Grep the memory file's distinctive phrases (named files, function names, specific facts) against skill/rule content:
   ```bash
   grep -rl "<distinctive phrase from the memory file>" plugin/skills/ .claude/rules/ 2>/dev/null
   ```
   A hit is evidence for a `drift` finding recommending the memory entry shrink to a pointer/reference rather than a restated copy.
4. **Runbook-shape heuristic** (informational only — this phase detects and flags, it does not promote). Count fenced code blocks:
   ```bash
   grep -c '^```' "<memory-file-path>"
   ```
   Two or more fenced blocks, or several lines that look like shell commands, is evidence worth noting in the finding's `reason` field: "reads like an operational runbook, consider promoting to `docs/`" — no automated doc creation this phase.

**Filing posture for memory findings.** Memory is audited exclusively by `/claude-tweaks:harness-health` (never by `/init` or `/wrap-up`, both skill-only), and `/claude-tweaks:harness-health` is report-only — additive and restructural memory findings alike always file as a `harness-health`-labelled issue for human review, the same posture CLAUDE.md findings get, per `skills/harness-health/SKILL.md` Step 7.
