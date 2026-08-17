# Subagent Contract

Canonical input/output rules for parallel-dispatched subagents. Referenced from every Form B / Form C parallel-execution site across skills.

This file is the single source of truth. Skills include the relevant template **literally** in their `Task()` prompts — agents only see what's in their prompt, they cannot read sibling files.

## Why this exists

This contract is **dispatch correctness** discipline. A dispatched agent is not a cheaper copy of the main thread — it is a separate reasoning context the dispatcher cannot see into, and every rule below exists to make that separation safe to act on:

1. **A dispatch you cannot reproduce is a dispatch you cannot trust.** An agent handed the conversation inherits the dispatcher's framing and its half-formed conclusions, then confirms them. The clean room is what makes N agents independent evidence rather than N echoes — the precondition for reproduction, debate, and refutation (`multi-agent-coordination.md`) meaning anything at all.
2. **An outcome you cannot route is an outcome you will misread.** Without a fixed status line, "I couldn't find the file" and "I found nothing wrong" arrive as the same confident paragraph, and a failed dispatch aggregates silently as a clean result.
3. **A result you cannot parse is a result you will paraphrase.** Free-form prose from three agents gets merged by the dispatcher's summary rather than by its content — inventing severities, dropping findings, smoothing over disagreement. Templates A/B/C keep aggregation mechanical.
4. **A model mismatch surfaces as a wrong answer, not just a bill.** An under-powered agent on judgment work returns confident nonsense shaped exactly like a finding.

The contract addresses all four — **input discipline** (below), **the status protocol**, **output templates** (Templates A/B/C), and **model selection** (per-dispatch profile guidance) — and adds **working-directory discipline**, the same principle applied to the filesystem: an agent whose CWD the dispatcher merely assumed lands real commits on the wrong branch while the dispatcher's own `git status` looks fine — and **waiting discipline**, the same principle applied to resume signals: a dispatcher that parks per-agent instead of trusting the notification wastes exactly the context this contract exists to conserve.

Following it also costs less to run, and the templates are deliberately compact. Treat that as a welcome side effect, never as the justification: a dispatch that saves tokens while returning an unroutable, unparseable, or context-contaminated result has bought nothing. The one sizing rule here (inherited project context, under Input Discipline) exists to stop a fan-out from being wider than it is worth — not to price the protocol.

## Input Discipline

A dispatched agent is a clean room. Don't pass the conversation. Pass exactly:

1. **The task scope** — one sentence: "Audit `src/auth.ts` for the OWASP top 10."
2. **The file/path the agent should read** — explicit paths, not "the relevant code."
3. **The output template** — literally, inline. Agents only see what's in their prompt; they cannot read sibling files.
4. **Constraints that prevent overreach** — "Do not modify other files." "Read-only."

Do NOT pass: prior messages, the user's original phrasing, your own findings so far, or "background context for completeness." Each of those compounds across N agents.

When in doubt, give less context. If the agent comes back with `NEEDS_CONTEXT`, give it more on the re-dispatch.

**A file allowlist inherits the staleness of whatever it was derived from.** When the scope comes from an issue body, a design doc, or any other snapshot, the real work site may sit outside it — the four health-sweep skills file issues whose file lists are routinely wrong in both directions (a named file that isn't really affected, and an unnamed one that is). Say so in the dispatch: the agent must locate constructs by content rather than by the source's line numbers, and report an out-of-allowlist site under `DONE_WITH_CONCERNS` instead of silently scoping around it or editing outside its list. That report is cheap; a fix applied to the wrong file because the right one wasn't listed is not.

**Inherited project context is the dominant per-agent cost.** Every dispatched agent also inherits the project's `CLAUDE.md` in its system prompt — you do not pass it, and you cannot opt out of it. That inherited payload is typically an order of magnitude larger than a well-disciplined prompt, and it multiplies by N across a fan-out, so a wide dispatch of cheap, mechanical agents costs far more than its prompts suggest. Size a fan-out against the inherited total, not the prompt you wrote — and measure the current file rather than trusting a remembered figure, since it changes. Note the division of labour: input discipline governs only your share of the cost; the lever for the inherited term is keeping `CLAUDE.md` itself lean. Sonnet 5's tokenizer emits roughly 30% more tokens for the same text than its predecessor, so the inherited payload's cost rose with it — the lever is unchanged: keep CLAUDE.md lean.

**Pre-specify shared interface text across interdependent parallel dispatches.** When two dispatches in the same fan-out produce artifacts that must cite each other by exact text — a heading, a literal string, a function's return value, a CLI flag name — decide that exact text yourself and quote it in both prompts, rather than letting each agent invent its own wording and hoping they converge. Observed 3x on one 6-record batch run, each with zero-coordination convergence: a CLI interface's exact shape cited into a parallel SKILL.md-editing agent's prompt, a heading's exact characters cited into a second, a function's literal output (`formatOffsetClause`, see `feedback/session-evaluation.md`'s watermark offset clause) cited into a third — every agent landed on identical text with no reconciliation step needed. The technique is an extension of Input Discipline point 3 (inline the output template literally) to the *input* side: when a dispatch's correctness depends on matching another artifact byte-for-byte, that other artifact's text is exactly the kind of thing that must not be left for the agent to guess.

