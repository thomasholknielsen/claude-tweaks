# Durable Cross-Firing State for the Health Skills

**Date:** 2026-07-12
**Status:** Approved (brainstorm 2026-07-12)
**Origin:** GitHub issues #7 and #8, filed against production evidence from a live cloud
Routine (memenu-app's `code-health-daily`). Both trace to one root cause: every health
skill's rotation/cache state lives at `.claude-tweaks/{skill}/*.json`, which is gitignored
and local-disk-only, while a scheduled cloud-routine (CCR) firing starts from a fresh,
stateless container every time — so that state never survives between firings.

## Problem

**#7 — rotation cursor / sub-threshold cache doesn't survive CCR recycling.**
`skills/code-health/SKILL.md`'s Routine Configuration section claims "a skipped run is
harmless — rotation resumes from the same position." A 2026-07-12 production firing found no
`.claude-tweaks/code-health/` cache at all despite GitHub already carrying issues from prior
sweeps — proof prior runs happened, proof the cache doesn't survive. The same local-only
storage also holds `cache.json`'s `remembered` (sub-threshold, below `--min-risk`) findings —
the "escalate once a finding recurs" mechanism can't work at all under CCR, since every
sub-threshold finding is forgotten the moment the container recycles.

**#8 — no retry/dead-letter path when a discovered finding fails to file.**
A 2026-07-10 firing found a real finding (an outdated `basic-ftp` pin with known CVEs),
attempted to file it, and every attempt failed (GitHub connector token expired mid-run). The
finding was never durably queued anywhere a later run would retry it — as of 2026-07-12 (2+
days later) the pin is still unfixed and no issue exists for it anywhere in the repo.

**A third, related gap found while designing this fix (not separately filed):**
`bin/lib/watchman-core/runs.js`'s `recordRun()`/`readRuns()` (used by `churn-report`, which
iterates *all* consecutive run pairs — confirmed in `bin/code-health.js`'s
`cmdChurnReport`, no history-window flag exists) has the identical local-disk-doesn't-survive-
CCR problem. Migrating it wholesale would grow unbounded (one record per firing, forever), so
it needs its own retention strategy — see "Run-history retention," below.

## Scope

All three health skills — `code-health`, `harness-health`, `journey-health` — not just the two
named in the filed issues. They share `bin/lib/watchman-core/cache.js` for cursor/run
persistence, and all three file findings via a bare `gh issue create` with no retry handling.
Fixing the shared root cause once, in the shared module, closes the bug for all three instead
of leaving it latent (and unfiled) in the other two.

One asymmetry carries through the whole design: only `code-health` has a `--min-risk`
threshold and a `remembered` (sub-threshold) cache tier. `harness-health` and `journey-health`
file every finding unconditionally — confirmed by grepping both `SKILL.md` files for
`min-risk`/`remember` (no matches). So `remembered.json` only ever exists for `code-health`;
the other two skills' durable state is just cursors + retry-queue + run history.

## Rename: watchman → health-core / health-state / "health check"

The shared module directory is named `watchman-core` today, and skill docs describe each
skill's recurring nature as "a recurring watchman." Both terms predate this design (see
`docs/superpowers/plans/2026-07-11-watchman-core-extraction.md`) but the term doesn't fit the
new mechanism this design adds, so it's renamed throughout **live code and shipped docs**:

| Location | Current | New |
|---|---|---|
| `bin/lib/watchman-core/` (dir + every `require('../watchman-core/...')` in `code-health`/`harness-health`/`journey-health`'s `cache.js`/`fingerprint.js`/`dedup.js`) | `watchman-core` | `health-core` |
| Test tmpdir prefixes (`bin/lib/watchman-core/tests/cache.test.js`, `runs.test.js`) | `'watchman-core-cache-'`, `'watchman-core-runs-'` | `'health-core-cache-'`, `'health-core-runs-'` |
| `CLAUDE.md`'s structure listing | `bin/lib/watchman-core/` | `bin/lib/health-core/` |
| `skills/code-health/SKILL.md:9`, `skills/harness-health/SKILL.md:9`, `skills/journey-health/SKILL.md:9` ("A recurring watchman...") | "A recurring watchman ..." | "A recurring health check ..." |
| `README.md:214`, `README.md:216`, `skills/help/reference-card.md:46`, `:47` ("Recurring watchman for/auditing...") | "Recurring watchman for/auditing ..." | "Recurring health check for/auditing ..." |
| `bin/lib/watchman-core/cache.js`'s own header comment ("shared by the health watchmen (code-health, harness-health, journey-health)") | "the health watchmen" | "the three health skills" (the parenthetical already names them, so the collective noun is redundant once it's not "watchmen") |

