---
files:
  - bin/release-claim.js
  - bin/lib/release-claim/release.js
  - bin/log-decision.js
  - bin/lib/log-decision/append.js
---

# Release a Claim and Log a Pipeline Decision

**Persona:** claude-tweaks skill author (or a maintainer of a project using the plugin) who wants proof that the release-claim and log-decision CLIs actually perform the read → classify → ownership → write sequence `_shared/issue-claims.md` and `_shared/auto-decision-log.md` document, rather than trusting the contract's prose.
**Goal:** Watch one claim release resolve against a fake `gh` (own claim, foreign claim, already-released claim) and one decisions.md append land under the right heading — confirming both CLIs' exit codes and log output match what Section E, Shared teardown, and Settle actually invoke.
**Entry point:** A terminal at the plugin checkout root (the repo that ships `bin/release-claim.js` and `bin/log-decision.js`).
**Success state:** Three release outcomes (`released`, `skipped-not-owner`, `already-released`) each exit with their documented code, and one `decisions.md` file carries a schema-valid entry under a named `## /{skill}` heading.

## Steps

### 1. Append a decision line and inspect the schema — terminal + a scratch run dir
- **URL:** `mkdir -p /tmp/ld-journey/.git && node bin/log-decision.js --run /tmp/ld-journey --status AUTO --step "Section E" --text "released claim on #999" --reversibility high --section "/wrap-up"`
- **Action:** Run the command from the checkout root — note the `.git` directory created first, so the run dir is anchored to a real (if tiny) checkout rather than a bare tmp path.
- **Should feel:** Instant and unambiguous — one echoed schema line, no configuration needed.
- **Should understand:** `cat /tmp/ld-journey/decisions.md` shows the line under a `## /wrap-up` heading — `- AUTO {HH:MM:SS} — Section E: released claim on #999. Reversibility: high.` — exactly the shape `_shared/auto-decision-log.md`'s Entry schema documents. Re-run with `--status STAGED --step "Step 3"` and the second line lands under the same heading, below the first — the Append protocol's per-skill grouping, not append-anywhere.
- **Red flags:** A stack trace instead of exit `2`/`3` on a bad invocation; the entry landing outside `## /wrap-up` on the second call (heading-matching regressed); a run pointed at a path with no `.git` above it succeeding instead of exiting `3`.

### 2. Watch the anchoring guard refuse a worktree-local shadow — terminal
- **URL:** `mkdir -p /tmp/ld-journey/.claude/worktrees/wt && printf 'gitdir: ../../../.git/worktrees/wt\n' > /tmp/ld-journey/.claude/worktrees/wt/.git && mkdir -p /tmp/ld-journey/.claude/worktrees/wt/.claude-tweaks/pipelines/run-a && node bin/log-decision.js --run /tmp/ld-journey/.claude/worktrees/wt/.claude-tweaks/pipelines/run-a --status AUTO --text "should be refused"`
- **Action:** Run the command — this simulates a run dir that resolves inside a linked worktree rather than the main checkout.
- **Should feel:** Fail loud and specific, not silent — the exact failure mode `[IL-127]` exists to prevent (a worktree-local shadow copy of pipeline state).
- **Should understand:** Exit `3`, stderr names the shadow path and points at `_shared/pipeline-run-dir.md` — the CLI walks up from the run dir to the nearest `.git`; a `.git` FILE (the `gitdir:` pointer above) means a linked worktree of either domain (`.claude/worktrees/` or `.worktrees/`), never the main checkout, so it refuses rather than silently writing a second, orphaned `decisions.md`.
- **Red flags:** Exit `0` and a `decisions.md` created under the shadow path — the guard has regressed to the domain-substring check it replaced.

### 3. Release a claim you own, then one you don't — terminal, `bin/lib/release-claim/release.js` directly with an injected fake `gh` runner
- **URL:** `node -e "const {releaseClaim}=require('./bin/lib/release-claim/release');const liveBlob=()=>({content:JSON.stringify({runId:'runA',sessionId:'s',claimedAt:new Date().toISOString(),ttlHours:72,host:'h'}),sha:'sha1'});let blob=liveBlob();const fakeGh=(args)=>{if(args[0]==='api'&&args[2]==='-q')return JSON.stringify({content:blob.content,sha:blob.sha});if(args[0]==='api'&&args[1]==='--method'&&args[2]==='PUT'){blob={content:'tombstone',sha:'sha2'};return '{}';}if(args[0]==='issue'&&args[1]==='comment')return '';throw new Error('unexpected '+args.join(' '));};const a=releaseClaim({owner:'acme',repo:'w',issueNumber:999,runId:'runA',reason:'merged: spec 999',runner:fakeGh});console.log('Run A:',a.outcome,a.calls.join(','));blob=liveBlob();const b=releaseClaim({owner:'acme',repo:'w',issueNumber:999,runId:'runB',reason:'merged: spec 999',runner:fakeGh});console.log('Run B:',b.outcome,'holder='+b.holder,b.calls.join(','));"`
- **Action:** Run from the checkout root. The script wires an in-memory fake `gh` runner (mirroring `tests/bin-lib/release-claim/cli.test.js`'s `deps({...})` harness) into `releaseClaim` directly — no real `gh`, no network. It calls `releaseClaim` twice against the same live claim blob on issue #999: once as `runId: 'runA'` (the holder), once as `runId: 'runB'` (a different caller — the equivalent of a second pipeline run's `--run <run-dir>` producing a different `runId`, since the CLI derives `runId` from `basename(--run)`).
- **Should feel:** Deterministic per caller — the same call means "release" for the owner and "no-op, someone else has this" for anyone else, with no ambiguity in between.
- **Should understand:** stdout prints exactly `Run A: released read,put,comment` then `Run B: skipped-not-owner holder=runA read`. Run A: blob read → tombstone `PUT` carrying the read `sha` → release comment — the same three-call sequence Section E steps 3-6 describe; `bin/release-claim.js` maps this `outcome` to exit `0`. Run B: `releaseClaim`'s own ownership check reads the blob (`calls` stops at `read`), sees a `runId` that isn't its own, and returns `{outcome:'skipped-not-owner', holder:'runA'}` before any write — no PUT, no comment, no label edit; the CLI maps this to exit `4` and logs `skipped release of issue #999: claim held by run runA` to its own `decisions.md`. An issue already tombstoned (released or swept) instead throws a `404`/`409`/`422` from the `PUT`, which `releaseClaim` maps to `outcome: 'already-released'` (CLI exit `3`) — the comment still posts, so the trail records the outcome even though nothing was overwritten.
- **Red flags:** Run B's call producing a `put` or `issue comment` entry in its `calls` array (a successor's claim is never deleted — `_shared/issue-claims.md`'s Ownership rule); `already-released` instead of `skipped-not-owner` for Run B (means the ownership check ran after, not before, the write attempt); a label-removal failure changing the release outcome (labels are best-effort — the release itself never blocks on them).

## Origin
- Created during build of record #686 (release-claim and log-decision CLI wrappers)
- All 3 steps built in this session
- Related specs: #687, #688, #689, #690, #691, #692, #693 (same `flow` run, `2026-08-16T210742-spec-686-687-688-689-690-691-692-693`)