## Working Directory Discipline

Agents do not inherit the dispatcher's CWD reliably. When a dispatch will run `git`, `node --test`, or any path-sensitive command, **anchor the working directory explicitly** in the prompt. Both forms work; pick one and use it consistently:

- **Explicit cd**: every shell step begins with `cd "/absolute/path/to/worktree" && ...`
- **`git -C` form**: every git command is `git -C "/absolute/path/to/worktree" <subcommand>`

**Substitute the path before dispatching.** The prompt must carry the resolved absolute path, never an unexpanded placeholder like `$WORKTREE` — the agent's shell does not share the dispatcher's variables. A brief that says "verify `cd "$WORKTREE"`" while also forbidding the agent from creating worktrees leaves it no legal move when the substitution didn't happen: `BLOCKED` is then the correct response, and the round-trip is pure waste. If the dispatch template interpolates a path, check one rendered prompt before sending the batch.

Before any commit step, the implementer must echo `pwd` and `git rev-parse --show-toplevel` and verify both match the expected worktree. A mismatch means the commit is about to land on the wrong branch — `BLOCKED` is the correct response.

**Why this matters:** When the dispatcher is itself inside a worktree (e.g., running from `.claude/worktrees/<name>/`), a dispatched agent can resolve a different CWD and commit to the parent repo's checked-out branch instead of the worktree branch. The branches diverge silently — the dispatcher's `git status` looks fine, but the commit went to `main`. The same risk applies to reviewer agents that run `node --test` from the parent repo where the new test files don't exist and report false failures.

When the dispatch is for a verification or test-running agent (no commits), the working directory still matters: results depend on which files are visible.

During worktree-mode pipeline runs this rule is mechanically enforced — the plugin's PreToolUse hook denies commits whose resolved checkout differs from the run's recorded worktree assignment.

**When the implementer's own isolation is `EnterWorktree`-based, its shell is restricted too.** A dispatched implementer that enters its assigned worktree via the native `EnterWorktree` tool (rather than merely `cd`-ing into a path a Bash call already sees) runs the rest of its session under a harder constraint than anything above: `&&` chains and heredocs are refused by shape, not just discouraged by convention. The dispatch prompt must say so explicitly — one plain command per Bash call, `Edit`/`Write` instead of a heredoc append, and no reliance on a shell variable surviving between calls. The mechanical detail and its rationale are documented once, canonically, in `skills/_shared/scratch-worktree.md`'s "## 7. Shell constraint" — cite it rather than restating it here. Observed across five implementer dispatches on the skill-invocation-ledger build: every dispatch that baked this constraint into its prompt up front avoided the failure; none that omitted it did.

**Never run `git stash` in any form.** A dispatched agent shares its worktree with the dispatcher and possibly sibling agents, and `git stash` (worse, `--include-untracked`) sweeps *their* in-flight state — staged edits, untracked files it never saw created — into a stash entry nothing else knows exists; an agent that finishes without restoring it has silently deleted sibling work, and the loss surfaces only when the dispatcher next looks for those files. The stash stack is also shared repo-wide across every worktree, so even a restore can collide with another session's entries. To compare against a clean baseline, read it without mutating the tree: `git show HEAD:<path>` for file contents, `git diff HEAD -- <path>` for what changed. To set your own work aside, make a WIP commit on the branch instead.

