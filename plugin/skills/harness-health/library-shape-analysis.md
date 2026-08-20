# Skill-Library Shape Analysis

A periodic pass in `/claude-tweaks:harness-health`'s existing SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline — comparing skills *against each other*, not against the codebase. Every other check in `_shared/harness-health-analysis.md` is one-skill-at-a-time; this is the first cross-skill-comparison check. Loaded by `SKILL.md`'s Step 1 (SELECT) when this pass's own due-ness cursor is due — see "Due-ness and SELECT" below.

## Due-ness and SELECT

This pass is its own rotation slot with a fixed pseudo-target — `kind: library-shape`, `target: library-shape` — on a 90-day interval (the same "stale" window the standard per-target rotation already uses), not tied to any single skill's own staleness/churn cursor, since this pass has no single natural target.

Before Step 1's `next-target` call (which only knows about real skill/rule/claude-md/design-artifact/memory files and never returns this pseudo-target on its own), check whether this pass is due. Cursors live on the dedicated `health-state` git branch, not local `cache.json` — `readCache()` never has a `cursors` key under this project's durable-state architecture (see `_shared/health-state.md`). Read the cursor via `readDurableState`, which `bin/lib/harness-health/cache.js` re-exports from `bin/lib/health-core/durable-state.js`'s `readState`:

```bash
node -e "
  const {readDurableState} = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/harness-health/cache.js');
  const root = process.cwd();
  const cursors = readDurableState(root).cursors;
  const cur = cursors['library-shape:library-shape'];
  const days = cur ? (Date.now() - cur.lastAuditedMs) / 86400000 : Infinity;
  console.log(JSON.stringify({due: days >= 90, daysSinceLastAudit: cur ? Math.floor(days) : null}));
"
```

Note this is a network call, not a pure local read — `readDurableState` does a `git fetch origin health-state` before returning, and degrades to an empty `{cursors: {}, retryQueue: [], runs: []}` shape (so `cur` comes back `undefined`, meaning "due") if the branch doesn't exist yet or the fetch fails. This exactly mirrors `bin/harness-health.js`'s own `cmdNextTarget` cursor-read pattern (`const durableCursors = readDurableState(root).cursors;` at line 80) — not a guess: it's the same call the standard rotation already makes.

If due (or never audited — `cur` is absent), run this pass this firing, in addition to (not instead of) whatever `next-target` returned for the standard rotation. If not due, skip this pass entirely this firing.

## Candidate narrowing (required — never scan all pairs)

With 30+ skills in this project, exhaustive pairwise comparison is infeasible per firing. Pre-filter before committing to a full read:

1. **Cheap pass:** read every skill's frontmatter `description` (the "When to Use" trigger text) — descriptions only, not full bodies. This is the same data `SKILL.md` files already expose in their frontmatter; no new extraction code needed, a `grep -A2 "^description:" .claude/skills/*/SKILL.md`-style scan suffices.
2. **Similarity scoring:** compute keyword overlap between each pair of descriptions (shared significant words, ignoring stopwords — a simple Jaccard-style overlap on the description text is sufficient; this is a judgment aid, not a precision metric).
3. **Threshold:** only fully read (both SKILL.md files, dimension-1/2 candidates) the pair(s) whose similarity clears a visibly-high bar — in practice, pairs sharing 3+ significant domain-specific keywords (not generic words like "use", "when", "project"). Judge this threshold qualitatively each run rather than hardcoding an exact numeric cutoff — the goal is narrowing 30+ skills down to a small handful of plausible candidates, not a precise ranking.
4. For dimension 3 (bloated, single-skill), no pairwise pre-filter applies — instead read the same skills the standard per-target rotation already selected as due this firing (its `next-target` result), applying dimension 3 alongside the standard dimension check on whichever target(s) that call returned. Dimension 3 does not need its own separate target selection.

## Dimension 1: Too shallow (leverage judgment, not line count)

**Anchor:** does the skill's actual guidance amount to *less* than what a well-scoped section in an existing sibling skill would need to say to cover the same trigger conditions? This mirrors `_shared/criteria-architecture-depth.md`'s `## Depth = leverage, not line ratio` model exactly — depth is measured by leverage (how much complexity the module/skill absorbs on behalf of its callers/readers), never by a line-count ratio. Line count may be cited as supporting color in a finding's evidence, never as the deciding signal.

For each candidate pair that cleared the pre-filter above: read both skills' full SKILL.md files (not their lazy-loaded sub-files — see the "Sub-file scope" note below). If skill A's actual guidance is thin enough that folding it into skill B (as a new section) would lose nothing a reader needs, propose `kind: "patch"` against skill B adding A's content as a section, with a companion note that skill A's own file becomes a redirect/removal candidate for human review (never auto-delete — filing proposes, humans decide).

