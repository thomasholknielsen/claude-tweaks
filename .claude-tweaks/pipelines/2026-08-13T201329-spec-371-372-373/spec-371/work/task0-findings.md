# Task 0 findings: Skill PostToolUse payload shapes (empirical premise check)

Captured with a throwaway `PostToolUse` hook (matcher `Skill`) via `claude -p --settings /tmp/skill-capture-371/hook-settings.json`, run headlessly from `/tmp/skill-capture-371` as cwd, against the installed `claude-tweaks:version` skill (v6.79.0). `--settings` fired the hook directly on the first run — the `.claude/settings.json` project-file fallback in the brief was never needed.

Four scenarios were run, each followed by a `printf` separator line into `capture.jsonl`. Full raw capture: `/tmp/skill-capture-371/capture.jsonl` (scratch, not committed).

## Pinned answers

**(a) `tool_input` field carrying the skill name + qualification format.**
Field is `tool_input.skill`, a plain string. For a qualified invocation the value is the literal namespaced form `"claude-tweaks:version"` (`{namespace}:{skill-name}`). `tool_name` for the event is `"Skill"`.

**(b) bare-invocation format.**
The same `tool_input.skill` field also accepts an unqualified bare name, e.g. `"version"`. The call succeeded (it resolved internally to `claude-tweaks:version`) — it is not rejected. Notably `tool_response.commandName` echoes back whatever was passed (`"version"`, not re-qualified to `"claude-tweaks:version"`) — the payload does not expose the resolved qualified name anywhere in the captured PostToolUse fields.

**(c) error-signaling field on a failed-but-permitted call.**
**No `PostToolUse` hook event was captured for this scenario at all.** `capture.jsonl` has zero JSON lines between the `SCENARIO B END` and `SCENARIO C END` markers, despite the Skill tool genuinely being invoked (confirmed via the session transcript: `{"name":"Skill","input":{"skill":"claude-tweaks:definitely-not-a-real-skill-xyz"}}`). The transcript shows the failure is signaled as a tool_result-level error *before* (or instead of) any `PostToolUse` dispatch: `{"type":"tool_result","content":"<tool_use_error>Unknown skill: claude-tweaks:definitely-not-a-real-skill-xyz</tool_use_error>","is_error":true,...}`. This is a genuine hole in the spec's premise: **a hook implementation that only listens on `PostToolUse` with matcher `Skill` cannot observe "unknown skill" failures** — there is no `tool_response.is_error` / `success:false` field to key off, because the hook never fires for this case. Any later task that assumed a `tool_response.is_error` (or similar) field on this path is building on an untested assumption; that assumption is now falsified by direct measurement, not merely unconfirmed.

**(d) whether a Skill call inside a Task-dispatched subagent fires parent-session hooks.**
**Yes.** The subagent's Skill call was captured in the same `capture.jsonl`, under the *same* `session_id` as the top-level `claude -p` invocation (`906fa528-8660-4526-b111-ef0b9bd03aba`) — i.e. the hook settings supplied to the parent process govern subagent tool calls too, dispatched through the same hook pipeline. The captured event carries two extra fields absent from the direct (non-subagent) scenarios: `"agent_id":"aecdf2eb0cc2a129b"` and `"agent_type":"general-purpose"`. Those two fields are the discriminator a consuming hook would use to tell a subagent-attributed Skill call apart from a top-level one; there is no separate "parent" event for the dispatch itself, only the one event for the subagent's own Skill call, tagged with agent identity. (The subagent's Skill call itself succeeded per both the capture and the parent's final text: "it invoked the `claude-tweaks:version` skill and reported... v6.79.0... replied 'done'".)

**(e) whether a user-typed slash command fires a Skill tool call at all.**
Measured during the Task 2 whole-branch final review (not in the original four-scenario capture above), with a matcher-less control capture confirming the negative: a user-typed slash command (e.g. `claude -p "/claude-tweaks:version"`) runs the skill by direct content expansion, with **no `Skill` tool call at all** — the control capture (PostToolUse with no `Skill` matcher restriction) shows only `Read`/`ToolSearch` tool use, never a `Skill` entry, for this invocation path. Scope caveat: measured in headless `claude -p` only; the interactive CLI uses the same slash-expansion mechanism but was not separately measured non-interactively. Consequence: a `PostToolUse`/`Skill`-matcher ledger records **model-initiated** Skill tool calls only — a human typing `/claude-tweaks:wrap-up` directly leaves no event in the ledger.