## Waiting for Dispatched Agents

The task-notification that arrives when a dispatched agent finishes is the **primary resume signal** — it is what actually wakes the dispatcher, not a per-agent `ScheduleWakeup` park-and-poll loop (a bounded slot-fill poll like `/test`'s QA dispatch is a different, still-valid pattern — see that skill's `qa-prompts.md`). Treat the notification as the default: after dispatching a wave of parallel agents, let their completion notifications drive the next turn.

**Cap parking to one long-delay watchdog per dispatch wave, not one per dispatch.** A `ScheduleWakeup` call for every individual agent in a fan-out is redundant against the notification each one already sends on completion, and it inflates per-wave API-call and context overhead for no additional signal — six scheduled parks buy nothing that the six completion notifications don't already deliver on their own. If a backstop against a hung or unusually slow wave is genuinely needed, schedule at most one long-delay watchdog for the whole wave, not one per agent dispatched into it.

## Implementer Status Protocol

Every dispatched agent reports one of four statuses as the first line of its reply (before the output template):

| Status | Meaning | Dispatcher response |
|---|---|---|
| `DONE` | Task complete, no concerns | Accept output; proceed. |
| `DONE_WITH_CONCERNS` | Task complete, but the agent flagged doubts | Read the concerns. If correctness/scope → address before proceeding. If observational ("this file is getting large") → note and proceed. |
| `NEEDS_CONTEXT` | Information was missing from the dispatch | Provide what was missing; re-dispatch. |
| `BLOCKED` | Cannot complete the task | Diagnose: more context (re-dispatch), more capable model (upgrade), smaller scope (split), or wrong plan (escalate). Never force-retry with no changes. |

**Finish everything the blocker doesn't gate before reporting `BLOCKED`.** A failed precondition — a worktree path that doesn't resolve, a missing fixture, an unavailable service — usually gates only *some* of the task. Analysis, measurement, verification, and drafting the exact edits are typically all still possible, and a `BLOCKED` report carrying that finished work costs the dispatcher one cheap re-dispatch instead of a full redo. This applies to the wrong-worktree case in Working Directory Discipline above: report `BLOCKED` rather than editing the wrong checkout, but do the read-only work first and hand back verified, ready-to-apply results. Do not silently downgrade to `DONE_WITH_CONCERNS` because you got most of it done — the blocker still stands, and the status line is what the dispatcher routes on.

For review-style agents (Template A) the status line is followed by the findings table. For search-style (B) and scout-style (C), the status replaces any "no findings" sentinel.

```
DONE
| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| ...
```

```
BLOCKED
Reason: couldn't locate the auth middleware referenced in the task scope.
Tried: grep -r "authMiddleware" src/, grep -r "requireAuth" src/
Need: actual file path of the auth middleware, or confirmation it doesn't exist.
```

SubagentStop hook (E3) logs replies missing the status line to the run dir's `events.jsonl` (best-effort — the event fires unreliably for Task dispatches, claude-code#27755).

## Model Selection

Match the profile to the work. A **work profile** names the kind of work; this table — the single canonical resolution — says what runs it:

| Profile | Model | Effort | Constraints |
|---|---|---|---|
| Fast | haiku | — | No effort dial (Haiku ignores effort) |
| Standard | sonnet | high | — |
| Capable | opus | high | — |
| Frontier | fable | high | Singleton-only; degrades to Capable |

This table is pinned to `bin/lib/model-profiles/profiles.js` by test — change them together. Models are family aliases, never versioned IDs. The effort scale is ordered `low < medium < high < xhigh < max`.

