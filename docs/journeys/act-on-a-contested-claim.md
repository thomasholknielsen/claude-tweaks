---
files:
  - plugin/skills/flow/claim-targets.md
  - plugin/bin/claim-targets.js
  - plugin/bin/lib/claim-targets/claim-targets.js
  - plugin/bin/lib/issues/claim-store.js
  - plugin/skills/_shared/issue-claims.md
---

# Act on a Contested Claim at the Start of a Run

**Persona:** claude-tweaks user typing `/claude-tweaks:flow #{n}` on a repo where another session — their own second terminal, a teammate's machine, or a scheduled dispatch firing — may already be building the same record.
**Goal:** When the run stops before it starts because the record is already claimed, learn within one screen whether the holder is actually alive, and take the one next step that fits — rather than guessing between waiting, reclaiming, and re-running.
**Entry point:** Typing `/claude-tweaks:flow #{n}` (or `/claude-tweaks:flow "#{n},#{m}"`) in a project whose work records live on GitHub.
**Success state:** The run either claims every named target and proceeds to the Config Manifesto, or stops with a card that names the holder, states a live / stale / remote verdict, and gives exactly one next step — leaving no worktree and no empty run directory behind.

## Steps

### 1. Start the run — terminal
- **URL:** `/claude-tweaks:flow #{n}` (or `/claude-tweaks:flow "#{n},#{m}"`)
- **Action:** Name the record(s) to build. The claim happens before any policy questions, so nothing has been configured or created yet when it decides.
- **Should feel:** Instant and quiet on the happy path — claiming is not something the user should have to think about.
- **Should understand:** Every named target is claimed together or none is — a partial claim is released before the run stops, so a second target is never left locked by a run that never started.
- **Red flags:** The Config Manifesto rendering before the claim outcome is known; a multi-target run proceeding with one of its targets unclaimed.

### 2. Read the overlap note, if one appears — terminal
- **URL:** the same run output, immediately before the claim
- **Action:** Read any `Note: #{target} overlaps open #{other}` line and decide whether to cancel and re-run naming both records.
- **Should feel:** Like a tip, not an obstacle — the run continues either way.
- **Should understand:** This is informational only; the explicitly named list is never auto-expanded.
- **Red flags:** The note stopping the run, or a record the user never named being added to the run.

### 3. Read the contest card's verdict — terminal
- **URL:** the `## Flow: Claim contested` block, rendered in place of the Config Manifesto
- **Action:** Read the holder line (run id, session, host, claimed-at, expiry), then the paragraph beneath it — exactly one of Live sibling, Remote holder, or Stale holder.
- **Should feel:** Diagnosed, not stonewalled — the card answers "is anyone actually working on this?", not merely "it is locked".
- **Should understand:** The verdict is evidence-based and read-only — a host comparison, a match against the existing worktrees, and how recently the holding session last wrote its transcript. A missing artifact counts as evidence, so a verdict always renders and the lookup never blocks.
- **Red flags:** The card rendering with no verdict; the run hanging while it gathers evidence; a Stale-holder verdict recommending a reclaim even though a worktree for the holding run still exists; the card asking the user to choose something when there is nothing to choose between.

### 4. Follow the verdict's own next step — terminal, or another session
- **URL:** the `Next:` clause of whichever verdict rendered
- **Action:** Live sibling — wait for that session to finish or release. Remote holder — inspect the session on the named host, or wait for the claim to expire. Stale holder — run `/claude-tweaks:tidy` to sweep and reclaim, unless the card pointed at a worktree that still exists, in which case inspect that worktree first.
- **Should feel:** Like one obvious action, not a menu of maybes.
- **Should understand:** Nothing was created by the stopped run — no worktree, and a run directory this invocation minted for itself is removed on the way out, so re-running later starts clean.
- **Red flags:** An empty run directory left behind after the stop; a sweep-and-reclaim recommended against a holder that is still live.

### 5. Re-run once the claim clears — terminal
- **URL:** `/claude-tweaks:flow #{n}` again
- **Action:** Re-invoke the same command; the claim now reads as released or expired and the run proceeds to the Config Manifesto.
- **Should feel:** Ordinary — the second attempt behaves exactly like a first attempt on an unclaimed record.
- **Should understand:** A run that was interrupted mid-build and is resumed under its own run directory is not a contest — it recognizes its own claim and continues rather than blocking itself.
- **Red flags:** A resumed run contesting against itself; a transient network failure (the `## Flow: Claim failed` card, which names no holder and just asks for a retry) being read as a competing claim.

## Origin
- Created during build of #722 (holder-liveness verdict in the claim-contest card) — the claim stop and its card already existed, but the card's only guidance was "wait for the claim to expire", so there was no decision to document; the live / stale / remote verdict and its per-verdict next step are what this journey covers.
- Related specs: #720, #721, #722, #723
