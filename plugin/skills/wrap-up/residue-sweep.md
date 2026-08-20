# Residue Sweep — Phase 3 ledger-gate preamble procedure

Run by Phase 3's ledger gate as its preamble, before the resolve gate. Computes what this work leaves outstanding
by re-scanning the repository at close time, rather than trusting whatever the session happened
to remember and write into the transcript — then writes each finding into this run's ledger, so
the ledger's own three-phase resolve gate (`_shared/ledger-format.md`'s Resolve Gate section) has something to enforce on
a standalone run, where no other producer ever creates one.

**Multi-spec: skip when this is not the final spec's wrap-up.** In a `/flow` multi-spec run
(`flow/multi-spec.md`), the shared PR and branch stay open by design until the run's own "Finish
once at the end" step, after every spec's pipeline completes — a per-spec wrap-up mid-run is not
"close time" for that PR/branch. Running this preamble against an in-progress multi-spec run's own
open PR reports it as outstanding residue, which it isn't. Check the parent run dir's
`manifest.yml` (`multispec.specs[]`): if any entry other than the current spec has `status`
`pending` or `running`, this is not the final spec — skip this preamble entirely (report "Residue
sweep deferred — multi-spec run in progress" and proceed straight to the resolve gate on whatever
ledger items already exist). Run it normally on the final spec's wrap-up, or on any single-spec
run, where "this work" and "the whole run" are the same thing.

