---
record: 763
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 763: Subagent model-profile resolution ignores live session model state after a same-session credit failure

Surface: backend

## Current State

`bin/resolve-profile.js`'s frontier/capable resolution (used by `/claude-tweaks:feedback`'s session-evaluation judge dispatch and other Subagent Contract fan-out sites) resolves a model from a per-skill/profile static default (`"source":"default"`), with no path to read the session's current active model or to remember a same-session failure. In a live session on 2026-08-17, the session hit a Fable 5 out-of-credits API error mid-conversation and the user recovered by running `/model sonnet`, setting Sonnet 5 as the session default. Roughly 15 minutes later, `/claude-tweaks:feedback`'s own session-evaluation judge dispatch resolved via `resolve-profile.js frontier` and got `{"model":"fable","source":"default"}`, the same credit-exhausted model, and the backgrounded Task agent failed identically ("out of usage credits"), costing a second avoidable failure, a second `AskUserQuestion` retry-or-not stop, and several minutes of wasted dispatch time before a manual `model: "sonnet"` override on the retry succeeded.

## Deliverables

- [ ] Add a same-session credit-exhaustion failure tracker that `bin/resolve-profile.js` (or the Subagent Contract dispatch sites that call it) checks before returning a resolved model: when a dispatch on a given model fails with a credit/usage-exhaustion error this session, record that model as failed for the remainder of the session, keyed to the session (each `resolve-profile.js` invocation is a fresh process, so this state must persist across process invocations within the session — e.g. a session-scoped file under the run/session directory).
- [ ] When resolution would otherwise return a blacklisted model, fall back to the next viable option (e.g. the session's current active model, or the next-tier default) rather than re-resolving to the failed model.
- [ ] Document the behavior in CLAUDE.md's Model Selection section and in `bin/resolve-profile.js`'s own header comment.

## Acceptance Criteria

1. A session that has recorded a credit-exhaustion failure for a given model does not re-dispatch a Task agent on that same model for the remainder of that session.
2. `npm test` passes; the new failure-tracking/fallback behavior is covered by a `bin-lib` unit test.

## Technical Approach

Track failed models in session-scoped state (a file under the run/session directory, written on a credit-exhaustion failure and read by `resolve-profile.js` before it returns a resolution) rather than changing `resolve-profile.js`'s default-resolution semantics broadly. This is intentionally the narrower of two directions considered (see Gotchas) — it fixes the one observed incident class without changing model-selection behavior for every Subagent Contract dispatch site.

## Gotchas

- Scope decision: the original finding presented two directions — (a) broadly read the session's current active model before falling back to any static default, changing model-selection semantics across every dispatch site, or (b) narrowly remember a same-session credit-exhaustion failure and blacklist only that model. Direction (b) was chosen at shaping time (human call, 2026-08-17) for its smaller blast radius — it doesn't touch resolution semantics for sessions that haven't hit a failure.
- Where the failure-tracking state lives needs a concrete decision during implementation — a session-scoped file is the working assumption above, but the exact path/format isn't nailed down yet.

## Original request

Subagent model-profile resolution ignores live session model state after a same-session credit failure

Origin: session evaluation of a /claude-tweaks:backlog refine run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

`bin/resolve-profile.js`'s frontier/capable resolution (used by `/claude-tweaks:feedback`'s session-evaluation judge dispatch and other Subagent Contract fan-out sites) resolves a model from a per-skill/profile default (`"source":"default"`), with no path to read the session's current active model. In a live session on 2026-08-17, the session hit a Fable 5 out-of-credits API error mid-conversation and the user recovered by running `/model sonnet`, setting Sonnet 5 as the session default. Roughly 15 minutes later, `/claude-tweaks:feedback`'s own session-evaluation judge dispatch resolved via `resolve-profile.js frontier` and got `{"model":"fable","source":"default"}`, the same credit-exhausted model, and the backgrounded Task agent failed identically ("out of usage credits"), costing a second avoidable failure, a second `AskUserQuestion` retry-or-not stop, and several minutes of wasted dispatch time before a manual `model: "sonnet"` override on the retry succeeded.

## Deliverables

- [ ] Either: `bin/resolve-profile.js` (or the Subagent Contract's Model Selection resolution path in CLAUDE.md) reads the session's current active model before falling back to a static per-skill/profile default, OR: the harness/skill layer remembers a same-session credit-exhaustion failure for a given model and skips that model for subsequent dispatches this session. Pick one direction; a human decision is needed here, not an agent's own preference (see Open Question below).
- [ ] Whichever direction is chosen, document it in CLAUDE.md's Model Selection section and in `bin/resolve-profile.js`'s own header comment.

## Open Question

Should subagent model-profile resolution (a) generally read the session's current active model before falling back to any static per-skill/profile default, or (b) narrowly remember a same-session credit-exhaustion failure and blacklist only that specific model for the rest of the session? (a) changes model-selection semantics broadly across every Subagent Contract dispatch site; (b) is a small, local failure-tracking fix scoped to the one incident class observed. No preference is stated in the source finding — this needs a human call on scope and blast radius before it becomes a build.

## Acceptance Criteria (post-decision)

1. A session that has explicitly switched its active model (via `/model`) after a credit failure does not re-dispatch a Task agent on the credit-exhausted model for the remainder of that session.
2. `npm test` passes; any new resolver behavior is covered by a `bin-lib` unit test.

_Filed by `capture` via specShapedBody._
