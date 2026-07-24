# Review — Step 3.5/3.6: Cross-Lens Debate, Per-Candidate Refutation, and Gap-Sweep

Loaded by `/claude-tweaks:review` after Step 3's per-lens reproduction completes. Contains the full procedure for the three effort-gated findings-quality mechanisms: Cross-Lens Debate and the Per-Candidate Refutation Pass (Step 3.5), and Gap-Sweep / Completeness Critic (Step 3.6). Lazy-loaded only when the resolved `review-effort` tier (Step 2.5) is `high` or above — at `low`/`medium`, SKILL.md's own gate skips straight to Step 3 Routing without reading this file at all.

## Step 3.5: Cross-Lens Debate & Per-Candidate Refutation

Two independent findings-quality mechanisms live in this step, each gated at its own `review-effort` tier (Step 2.5). Cross-Lens Debate resolves contradictions between different lenses reviewing the same region. The Per-Candidate Refutation Pass re-examines every individually `confirmed` finding for correlated error that reproduction-pair agreement alone can't catch — two reproduction agents sharing the same blind spot, or the same miscalibration, still agree with each other. They operate on different inputs — debate on cross-lens contradiction pairs, refutation on the whole `confirmed` bucket once debate has resolved — and both can fire in the same `xhigh`/`max` review without interfering with each other.

### Cross-Lens Debate

**Skip this entire step when the resolved `review-effort` tier (Step 2.5) is `low` or `medium`** — contested findings remain `unconfirmed`/staged without a debate round, trading resolution depth for speed at the lower tiers, matching Step 3's own narrower lens scope there. At `high` and above, run as follows:

After per-lens reproduction completes, scan for contradictions across lenses before routing. Two lenses that both flagged the same region with mismatched severity get exactly one debate round to converge or escalate to `contested`. A silent lens — one that reviewed the region but produced no finding there at all — cannot enter this mechanism: `detectCrossLensOverlap` below only pairs findings that exist in *both* lenses' arrays, so the asymmetric "one flagged, the other did not" case has no data to pair against and is never dispatched (see step 5's skip condition).

