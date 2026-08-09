# Dispatch autonomy — serialized execution, blind review, and branch durability

Date: 2026-08-09
Status: approved design, not yet planned

## Problem

`/claude-tweaks:dispatch` Step 5's own banner instructs: "Dispatch every selected group as a
parallel Task agent — each runs independently, owns its own worktree." That capability does not
exist. A Task-tool subagent launched from within a session is refused at every route to its own
worktree — `EnterWorktree` explicitly refuses "a subagent with a cwd override" — so sibling group
agents in one firing are forced onto the dispatching session's own branch, unconditionally. This
was not discovered as a rare edge case; it reproduces on every multi-group firing, and it only
happens to matter on the firing where two groups collide.

That collision is #155: a group carrying `auto:merge` committed onto the shared branch while a
sibling group without the grant was still building. Any commit the second group made would have
sat on a branch eligible for the first group's auto-merge gate, publishing a build-only record to
`main` with no review — the authorization boundary between "build" and "build-and-merge" failing
open, not a mere merge conflict.

Two further, related gaps surfaced during a live dispatch test on 2026-08-09 (bundle
`#264,#223,#221,#220,#179`):

1. **No independent review pass.** The run's own self-report flagged that build, test, and review
   ran as one continuous agent context instead of genuinely separate dispatches — the adversarial,
   fresh-eyes property the review pipeline is supposed to provide never actually applied.
2. **No branch durability.** The resulting `pending-review` branch (8 commits, tests passing)
   exists only inside the ephemeral cloud sandbox — recoverable only by resuming that exact session
   before its container recycles, with no git history fallback if it doesn't.

## Evidence

- **#155's own investigation table** — five attempted remedies (`EnterWorktree`, `git worktree add`
  + `EnterWorktree`, `Write` into a second worktree, `git -C <other-worktree>`, a probe subagent
  with `isolation: "worktree"`), all refused or structurally inadequate.
- **#155's sharp edge**, observed 2026-08-07: firing `2026-08-07T001000-dispatch-standalone`
  dispatched `#141` (singleton, `auto:merge`) and `#146,#150` (bundle, no grant) concurrently. `#141`
  committed onto the shared branch while group 2 was still in pre-flight. Group 2 detected the
  collision and released its claim cleanly rather than write — correct, but dependent on the agent
  noticing; nothing in the protocol forces the check.
- **Live test, 2026-08-09**: bundle `#264,#223,#221,#220,#179` built cleanly (8 commits, 2293/2295
  tests, one self-corrected version-bump violation), landed on `pending-review`. The branch was
  never pushed to origin (`git ls-remote` confirmed empty), recoverable only via cloud session
  `cse_01JCrjoE4k4syh2NPkFKdkZF`. The run's own self-report named the collapsed build/review
  separation as a process deviation from the pipeline's documented design.

## Thesis

Isolation is a **session-level** primitive in this harness, never a subagent-level one. Any design
that assumes a Task-tool subagent can obtain independent git isolation is wrong by construction,
not merely buggy — and no amount of prompting or after-the-fact checking fixes a structural
impossibility. The three phases below share one throughline: replace "verify the agent behaved
correctly" with "make the harness incapable of doing otherwise." Serialized execution makes the
branch-sharing hazard unrepresentable. A hard Task-call boundary makes review genuinely blind
instead of self-reported. An explicit push step makes durability a property of the pipeline, not
of whether a particular sandbox happens to still be alive when a human gets around to it.

## Decisions taken

| Question | Decision |
|---|---|
| Fix true parallel execution, or accept sequential? | Accept sequential within one firing — real concurrency requires independent sessions, a materially larger and riskier lift; not attempted here |
| Rename `dispatch-pick-max-concurrent`? | Yes — semantics genuinely change (concurrency slots → sequential batch size); rename to `dispatch-batch-size` with a deprecated, warn-once alias, per this project's expand-contract discipline |
| How to make review independent | Split each group's Task dispatch into two sequential Task() calls (`build,test` then `review,polish,wrap-up`) reusing `/flow`'s existing step-resume contract, rather than a floor/verification mechanism bolted onto one continuous agent |
| Branch durability scope | Push + open a draft PR for `pending-review` outcomes from dispatch-originated (headless) runs only — not `failed`/`blocked` (already has `bot:blocked`), not interactive human runs (branch already sits in their own terminal) |

## Phase 1 — Serialize group execution (closes #155)