**Dispatching.** Name the profile in the prompt as `[Use: {Profile}]`, and resolve it mechanically: run `node bin/resolve-profile.js {profile}` (profile lowercase) from the checkout root (add `--run-dir "$PIPELINE_RUN_DIR"` inside a pipeline, `--unattended` in any headless context) and copy the returned `model` into the Agent tool's `model` parameter. The two flag families answer different questions: `--frontier-used N` / `--run-dir` express the Frontier singleton tally (how many Frontier dispatches this run has already spent), while `--unattended` expresses "no human is present" and unconditionally degrades a Frontier resolution — so a Frontier singleton call site must never hard-code `--unattended` unconditionally — write the interactive form (or, for a command that only ever runs headless, state the headless context beside it) and append the flag only when the invocation is genuinely headless, resolved from session state. Append the returned `effortLine` to the dispatch prompt. Its shape is `[Effort: {level} — apply {level}-level reasoning depth to this task.]`. (`${CLAUDE_PLUGIN_ROOT}` is not reliably set in Bash tool calls — #170 tracks it; the repo-local invocation above is the documented form.) Effort binds mechanically only where an agent definition carries `effort:` frontmatter — the Agent tool has no per-dispatch effort parameter, so `effortLine` is a best-effort prompt instruction. Upstream watch item: adopt a per-dispatch effort parameter the release it exists.

