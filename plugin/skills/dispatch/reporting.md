# Dispatch — Reporting

Per-firing output is one group's outcome (a drain firing with M ≤ `{budget}` groups: one report block per dispatched group) — there is **no consolidated multi-group console**. (See `SKILL.md`'s When to Use above.)

Each group's block ends with one timing line read from `{run-dir}/timing.json` (`bin/phase-timing.js --run "$PIPELINE_RUN_DIR" --markdown --transcript <call-1 transcript> --transcript <call-2 transcript>`, #1928) — never composed by hand: `timing: call-1 {m}m · call-2 {m}m · verify {n} run(s) ({modes}) · {k} tokens in / {m} out` — not `--auto-transcript`, which only sees the current session; omitted when the CLI printed a `tokens: transcript not found` note.

A headless (Routine-fired) firing's report has nobody live to read it — the durable trace is the label state change, the claim-comment trail, and `decisions.md`, not a rendered console. Over time, a human sees the aggregate picture via `/claude-tweaks:tidy`'s own periodic sweep (`tidy/SKILL.md`).

`pending-review` outcomes park the group's `/flow`-created run dir, not the branch — at `supervised`/`trusted`, an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it. (At `unattended`, `consoleAutoResolve` completes the console instead of resting on it — see `_shared/autonomy-ceiling.md` and `wrap-up/review-console.md`'s Auto-resolution short-circuit.) Under `integration-model: pr-first`, the branch itself never waited on parking to become public in the first place: `_shared/pr-early-run-lifecycle.md` opened its draft PR at run start, and every phase exit since has kept it current.

**Resuming a parked run.** "Resumes that session" above is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads this report, and there is no way to re-attach to it.

**Confirm before resuming.** Before running the re-invocation below — including when a human triggers the resume conversationally (e.g. replying "merge!" in chat) rather than by typing the command directly — read `resume-confirmation.md` in this skill's directory and follow it: the `AskUserQuestion` shape, the Recommended-derivation rule (shared with `review-console-interactive.md`'s merge confirmation, so the two can never disagree on the same PR state), why this stays a separate stop from the Review Console rather than folding the two together, why it carries no `autonomy`-ceiling carve-out (unconditional at every tier, including `unattended`), how the confirmation's values are sourced live, the resume-freshness probe, and the actual re-adoption mechanism.

`PushNotification` fires only at the retry ceiling and for auto-merge FYIs (Step 6's Settle procedure and Auto-merge gate, both in `settle-and-merge.md`) — never per-firing just because a firing happened, to avoid notification fatigue.