**"health-state" is reserved exclusively for the new durable-storage branch and its module** —
it does not replace "watchman" in the recurring-behavior prose. "Watchman" there is a metaphor
for a thing that patrols; "health-state" is a noun about storage. Substituting one for the
other in that sentence produces "a recurring health-state," which doesn't parse as intending
the same meaning — so the prose uses "health check" instead, which stays consistent with the
skills' own `-health` naming.

**Explicitly not renamed:** `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md`
(historical design-decision records — rewriting past decisions' vocabulary after the fact
would misrepresent what was actually decided at the time, the same reason git commit messages
aren't rewritten after merge).

## Architecture: a dedicated `health-state` branch

A single branch, `health-state`, created once and never merged into `main` (or any other
branch) — a scratch area for machine bookkeeping only, mirroring today's local directory
layout:

```
code-health/cursors.json
code-health/remembered.json      # sub-threshold findings — code-health only
code-health/retry-queue.json
code-health/runs/                # capped run-history records, see below

harness-health/cursors.json
harness-health/retry-queue.json
harness-health/runs/

journey-health/cursors.json
journey-health/retry-queue.json
journey-health/runs/
```

File *contents* keep today's existing JSON shapes exactly (the `{ lastSweptMs, lastHash }`
cursor entry shape, the `{ status, issue }` remembered-entry shape, the
`{ runId, runAt, fingerprints }` run-record shape) — only their location changes, so no schema
migration is needed on top of the storage-location change.

**Why a branch, not a bare ref (like `refs/claims/issue-<N>`) or a GitHub-issue-body blob:** a
real branch is inspectable with plain `git log`/`git show` — every historical state change is
a commit, not just the latest snapshot — and reads/writes both happen via git plumbing against
the branch's own history, never against the checked-out working tree. That means zero
interaction with this repo's own `worktree.always` policy or its wrong-checkout hooks: nothing
is ever `Edit`/`Write`-ed into a working directory, so there's no `EnterWorktree` dance for an
unattended CCR firing to navigate, and no HARD-GATE it could get stuck on with no human present
to resolve it.

(`refs/claims/*` deliberately avoids `refs/heads/` specifically to stay out of the branch list;
this design accepts that tradeoff in exchange for the free audit trail a real branch's commit
history gives for free. Renaming to a bare ref instead is a one-line change to the read/write
plumbing below if that tradeoff is ever revisited.)

### Read path

```bash
git fetch origin health-state
git show origin/health-state:code-health/cursors.json
```

No checkout. A single `git fetch` per firing, then plain local `git show` reads for every file
that skill needs — cheap relative to the LLM-judging cost that dominates a real sweep.

### Write path, with compare-and-swap

One write per firing, batching every file that firing touched (cursor update + retry-queue
delta + remembered delta, if any + a capped run-history append) into a **single commit**,
built via the Git Data API:

1. `POST .../git/blobs` for each changed file's new content.
2. `POST .../git/trees` — new tree, based on the current tip's tree, with the changed blobs
   swapped in.
3. `POST .../git/commits` — parent = the branch's current tip sha (read once at the start of
   the firing).
4. `PATCH .../git/refs/heads/health-state` with the new commit sha, **`force` omitted (false by
   default)**.

Step 4 is the actual compare-and-swap: GitHub's non-force ref update requires a fast-forward.
If another firing moved the branch since step 3's parent was read, the new commit's parent no
longer matches the live tip and the PATCH is rejected — a correct, free CAS with no extra
parameter, extending the same "ref update as atomic test-and-set" idea `refs/claims/*` already
uses for locks (there it's create-if-absent/422; here it's update-if-unmoved/reject-on-non-
fast-forward).

**On rejection:** re-fetch the new tip, re-read the now-current file contents, replay this
firing's mutation on top of them, retry. Bounded at 3 attempts; if still rejected, warn and
skip the branch write for this firing rather than blocking the sweep — a lost bookkeeping write
just means the next firing might redo some rotation/retry work it otherwise wouldn't have to,
which is safe (GitHub-issue fingerprint dedup means a redundant re-file attempt just resolves
to `skip`, never a duplicate issue). Concurrent writers to this branch should be rare in
practice — one project's own scheduled routines, not a multi-tenant queue — so this is a
correctness backstop, not an expected-common-path.

**Branch bootstrap:** if `health-state` doesn't exist yet (first-ever run in a fresh repo),
create it via the same atomic create-if-absent pattern `refs/claims/*` uses for locks — an
empty root commit, then `POST .../git/refs` (201 = created; 422 = a concurrent firing already
created it, in which case just proceed as if it already existed).

### New module

`bin/lib/health-core/durable-state.js`, parameterized like `createCache(skillName)` already is:

