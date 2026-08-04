# Skill Bloat Reduction — Phase 2b (Relationship removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `## Relationship to Other Skills` section from all 32 skills — ~124.5 KB, 13.5% of all `SKILL.md` bytes — after relocating the rows that bind execution, recording every edge once in `docs/skill-graph.md`, and resolving the identifiers that would otherwise leave the runtime payload with nothing reaching them.

**Architecture:** Additive first, destructive last. Tasks 1–3 only add text: the unreached-identifier rewordings, the graph document, and the OPERATIVE relocations. Task 4 is the single destructive change-set — it deletes all 32 sections and, in the same commit, updates every consumer that assumes they exist (the `auto-mode-contract.md` mandate, three CLAUDE.md conventions, eight in-body pointers, seven test files). Splitting Task 4 would leave the suite red between tasks and would let a task-scoped review approve a deletion whose consumer update never came (`[IL-02]`, `[IL-60]`).

**Tech Stack:** Markdown skill files, Node 18+, `node --test`. `bin/lib/skill-audit/` provides the parser and the loss checks.

## Global Constraints

- **Verdict source of truth:** `docs/superpowers/specs/2026-08-04-relationship-triage-verdicts.md`. Its three controller corrections override the raw per-agent classes — apply them before acting on any row.
- **Scope decision, taken by the human 2026-08-04:** full removal + graph. Do not re-litigate it; do not preserve a partial table in any skill.
- **The orphan scan gates deletion, not the agents' citations.** Nine citations were verified by hand and all held, but one pointed at the wrong line. Use `bin/lib/skill-audit/` to verify, never the cited line number alone.
- **`findLostOccurrences` is for relocations, not deletions.** A deleted row necessarily drops its identifiers' counts. For a deletion the question is the weaker one: does each identifier still appear somewhere in the same `SKILL.md`? Express it as `countOccurrences(id, after) === 0 && countOccurrences(id, before) > 0`.
- Commit style `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes, `Claude-Session:` trailer, never a GitHub closing keyword (use `refs #N`).
- Every commit: `git add <paths>` then `git diff --cached --name-only` to verify the staged set before committing (`[IL-42]`).
- Check `git log --oneline <branch>..main` between tasks — this branch touches all 32 skills and back-loaded conflict resolution is the riskiest moment (`[IL-20]`).

---

### Task 1: Resolve the unreached identifiers (see the corrected measurement below)

**Files:** Modify: up to 30 `skills/*/SKILL.md` (step bodies only — do NOT touch the Relationship sections yet)

**Interfaces:** Produces: a resolved corpus in which no identifier's only occurrence is a Relationship row, except those explicitly accepted below.

**Why this task exists.** 307 identifiers appear only in a Relationship row. 182 are recoverable because a sub-file the body already points at also carries them. **88 are not** — nothing in the invocation payload reaches them. Deleting those rows removes the identifier from the skill's runtime context outright.

> **Corrected, 2026-08-04 — the 88 figure is an instrument artifact; the real depth-1 figure is 38.**
> The Step 1 script below has two defects that inflate loss by ~2.3x. It walks only the skill's own
> directory plus `_shared/`, so a **cross-skill path the body explicitly names** is never opened —
> `skills/flow/materialize.md` appears 10 times in build's body and was still scored unreachable.
> And its head-token artifact test compares against `body` only, never against the reachable
> sub-files — `diagram-suggestions: enabled` was scored absent while `specify/decomposition-mode.md:195`
> states the flag *and* its full gate semantics.
>
> Re-measured with cross-skill path resolution and head-token-vs-reach:
>
> | Reach model | Absent | Avg load per skill |
> |---|---|---|
> | Original single-hop scan (below) | 88 | — |
> | **Depth 1** — SKILL.md + files its body names | **38** | 10 files / 141 KB |
> | **Depth 2** — one further instructed pointer | **1** | 26 files / 340 KB |
> | Unbounded closure | 1 | 120 files / 1.2 MB — not credible |
>
> Use **depth 1 as the safety floor**: it is the conservative model of a single invocation.
> Depth 2 is what actually happens whenever a sub-file says "apply the procedure in X" — e.g.
> wrap-up Step 7 → `skill-curation.md:37` → `_shared/harness-health-analysis.md:37` →
> `skills/init/skill-template.md`, three hops the skill instructs. The unbounded closure absorbs
> ~120 of 214 files per skill and models nothing real.
>
> The **only** identifier absent even at depth 2 is `version`'s `_shared/auto-mode-contract.md`,
> whose own row states the contract "does not modify behavior." **Nothing is at risk.** The reword
> set below therefore shrinks from ~32 to roughly 6; the rest is cross-skill navigation (accept) or
> a factually wrong claim (drop, and fix in Task 5).

