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
rows), judged at filing time by the routing skill itself — not read off an existing label, since
most filing paths never stamp `priority:*` (it is an optional family; only `/backlog refine`,
`/backlog attention`, `/dispatch`, and `/specify`'s `next` mode write it). The routing skill judges
all three axes as it would score a fresh filing, including the unstamped priority axis. An axis the
routing skill genuinely cannot judge, or judges ambiguously, counts as **not low** — the floor
fails toward filing an ordinary issue, never toward the digest.

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

`{area}` is the subsystem the finding belongs to, written as a stable, low-cardinality, lowercase
token: the skill name (`tidy`, `review`), the `bin/lib/` module (`issues`, `hooks`), or the
top-level tree (`docs`, `tests`) the `{file refs}` sit under — never a sentence and never a
slash-prefixed command name. `tidy/digest-sweep.md`'s cluster promotion groups on this field by
exact match, so improvised per-run phrasings of the same area (`tidy` vs `/tidy` vs `the tidy
skill`) silently keep a real cluster below the ≥3 threshold forever.

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

**The digest issue is a container, not a work record.** It carries no stage label by design, so
every record-scoped sweep that reads the open-issue queue classifies it as an ordinary backlog
record (`bin/lib/issues/record-buckets.js`'s `isBacklog` — stage `backlog` is the no-label
default). Every such sweep exempts a `digest`-labeled issue the same way `/tidy`'s Shape 1 already
exempts `parent-issue` (`tidy/step-1-records.md`): a digest issue is never shaped, scored,
promoted, or closed as a record. Without that exemption the container is `isBacklog` forever and
crosses any staleness threshold, where Shape 1's default recommendation is `Delete or Promote` —
closing the container out from under every entry it holds. Only the digest sweep's own lifecycle
(`tidy/digest-sweep.md`'s 100-comment rollover) ever closes a digest issue, and it bootstraps the
replacement in the same move.

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

Ten adopter files route below-floor findings here: `review/step3-routing.md`,
`wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `reflect/full-mode.md`,
`reflect/hindsight-mode.md`, `visual-review/browser-review.md`, and the four health sweeps
(`code-health`, `docs-health`, `harness-health`, `journey-health`) — see `docs/skill-graph.md` for
the full per-skill relationship. `/tidy`'s digest sweep (`tidy/digest-sweep.md`) manages the
container's lifecycle (cluster promotion + expiry) independent of which adopters are actively
routing to it.