```
createDurableState(skillName) -> {
  readState(root)                    // one fetch + N local `git show` reads
  writeState(root, mutatorFn)        // read-modify-write with CAS retry, as above
}
```

`root` is used only to resolve `owner/repo` (via `gh repo view`) — never to read local files.
Each skill's existing `cache.js` (`code-health`, `harness-health`, `journey-health`) swaps its
`core.readCursors`/`core.writeCursors` calls for this module's `readState`/`writeState`, scoped
to the cursor/remembered/retry-queue/run-history fields relevant to that skill.

## Retry / dead-letter queue (closes #8)

Each skill's `retry-queue.json` is an array of
`{ fingerprint, payload, firstFailedAt, attempts, lastError }` — one entry per finding that was
fingerprinted but whose `gh issue create` call failed.

**Drain-before-rotate.** Every firing's filing step first attempts to re-file everything
already in that skill's retry queue, *before* normal slice/target rotation begins. This is
smaller than reordering the existing validate/persist → file step order — the queue itself is
what makes a filing failure survive independently of whether the cursor already got marked
swept, exactly as each issue's own "Suggested fix" section proposed.

- **Fresh failure** (queue drain, or a new finding that fails to file): append/update the
  entry, increment `attempts`, include it in this firing's batched branch write.
- **Success:** remove the entry.
- **3rd consecutive failure for the same fingerprint:** escalate — file (or update) a
  dedicated issue labeled `{skill}:filing-failed` naming the stuck fingerprint and its failure
  history, bootstrapped via the standard label-bootstrap snippet. This surfaces the problem
  through the normal GitHub issue list a human already watches, rather than growing the queue
  silently forever or inventing a second notification channel.

## Run-history retention

`runs/` moves into the `health-state` branch (so `churn-report` works under CCR too), capped to
the **last 90 records per skill**, oldest pruned on every write that would exceed the cap. 90
comfortably covers `churn-report`'s practical use case — spotting a recent shift in
criteria/anchoring/code structure — without unbounded growth over the life of a repo.

## What's not changing

- **`cache.json`'s open/closed/wontfix/regressed dedup entries** stay exactly as they are
  today: local, gitignored, rebuilt fresh from `gh issue list` every run. This part was never
  actually broken — GitHub issue state is already the reconstruction source for it, matching
  `code-health/SKILL.md`'s own Anti-Patterns entry ("GitHub issue state is the source of truth
  for cross-run memory").
- **Routine template prompts** (`skills/*/routine-template*.yml`, the standard preamble added
  earlier this cycle) are unaffected — that preamble governs freshness of the *working-tree
  checkout* used to run the skill against real source code, which is orthogonal to a branch
  that's fetched separately and never checked out. Checked for cross-reference; no change
  needed.

## Testing approach

`durable-state.js`'s git/`gh` calls are injected (a runner function), mirroring how
`bin/lib/code-health/scope.js` already isolates its `execFileSync` calls — unit tests stub the
runner to verify CAS-retry-on-rejection, batching, and bootstrap-on-missing-branch without
touching real GitHub. A small integration check (manual or CI, against a disposable test repo)
confirms the real Git Data API sequence actually round-trips.

## Files touched (for the implementation plan)

- `bin/lib/watchman-core/` → `bin/lib/health-core/` (rename), all 3 skills' `cache.js` /
  `fingerprint.js` / `dedup.js` require-path updates, test file renames + tmpdir prefix updates.
- New: `bin/lib/health-core/durable-state.js` + tests.
- `bin/lib/code-health/cache.js`, `bin/lib/harness-health/cache.js`,
  `bin/lib/journey-health/cache.js` — swap local cursor/remembered/run persistence for
  `durable-state.js` calls, **and** update each file's own header comment: today all three say
  some form of "Gitignored, rebuildable-from-issues state. Canonical path:
  `.claude-tweaks/{skill}/{cache,cursors}.json` and `.../runs/*.json`" — that's false after this
  change for `cursors.json`/`runs/*.json` (they move to the `health-state` branch); only
  `cache.json` stays local/gitignored. Each header needs to say so explicitly, not just have its
  call sites swapped silently underneath a stale comment.
- New: a retry-queue module (or folded into `durable-state.js`) + wiring into each skill's
  filing step in `skills/code-health/SKILL.md` (Step 9), `skills/harness-health/SKILL.md`,
  `skills/journey-health/SKILL.md`.
- `CLAUDE.md`, `README.md`, `skills/help/reference-card.md` — rename table above.
- `skills/code-health/SKILL.md`'s Routine Configuration section — correct the "a skipped run
  is harmless" claim now that it's actually true.