**Overrides.** The resolver merges *values* in precedence order: per-invocation override > project policy (`model-profiles` rows in `.claude-tweaks/policy.yml`) > the table. The run stance (`--stance`, else the policy's `model-stance`) is a run-level *posture*, not a value source: it applies after the merge, shifting the resolved effort one notch (`economy` down, `max-rigor` up, capped at the scale's ends), and `economy` resolves a still-Frontier result as Capable. Stance applies even to per-invocation choices, and Frontier's own gates (below) apply last regardless of how Frontier was selected. `model-ceiling` clamps any resolution whose per-invocation override named no field. The per-invocation override is the resolver's `cliOverride` API argument — deliberately not exposed as CLI flags; a dispatch site's per-invocation lever is normally which profile it names. Stances shift effort, never the model upward. `CLAUDE_CODE_SUBAGENT_MODEL` and the session's `/model`/`/effort` are harness-level and always win — the plugin defers to them **only when a dispatch omits the Agent tool's `model` parameter entirely**. Probed 2026-08-17 (one throwaway Agent dispatch, explicit `model: 'haiku'`, from a session running Sonnet 5 with no `CLAUDE_CODE_SUBAGENT_MODEL` set: the dispatched agent self-reported running as Haiku 4.5, not Sonnet): an explicit per-invocation `model` value **does** override the session's own ambient model — "the plugin defers to them" describes a choice not to pass `model`, not a structural limit on passing it. Single-observation confidence (the agent's own self-report was the only signal available; not independently re-verified against an interactively-changed `/model`, though the same tool parameter governs both cases). This is what licenses `build/SKILL.md`'s whole-branch-review model-resolution step — see there for the one site that acts on it.

**Selection and upgrade.** Default to the cheapest profile that can do the job. Upgrade one profile when the agent comes back `BLOCKED` for reasoning reasons (not for context reasons). Capable→Frontier upgrades are valid only at the singleton slots enumerated in this section.

**Frontier is singleton-only.** Profiles govern *dispatches*; inline steps ride the session model by design. Frontier is never valid in a parallel fan-out — one agent whose judgment is the bottleneck, at an enumerated slot only. Preconditions (all enforced by the resolver): interactive context, stance at `default` or above, and the per-run cap (`frontier-run-cap`, default 3, tallied in the run dir's `frontier-tally.log`; standalone skill invocations get 1 per invocation, enforced by the calling skill). Any miss degrades to Capable with the reason in the resolution's `source`. Best-effort rule: a harness usage-limit warning observed in-session degrades Frontier to Capable for the remainder of the run — best-effort, no mechanism claimed.

**The enumerated slots.** Two categories, each a deliberate, singleton-shaped dispatch site — degradation to Capable via the preconditions above is always the fallback, never a separate code path:

| Category | Slot | Shape |
|---|---|---|
| Verdict gate (#220) | `/review`'s gap-sweep (`step3-debate-and-refutation.md` Step 3.6) | Single agent, no reproduction pair — deliberately fresh-eyes. |
| Verdict gate (#220) | `/review`'s cross-lens debate agent (`step3-debate-and-refutation.md` Step 3.5, `multi-agent-coordination.md` Mode 2) | The one contract-enumerated exception to strict single-agent shape: a fixed 2-agent, 1-round pair per contradiction — bounded by the contradiction count, not a variable-N fan-out over a candidate set, which is what the no-fan-out rule actually guards against. |
| Verdict gate (#220) | `/specify`'s red-team synthesis/write-back (`specify/red-team.md`) | Single agent, dispatched only when interactive and the resolver returns `frontier`; otherwise runs main-thread exactly as today — never a Capable dispatch of this step. |
| Self-improvement (#221) | `/wrap-up`'s Phase 2 curation-engine row-judgment, when fewer than 3 rows are open (`wrap-up/curation-engine.md` section 4) | Single agent judging every open row in one pass. The existing 3+-row branch is a genuine parallel fan-out and stays Capable unconditionally. |
| Self-improvement (#221) | `/reflect`'s lens procedure, standalone invocations only (`reflect/SKILL.md` Step 2) | Single agent running every lens. Component-invoked runs (a `/review`- or `/wrap-up`-owned run dir, or an explicit `--source`) never dispatch this — main-thread only. |
| Self-improvement (#221) | `/feedback`'s session-evaluation judge (`feedback/session-evaluation.md`) | Single agent per invocation — the standalone-invocation cap (no `--run-dir` in the common case). The Step 6 scrub this slot previously named now resolves Capable (record #221's entry knowingly superseded). |
| Self-improvement (#221) | `/init`'s CLAUDE.md generation/patch synthesis (`init/claude-md-template.md`) | Single agent; `--unattended` in headless (scheduled Routine) contexts. |

**`/challenge` is excluded from the verdict-gate category.** Its `framing-check` mode is inline-only by that skill's own Component-Skill Contract — dispatching it as a Task agent is a named anti-pattern there. Profiles govern dispatches only; an inline step rides the session model by design and has no profile to carry, so `framing-check` is never a candidate for this enumeration regardless of how singleton-shaped its judgment is.

**Session-inherit protection.** No fresh-agent dispatch omits `model` — inheriting the session model is only ever an explicit, stated choice (`[Use: inherit — {reason}]`), never a silent default; this is what makes running a session on Fable or Opus safe. Fork dispatches are exempt (the Agent tool ignores a fork's `model` override structurally; fork usage is already restricted — see the incident-log rule on forks). Every agent definition under `agents/` must declare `model:` in its frontmatter.

## Template A — Review-style (returns findings)

Use when an agent audits code, designs, or specs and returns findings to be acted on.

```
OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
| medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |

Severity scale: critical / high / medium / low / info
If no findings: return literal text "No findings."
Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
Do not add narration, headers, or summaries before or after the table.
```

**Used by:** `/review` (review angles), `/visual-review` (per-page review agents), `/specify` (per-persona red-team findings).

## Template B — Search-style (returns locations)

Use when an agent locates code, files, or references.

```
OUTPUT FORMAT (required):
Return ONLY bullet lines, one per match:

- {path}:{line} — {one-line context}

If no matches: return literal text "No matches."
Do not add narration or grouping headers.
```

**Used by:** `/journeys` (per-journey extraction), `/stories` (per-flow probe), `/build` (search subagents).

## Template C — Scout-style (returns yes/no + evidence)

Use when an agent answers a binary question with brief evidence.

```
OUTPUT FORMAT (required):
First line: "yes" or "no"
Second line onward: up to 3 bullet lines of evidence (path:line — context).
Maximum 200 tokens total.
```

**Used by:** `/test` (parallel verification scouts), pre-checks before larger parallel dispatch.

## Not every consumer uses A/B/C

When a dispatch's output genuinely doesn't fit A/B/C, define the format explicitly in the dispatch prompt rather than forcing it into one of the three.

## Failed-agent retrieval

A dispatched agent that dies mid-flight (session-limit interruption, tool crash) is a
different case from one that finished — do not treat both the same way when collecting
results.

**Check the task-notification's `<status>` first.** `completed` → read the result as
documented above. `failed` → the full envelope is not worth blocking on: retrieve only the
tail — either a non-blocking `TaskOutput` call read for its trailing `<error>` block, or
`tail -n 50` on the notification's own `<output-file>` path — never a blocking full-envelope
`TaskOutput {block:true}`. The trailing error is the only actionable content; the rest is
raw transcript internals (measured at ~6% of one run's total tool-result characters for zero
net information when read in full).

## Exemption: third-party agents

**The condition is structural, not a judgment call.** An agent is exempt from this contract when **its definition file lives outside the `agents/` directory this plugin owns** — it ships with a third-party plugin and is invoked as a delegation. Everything under this repository's `agents/` (declared in `.claude-plugin/plugin.json`'s `agents` array) is claude-tweaks-authored and is **never** exempt, however awkward its output is to parse. "This agent's output is inconvenient" is not a reading this paragraph supports: a dispatch site settles its own eligibility by asking where the agent file lives, with no appeal to intent.

Why an exemption rather than a conformance shim: this contract buys **dispatch correctness** for agents claude-tweaks authors, where we control the prompt and the protocol is what makes the result routable. A third-party agent is a delegation — it already has its own input and output contract, written by someone else and versioned with their plugin. Wrapping it to force a `DONE` line and a Template A table would mean paraphrasing its output into a shape it never promised, which is exactly the failure this contract's own rationale warns about. Adapt at the boundary instead.

**The exemption covers the agent, never the caller.** Everything on the dispatcher's side still binds:

- **Normalize at the boundary.** The caller maps the third-party output into the shape its own consumers already read, and documents that mapping at the call site. A caller that passes foreign output through unmapped has not adapted, it has leaked.
- **Handle the outcomes the status line would have carried.** With no `BLOCKED` / `NEEDS_CONTEXT` to route on, the caller must still separate *agent unavailable*, *agent failed*, *agent returned nothing*, and *agent returned something that does not parse* — and must never report a clean result for any of them. Silence is not a pass.
- **Check availability at the agent level.** Plugin presence does not imply agent presence; agents are added and removed between versions of one plugin. Resolve the agent's own definition file before dispatching.
- **Input discipline and working-directory discipline still apply** — both describe what the dispatcher sends, not what comes back.

Re-prompting on format (below) does not apply to an exempt agent: it is not violating a format it was never given.

**Current exempt dispatch:** `impeccable-finish-reviewer`, shipped by the Impeccable plugin and dispatched by `/claude-tweaks:design-wrapper`'s `review` mode (`modes/review.md` Step 3.7). Its four-section output contract (`persistence` / `ceiling` / `material_fixes` / `keep`) is upstream's; that mode's Step 4 maps it into this repo's normalized finding shape.

## Re-prompt on violation

When an agent returns malformed output (no table, narration before the table, wrong columns), the dispatcher re-prompts:

```
Your output didn't match the required format. Re-emit using only this format:
{template repeated}
Do not add explanation.
```

Cap at one retry. If still malformed, accept what you got and move on (do not loop).

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| Padding the template with optional sections "if relevant" | Agents include them every time, defeating the compression. |
| Using soft directives like "be concise" or "summarize" | Too soft — agents drift back to prose. |
| Asking for both narration AND a table | Agents pick narration. The contract must be exclusive. |
| Omitting the severity scale | Agents invent their own scales (P0/P1, MUST/SHOULD, urgent/normal), making aggregation impossible. |
| Letting agents read sibling files for the template | Agents only see their prompt. Always inline the template literally. |
| Stating a requirement in prose beside the inlined template | The agent receives the fence, not the file around it. Anything outside the block never arrives. |
| Skipping the "if no findings" literal text | Without it, agents pad empty results with explanation. |

## How to integrate at a dispatch site

In a Form B blockquote:

```
> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns findings in Template A format. Assemble results after all agents complete.
> **Contract:** Each agent follows the Subagent Contract — minimal input (scope + path + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line, then Template A. Pick the cheapest work profile that fits ({Fast | Standard | Capable} — Frontier never rides a fan-out; singleton slots only, §Model Selection) and resolve it per §Model Selection. Inline the template literally; reject and re-prompt on format violations.
```

In the actual `Task()` call, the prompt body must contain the literal template — not a reference to it. Concrete example:

```
Task scope: Review src/auth.ts and src/api.ts for security issues.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |

Severity scale: critical / high / medium / low / info
If no findings: return literal text "No findings."
Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
Do not add narration, headers, or summaries before or after the table.

[Use: Standard model.]
```

The blockquote above is the dispatch-site directive; the fenced block is what each `Task()` call's prompt actually contains.

## Related primitives

- `skills/_shared/multi-agent-coordination.md` — inter-agent coordination patterns (Reproduction, Debate, Multi-persona red-team) that compose with these templates.
