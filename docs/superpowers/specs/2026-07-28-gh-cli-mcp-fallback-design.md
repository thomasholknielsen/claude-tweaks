# GitHub Write Transport Fallback — gh CLI locally, GitHub MCP tools in cloud Routines

## Problem

Three GitHub issues (#60, #61, #63) describe the same root cause hitting three different call sites: `tidy`'s `--scope=github` digest, `dispatch`'s claim-lock and labeling/commenting, and `bin/lib/health-core/durable-state.js`'s cursor-write CAS loop all shell out to the `gh` CLI binary exclusively, which is not installed in a Claude Code cloud Routine (Claude Code Remote / CCR) sandbox. That sandbox's own system prompt states: "You do NOT have access to the `gh` CLI, `hub` CLI, or direct GitHub API access. Instead, use the GitHub MCP server tools ... for ALL GitHub interactions."

Production evidence (from `memenu-io/memenu-app`, cited in the filed issues):
- `dispatch-weekdays` has a confirmed 100% failure rate since going live (3/3 firings never reached the queue).
- `tidy`'s rolling GitHub-triage digest sat stale since 2026-07-22 despite a confirmed cloud firing on 2026-07-26.
- The four health engines' cross-firing cursor state can be read but never advanced from a cloud firing, causing `docs-health-daily`/`journey-health-daily` to repeatedly re-select the same already-filed target.

A fourth issue, #62 (pipeline run-dir bookkeeping cross-contamination under concurrent sessions), shares the same production audit but has an unrelated root cause and is out of scope for this design.

## Why not fix the environment instead of the code

The obvious-looking alternative — install and authenticate `gh` CLI in the cloud sandbox via a setup script (`apt update && apt install -y gh`, confirmed to work and auto-authenticate through Claude Code's GitHub proxy) — was investigated and rejected. The environment (and its setup script) that would need to carry this is a manual, per-account GUI configuration at `claude.ai/code`; it cannot be declared in a `routine-template.yml` (this plugin's own `_shared/routine-template-schema.md` explicitly forbids baking `environment_id` into a template, since it's account-specific). That makes the fix invisible to the plugin itself — every user who installs this plugin and creates a Routine would need to separately remember and repeat a manual setup step with no enforcement, verification, or drift detection. A code-level fix that works unconditionally, with zero manual account configuration, is preferred.

The built-in GitHub tools (what the cloud sandbox's system prompt calls "GitHub MCP server tools") cannot be disabled — they are a fixed, always-on proxy for every cloud session, independent of any connector/MCP setting. This is confirmed directly against Claude Code's own documentation (`cloud-environments.md`): "All GitHub operations go through a dedicated proxy... independent of the environment's access level."

## Architecture

**Transport selection is one decision, reused everywhere.** Every GitHub-write call site asks the same question — is `gh` on PATH? — via the existing Detection Ladder check already living in `_shared/github-pr-scan.md`. `gh` present → today's exact `gh` CLI behavior, unchanged. `gh` absent → the MCP path. No new environment-variable sniffing, no per-skill detection logic. This also means a future environment where someone does manually install `gh` continues to work, unmodified — the check is capability-based, not environment-classification-based.

**One primitive carries both hard cases.** Dispatch's claim lock and health-state's cursor CAS are the same problem wearing two hats: "write this value, but only if nothing else wrote first." Today both solve it via git-ref-level compare-and-set (`gh api .../git/refs`: atomic 201-on-create/422-on-exists; a non-force PATCH for update, which fails if the ref moved). The official GitHub MCP server has no ref-level equivalent — no blob/tree/commit creation, no ref update, no distinct create-vs-exists response for ref creation (confirmed directly against the GitHub MCP server's own tool documentation). It does, however, expose `create_or_update_file` / `push_files`, which carries the identical guarantee one level down, at the file-blob level: omit `sha` and the write fails if the file already exists; supply a stale `sha` and it fails on mismatch. This is GitHub's real, documented "Create or update file contents" REST semantics, which the MCP tool wraps. Both dispatch's claim and health-state's cursor become "conditionally write a JSON file to a dedicated branch, gated on expected `sha`" — the same call, two different payloads.

**A new shared fragment owns the mapping.** `_shared/github-write-transport.md` becomes the single place documenting the detection check, the gh-command → MCP-tool table for plain CRUD (list-by-label, create, edit/label, comment, close — tidy's whole fix, and the non-locking parts of dispatch), and the conditional-write pattern for the two CAS consumers. Skills reference it the same way `_shared/github-pr-scan.md` is already referenced elsewhere (inlined at dispatch time for subagents, read directly in the main session).

**`durable-state.js` cannot call MCP tools itself — this constrains its half of the design.** MCP tools are only invocable from the calling agent's own turn, never from a spawned Node subprocess — and `durable-state.js`'s `writeState` runs entirely inside one such subprocess (`node bin/{skill}.js validate-findings`, a single opaque CLI call per firing, unlike dispatch's claim mechanism which is already orchestrated step-by-step in skill prose). So `writeState` cannot itself perform an MCP write. Instead, when `gh` is unavailable, it stops short of any network call — computing what *would* be written (reusing its existing `buildFiles` logic against a fresh git-based read, which stays unaffected since reads were always `gh`-free) — and returns that description to its caller instead of attempting to write it. The CLI surfaces this description on stdout; a new section in `_shared/health-state.md` (referenced identically by all four health skills, mirroring how they already share `retry-cli.js`) documents the retry loop the *skill's own prose* then drives externally: call the CLI once, and if it reports a pending write, perform the MCP write itself, then either finish or re-invoke the CLI from scratch on a conflict (bounded by the same `MAX_CAS_ATTEMPTS`). The `command -v gh` check itself lives inside the module (an injectable capability probe, checked once per `createDurableState` call, not re-shelled per write attempt) — only the actual MCP network call moves out to the skill layer.

## Components

| Component | Change |
|---|---|
| `skills/_shared/github-write-transport.md` (new) | Detection check; gh→MCP mapping table for plain CRUD; the conditional-write pattern the two CAS consumers cite. |
| `bin/lib/issues/claims.js` | `claimPayload`/`releasePayload` stop returning `gh api` argv arrays (`refArgs`/`refDeleteArgs`); they return backend-neutral data (issue number, claim path, expected `sha` if any, `runId`, `sessionId`). The marker/comment-building half (already backend-neutral) is untouched. |
| `bin/lib/health-core/durable-state.js` | `writeState` gains an injectable `hasGh` capability probe. When `gh` is unavailable, instead of running its blob/tree/commit/ref sequence, it computes the pending write (via the existing `buildFiles`, against a fresh read) and returns `{ ok: false, needsMcpWrite: true, branch, files }` — no MCP call happens inside this module (see "Why `durable-state.js` can't call MCP tools itself" above). Read path (`readState`) is untouched — already `gh`-free. |
| `bin/lib/health-core/retry-cli.js`, `bin/code-health.js`, `bin/harness-health.js`, `bin/journey-health.js`, `bin/docs-health.js` | Each of the 5 call sites that invoke `writeDurableState` and check `result.ok` gains a preceding `result.needsMcpWrite` check, printing the pending-write description to stdout instead of the usual output. |
| `skills/_shared/issue-claims.md` | Gets a second "MCP path" column alongside today's `gh`-only steps: claim = conditional-create of `claims/issue-{n}.json`; release = conditional overwrite with a tombstone; list = a directory listing instead of `git/matching-refs`. |
| `skills/dispatch/SKILL.md` | Step 4 (claim) and the labeling/commenting call sites reference the new shared fragment and the updated `issue-claims.md` instead of hardcoding `gh` calls. |
| `skills/tidy/scan-procedures.md` + `skills/tidy/github-routine-procedures.md` | Step 4.8 / Rolling digest's `gh issue list`/`create`/`edit`/`close` calls each get their MCP-tool sibling per the new shared fragment's mapping table. Find-by-marker must route through `list_issues`, never `search_issues` — mirroring the documented reason `gh issue list --search` was already banned here (3 real duplicate-digest production incidents). |
| `bin/lib/issues/dedup-lookup.js`, `bin/lib/issues/record.js` | No change — already transport-agnostic (confirmed during research: both operate on already-fetched data, regardless of fetch mechanism). |
| Routine templates (`dispatch`, `tidy`, `tidy-github-triage`) | No change needed — this design requires zero environment/setup-script configuration. |

## Data flow

**Dispatch claim, `gh` path (unchanged):** resolve default-branch sha → `gh api .../git/refs -f ref=refs/claims/issue-${N} -f sha=${SHA}` (201=claimed, 422=already-claimed) → on claim, `gh issue edit` (label) + `gh issue comment` (marker) → on release, `gh api -X DELETE .../refs/claims/issue-${N}`.

**Dispatch claim, MCP path (new):** resolve default-branch sha via the built-in GitHub tools → `create_or_update_file` writing `claims/issue-{n}.json` (`{runId, sessionId, claimedAt}`) to a dedicated claims branch, omitting `sha` (create-only) — success = claimed, a file-exists rejection = already-claimed, the same 201/422 shape one level down → on claim, `issue_write` (label) + `add_issue_comment` (marker, identical format to the gh path) → on release, `create_or_update_file` overwriting the claim file with a `{released, releasedAt}` tombstone. Because the marker/comment format is identical either way, `issue-claims.md`'s reconciliation logic (staleness checks, `/tidy` Step 4.7's claims audit) reads claim state the same regardless of which path wrote it.

**Health-state cursor write, `gh` path (unchanged):** `git fetch` (read) → mutate in memory → `createBlob`→`createTree`→`createCommit`→`updateRef` (non-force PATCH = the CAS) → on PATCH failure, disambiguate (did our commit actually land?) then retry with backoff, up to `MAX_CAS_ATTEMPTS`.

**Health-state cursor write, MCP path (new):** the CLI command (e.g. `validate-findings`) runs once — `git fetch`/`git show` still runs unmodified (already `gh`-free) to read current state → mutate in memory (unchanged) → `writeState` detects `gh` is unavailable and returns `{ needsMcpWrite: true, branch, files }` without attempting any write → the CLI prints this to stdout instead of its normal output. The *skill's own prose* then takes over: resolve each file's current blob sha via `git rev-parse origin/health-state:{path}` (empty means new file, omit `sha`) → call `create_or_update_file` per file itself → on a sha-mismatch, sleep `casBackoffMs(attempt)` and re-invoke the CLI command from scratch (state may have changed, so the read-modify-write cycle must restart, not retry with stale data) → bounded by the same `MAX_CAS_ATTEMPTS`.

**Tidy digest, either path:** fetch open issues (`list_issues` or `gh issue list`) → `findByMarker` (unchanged, already transport-neutral) → create/edit/close via the matching tool. No locking involved — the "update in place, never duplicate" invariant holds because `findByMarker` always reads fresh state first.

## Error handling

**Ambiguous-failure disambiguation carries over structurally, but relocates.** Today's `writeState` doesn't blindly retry every PATCH failure — it first checks whether the update actually landed (`currentCommitSha(root) === commitSha`) before deciding to retry, since a network blip can make a successful write look like a failure. Since the MCP path's actual write call happens in the skill's own prose (not inside `durable-state.js` — see Architecture), the identical discipline lives there instead: after an ambiguous `create_or_update_file` error (timeout, connection drop — not a clean sha-mismatch response), re-read the file's current `sha`/content and compare against what was intended before retrying, per `_shared/health-state.md`'s documented procedure.

**Two distinct failure classes, both handled at the skill-prose layer.** A sha-mismatch (someone else wrote first) is the expected, bounded-retry case — same `MAX_CAS_ATTEMPTS`/backoff, but driven by re-invoking the CLI command from scratch rather than a retry loop inside one function call. A hard tool error (the MCP call itself fails) must not be treated as a CAS-retry signal — retrying into a broken transport just burns the attempt budget without ever succeeding.

**The claim lock's existing safety nets don't need touching.** The 72h TTL/staleness check and its fail-closed behavior on an unparseable `claimedAt` (`issue-claims.md`) operate on the marker-comment content, which is byte-identical regardless of which path wrote it.

**Tidy's digest keeps its `--search`-avoidance discipline** — see Components table.

**The one unverified assumption gets a named checkpoint.** `create_or_update_file`'s exact reject-on-existing/reject-on-mismatch behavior is well-established for GitHub's public REST API, but this design leans on it for two security/correctness-relevant mechanisms. A live smoke test confirming this must happen before either mechanism is trusted with real traffic — see Testing.

## Testing

- **`claims.js`:** existing tests extended, not replaced — the gh-path behavior must be byte-for-byte unchanged. New tests cover the neutral-data shape and that both executors (gh-CLI, MCP) consume it correctly.
- **`durable-state.js`:** the module already shells out via an injectable seam for its existing tests — the new `hasGh` capability probe is injectable the same way, so tests cover: `gh` present (unchanged gh-path behavior, every existing test still passes verbatim), `gh` absent (the `needsMcpWrite` signal shape, including the specific edge case of a first-ever run where the branch doesn't exist yet — the fetch itself must degrade gracefully, not throw). The actual MCP-call retry logic (sha-mismatch vs. hard-error classification, ambiguous-failure disambiguation) lives in skill prose, not in this module, so it's verified live (see the named checkpoint below) rather than unit-tested. Read-path tests are untouched.
- **Detection logic:** a small, direct test that the `command -v gh` check selects the right branch.
- **Tidy's digest:** procedures are markdown/prose, not code — verification is a live run during implementation (create/find/edit-in-place a real test digest issue via the MCP path), same as the existing gh-based procedure has always been verified.
- **Named checkpoint:** verify `create_or_update_file`'s reject-on-existing/reject-on-mismatch behavior against the real API, once, live, before either CAS consumer is trusted — a plan step, not a permanent automated test.
- **Full-suite regression:** `npm test`'s existing suite must stay green throughout — this is a behavior-preserving change for the gh-CLI path by construction.

## Out of scope

- #62 (pipeline run-dir bookkeeping cross-contamination) — unrelated root cause, tracked separately.
- Approach 3 from brainstorming (offloading sensitive writes to a GitHub Action via `repository_dispatch`) — would work, but overlaps with the separately-deferred #29 ("Event-driven dispatch via GitHub Action") and adds real CI infrastructure this design doesn't need.
- Any change to the environment/setup-script path — rejected in favor of the code-level fix (see "Why not fix the environment instead of the code").