1. **Detect overlap.** Collect each lens's `confirmed` and `unconfirmed` findings into one `{lensName: [findings...]}` object, write it to a temp file, and call `detectCrossLensOverlap`:
   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
     console.log(JSON.stringify(c.detectCrossLensOverlap(require(process.argv[1]))))" \
     /tmp/findings-by-lens.json
   ```
   It returns pairs `{lensA, lensB, findingA, findingB}` for findings on the same `path` within ±5 lines from *different* lenses.

2. **Filter to contradictions.** Each overlap pair already has a finding from both lenses (by construction of step 1) — keep only those where the two findings' severities don't match. Pairs where the severities match (both lenses agree) produce no debate.

3. **Dispatch debate (Mode 2 — 2 agents, 1 round, parallel).** For each contradiction, dispatch 2 agents using the original lens-agents' identity (re-dispatch the affected lens's reviewer with the *stripped opposing finding* as input — no model identity, no reasoning chain, just finding text + evidence). Both judges return `agree | disagree | partial` plus one paragraph of reasoning. Inline this template literally in each `Task()` prompt:
>
>    ```
>    Two lenses disagreed on this region. Review the conflicting findings below and return:
>    First line: one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Then:
>    1. Verdict: agree / disagree / partial
>    2. One paragraph of reasoning.
>
>    Contested region: {path}:{line}
>    Finding A (lens: {lensA}): {finding text}
>    Finding B (lens: {lensB}): {finding text}
>
>    [Use: Capable model — debate agent. Independent run; do not see the other judge's reasoning.]
>    ```

4. **Resolve.** Apply `resolveDebate`:
   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
     console.log(c.resolveDebate(process.argv[1], process.argv[2]))" "$VERDICT_A" "$VERDICT_B"
   ```
   - Both `agree` → finding upgraded to `confirmed`. Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged positive after 1 round. Reversibility: high.`
   - Both `disagree` → finding downgraded to `unconfirmed` (lands in Low-confidence subsection). Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged negative after 1 round. Reversibility: high.`
   - Mixed / partial → finding becomes `contested`. Write `STAGED {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} inconclusive ({verdicts}). Both verdicts staged. Reversibility: high.` Stage the side-by-side verdicts to `staged/review-contested-{N}.md`.

5. **Skip debate** when no overlap is detected, or when only one lens covered a region. Avoid running debate on every `Path:Line` where any two lenses touched — that explodes the token budget for no value.

### Per-Candidate Refutation Pass

**Skip this entire step when the resolved `review-effort` tier (Step 2.5) is not `xhigh` or `max`** — one tier stricter than Cross-Lens Debate's `high`+ gate above, so `high`-tier reviews aren't paying for both mechanisms at once. At `xhigh` and `max`, run as follows:

This is explicitly NOT a second reproduction pair — reproduction pairs (Step 3) check agreement between two initial readers; refutation is a distinct, later agent whose only job is to try to break a finding that already survived that agreement. Correlated error (both reproduction agents sharing the same blind spot, or the same miscalibration) is exactly what agreement alone can't catch. This was caught concretely during the #45 native-review prototype: a dedicated verifier subagent, dispatched per surviving candidate finding with the explicit job of trying to falsify it using fresh evidence-gathering, caught false positives that reproduction-pair agreement alone had let through.

> **Parallel execution:** Dispatch one refutation agent per `confirmed` candidate as parallel Task agents — each runs independently, sees only its own candidate finding (not the other candidates or the lens's original reasoning chain), and returns a `refuted`/`not-refuted` verdict. Assemble results after all agents complete.

1. **Collect candidates.** Once Cross-Lens Debate above has resolved, take the full `confirmed` bucket — every finding that would otherwise proceed to Step 3 Routing, whether it got there via plain reproduction or via debate converging positive.

2. **Dispatch one refutation agent per candidate, given fresh file access.** Each agent gets the finding's path/line/severity/evidence and fresh read access to the actual current file content (not the finding's cached evidence text) — instructed to actively try to falsify it: re-trace whether the claimed failure is actually reachable, verify the cited evidence still matches the current code, and challenge the reasoning rather than restate it. Inline this template literally in each `Task()` prompt:
>
>    ```
>    You are trying to FALSIFY this finding, not confirm it. Re-read the actual current file
>    content at {path}:{line} (do not trust the cached evidence text below) and determine
>    whether the claimed issue is real and reachable.
>
>    First line: one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Then:
>    1. Verdict: refuted / not-refuted
>    2. One paragraph of reasoning, citing what you actually found in the current file.
>
>    Candidate finding: {path}:{line}
>    Severity: {severity}  Category: {category}
>    Finding: {finding text}
>    Cached evidence: {evidence text}
>
>    [Use: Capable model — refutation agent. Independent run; fresh file read, not the
>    lens's original context.]
>    ```

3. **Resolve.** First check the dispatched agent's own status line, per the Subagent Contract (`_shared/subagent-output-contract.md`): a `BLOCKED`/`NEEDS_CONTEXT` status, or a response with no parseable `Verdict:` line, means the refutation attempt itself failed — do not fabricate a verdict for `resolveRefutation`. Treat this case directly: downgrade to `unconfirmed` and write `AUTO {HH:MM:SS} — Refutation: {path}:{line} — dispatch failed ({status}/unparseable verdict), not genuinely re-examined. Downgraded to unconfirmed out of caution. Reversibility: high.` A failed dispatch must never be logged as if a real falsification attempt happened.

   Otherwise, apply `resolveRefutation` to the parsed `Verdict:` value:
   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
     console.log(c.resolveRefutation(process.argv[1]))" "$VERDICT"
   ```
   `resolveRefutation` itself also fails toward scrutiny on any unrecognized value — only the exact literal `not-refuted` keeps a finding `confirmed`; `refuted` and anything else downgrade to `unconfirmed`. This is defense in depth against a malformed verdict slipping past the explicit status check above, not a substitute for it.
   - `refuted` → finding downgraded to `unconfirmed` (lands in Low-confidence subsection). Write `AUTO {HH:MM:SS} — Refutation: {path}:{line} refuted — {one-line reasoning}. Downgraded to unconfirmed. Reversibility: high.`
   - `not-refuted` → finding proceeds unchanged toward Step 3 Routing. Write `AUTO {HH:MM:SS} — Refutation: {path}:{line} not refuted — stands as confirmed. Reversibility: high.`

After Step 3.5, every finding has a final bucket — `confirmed`, `unconfirmed`, or `contested`. A `confirmed` finding downgraded by the Per-Candidate Refutation Pass above joins `unconfirmed` with the same visibility rules as any other unconfirmed finding. Only `confirmed` findings flow into Step 3 Routing. `unconfirmed` and `contested` are already staged to the Wrap-Up Console.

## Step 3.6: Gap-Sweep / Completeness Critic

**Skip this entire step when the resolved `review-effort` tier (Step 2.5) is not `xhigh` or `max`** — the same gate as the Per-Candidate Refutation Pass above, one tier stricter than Cross-Lens Debate's `high`+ gate, since this stacks additional cost on top of an already-thorough pass. At `low`/`medium`/`high`, this step is a no-op: no dispatch, nothing added to the summary. At `xhigh` and `max`, run as follows:

Each of lenses 3a-3i is angle-scoped by construction — 3b only looks for security issues, 3e only architecture, and so on — so a real defect that doesn't cleanly fit any single lens's angle can pass through every lens unflagged. This step asks the question none of them do: what did every lens, collectively, miss? This was caught concretely during the #45 native-review prototype: its own final "what did we miss" fresh-eyes pass caught 2 of 4 real findings that none of the angle-based finders surfaced.

Dispatch **exactly one** Capable-model (Opus) agent — **not a reproduction pair**. A fresh-eyes pass loses its value if paired/averaged against a second identical fresh-eyes agent, so resist the urge to "fix" this into a pair even though the pattern immediately above (Cross-Lens Debate, Per-Candidate Refutation Pass) dispatches multiple agents per unit of work — this step is deliberately single-source. Give the agent: the diff scope from Step 2 (the branch's-own-work scope when the Merge-Provenance Check found merge commits) and a compact list of what lenses 3a-3i already flagged — `path:line` + one-line summary for every `confirmed` and `unconfirmed` finding so far, after Step 3.5's debate and refutation have both resolved. Inline this template literally in the `Task()` prompt, per the Subagent Contract (`_shared/subagent-output-contract.md`) — Template A output:

```
You are a fresh-eyes reviewer. The following lenses have already reviewed this diff and
produced these findings: {already-flagged findings list, path:line + one-line summary}.
Do NOT restate any of these. Find genuine gaps — real defects the above list does not
already cover. If you find nothing beyond what's already flagged, return "No findings."

[... CALIBRATION + OUTPUT FORMAT block, byte-identical to the per-lens dispatch contract
in step3-routing.md ...]

[Use: Capable model — gap-sweep agent. Independent run; single dispatch, not a
reproduction pair.]
```

Findings returned are tagged with an internal `source: gap-sweep` marker (parallel to how lenses tag findings with their own lens name for Step 3 Routing's Category column) and inserted directly into the `unconfirmed` bucket — the same confidence tier a single-source, non-reproduction-paired lens finding gets. They are **not** auto-promoted to `confirmed` — there's no second agent to reproduce them against, by design. This reuses `step3-routing.md`'s existing `xhigh`/`max` inline-visibility rules (unconfirmed findings surface inline at `xhigh`+) — no new routing table needed. Write `STAGED {HH:MM:SS} — Gap-sweep: {path}:{line} — {one-line finding}. Staged to Review Console as low-confidence (gap-sweep, single-source by design). Reversibility: high.`

Check the agent's status line first, per the Subagent Contract: a `BLOCKED`/`NEEDS_CONTEXT` status, or a response that parses as neither a findings table nor the literal `No findings.`, means the sweep did not actually complete — write `STAGED {HH:MM:SS} — Gap-sweep: dispatch failed ({status}), sweep not genuinely performed. Reversibility: high.` so a persistently broken dispatch stays visible rather than silently reading as "we checked and found nothing." Only a genuine `DONE`/`DONE_WITH_CONCERNS` response with literal `No findings.` text logs nothing further, per the existing per-lens convention — no decision-log entry is needed for an actually-completed zero-findings pass.