**Sub-file scope (explicit, resolved):** "full skill file" for this dimension means **SKILL.md only**, not its lazy-loaded sub-files. This project's own convention (the "Skills with sub-files" table in `docs/plugin-structure.md`) deliberately keeps some SKILL.md files lean by pushing real depth into sub-files — a dimension-1 verdict based on SKILL.md alone could therefore misjudge a skill whose actual depth lives in a sub-file as shallower than it really is. This is a known, documented limitation of this pass, not a solved problem — a future tightening could read relevant sub-files too, but that's out of scope here. Do not silently treat "SKILL.md alone" as equivalent to "the skill's full documented depth."

## Dimension 2: Overlapping (merge candidate)

Two skills whose domains (frontmatter `description` / "When to Use") have drifted into covering genuinely the same territory. Before flagging: read both skills' own Relationship-to-Other-Skills tables. If either table already documents the other skill as a complementary/distinct relationship (a row explaining how they differ or hand off), that is evidence AGAINST overlap — do not flag, even if the description-similarity pre-filter scored them high. Only flag when the overlap is genuine (both skills would plausibly fire on the same trigger, and neither's own documentation explains why that's intentional).

## Dimension 3: Bloated (single-skill, not pairwise)

Unlike dimensions 1-2, this is a **single-skill** judgment — it never needs a comparison partner. Apply to whichever skill(s) the standard per-target rotation selected this firing (see "Candidate narrowing" step 4 above). Two input signals:

1. **Narrative-density heuristic** — reuse `_shared/harness-health-analysis.md` Step 1 check 7 (words-per-bullet-line) as-is; a high ratio is evidence, not a verdict.
2. **Same-file redundancy check** — does the skill state the same guidance more than once in different words? Does it have sections that could merge without losing distinct content? Look for this directly by reading the file, not via a mechanical grep signature (redundancy-in-prose has no single reliable pattern).

Propose `kind: "patch"` trimming the redundant content, citing both signals in the finding's evidence.

## Fingerprint canonicalization (two-skill findings)

For a dimension-1 (collapse-into-X) or dimension-2 (overlapping) finding naming two skills: canonicalize the `target` field by sorting both skill names alphabetically and joining with `+` — e.g. `docs-health+journey-health`, not `journey-health+docs-health` and not whichever skill the check happened to start from. This ensures the same pair is never independently fingerprinted twice regardless of which skill triggered the comparison. Dimension 3 (bloated) keeps the existing single-skill `target` convention (its own skill name) — it never names two skills.

## Emitting findings

Every finding from this pass uses the EXISTING Finding Shape (`_shared/harness-health-analysis.md`) unchanged:
- `assetType: "skill"` (always — every dimension here judges skill files)
- `kind: "patch"` (always — every dimension proposes an edit to an existing file, never a new one)
- `category: "best-practice"` (matches `_shared/harness-health-analysis.md` Dimension 8's existing "no cross-skill overlap, right-sized scope" framing — this pass is that dimension's concrete mechanical backing)
- `target`: sorted-pair (dimensions 1-2) or single skill name (dimension 3), per the canonicalization rule above
- `section`/`oldString`/`newString`: as usual for a `patch` finding — exact, unique, verbatim quotes from the target file(s)

These validate against the existing `bin/lib/harness-health/validate-finding.js` enums with no code changes (`assetType: "skill"` and `kind: "patch"` are both already-valid values). Feed findings into `SKILL.md`'s existing Step 6 (`validate-findings --target library-shape --kind library-shape`, using the pseudo-target from "Due-ness and SELECT" above so this pass's own cursor gets recorded) and Step 7 (FILE) exactly as any other target's findings would — no new filing logic needed.

**Run Step 6 even on a clean firing (zero findings).** If candidate narrowing and all three dimensions produce no findings this firing, still run `validate-findings --target library-shape --kind library-shape` against an empty findings array (`[]`) rather than skipping the call. `validate-findings` accepts an empty JSON array and still advances the `library-shape:library-shape` cursor as long as `--target`/`--kind` are both passed — this is what records `lastAuditedMs` for "Due-ness and SELECT" above to read on the next firing. This mirrors how the standard per-target rotation always runs Step 6 for its selected target regardless of outcome (see `SKILL.md`'s own anti-pattern note against skipping a target's `validate-findings` call). Skipping this call on a clean firing leaves the cursor exactly where it was — permanently "due" — so this pass would re-run its expensive 30+-skill description-similarity scan on every single firing forever, defeating the 90-day cost-control the cursor exists for.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Scanning all pairs across 30+ skills every firing | Infeasible cost — always pre-filter by description similarity first |
| Flagging two skills as overlapping without checking `docs/skill-graph.md` | A documented complementary relationship (e.g. `/deepen` vs `/simplify`) is evidence against overlap, not for it |
| Using line count as the deciding signal for "too shallow" | Contradicts this project's own `/claude-tweaks:deepen` model — leverage, not line ratio |
| Auto-applying a merge/split/simplify | This pass is report-only, like every other harness-health finding — structural changes are `restructural`, human-gated |
| Treating dimension 3 as needing a comparison partner | It's explicitly single-skill — don't pair it with an unrelated skill just to "match" dimensions 1-2's shape |
