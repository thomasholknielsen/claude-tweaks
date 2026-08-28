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

**`Defer-reason:` for producers that never run the deferral gate.** The four health sweeps
(`code-health`, `docs-health`, `harness-health`, `journey-health`) route findings about *other*
code they audited, not residue of a fix-now attempt on their own diff — `_shared/deferral-gate.md`
never applies to them (per #1262's Current State: "These do NOT cite the deferral gate"). Neither
that file's closed `Defer-reason:` vocabulary nor `bin/lib/issues/record.js`'s `DEFER_REASONS` was
built to describe this producer class, and extending that closed set for it would also change
`clearsFloor`'s (`bin/lib/issues/autonomy.js`) unrelated autonomy-grant floor — a much larger
change than this gap needs, since a digest entry is a comment append, never a `recordPayload` call.
Instead: a finding from one of these four producers, or any future producer that files directly
without running the deferral gate, stamps the fixed literal value `Defer-reason: proactive-sweep`
in this entry format's field — a contract-level exception documented here, not a `DEFER_REASONS`
member, never validated against that vocabulary and never evaluated by `clearsFloor`.

## Dedup

Before composing this run's routing (the comment or file-append below), read the container's
currently **active** entries — no trailing marker (`→ {id}` / `→ expired`) — the same read
`tidy/digest-sweep.md`'s cluster promotion already performs across every comment
(`work-backend: github-issues`) or the whole file (`work-backend: local-files`). Drop any of this
run's below-floor findings whose `{area}` plus its one-line finding and `{file refs}`, each
whitespace-collapsed and lowercased, already matches an active entry's same triple — do not append
a duplicate line for a finding the container already holds. The existing entry's `{provenance}`
stays exactly as originally filed; a re-encounter never rewrites it and never restarts that entry's
90-day expiry clock. Because a re-encountered finding never gets a second line, `tidy/digest-sweep.md`'s
cluster-promotion count (which counts entry *lines*) can never count the same real-world finding
toward its ≥3 threshold more than once.

## Container

**`work-backend: github-issues`:** one pinned rolling issue labeled `digest`. Before routing, list
open `digest`-labeled issues (`gh issue list --label digest --state open`); create one only when
none exists, bootstrapping the label first (`_shared/label-bootstrap.md`). Route by posting one
comment per run, aggregating that run's below-floor items that survive the Dedup fold above — one
comment URL per run, never one comment per item. All writes go through
`_shared/github-write-transport.md`. Routing appends are
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
backend, no rollover needed) after the same Dedup fold above (read the whole file instead of every
comment). Promotion marks the entry line with a trailing `→ {id}`. Expiry moves entry lines to an
`## Archived {YYYY-MM-DD}` section at the bottom of the same file.

## Summary surfacing

Every adopter's own summary/report output surfaces this run's routing to this digest, distinctly
from the unrelated per-origin cap-digest mechanism (`_shared/health-filing-digest.md`): when this
run routed at least one finding here, the adopter states the count and this run's digest comment
URL (`work-backend: github-issues`) or that `specs/digest.md` was appended
(`work-backend: local-files`); a zero-routing run states the count as `0` rather than omitting the
line, so digest activity is never silently inferred. The four health sweeps additionally carry this
as a `materiality-digest: K` field on their existing `filed: N, digested: M, cap: {CAP}` throttle
line (`_shared/health-filing-digest.md`'s SUMMARIZE step) — `M` (cap-digest) and `K`
(materiality-digest) are two different mechanisms and must never be folded into one number.

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

These adopter files route below-floor findings here: `review/step3-routing.md`,
`wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `reflect/full-mode.md`,
`reflect/hindsight-mode.md`, `visual-review/browser-review.md`, and the four health sweeps
(`code-health`, `docs-health`, `harness-health`, `journey-health`) — see `docs/skill-graph.md` for
the full per-skill relationship. `/tidy`'s digest sweep (`tidy/digest-sweep.md`) manages the
container's lifecycle (cluster promotion + expiry) independent of which adopters are actively
routing to it.