- [ ] **Step 1: Regenerate the unreached list against current HEAD**

Use the **corrected** depth-bounded scan. It resolves cross-skill paths the body names and tests head
tokens against the whole reachable set, both of which the original single-hop version got wrong. A
sibling `SKILL.md` is deliberately never pulled in — naming another skill does not load it.

```bash
node -e '
const fs=require("fs"),path=require("path");
const {extractIdentifiers,countOccurrences}=require("./bin/lib/skill-audit/identifiers.js");
const {extractRelationshipRows,bodyOutsideSection}=require("./bin/lib/skill-audit/relationship-rows.js");
const DEPTH=Number(process.env.DEPTH||1);
const D="skills";
const names=fs.readdirSync(D).filter(n=>fs.existsSync(path.join(D,n,"SKILL.md"))).sort();
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
  if(e.isDirectory()){walk(p);continue;}
  if(e.name.endsWith(".md"))files.push({abs:p,rel:p,base:e.name});}})(D);
for(const n of names){
  const dir=path.join(D,n);
  const md=fs.readFileSync(path.join(dir,"SKILL.md"),"utf8");
  const body=bodyOutsideSection(md);
  const seen=new Set(); let frontier=[body]; const texts=[body];
  for(let d=0;d<DEPTH;d++){const next=[];
    for(const t of frontier) for(const f of files){
      if(seen.has(f.abs))continue;
      if(f.base==="SKILL.md" && !f.abs.startsWith(dir))continue;
      if(!(t.includes(f.rel)||t.includes(f.base)))continue;
      seen.add(f.abs); const c=fs.readFileSync(f.abs,"utf8"); texts.push(c); next.push(c);}
    frontier=next;}
  const reach=texts.join("\n");
  for(const row of extractRelationshipRows(md))
    for(const id of extractIdentifiers(row.raw)){
      if(countOccurrences(id,reach)>0) continue;
      const head=id.split(/[:=\s{(]/)[0].replace(/[*\/]+$/,"");
      if(head.length>=4 && countOccurrences(head,reach)>0) continue;  // exact-match artifact
      console.log(n+"\t"+row.line+"\t"+id);
    }
}' > /tmp/unreached-current.tsv
wc -l /tmp/unreached-current.tsv
DEPTH=2 node -e '...same script...' | wc -l    # sanity: should be ~1
```

Expected: **38 lines at depth 1**, 1 at depth 2. If materially different, stop and report — the
corpus moved. Do not use the unbounded closure: it absorbs ~120 of 214 files per skill and reports
near-zero loss for any corpus, so it cannot fail.

- [ ] **Step 2: Apply the disposition rule to each line**

Two dispositions, decided by what the identifier names:

| The identifier names… | Disposition |
|---|---|
| **Another skill's internals** — a step number in a different skill, a `docs/` or `.claude/` path, another skill's sub-file or `bin/` module | **Accept.** This is cross-skill navigation. It belongs in the graph edge label (Task 2), not in this skill's payload. No edit. |
| **This skill's own runtime token** — a config key it reads, a label it writes, an env var it sets, a CLI flag it accepts, a field name it emits | **Reword into the step body** that uses it, as one clause. Do not copy the row; state the token where it is used. |

**The seven bare filenames the mechanical rule cannot place — all resolved, none needs a reword:**