## Representative raw payload lines (verbatim from capture.jsonl)

Scenario (a) — qualified invocation, success:

```json
{"session_id":"35041dba-0268-4aa8-ad14-f2adde5770be","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/35041dba-0268-4aa8-ad14-f2adde5770be.jsonl","cwd":"/private/tmp/skill-capture-371","prompt_id":"c7a57d91-ee92-42f0-bde3-e221a478aec5","permission_mode":"bypassPermissions","effort":{"level":"high"},"hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"claude-tweaks:version"},"tool_response":{"success":true,"commandName":"claude-tweaks:version"},"tool_use_id":"toolu_01VrDhrpt9vX3Fhi2Bs1RhdH","duration_ms":7}
```

Scenario (b) — bare unqualified invocation, success:

```json
{"session_id":"1c70d949-f206-48f4-aecb-94e354e2759c","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/1c70d949-f206-48f4-aecb-94e354e2759c.jsonl","cwd":"/private/tmp/skill-capture-371","prompt_id":"2d33db0b-a397-49ba-be02-ff7663f00383","permission_mode":"bypassPermissions","effort":{"level":"high"},"hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"version"},"tool_response":{"success":true,"commandName":"version"},"tool_use_id":"toolu_012cgUtvV4ZLjwR4Xb6oqAVp","duration_ms":9}
```

Scenario (c) — **no PostToolUse line exists**. For context only (this is a session-transcript tool_result entry, NOT a PostToolUse hook payload — quoted verbatim from `/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/902a758c-c381-4e9e-81fa-a6b254a7c66a.jsonl` line 13, to show where the error actually surfaces instead):

```json
{"parentUuid":"e09db1b4-d17c-4a89-80f2-aa2f4b4d3325","isSidechain":false,"promptId":"1bfaa7ed-e83b-46ad-b2a3-73411e5128ed","type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"<tool_use_error>Unknown skill: claude-tweaks:definitely-not-a-real-skill-xyz</tool_use_error>","is_error":true,"tool_use_id":"toolu_01URA9n8XRhJuZZiCCFCzL2u"}]},"uuid":"e4530d5e-7b77-4d08-851c-95679d2f20fa","timestamp":"2026-08-13T20:22:32.421Z","toolUseResult":"Error: Unknown skill: claude-tweaks:definitely-not-a-real-skill-xyz","sourceToolAssistantUUID":"e09db1b4-d17c-4a89-80f2-aa2f4b4d3325","userType":"external","entrypoint":"sdk-cli","cwd":"/private/tmp/skill-capture-371","sessionId":"902a758c-c381-4e9e-81fa-a6b254a7c66a","version":"2.1.231","gitBranch":"HEAD"}
```

Scenario (d) — Skill call inside a Task-dispatched subagent, success, captured under the parent session's hook with `agent_id`/`agent_type` fields:

```json
{"session_id":"906fa528-8660-4526-b111-ef0b9bd03aba","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/906fa528-8660-4526-b111-ef0b9bd03aba.jsonl","cwd":"/private/tmp/skill-capture-371","prompt_id":"3a93798f-4aab-4c26-8738-32f2e672166e","permission_mode":"bypassPermissions","agent_id":"aecdf2eb0cc2a129b","agent_type":"general-purpose","effort":{"level":"high"},"hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"claude-tweaks:version"},"tool_response":{"success":true,"commandName":"claude-tweaks:version"},"tool_use_id":"toolu_014QfZJzHJejH5BhpsDKuT8R","duration_ms":10}
```

## Implication for later tasks

The spec's premise that a `PostToolUse`/`Skill` hook can log every skill invocation, success or failure, is only half true: it reliably captures **successful** invocations (qualified or bare) and **subagent-attributed** invocations (same mechanism, extra `agent_id`/`agent_type` fields). It does **not** capture invocations that fail at skill-name resolution ("Unknown skill: ...") — those never reach `PostToolUse` for the `Skill` matcher at all. A ledger hook built purely on this event will silently miss unknown-skill misfires; any requirement to log those needs a different signal (e.g. a transcript-level or `PreToolUse`-adjacent check), not an `is_error` field inside `tool_response` — no such field was observed because no event exists for this case.
