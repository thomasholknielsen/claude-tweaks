# Materiality Floor — routing legitimately-deferred, below-floor findings to a digest

Applied strictly **after** `_shared/deferral-gate.md`: an item first attempts fix-now, and only
an item that fails fix-now and carries a valid `Defer-reason:` from that gate's closed vocabulary
reaches this floor. The floor never decides whether to fix — it only decides which container a
*legitimately-deferred* item lands in. Citing this file as a reason to skip a fix, or to defer
without a valid `Defer-reason:`, is a misuse of both contracts; `_shared/deferral-gate.md`'s hard
gate still applies unchanged, and this file repeats that ordering deliberately because it is the
predictable failure mode.

## The floor

Route to the digest only when the item would be filed at **all three**: `size:low` AND
`priority:low` AND `risk:low` (`_shared/work-record.md`'s Label taxonomy table — Risk/Size/Priority
rows). An unscored or ambiguous axis counts as **not low** — the floor fails toward filing an
ordinary issue, never toward the digest.

## Overrides

- `Defer-reason: tangential` always clears the floor and files as an ordinary issue — a tangential
  finding is a new idea the finding suggests, not residue of the current work, and ideas are
  intent, not exhaust (`_shared/deferral-gate.md`'s vocabulary).
- Human-typed `/capture` input is out of this contract's scope entirely — human input is intent,
  never exhaust, and never routes to the digest.

## Entry format

```
- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}
```

`{provenance}` is the pipeline run-id when a run directory resolves (`$PIPELINE_RUN_DIR`'s
basename), else the invoking skill's name. The entry itself is the durable audit trail — a
no-run-dir routing is never unlogged.

## Container

**`work-backend: github-issues`:** one pinned rolling issue labeled `digest`. Before routing, list
open `digest`-labeled issues (`gh issue list --label digest --state open`); create one only when
none exists, bootstrapping the label first (`_shared/label-bootstrap.md`). Route by posting one
comment per run, aggregating that run's below-floor items — one comment URL per run, never one
comment per item. All writes go through `_shared/github-write-transport.md`. Routing appends are
append-only; the one sanctioned exception is the `/tidy` digest sweep's promotion/expiry marker
edits (`tidy/digest-sweep.md`). A creation race that leaves two open `digest` issues is repaired
by that same sweep: merge the newer issue's comments into the older, then close the newer.

**`work-backend: local-files`:** `specs/digest.md`, entries appended in place (single-writer
backend, no rollover needed). Promotion marks the entry line with a trailing `→ {id}`. Expiry
moves entry lines to an `## Archived {YYYY-MM-DD}` section at the bottom of the same file.

## Audit line

When a run directory resolves, routing additionally logs, per `_shared/auto-decision-log.md` — the
existing `AUTO` status, no new status word:

```
AUTO {time} — materiality-floor: {item} routed below floor ({defer-reason}) → digest. Reversibility: high (entry remains promotable or re-filable from the digest at any time).
```

This is bookkeeping, not decision-worthy — no Review Console row per entry.

## Expiry is not skipped work

An expired entry already passed the deferral gate (fix-now was attempted and refused for a stated
reason) and sat un-promoted for 90 days. Archival is a logged retention decision reachable only
through that gate — the distinction that separates it from the silent skipping CLAUDE.md's "No
implicit deferrals" rule forbids. `tidy/digest-sweep.md` performs this archival; see that file for
the exact promotion and expiry procedures.

## Consumers

Nothing routes to the digest yet — the exhaust channels named in the follow-up sub-issue adopt
this contract there. `/tidy`'s digest sweep (`tidy/digest-sweep.md`) is the first and, until that
follow-up lands, only consumer — it manages the container's lifecycle (cluster promotion + expiry)
regardless of whether anything has routed to it yet.