Step 5's per-firing loop changes from "launch every selected group as a parallel Task agent" to:
work through selected groups **one at a time**. Group N's Task agent must reach a terminal outcome
(`merged` / `pr-opened` / `pending-review` / `failed` / `blocked`) and its worktree be fully
resolved before group N+1's Task agent is even created. There is never a moment two groups are
both in flight, so there is never a moment they could share a branch — the hazard becomes
structurally unrepresentable, not merely detected-and-refused (a strictly stronger guarantee than
#155's Acceptance Criterion 2's "fails loudly" bar).

`dispatch-pick-max-concurrent` is redefined from a concurrency dial (which never actually worked)
to a per-firing **batch size** — how many groups one firing works through sequentially before
stopping. Same default (3), same config location; per this project's contract-change discipline,
rename to `dispatch-batch-size`, keep `dispatch-pick-max-concurrent` as a deprecated warn-once
alias. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and README config-key
table cite only the new name, checked at the next minor release. Same treatment for the
`--concurrent <n>` CLI flag → `--batch-size <n>`.

Step 4 (claiming) is unaffected — batch-claiming all selected groups' whole file-overlap groups
stays exactly as-is; it is pure GitHub-label/claim-blob writes with no filesystem or isolation
hazard, and doing it up front still protects group 2's claim from a racing second firing even
while group 1 is still executing.

**Trade-off, accepted explicitly:** a multi-group firing's wall-clock time now scales linearly with
group count instead of being bounded by the slowest group. Dispatch only ever fires on a schedule
(currently every 2h) with nobody waiting synchronously on the result — judged free in practice.

### Files

- `skills/dispatch/SKILL.md` — Step 5's banner and execution loop; the Configuration table
- `skills/dispatch/settle-and-merge.md` — check for any assumption of concurrent groups
- `.claude-tweaks/policy.yml` (this repo's own) — migrate to the new key name
- Closes #155

### Risk

None structural — this phase removes a capability that never actually existed, so there is no
regression surface beyond the accepted wall-clock cost above.

## Phase 2 — Split build/test from review/polish/wrap-up into independent Task calls

Depends on Phase 1 — only safe and meaningful once a group's execution is already a bounded,
sequential unit within the firing.

Each group's single Task dispatch becomes **two** sequential Task() calls:

1. `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 build,test`
2. Dispatched only after (1) returns cleanly: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 review,polish,wrap-up`

Call (2) is a brand-new agent with zero conversation history from call (1) — it cannot rationalize
a build decision it never saw made, because it never saw it. This is a structural blind reviewer,
not a self-report to trust.

This reuses existing plumbing rather than inventing new infrastructure:

- `/flow`'s `[steps]` argument already documents this exact resume shape (`steps-and-gates.md`:
  "single step = resume from that step onward"; `/flow 42 review`, `/flow 42 review,wrap-up` are
  named examples).
- `_shared/pipeline-run-dir.md`'s resolution order already handles a fresh agent with no
  `PIPELINE_RUN_DIR` env var locating the right run: step 2, "most-recent matching directory...
  whose `spec-slug` segment matches the current spec." Call (2) finds call (1)'s run dir by record
  number, automatically.
- The worktree itself is tracked durably in `run-state.json` (main checkout, survives independent
  of any one session) via `record-worktree`/`close-run` — call (2) locates and re-enters the same
  worktree call (1) built in.

No new policy lever, no after-the-fact artifact-verification mechanism — the separation this phase
exists to guarantee is true by construction of dispatch's own control flow, which is why nothing
else is needed to enforce it.

### Files

- `skills/dispatch/SKILL.md` — Step 5's per-group dispatch template, now two Task() calls
- `skills/flow/steps-and-gates.md` — confirm/document that this resume shape is a supported,
  intentional consumer, not an incidental one
- `skills/_shared/pipeline-run-dir.md` — no change expected; call out explicitly as reuse

### Risk

- `worktree.always`'s wrong-checkout hook treats a commit from a session different than the one
  that recorded the worktree as allowed-with-warning (`wd-foreign-session`), not a denial — expect
  call (2) to trigger this when it commits polish fixes into call (1)'s worktree. Should work
  functionally; confirm empirically during planning rather than assume.
- Call (1)'s intermediate report needs an outcome vocabulary distinct from `/flow`'s terminal list
  (`merged | pr-opened | pending-review | failed | blocked`) — a `build,test`-only invocation isn't
  any of those yet. Resolve the exact intermediate signal during planning.

## Phase 3 — Push pending-review branches, open a draft PR

Depends on nothing above technically, but lands naturally in the same Step 5/Step 6 rewrite and
reuses the `CLAIM_RUN_ID`-set detection Phase 2 already establishes for "nobody is live in a
terminal."

When a dispatch-originated run resolves to `pending-review`, push the branch to origin and open a
**draft PR** against the target branch, with the run's Verification Brief as the PR body, before
the firing ends. Reuses the worktree-safe push mechanics `settle-and-merge.md`'s auto-merge gate
already has (push from inside the worktree, never the main checkout, per `worktree.always`) —
without the merge step, since this branch isn't merging yet.

**Scope, deliberately narrow:**

- Only `pending-review` outcomes — a build that reached wrap-up cleanly. Not `failed`/`blocked`
  (already has a durability answer via `bot:blocked` + retry ceiling); pushing an incomplete or
  broken branch would be noise, not signal.
- Only headless (dispatch-originated, `CLAIM_RUN_ID` set) runs. A human running `/flow` interactively
  already has the branch in their own terminal — nothing to protect, and auto-opening a PR on every
  interactive run would be a surprising, unrequested side effect.

A draft PR replaces "resume this exact ephemeral session" with an ordinary, durable GitHub review
surface — anyone can review, comment, and merge normally, and the artifact survives regardless of
what happens to the sandbox that built it.

### Files

- Wherever `pending-review` currently resolves and writes `demo:pending` + the Verification Brief
  comment (the Wrap-Up Review Console path) — add the push + draft-PR step alongside it, gated on
  `CLAIM_RUN_ID`
- `skills/dispatch/settle-and-merge.md` — reuse its push mechanics rather than duplicating them

### Risk

This phase deliberately creates a new, visible object in the repo (a draft PR) where none existed
before — an accepted, agreed trade-off (see Decisions taken), not a silent side effect. No other
structural risk identified.

## Testing

1. **Serialization.** Dispatch two groups in one firing where one carries `auto:merge` and the
   other doesn't; assert they never commit to the same branch. This is #155's own Acceptance
   Criterion 5 — revert the fix, confirm the test fails (`[IL-62]`).
2. **Blind review.** Assert call (2)'s agent context carries none of call (1)'s reasoning — e.g., a
   test that call (2) can locate and act on the run dir purely from the record number, with zero
   conversation carryover, and that a deliberately-planted flaw in call (1)'s own self-narrative
   (e.g. a false "all tests pass" claim) is independently checked rather than trusted.
3. **Durability.** Assert a `pending-review` outcome results in a branch reachable via
   `git ls-remote` and a real PR object — not merely a claim in the report that it happened.

## Failure analysis

- **Serialization failing to launch group N+1.** If group N's Task agent hangs or times out,
  downstream groups queue indefinitely rather than starting early — a availability cost, not a
  correctness one; the branch-sharing hazard this phase closes cannot reopen from a hang.
- **Call (2) never gets dispatched.** If call (1) fails or is blocked, call (2) must not run at
  all — nothing to review. Existing Settle/retry-ceiling handling applies to call (1)'s failure
  exactly as it does today to a single-call group.
- **Push/PR step fails (network, `gh` auth).** Falls back to today's behavior — branch stays
  sandbox-local, `pending-review` label and Verification Brief comment still post normally. A
  failed push must never fail the whole firing.

## Non-goals

- True concurrent execution across groups (spawning independent cloud sessions, one worktree each)
  — a legitimate future phase if firing cadence × batch size ever becomes a real bottleneck, not
  attempted here.
- Changing grant semantics or the `auto:merge` authorization boundary itself — inherited from
  #155's own Non-Goals.
- Event-driven/webhook-triggered dispatch (#279, parked). This design does not unpark it, though
  Phase 1's serialization satisfies one of #279's two stated unparking conditions ("#155 closes").
- Any change to `/claude-tweaks:backlog`'s grant-check or the #269/#270 machine-grant work —
  orthogonal thread, not touched here.

## Open items to resolve during planning

- Exact wording and enforcement mechanism for the `dispatch-pick-max-concurrent` →
  `dispatch-batch-size` deprecation alias.
- What outcome vocabulary call (1) reports for its intermediate `build,test`-only state.
- Whether Phase 3's draft PR should request a specific reviewer, or land unassigned.
- Confirm empirically whether Task-tool subagents receive distinct `CLAUDE_CODE_SESSION_ID`
  values, needed to reason precisely about Phase 2's expected `wd-foreign-session` warn event.