| Skill | Identifier | Verdict | Evidence |
|---|---|---|---|
| `code-health` | `criteria-simplification.md` | Accept | Binding is data, not prose — `bin/lib/code-health/criteria.js:21` carries `fragment: 'criteria-simplification.md'` |
| `docs-health` | `docs-health-integration.md` | Accept | Wrap-up's file; wrap-up's own Step 7.7 owns the pointer |
| `harness-health` | `routine-relevance-analysis.md` | Accept | `init/update-mode.md:197` already reads it; harness-health's own steps never do |
| `review` | `verification-brief.md` | Accept | Wrap-up's file, reached by wrap-up's own body |
| `wrap-up` | `skill-template.md` | Accept | Three instructed hops: Step 7 → `skill-curation.md:37` → `_shared/harness-health-analysis.md:37` → `skills/init/skill-template.md` |
| `assess-agent-autonomy` | `tier.js` | **Drop** | Tombstone — `bin/lib/issues/tier.js` does not exist; `recommendGrants`/`recommendTier` appear nowhere in the repo |
| `backlog` | `grouping.js` | **Drop** | Factually wrong (Task 5 defect #3) — `overview-mode.md:66` calls only `ranking.js`'s `rankNextToBuild` |

Known members of the second group, from the pre-plan scan — **most of these were cleared by the
re-measurement above; verify each against a depth-1 run rather than trusting this table:**

`journeys` `journey={name}` · `routine` `by:docs-health` · `visual-review` `demo:pending` ·
`wrap-up` `needs-human`, `test/qa` · `visualize` `--source journeys|specify|review` ·
`build` `Design-intent:`, `journey:` · `design-wrapper` `Visual-reference:`, `{deferred}`, `{fail}`, `{result}`, `{skipped}`, `DESIGN.json` · `stories` `auth: { vault: ... }` ·
`capture` `Origin: demo changes-requested from #N` · `deepen` `no-deepen` · `specify` `review-effort` ·
`demo` `acceptance-queue` · `simplify` `distill` · `code-health` `grant-check`, `triage dispatch` ·
`assess-agent-autonomy` `recommendGrants`, `recommendTier`, `tier.js` · `backlog` `groupByFileOverlap`, `grouping.js` **(but see Task 5 — this claim is factually wrong; fix it there rather than preserving it)** ·
`ledger` `{run-dir}/staged/deepen-{n}.md` · `dispatch` `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n}[,#{m}...]` · `init` `.claude-tweaks/harness-health/cache.json` · `tidy` `.claude-tweaks/pipelines/{ts}-tidy-standalone/`

- [ ] **Step 3: Verify no regression and commit**

Re-run the Step 1 script. Every identifier you rewrote must be gone from the output; every one you accepted must remain, and its skill must appear in Task 2's graph with that identifier in the edge label.

```bash
npm test 2>&1 | tail -5    # expect 0 failures; nothing here changes test-visible structure
git add skills/
git diff --cached --name-only
git commit -m "..."
```

---

### Task 2: Build `docs/skill-graph.md`

**Files:** Create: `docs/skill-graph.md`

**Interfaces:** Consumes: every row classified NAV in the verdict table, plus the ~17 DEAD rows reclassified NAV by correction 1 (circular evidence). Produces: one edge per relationship, stated once.

**Why this task exists.** ~232 NAV rows describe roughly half that many *edges*, because the bidirectional convention states each one twice. Collapsing them is the point: `[IL-17]` and `[IL-52]` are both drift between two copies of one fact.

- [ ] **Step 1: Extract the NAV rows**

Emit `From | To | Relationship` for every NAV row using `extractRelationshipRows`, keyed by source skill. Do not hand-transcribe — 232 rows is past the point where transcription is reliable.

- [ ] **Step 2: Collapse reciprocal pairs**

Where `A → B` and `B → A` both exist, merge them into one row whose Relationship cell states the edge once, from the producer's side. Where only one direction exists, keep it as-is. **Record the merge count** — it is the direct measure of what the bidirectional convention was costing.

- [ ] **Step 3: Fold in the accepted unreached identifiers**

Every identifier accepted in Task 1 Step 2 must appear in its edge's Relationship cell. That is the whole justification for accepting it: the fact survives in the graph even though it leaves the payload.

- [ ] **Step 4: Header and commit**

Open the file with what it is and why it is not shipped:

```markdown
# Skill graph

Every relationship between claude-tweaks skills, stated once.

This file is maintainer documentation. It is **not** part of the shipped plugin —
`evals/runner.js`'s `PLUGIN_SNAPSHOT_DIRS` covers `.claude-plugin`, `skills`, `agents`,
`hooks`, `bin`, and `commands`, not `docs/`. No skill reads it at runtime, and consuming
projects have no use for a map of this plugin's internal wiring. That is why the content
could leave the `SKILL.md` files at all.

Edges are stated once, not once per direction. The per-skill `## Relationship to Other
Skills` tables it replaces stated each edge twice, and the two copies drifted.
```

---

### Task 3: Relocate the OPERATIVE rows

**Files:** Modify: `skills/{capture,build,tidy,flow,ledger,routine,visualize,help}/SKILL.md` and any others surviving normalisation

**Interfaces:** Produces: each binding rule stated in the step body that implements it.

**Why this task exists.** 20 rows bind their own skill's execution. They are the reason this is a relocation and not a bulk delete.

- [ ] **Step 1: Apply the three verdict-table corrections first**

Do not relocate the raw 20. Normalise:

- **`reflect`'s 7 OPERATIVE verdicts are outliers** — every comparable component skill returned 0. Rows 10 and 11 were called OPERATIVE for "read it before adding or changing any auto-mode handling here", which is addressed to a skill author, not to the running model; that is the same sentence that made nine other boilerplate rows DEAD. Re-apply the test to all seven and expect most to fall to DEAD or NAV.
- **`routine` row 7 is 1,790 bytes of which only the `--source init` / `--defaults` kernel binds `routine`.** Relocate the kernel, drop the rest — the bulk describes `init`'s own internals.
- **`dispatch` row 12 stays DEAD.** The agent overrode the dispatch prompt's framing with evidence from Step 1 and the Component-Skill Contract. The agent is right.
- **`tidy` row 7's `extractFingerprint` claim is unverified** — Task 5 resolves it. Do not relocate an unverified claim; relocate only `recordPayload` unless Task 5 confirms otherwise.

- [ ] **Step 2: Relocate each surviving row as a clause, not a paste**

Write the rule where the step performs it, in the step's own voice. A relocated row that reads like a table row in prose is a failed relocation.

- [ ] **Step 3: Verify with the count-delta check**

For each relocation, scope = the skill's own `SKILL.md` (source and destination are the same file, so counts must hold exactly):

```js
const { findLostOccurrences } = require('./bin/lib/skill-audit/identifiers.js');
findLostOccurrences(rowText, beforeFileText, afterFileText); // must be []
```

A non-empty result means the relocation dropped payload. Fix the wording, do not accept the loss.

---

### Task 4: The destructive change-set

**Files:** Modify: all 32 `skills/*/SKILL.md`; `skills/_shared/auto-mode-contract.md`; `CLAUDE.md`; `skills/{deepen,code-health,docs-health,harness-health,journey-health,flow,research}/SKILL.md` (in-body pointers); `tests/research/skill-md.test.js`; `tests/research/cross-refs.test.js`; `bin/lib/{code-health,docs-health,harness-health,journey-health}/tests/skill-md.test.js`; `bin/lib/health-core/tests/skill-md-house-checks.js`; `bin/lib/skill-audit/tests/relationship-rows.test.js`

**Everything in this task lands in one commit.** A task-scoped review that sees the deletion without the consumer updates will approve a broken tree (`[IL-02]`); one that sees a consumer update without the deletion cannot tell whether it is correct.

- [ ] **Step 1: Delete all 32 sections**

Use `extractRelationshipRows`'s `locate()` boundaries, not a hand-written walk — **31 of 32 skills carry the section last**, and a walker requiring a following `##` heading truncates almost every file.

- [ ] **Step 2: Fix the 8 in-body pointers that now dangle**

Found by sweeping the structural pattern rather than one instance (`[IL-15]`):

| Skill | Shape |
|---|---|
| `deepen` (×2, lines 98 and 163) | "(see the `/claude-tweaks:ledger` row in Relationship to Other Skills)" |
| `code-health`, `docs-health`, `harness-health`, `journey-health` | "standalone-only skill — no invocation path exists … (see …)" |
| `flow` | "`/claude-tweaks:dispatch` is the only skill that invokes … see …" |
| `research` | "Referenced by (advisory cross-reference in each skill's own Relationship table — …)" |

Re-point each at `docs/skill-graph.md` or restate the fact inline. Re-run the sweep afterwards and expect zero hits.

- [ ] **Step 3: Re-point `skills/_shared/auto-mode-contract.md:205`**

Current requirement 1 reads "Reference this file in its Relationship table (e.g. …)". Replace with a requirement to cite the contract **at the point where the skill implements an auto branch** — which is exactly where Task 3 relocated the seven step-naming auto-mode rows. Leave requirements 2 and 3 alone.

- [ ] **Step 4: Update the three CLAUDE.md conventions**

- Line 40, structure item 9 — drop the Relationship table from the required section list.
- Line 66, Next Actions placement — the sentence orders Next Actions before "Component-Skill Contract / Anti-Patterns / Relationship to Other Skills". Drop the last term.
- Line 118, the bidirectionality rule — "Every skill's Relationship table must be bidirectional" no longer has a referent. Replace with the graph rule: every edge is stated once in `docs/skill-graph.md`, and adding a skill means adding its edges there.

Also revisit line 66's own claim that "CSC, Anti-Patterns, and Relationship are meta-documentation for skill authors" — that sentence is the finding this entire design turns on, and with Relationship gone it should say so precisely.

- [ ] **Step 5: Update the seven test files**

Six assert the section exists or that specific skills appear in it; those assertions go. `tests/research/cross-refs.test.js` is the substantive one — nine assertions enforcing that `/research` and four other skills cross-reference each other. **Re-point it at `docs/skill-graph.md`** rather than deleting it: the invariant it protects (those relationships stay recorded) is still real, only its home moved.

- [ ] **Step 6: Invert `bin/lib/skill-audit/tests/relationship-rows.test.js`**

Its corpus assertion currently reads `assert.strictEqual(total, 510)`. After this task the answer is 0. Invert it into a regression guard:

```js
test('no skill carries a Relationship section any more', () => {
  // The convention was removed in Phase 2b — 124.5 KB of author-facing meta that
  // every invocation paid for. This guard stops it creeping back one skill at a time.
  for (const name of names) {
    const md = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    assert.strictEqual(
      extractRelationshipRows(md).length, 0,
      `${name}/SKILL.md has a Relationship section again — put the edge in docs/skill-graph.md`,
    );
  }
});
```

The parser keeps its unit tests and its purpose: it is the migration tool and now the guard.

- [ ] **Step 7: Measure, verify, commit**

```bash
npm test 2>&1 | tail -5          # 0 failures
```

Measure the actual saving with the same method Phase 1 used — bytes before minus bytes after across the 32 files — and record the real number. Do not carry the ~124.5 KB projection into the CHANGELOG; Phase 1's figures went stale exactly this way.

---

### Task 5: Fix the defects the triage surfaced (see the table below)

**Files:** `skills/help/SKILL.md` + `skills/help/reference-card.md`; `skills/backlog/SKILL.md`; `skills/tidy/SKILL.md` + `skills/tidy/actions-github-issues.md`; `skills/capture/SKILL.md`

These are real defects independent of the bloat work, found because classification forced someone to read every row against its target. Verify each against the live files before fixing — an issue body's own account of a defect is not evidence (`[IL-71]`), and this list is exactly that.

| # | Defect | Fix |
|---|---|---|
| 1 | `help` row 14 places `stories` between `test` and `review`; `reference-card.md` has it between `build` and `test` | Determine which is right from the pipeline itself, correct the wrong one |
| 2 | `help` row 24 calls `design-wrapper` a Utility; `reference-card.md:29` lists it as a Component | Correct the row, or the card |
| 3 | `backlog` row 17 credits `groupByFileOverlap`/`grouping.js` to overview-mode, which only calls `ranking.js`'s `rankNextToBuild` | Verify actual callers, then state them correctly in the graph edge |
| 4 | `tidy` row 7 claims `extractFingerprint` backs the Sync payload; `actions-github-issues.md` uses only `recordPayload` | Verify; if stale, drop the claim rather than relocating it |
| 5 | `help` rows 5 and 25 describe recommendation behaviour absent from Section 3's Priority Order | Documented-but-unimplemented. File as work records rather than fixing inline — implementing them is out of scope here |
| 6 | `capture` row 7 says leftover work becomes a `parked` record, conflicting with `capture/SKILL.md:22`'s Defer attribution to `tidy` | Resolve which is correct, fix the loser |
| 7 | `design-wrapper` row at `SKILL.md:262` claims `_shared/design-wrapper-handling.md` "documents the universal `{result}` / `{skipped}` / `{deferred}` / `{fail}` shapes" — that file contains **zero** occurrences of any of those brace tokens | Read the file's actual return-shape notation first. Either the notation changed or the claim was never true; do **not** carry the row's notation forward on faith when rewording |

---

### Task 6: Release

- [ ] **Step 1: Bump `.claude-plugin/plugin.json`**

`git fetch origin main` first, then check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json` for a bump landed by a concurrent session — local history alone is blind to one that landed upstream (`[IL-12]`). Minor bump; this is a feature-scale change.

- [ ] **Step 2: CHANGELOG entry with measured figures**

Use Task 4 Step 7's measurement, not the projection. State what left the payload, what moved into step bodies, and where the edges now live.

- [ ] **Step 3: Merge, then mirror**

The marketplace `source` is an unpinned git URL tracking this repo's `main` HEAD, so mirroring from an unmerged branch publishes a version that does not exist upstream. Merge first, then mirror `plugins[0].version` and bump `metadata.version` in `thomasholknielsen/claude-tweaks-marketplace`. The two pushes are one action; that action begins once the bump has landed on `main` (`[IL-59]`).

---

## What this plan deliberately excludes

- **Anti-Pattern compression (Phase 3).** 72 KB → ~43 KB, compressed in place, never evicted. Separate plan; the reasoning for keeping them inline is in the design doc's "What deliberately does not move".
- **Implementing `help`'s two documented-but-missing recommendations.** Task 5 files them; building them is its own work.
- **[#119](https://github.com/thomasholknielsen/claude-tweaks/issues/119) prose diet and [#120](https://github.com/thomasholknielsen/claude-tweaks/issues/120) bloat detection.** #120's thresholds should calibrate against the post-removal state, so it stays sequenced last.
