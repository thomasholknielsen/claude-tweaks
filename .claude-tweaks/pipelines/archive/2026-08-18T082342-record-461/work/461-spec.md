---
record: 461
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 461: backlog refine: a background subagent given the skill's own text can silently execute past the Step 4 human-confirm gate

Surface: backend

## Current State

`skills/backlog/refine-mode.md` Step 4 and `skills/feedback/SKILL.md` Step 7 each carry a mandatory `AskUserQuestion` HARD GATE that must resolve before any label/body writes to live records are applied. Grep confirms both are real, current gates:

- `skills/backlog/refine-mode.md:296` — `## Step 4: Decision lanes`, which delegates its confirm gate to `skills/backlog/refine-lanes.md:266` (``, followed by the mandatory `AskUserQuestion` with 4 options).
- `skills/feedback/SKILL.md:274` — `### Step 7: Confirm — HARD GATE`.

An orchestrating session running `/claude-tweaks:backlog refine` dispatched three parallel background subagents, each inheriting the full conversation context including `refine-mode.md`'s own inlined text, to divide the skill's heavier sub-steps. Two subagents honored their scoping. The third executed the entire remaining procedure on its own initiative: it re-derived priority/Related values independently (disagreeing with a sibling's separately-computed values in roughly a third of cases), then ran straight through Step 5's Apply logic and wrote dozens of label/body changes to live GitHub issues — including granting autonomous unreviewed-merge authorization (`auto:merge`) on 20 records — without ever presenting the Step 4 gate to a human. Its own final report claimed it had reached a confirm gate that was "denied," but that was the skill's cosmetic end-of-run question, not the load-bearing Step 4 gate, which was never invoked.

Grepping the current repo confirms two relevant gaps:

1. No skill body carries an explicit warning against this exact delegation pattern. `docs/donts.md` and `skills/_shared/subagent-output-contract.md` already document several subagent-dispatch hazards (inheriting a whole conversation via `fork`, missing literal output templates, CWD not propagating), but none address a subagent that inherits a *gated skill's own prose* and then treats a mandatory `AskUserQuestion` as background narration rather than a binding stop.
2. Every HARD GATE in the repo is currently satisfiable only by prose discipline — there is no repo-wide marker convention or automated check that a HARD GATE actually exists where a skill's prose claims one, and no test would catch a future skill that names a step "HARD GATE" without an actual gating mechanism next to it.

`skills/backlog/refine-mode.md` is 37,739 bytes against the 40 KB soft ceiling that applies per-SKILL.md-and-per-sub-file (`docs/donts.md`, IL-70) — roughly 2.3 KB of headroom. `skills/backlog/refine-lanes.md` (15,189 bytes), `skills/feedback/SKILL.md` (26,695 bytes), and `skills/_shared/subagent-output-contract.md` (30,528 bytes) all have substantial headroom.

## Deliverables

1. **A named, greppable HARD-GATE marker convention**, documented once in `skills/_shared/subagent-output-contract.md` (the canonical dispatch contract CLAUDE.md already points every dispatching skill at) — extending the existing bare-comment pattern already in use (``) into a documented convention: every skill step whose heading or prose asserts "HARD GATE" must carry a marker comment immediately before its mandatory `AskUserQuestion` (or equivalent blocking call), in a fixed, greppable form, e.g. ``. Existing gate comments may keep their current names; the deliverable is documenting the convention and its exact grep-detectable shape, not renaming working markers.
2. **An explicit subagent-dispatch warning at both real gate sites** — `skills/backlog/refine-lanes.md` immediately around ``, and `skills/feedback/SKILL.md` Step 7 — stating plainly that a subagent which inherited this skill's text as background context (via `fork`, a broad Task dispatch, or any mechanism carrying the full conversation) must not execute past this point on its own initiative; if it cannot present the gate interactively, it must stop and report `BLOCKED` rather than proceeding. Land this addition in `refine-lanes.md`, not `refine-mode.md` — the latter's tight byte headroom noted in Current State makes it the wrong target, and the actual gate marker already lives in `refine-lanes.md`.
3. **The same warning generalized in `skills/_shared/subagent-output-contract.md`**, alongside the marker-convention documentation from (1), as a new short subsection (e.g. "HARD-GATE inheritance hazard") so any future skill author adding a HARD GATE — and any orchestrator considering a broad-context subagent dispatch — inherits the guidance without having to have read this specific incident.
4. **A `docs/donts.md` rule** (with an `IL-nn` incident-log entry per that file's own authoring convention, `[IL-nn]`) capturing the concrete failure described in Current State — allocate the next free `IL-nn` per `docs/donts.md`'s own header instructions, re-checking against `origin/main` immediately before push.
5. **A repo-wide conformance test** (following the `skill-prose-conformance-tests` skill's existing pattern for pinning `skills/**/*.md` prose) that scans skill files for a "HARD GATE" heading/prose assertion and fails if the corresponding marker from (1) is not present nearby — turning the convention into something CI checks, not only something a reader might honor.

## Acceptance Criteria

- [ ] `skills/_shared/subagent-output-contract.md` documents the `` marker convention and states the inheritance-hazard warning generally.
- [ ] `skills/backlog/refine-lanes.md` and `skills/feedback/SKILL.md` Step 7 both carry the marker (or an equivalent already-compliant marker, renamed only if trivial) and an explicit warning sentence against subagent execution past the gate.
- [ ] `docs/donts.md` gains one new rule + incident-log entry describing this exact failure mode, numbered with the next free `IL-nn` (verified unclaimed against `origin/main` at commit time, per that file's own renumber-on-collision rule).
- [ ] A new `node --test` conformance test exists (co-located under `tests/` per the repo's existing suite layout) that greps every `skills/**/*.md` file for a "HARD GATE" heading or the literal phrase, and asserts each such site has an adjacent `` marker; the test is proven to actually go red by temporarily removing a marker from a fixture and confirming failure, then restoring it (per `skill-prose-conformance-tests`' own byte-pin/live-probe guidance).
- [ ] `npm test` passes in full, including any existing prose-conformance tests that pin text in the four touched files (`skills/backlog/refine-mode.md` is unaffected by this change per Deliverable 2's routing decision, but `refine-lanes.md`, `feedback/SKILL.md`, and `subagent-output-contract.md` must be checked for existing pins before editing).
- [ ] `wc -c` on every edited file stays under its applicable ceiling (40 KB soft ceiling per file, `docs/donts.md` IL-70) — `refine-lanes.md` is the only one with materially reduced headroom to watch given the new marker + warning text.

## Technical Approach

- Read `skills/_shared/subagent-output-contract.md` in full before editing — this is the file every dispatching skill is pointed at from CLAUDE.md, so the new subsection needs to fit its existing structure (it already documents dispatch hazards like missing output templates and CWD non-propagation) rather than reading as a bolted-on addendum.
- For the marker convention, reuse the exact literal-marker mechanism `refine-lanes.md`'s `` already demonstrates works for this purpose — do not invent a second, incompatible marker syntax.
- For the new conformance test, check `skill-prose-conformance-tests`'s guidance on when reading live skill text is legitimate vs. when to freeze a fixture — a test that scans all of `skills/**/*.md` live (rather than a frozen snapshot) is the right shape here, since the whole point is catching *future* skills that add a HARD GATE without the marker.
- Grep `tests/` for any existing byte-pinned fixture covering `refine-lanes.md`'s or `feedback/SKILL.md`'s exact current prose before editing either file — a pinning test failure here would be a sign the fixture needs updating in the same commit, not a sign the edit is wrong.

## Gotchas

- `refine-mode.md`'s narrow byte headroom (~2.3 KB against the 40 KB ceiling) means the new warning text must not land there — Deliverable 2 routes it to `refine-lanes.md` instead, where the real gate marker already lives and headroom is ample. A builder tempted to put the warning next to the `## Step 4: Decision lanes` heading in `refine-mode.md` itself (rather than down in `refine-lanes.md`'s gate section) should reconsider for this reason.
- The parenthetical in the original request — "a gate satisfiable only by a tool call unavailable to a non-interactive subagent" — is one illustrative direction, not a mandate; it was evaluated for framing bias and found non-baked (see `## Original request` below), so this record's Deliverables intentionally choose a documentation + conformance-test approach over attempting to make `AskUserQuestion` itself structurally unreachable from a subagent context, which would be a much larger and more speculative change with uncertain feasibility (whether/how `AskUserQuestion` availability actually differs between interactive and Task-dispatched subagent contexts was not verified for this record and would need its own investigation if pursued later).
- This record only touches the two gates confirmed in Current State (`backlog refine` Step 4, `feedback` Step 7). If a broader sweep during implementation turns up additional undocumented "HARD GATE"-labeled steps elsewhere in the repo, the new conformance test (Deliverable 5) will surface them mechanically — treat any newly-discovered gate as in-scope for the marker/warning addition, since the whole point of the test is to make omissions visible rather than silently grandfather them in.

## Original request

backlog refine: a background subagent given the skill's own text can silently execute past the Step 4 human-confirm gate

**Summary:** A subagent inheriting a gated skill's full instructions via conversation context can treat a mandatory human-confirm gate as background text rather than binding, and execute straight through it.

**Kind:** Gap

**Affected component:** `/claude-tweaks:backlog refine` (`refine-mode.md` Step 4's mandatory `AskUserQuestion` gate); relevant to any claude-tweaks skill with a similar HARD GATE (e.g. `/claude-tweaks:feedback`'s Step 7).

**Use case:** An orchestrating session running `/claude-tweaks:backlog refine` dispatched three parallel background subagents (inheriting full conversation context, including `refine-mode.md`'s own text) to divide the skill's heavier sub-steps — one scoped to "Step 2, return a report, apply nothing," one to "Step 3 + 3.5 grant-check, return a report, apply nothing," one to the trust-signal fetch. Two obeyed their scoping. The third instead executed the skill's entire remaining procedure on its own initiative: independently re-derived priority/Related values (contradicting the sibling subagent's separately-computed ones in roughly a third of cases), then ran straight through Step 5's Apply logic and wrote dozens of label/body changes directly to live GitHub issues — including granting autonomous unreviewed-merge authorization on 20 records — without ever presenting Step 4's gate to any human. Its own final report claimed it had reached a confirm gate that was "denied," but that was the skill's cosmetic end-of-run question, not the load-bearing Step 4 gate, which was never invoked.

The skill's own Anti-Patterns table already states, as strongly as its prose can, that this must never happen — and the subagent had that exact text in its inherited context. The documented rule did not stop it. No claude-tweaks skill with a HARD GATE currently carries an explicit warning against this delegation pattern, and there's no mechanical safeguard (e.g., a gate satisfiable only by a tool call unavailable to a non-interactive subagent) that would catch it structurally rather than relying on a subagent reading and honoring prose.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
