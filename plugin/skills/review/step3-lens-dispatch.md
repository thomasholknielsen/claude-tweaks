# Step 3 Lens Scope and Dispatch — /claude-tweaks:review

Read from `SKILL.md`'s Step 3 before dispatching any lens. Holds the `review-effort` tier →
lens-scope mapping, the dispatch contract (context bundle, reproduction pairs, model profiles),
and the question list for lenses 3a-3f. The severity floor per lens stays in `SKILL.md`; the
canonical agent prompt (Calibration block + OUTPUT FORMAT) lives in `step3-routing.md`.

"Above" in the next section means `SKILL.md`'s Step 3 preamble — the "skip lenses that don't
apply to the type of change" rule and the severity-floor table.

## Lens scope and dispatch

**Lens scope by `review-effort` tier** (resolved in Step 2.5): lower tiers dispatch fewer agent-based lenses, trading breadth for speed and higher-confidence-only output; higher tiers trade speed for broader coverage.

| Tier | Agent-dispatched lenses in scope |
|------|------|
| `low` | 3b, 3c |
| `medium` | 3b, 3c, 3a, 3f |
| `high` | 3b, 3c, 3a, 3f, 3d, 3e, 3h — every applicable lens. **Reproduces this skill's pre-existing default behavior.** |
| `xhigh` | Same lens set as `high` |
| `max` | Same lens set as `high` |

A lens outside the resolved tier's scope is never dispatched — it does not run and produces no findings. The pre-existing "skip a lens if it doesn't apply to this change type" rule (above) still applies on top of whichever set the tier allows — e.g. at `high`, Performance is still skipped for a docs-only diff. Lens 3h additionally requires QA data to be available at all (its own existing, effort-independent gate) — when QA data isn't available, 3h doesn't run even at `high`+. Lenses 3g-cov, 3i, and 3i-diagram are **not** gated by effort at all — they're main-thread/deterministic, not agent-dispatched, and stay gated only by their own existing data-availability conditions.

Reproduction pairs (the 2-agent verification dispatch below) always run for every lens that already uses the reproduction-pair mechanism (3a-3f) and is in scope at the resolved tier — verification is never skipped, only the initial lens set that gets a chance to flag something. (3h is never reproduction-paired, at any tier — see the "not dispatched as reproduction pairs" note below.)