## Running the sweep

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/residue.js" --base {base} --integration-branch {ref} --scope blast-radius
```

**`--scope blast-radius`, not `--scope repo`.** This preamble closes out one run's own work, so a finding
belongs on this run's ledger only if it is this run's own blast radius (a branch this run's worktree left
behind, a PR from this run's own head branch, a missing release-triple entry). `--scope repo` keeps
everything — another session's live worktree, another lane's open PR — and forcing this run's ledger to
drill on those is exactly the noise `bin/lib/residue/scope-filter.js` exists to filter out. It stays the
CLI's own default (`bin/residue.js`'s `parseArgs` states why) and the right scope for `/tidy`
(`skills/tidy/scan-procedures.md`), whose job is to sweep every worktree and merged branch across the whole
repo; this preamble is the one caller that must override it.

**`--integration-branch` must always be passed explicitly — never rely on the CLI's own default.**
`bin/residue.js` defaults `--integration-branch` to the literal string `origin/main`, which is
correct for this repo and wrong for any adopter whose integration branch differs. Resolve `{ref}`
via `skills/_shared/integration-branch.md`'s canonical ladder before invoking the CLI, the same
resolution the Review Console's auto-merge short-circuit already performs.

Add `--no-suite` when the project's full test command already ran earlier in this same wrap-up
(e.g. via `/claude-tweaks:test`) and re-running it would only cost time without new information —
the CLI reports `unknown: skipped via --no-suite` for that probe rather than silently treating a
skip as a pass. Add `--json` when reading the findings programmatically instead of parsing the
CLI's own markdown table.

### Resolving `{base}`

Identical to `summary-template.md`'s existing three-rule base-resolution ladder (its State block)
— reuse that ladder by reference rather than restating it here; a second copy drifts from
the first the next time either is touched.

## Writing findings to the ledger

For each finding the CLI returns, add a row to this run's ledger (`ledger/SKILL.md`'s Add Item
operation): `Phase: wrap-up`, `Item`: `{kind} — {subject} — {evidence}`, `Status: open`. Apply the
ledger's own semantic-duplicate check first (`ledger/SKILL.md`'s Add Item section) — a finding
matching an existing item's phase and description is a duplicate, not a second row. If no ledger
file exists yet for this run (the standalone case this preamble exists for), create it now via the
ledger's own Create operation before adding the first item.

**There is no second disposition mechanism here.** Phase 3's existing three-phase resolve gate
(`_shared/ledger-format.md`'s Resolve Gate section) is what assigns each item's eventual disposition, exactly as it already
does for every other ledger producer (build, test, review, reflect):

- Phase 1 fixes it now → ledger status `fixed`, with the commit hash
- Phase 3 "Route to a record" (Defer/Keep) or "Close out → Acknowledge" stages then creates a
  record → ledger status `deferred`/`acknowledged`, resolved to the record number once created
- Phase 3 "Close out → Accept/Drop" → ledger status `accepted`, with the stated reason

## `remedy: auto` findings and the scratch worktree

A finding the CLI marked `remedy: auto` (an unlocked stale worktree, a claim blob for a closed
issue, a missing release-triple entry, an un-archived pipeline run dir whose `run-state.json`
reached `status: clean`) is naturally a Phase 1 fix-now candidate — its `Item` description should
say so. A merged-but-undeleted branch carries `remedy: auto` too, but never reaches here under
this preamble's `--scope blast-radius` (above): `probeBranches` only ever tags a branch
`scope: 'observed'` once it survives the `scope.headBranch` exclusion (#499), so it's filtered
out before Phase 1 sees it — same as any other `observed` finding, and still visible under
`--scope repo` (`/tidy`'s job, not this preamble's). When Phase 1 (or a user's "Fix anyway" choice in Phase 2)
applies it and the write is not legal from wherever this session currently sits, provision a
worktree via `skills/_shared/scratch-worktree.md` — apply each remedy as its own commit, then
merge back, and record the resulting sha as that item's `fixed` resolution. This applies to the
pipeline-run-dir finding too: the directory lives in the main checkout, so the move (archive it
under `.claude-tweaks/pipelines/archive/`) is usually illegal from wherever the run currently
sits.

## `remedy: record` findings

A finding the CLI marked `remedy: record` (an open PR outside this run's own blast radius, a red
suite, a locked worktree a live session still holds) is not Phase 1's to fix. Its `Item`
description should say so plainly, so Phase 1 correctly leaves it `open` for Phase 2's per-item
drill, where "Route to a record" or "Close out" is the natural landing choice — the CLI's `remedy`
field is a hint for that drill, not a rule the gate is bound to follow. `_shared/deferral-gate.md`
governs the routing: a proposal routed from here carries a `Defer-reason:` per this mapping — a
locked worktree a live session holds → `blocked-external`; an open PR outside this run's blast
radius → `blocked-external`; a red suite this run cannot fix → `genuinely-larger`; anything else
stays `open` for Phase 2's drill, where the human picks the value. A `remedy: record` item Phase 2
routes to a record composes exactly as ledger Phase 3's branches do (`_shared/ledger-format.md`) —
`specShapedBody`, the #621 mapping above supplying its `Defer-reason:`, landing born-ready, parked,
or `needs:definition` by the same rules.

## The judgment class — named triggers

Two observable classes resolve mechanically (the suite re-run above; a resolved gate denial, once
`events.jsonl` carries `gate-denial` entries). A third does not: something this session noticed by
reading, not by running a command. Add either of these as an `open` ledger item by hand (`Phase:
wrap-up`), same as any CLI-sourced finding:

- **A sibling record was read during this work and found wrong** — a fact, dependency, or
  assumption another open record states that this work's own findings contradict.
- **A decision was made and not acted on** — a `decisions.md` entry, or a conversation-level call,
  that concluded something should happen and nothing downstream executed it.

A run that finds neither adds no item for this class — silence here is a true negative, not a
skipped probe.

## `unknown` — never a silent skip

A probe reporting `ran: false` (no `gh`, an unresolvable scope, a test command that would not run)
is added as an `observation`-status ledger item, not `open` — there is nothing for Phase 1 or 2 to
resolve, but `observation` still counts in the ledger's own status summary (`Open: N | Fixed: N |
... | Observation: N`), so it is never silently dropped. This is the same rule the CLAUDE.md & rules
curation row already applies to `audit not run`: a check that never ran is not the same fact as a check that ran clean,
and folding the two into one "nothing outstanding" read is exactly the failure this procedure
exists to prevent.