At `xhigh` and `max`, append the resolver's `effortLine` output to each dispatched lens's prompt, after the Output Format block (do not modify the CALIBRATION block itself — it stays byte-identical across all tiers, per `step3-routing.md`'s dispatch contract): resolve the lens's profile per `_shared/subagent-output-contract.md`'s Model Selection dispatch procedure and append the returned `effortLine` verbatim — shape `[Effort: {level} — apply {level}-level reasoning depth to this task.]`. This is still a best-effort prompt-level nudge, not a verified change to the dispatched agent's actual reasoning depth — the lens-scope table above is the load-bearing mechanism — but it is now the resolver's own honest statement of effort rather than a hand-written sentence, so it never drifts from what the resolver actually returned.

> **Working Directory Discipline:** Applies to every `Task()` dispatch in Step 3, Step 3.5, and Step 3.6 (reproduction, debate, refutation, and gap-sweep agents). Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any git or path-sensitive command in the agent prompt. See also `_shared/git-discipline.md`.

> **Full diff content is read here, in the lens agents — not in the main thread.** Step 2 deliberately holds only `--stat`/`--name-only`, so this dispatch is the first point at which actual diff content is read. Give each lens agent the shared context bundle's path (built below) plus the diff *scope* — the base/branch refs, or the own-work file set when the Merge-Provenance Check found merge commits. Do not inline diff text into the prompts from the main thread: every dispatched agent has its own context window, and re-inlining the diff N times reintroduces the cost Step 2 exists to avoid.

> **Parallel execution — assemble the shared context on disk, never in main-thread context.** Every lens needs the same files, so build the bundle once using shell redirection, whose content never enters this thread, and hand every dispatched agent the same path:
>
> ```bash
> CTX="/tmp/review-context-$(git rev-parse --short HEAD).md"
> { git diff {base}...{branch}
>   git diff {base}...{branch} --name-only | while read -r f; do
>     printf '\n===== %s =====\n' "$f"
>     cat -- "$f" 2>/dev/null
>   done
> } > "$CTX"
> wc -c "$CTX"    # only the byte count enters this thread
> ```
>
> A section can legitimately come out empty — a deleted file, or a path git quoted for non-ASCII characters that `cat` then couldn't open. That degrades safely rather than silently: the full diff sits at the top of the same bundle, so the agent still sees that file's change either way.
>
> Do **not** `Read` the changed files into this thread to "front-load" them. `Read` places their full content in main-thread context, and each dispatched agent still reads its own copy regardless — so the front-load saves no I/O and costs the entire diff plus every touched file, the exact cost Step 2 exists to avoid. An agent needing more than the bundle (imports, schemas, callers) reads those itself, in its own context window.

> **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a **reproduction pair** — 2 identical agents per lens (up to 12 Task agents total: 6 reproduction lenses × 2). When the diff is smaller, run each lens as a 2-agent reproduction pair sequentially in the main thread. Lenses 3g-cov, 3h, and 3i are not dispatched as reproduction pairs — they run as single agents (3h) or main-thread procedures (3g-cov, 3i).
>
> **Reproduction dispatch (Mode 1 — per lens):** For each lens, dispatch 2 agents in one batch with **byte-identical prompts** (same scope, same Template-A contract, same model profile). Independent runs — no agent sees the other's output. After both return, write each agent's `findings` array to a temp file and call `categoriseReproduction`:
> ```bash
> node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
>   console.log(JSON.stringify(c.categoriseReproduction(require(process.argv[1]), require(process.argv[2]))))" \
>   /tmp/lens-${LENS}-agentA.json /tmp/lens-${LENS}-agentB.json
> ```
> A dispatched lens agent that fails mid-flight is a different case from one that completes — see `_shared/subagent-output-contract.md`'s "Failed-agent retrieval" section for how to read its result cheaply, without blocking on the full envelope.
>
> - Findings present in both agents' outputs (path exact, line ±2, matching severity bucket) → emit as `confirmed`. Write to `decisions.md`: `AUTO {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} reproduced. Confirmed. Reversibility: high.`
> - Findings present in only one agent's output → emit as `unconfirmed`. Write: `STAGED {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.` Unconfirmed findings do **not** enter Step 3 Routing — they route directly to the Wrap-Up Console's Low-confidence subsection.
>
> **Direct-verification override.** An `unconfirmed` finding can still be elevated to `confirmed` — an *additional* path alongside reproduction-pair agreement above, never a replacement for it — when the reviewing agent itself reads the actual conflicting source text the finding is about (the real file content, not the reproduction agent's report of it) and independently confirms the finding. This applies only in interactive/hybrid mode, or when an auto-mode agent's own pass happens to read that source directly as part of its work — never as blanket license for an unattended auto run to wave through every `unconfirmed` finding. Merely agreeing with the single agent's report, without independently reading the source, does not qualify — the override exists because independent source-reading rules out two agents sharing the same misread, which agreement-with-a-report cannot rule out. When it applies: re-emit the finding as `confirmed`, write `AUTO {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} elevated via direct-verification override (source read independently). Confirmed. Reversibility: high.`, and let it enter Step 3 Routing as an ordinary `confirmed` row.
>
> **Model profile (per lens):** 3a (Convention) and 3f (Test Quality) → [Use: Fast] — mechanical convention checks on isolated files. 3b-3e (Security, Errors, Performance, Architecture) → [Use: Standard] — multi-file analysis and cross-cutting findings. 3h (UX Analysis) → [Use: Capable] — judgment-heavy synthesis. Resolve each via `node plugin/bin/resolve-profile.js {profile}` (contract § Model Selection).
>
> **Output template (each agent must follow exactly):** The Calibration block + OUTPUT FORMAT must be reproduced byte-identical in each dispatched agent's prompt — do NOT paraphrase. Read `step3-routing.md` in this skill's directory for the canonical dispatch template; inline it verbatim into every `Task()` call.

## Lens definitions (3a-3f)

### 3a: Convention Compliance

- Does the code follow naming conventions documented in CLAUDE.md?
- Are project patterns followed (error handling, validation, logging)?
- Are shared utilities used instead of reinventing (check existing packages)?
- Are imports from the right packages (not duplicating types inline)?
- Does the code follow patterns documented in `.claude/skills/*.md`? Append a `review/skill` ledger entry when the code **diverges** from a skill (flag it in the findings table too — the code may be correct and the skill stale), **extends** a documented pattern with a new wrinkle worth capturing (enrichment), or establishes a reusable pattern in a domain **no skill covers** (tag the entry `[skill: NEW - {name}]` — hyphen, not em-dash, for tooling friendliness). Keep it to a one-line entry — `/claude-tweaks:wrap-up`'s Skills curation row does the deep analysis.

### 3b: Security

- Input validation at system boundaries?
- No raw SQL or command injection risks?
- Authentication/authorization checks present where needed?
- No secrets or sensitive data in code?
- OWASP top 10 considerations?

### 3c: Error Handling

- Appropriate error types used (project's error class, not raw Error)?
- Edge cases handled (null, empty, malformed input)?
- Errors logged with sufficient context for debugging?
- User-facing errors safe (no internal details leaked)?

### 3d: Performance

- No N+1 query patterns?
- Appropriate use of caching where applicable?
- No unnecessary re-renders (React)?
- Database queries have proper indexes?
- Pagination used for unbounded lists?

### 3e: Architecture

- Right level of abstraction (not over/under-engineered)?
- Proper separation of concerns?
- Dependencies flow in the right direction?
- No circular dependencies introduced?
- Changes consistent with existing architecture?
- **Shallow modules?** Does any new module have an interface nearly as complex as its implementation (a pass-through wrapper, a module whose interface mirrors its single dependency)? Flag at most the 1-2 most leverage-worthy at medium severity — and when shallow abstractions or wrong boundaries are the theme, recommend `/claude-tweaks:deepen` for a dedicated depth pass rather than trying to resolve module-level restructuring inline here. (module-level depth criteria: `_shared/criteria-architecture-depth.md`)

### 3f: Test Quality

- Tests verify behavior through the public interface, not implementation details? (No asserting on private methods, spying on internal collaborators, or checking intermediate data shapes that exist only because of the current implementation.)
- **Refactor-coupling diagnostic:** would this test break if you renamed an internal function or restructured the implementation *without changing behavior*? If yes, it's testing implementation, not behavior — flag it. The point of a test is to survive refactors and fail only when behavior breaks.
- **Test names read as specifications?** A good name states a capability ("user can checkout with a valid cart"), not an implementation path ("returns 200 when cart items quantity > 0 and user authed"). Flag names that describe internals.
- Edge cases and error paths tested?
- Test data is realistic and follows schemas?
- No test pollution (shared mutable state)?
- Mocks are minimal and at the right level? (Mocking internal collaborators is a smell — prefer real objects or interface-level stand-ins.)
