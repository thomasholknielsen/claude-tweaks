# Specify — bare drain (headless selection form)

Entered from `SKILL.md`'s `### Resolve the input` case 0 (bare invocation,
or its deprecated `next` alias, normalized to `--budget 1` before this case
runs). The headless-safe unit a scheduled Routine fires — mirrors
`/claude-tweaks:dispatch`'s own bare drain (`dispatch/SKILL.md` Step 3)
end-to-end: same ranking definition, same zero-eligible no-op posture, same
claim/release discipline, same per-iteration re-fetch-and-re-rank driver.
This file (Flag rejection through Claim) and `next-mode-shape.md` (Framing
Guard through Failure self-report, #1346's split) together are the drain's
loop body **and** driver: the Claim → Framing Guard → Shape → Release
sequence is the per-record body, run once per iteration in ranked order,
until `--budget <n|all>` attempts are spent or the eligible set is empty
(`_shared/record-batch-input.md`'s `--budget` section states the canonical
`n`/`all` semantics — cited, not restated, here). Shaping itself is
unchanged: this file hands each iteration's claimed record to
`shaping-mode.md` exactly as a `--chained` invocation does — no shaping
logic is duplicated here.

## Flag rejection

`phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected
with a one-line notice when combined with bare drain (or its deprecated
`next` alias) on the command line: "bare drain accepts only `--budget` and
`--priority` — {flag} ignored." This form always resolves
`Design-intent: none` internally, and resolves `Ui-stack:` from the
`ui-stack` project policy — the same `bin/resolve-policy.js --values ...
ui-stack` invocation Step 2.5c2's own `--chained` branch runs
(`design-pre-steps.md`), against the run dir the **Decision-log fallback**
paragraph below names — writing the policy value verbatim when it is non-empty and
falling back to `Ui-stack: none — no preference, defer to reference
codebase` only when it is empty. Both mirror `--chained`'s own headless
posture, including that policy-first resolution: `design-intent` needs no
resolve here because `none` is its schema default, while `ui-stack` carries
no schema default, so an unconditional sentinel would discard a real,
explicitly-set project policy value. Neither prompts, since a headless
firing has nobody to answer Step 2.5c's design-intent question or Step
2.5c2's UI-stack question — an empty `ui-stack` falls to the sentinel here,
never to that step's KEPT-PROMPT fallback. Report the rejection notice,
then proceed with this form's own procedure below — a rejected flag is a
warning, never a hard stop.

## Preflight

> The local-files stop paragraph below follows the canonical pattern in
> `_shared/local-files-preflight-stop.md` — do not weaken its enumeration,
> no-exception clause, or auto-mode disclaimer when editing.

Read the project's `work-backend` config key (per `_shared/work-record-config.md`,
the key table's canonical home). **`work-backend: local-files`** — report
that headless shaping is `github-issues` only (the claim protocol depends on
GitHub's RBAC + atomic content writes, not a policy choice) and **stop this
turn completely**: do not read or follow `shaping-mode.md`'s procedure,
invoke `ceremony-check` or `framing-check`, claim, write, edit, or create
any file; do not run any test or git-committing command. Tell the user they
can run `/claude-tweaks:specify #{n}` manually against a chosen record if
they want it shaped — this is information for the user to act on, never an
instruction for you to act on yourself. This holds with no exception when no
interactive human is present to receive it — which is bare drain's
entire reason for existing (the deprecated `next` alias inherits the same
posture): the absence of a human to hand this off to is
not license to do the work in their place — it means the claim mechanism
this protocol depends on is unavailable, so the correct behavior is to stop,
not proceed. This stop is not superseded by this project's own auto-mode or
hands-off-pipeline conventions elsewhere in CLAUDE.md (e.g.
`/claude-tweaks:flow` defaulting to `auto`, "skills MUST NOT invent new
mid-flow stops"): those conventions govern a pipeline run already authorized
to proceed; Preflight decides whether new work may start at all, which
under `local-files` it explicitly cannot. A record that looks low-risk,
well-scoped, or "ready-adjacent" is not an exception.

**Headless self-report.** Before stopping on this Preflight failure, or on
any post-claim shaping-stage failure below, read `_shared/headless-self-report.md`
and follow it (`{caller}` = `specify`), then stop. It never softens the
stop — it only leaves a durable GitHub trace, deduplicated against any
existing open report so repeated firings don't re-file. A zero-eligible
exit or a lost-claim-race retry (below) is NOT a failure and files
nothing.

**Label prerequisites.** This firing writes two of `_shared/label-bootstrap.md`'s
canonical labels: `needs:definition` (the Framing Guard section's routing
outcome, stamped before `shaping-mode.md` ever loads) and `shaped:headless` (applied
inside `shaping-mode.md`'s own compose-then-write-once call, which bootstraps
it per that file's own instruction). This file runs no bootstrap loop of its
own — a headless firing assumes an earlier interactive run, or
`/claude-tweaks:init`'s one-time provision-now offer, already established the
canonical set in this repo. If `needs:definition` is absent, the routing stamp
simply fails, and that is handled as the Framing Guard section's stamp-failure
condition below — never swallowed as a success.

## Eligibility query

This query runs fresh at the top of **every** drain-loop iteration — never
once at the firing's start. Selection below is a full re-derivation from
that fresh fetch each time, not a filter over a list frozen earlier in the
run (`next-mode.md`'s Zero eligible or budget exhausted section below names
the two ways the loop actually ends).

Per `_shared/record-queue-fetch.md`'s `work-backend: github-issues` fetch:
open records carrying none of `ready`, any `needs:*`-prefixed label
(`_shared/work-record.md`'s worklist rule), `parked`, `parent-issue`, and
`bot:in-progress`. The last is a cheap label-based
pre-filter, the identical posture `dispatch/SKILL.md` Step 2 already takes
for its own `bot:*` exclusion ("labels are projection, not truth... the
authoritative unclaimed check is `/flow`'s Step 2.8 atomic claim
attempt") — passing this pre-filter does not mean a record is actually
unclaimed, only that its label snapshot doesn't say so; the authoritative
check happens at the Claim step below. `ready` and `parent-issue` are
excluded because they are not this skill's job at all — a `ready` record
is already shaped (nothing left for bare drain to do), and a `parent-issue` is
a decomposition summary, never itself a shaping target
(`_shared/work-record.md`'s Structure family). That exclusion is
label-only and selection-time; an unlabeled legacy parent (a
`## Leaves`-table body with no `parent-issue` label) passes it —
`SKILL.md` case 1's parent-record guard is the shaping-time backstop that
still refuses it here, headlessly, without repair. The other two exclusions
are content judgments, not mechanical ones, and each rules out headless
shaping for a different reason: **any `needs:*`-prefixed label** marks a record another unit is
already asking a human to decide (`_shared/work-record.md`'s worklist rule; `needs:definition`
specifically marks "a genuine open choice with no tradeoff made yet, rather than a single clear
ask" — that file's Definition family) — an undecided record cannot be born-ready, and a headless
firing has nobody present to make the decision it's waiting on, so shaping it would mean
fabricating that human call. **`parked`** marks a record a human deliberately deferred;
unattended shaping must not un-defer it on its own — promoting a `parked`
record out of hold is exactly what shaping mode does (removes the label,
per `shaping-mode.md`'s Stamp scoring and stage labels section), so
leaving it un-promoted is the only safe default with nobody present to
confirm the human's deferral has lapsed.

`gh issue list` returns newest-first, so a fetch that hits the `--limit`
cap silently drops the *oldest* open records — precisely the records
bare drain's own oldest-first tie-break (Selection below) is designed to
surface first (the same risk `dispatch/queue-pull-script.md`'s own `next`
queue pull already guards against). This applies on every iteration, not
just the first — a long-running `--budget all` drain re-checks it on each
fresh fetch. Check the raw pre-filter fetch count
against the cap, not the post-filter `eligible` count, which will rarely
hit 500 exactly even when the raw fetch was truncated:

Resolve this fence's session-scoped temp paths first (`_shared/session-tmp-root.md`):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" RAW=specify-next-raw.json CANDIDATES=specify-next-candidates.json)"
gh issue list --state open --json number,title,labels,createdAt --limit 500 > "$RAW"
RAW_COUNT=$(node -e "console.log(require('$RAW').length)")
if [ "$RAW_COUNT" -ge 500 ]; then
  echo "Warning: the open-issue pull for a bare /claude-tweaks:specify drain (or its deprecated next alias) returned exactly the --limit cap (500) — this repo may have more open records than fetched. gh issue list returns newest-first, so any records beyond the cap are the OLDEST ones, exactly what bare drain's own oldest-first tie-break exists to surface first. Consider raising the cap, or filing this as a signal to re-triage the backlog down." >&2
fi
node -e "
  const records = require('$RAW');
  const EXCLUDE = new Set(['ready', 'parked', 'parent-issue', 'bot:in-progress']);
  const eligible = records.filter((r) =>
    !r.labels.some((l) => EXCLUDE.has(l.name) || l.name.startsWith('needs:'))
  );
  console.log(JSON.stringify(eligible));
" > "$CANDIDATES"
```

No further claim-state filtering runs here — the `bot:in-progress`
exclusion above is a cheap label pre-filter only, same posture as
dispatch's own queue-time filter. The authoritative unclaimed check is the
Claim step's live re-read below, which reads each candidate's actual
claim-blob state per `_shared/issue-claims.md`'s "Reading claim state" and
attempts an atomic create-only/conditional write; a record can pass the
pre-filter above and still turn out contested once Claim runs.

## Selection

The ranked list, by dispatch's own ranking (`dispatch/SKILL.md` Step 3):
`priority:high` > `priority:medium` > `priority:low` > unprioritized,
oldest `createdAt` first within each band — the top of that ranking is
this iteration's pick.

This is a **full re-derivation on every iteration** of the drain loop,
never a filter over a list frozen at the firing's start: the Eligibility
query above re-runs fresh each time this section is reached, so a record
shaped, routed, or claimed elsewhere earlier in this same run is naturally
absent from a later iteration's fetch (it no longer matches the
Eligibility query's own predicate — it now carries `ready`,
`shaped:headless`, a `needs:*`-prefixed label, or `bot:in-progress`), and a
record that becomes newly eligible mid-run (a label removed, a `parked`
deferral lifted by a human in another session) is naturally picked up the
next time this section runs. A record `next-mode-shape.md`'s Framing Guard
routes to `needs:definition` mid-run is likewise excluded from every later
iteration by this same fresh re-fetch, via the Eligibility query's
existing `needs:*`-prefixed-label exclusion — no special-case skip logic
beyond re-running the query.

Re-resolve this fence's session-scoped temp paths (a fresh bash invocation does not inherit the Eligibility fence's shell variables, `_shared/session-tmp-root.md`):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" CANDIDATES=specify-next-candidates.json PICK=specify-next-pick.json)"
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => {
    const p = r.labels.find((l) => l.name.startsWith('priority:'));
    return p ? RANK[p.name.slice('priority:'.length)] : 3;
  };
  const candidates = require('$CANDIDATES');
  const ranked = candidates.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0] : null));
" > "$PICK"
```

## Zero eligible or budget exhausted (loop termination + close-out)

A `null` result at this fence's `$PICK` path (this iteration's fresh
Eligibility-query fetch turned up no candidates) ends the drain loop. Two
distinct cases, by whether this firing has claimed anything yet (the
`shaped`/`routed`/`failed` counts below):

- **Nothing claimed yet** (the very first iteration returns `null`): report
  "nothing eligible this firing" and exit cleanly — no self-report, no
  notification, no close-out rendered. The firing's own session transcript
  line is the only trace, deliberately (mirrors dispatch's "Zero eligible
  groups" posture) — `/claude-tweaks:tidy` and `/claude-tweaks:help`
  surface queue state independently on their own cadence.
- **At least one attempt already ran this firing**: this is the loop's
  normal, successful termination — the eligible set drained to empty
  before `--budget` was spent (`--budget all` can only end this way).
  Render the close-out below; there is no "remaining" line in this case,
  since nothing is left to attempt.

**Budget exhaustion** ends the loop the same way but with the eligible set
still non-empty: this firing's attempt counter (incremented once per
successful claim in `## Claim` below) reaches `--budget <n>` while a fresh
fetch still returns a non-`null` pick. Render the close-out below, plus one
line naming the record(s) this firing's ranking would have attempted next
had budget allowed — the top of that final fetch's ranked list.

**Close-out.** Lead with the three counts, then each bucket's own
accumulated record refs beneath:

```
{shaped: N, routed: M, failed: K}
shaped: #a, #b, ...
routed: #c, ...
failed: #d, ...
remaining (budget exhausted, not attempted this firing): #e, #f, ...
```

- `shaped` — this firing's own Shape-step successes (`next-mode-shape.md`'s
  `## Release`, `shaped: #{n}` reason).
- `routed` — this firing's own Framing Guard routing outcomes
  (`next-mode-shape.md`'s `## Release`, `routed: needs:definition #{n}`
  reason) — a productive outcome, never a failure, per that section.
- `failed` — exactly one outcome: this firing successfully claimed the
  record, then `next-mode-shape.md`'s Framing Guard or Shape step raised
  before completing (`## Release`'s `failed: shaping` reason). Never a
  lost claim race (`## Claim` below — that consumes no budget and never
  reaches this bucket) and never a Framing Guard routing outcome (that is
  `routed`, never `failed`). Each entry here already filed the shared
  self-report per `next-mode-shape.md`'s Failure self-report section
  before the loop continued past it.
- `remaining` — rendered only on the budget-exhaustion case above; omitted
  entirely when the loop ended because the eligible set emptied.

This close-out is this firing's own report — it renders on every
loop-termination path above (bare drain interactive or headless alike),
independent of the pre-existing, unchanged "no `## Next Actions` block for
a headless firing" rule (`next-mode-shape.md`'s Shape section) — that rule
governs the separate interactive suggestion-menu render, not this summary.

## Claim

Re-read the selected record's live labels immediately before claiming — the
Eligibility query snapshot (above) is stale by definition by the time
Selection picks a winner:

```bash
gh issue view {n} --json labels -q '[.labels[].name]'
```

If the re-read shows the record no longer eligible (now carries `ready`,
any `needs:*`-prefixed label, `parked`, `parent-issue`, or `bot:in-progress`)
— this is a **lost claim race**: it consumes no `--budget` unit, and the
loop retries immediately, exactly as if the record had never appeared —
return to the Eligibility query above for a fresh fetch and re-rank, then
re-run this section against whichever record comes out on top now (never
the same one; the fresh fetch's own predicate excludes it, since something
else changed its labels between the two reads). This is a different
outcome from the `gh issue view` re-read command, or the `resolve-run-dir`
call below, failing to run at all (network error, `gh` auth failure,
malformed response, a non-zero exit from either command) — that is a
genuine infra failure, not an eligibility result, and ends the whole
firing per Failure self-report below; it must not be folded into the
no-cost retry above.

Otherwise, claim it per `_shared/issue-claims.md`'s "The lock": read the
claim blob, classify with `classifyClaimBlob`, and write create-only
(`'absent'`) or conditionally (`'tombstone'`/`'stale'`). If the write is
contested (`'live'`, or a write rejection) — this is the same lost-claim-race
outcome as an ineligible re-read above: no budget consumed, retry
immediately against a fresh fetch. This is not a failure; file no
self-report. A successful, uncontested claim write is what actually starts
an attempt — increment this firing's attempt counter here, the one
`--budget` is checked against (the loop-termination section above). Add
`bot:in-progress` alongside a successful claim write (bootstrap-then-add,
per `_shared/issue-claims.md`'s "The bot:in-progress label" section) —
best-effort, never blocking the claim itself on a failed add. Proceed to
`next-mode-shape.md`'s Framing Guard.

This firing always resolves its run directory in `auto` mode — a headless
bare drain firing has no human present to answer an interactive-mode
prompt, so `--mode auto` below is a structural fact of the form itself
(the deprecated `next` alias inherits the same posture), not a policy
choice. `runId` for every claim this firing makes is this firing's own
resolved run directory identity — resolved **once per firing, not once per
iteration**: every later iteration's claim (and release) reuses the same
`$RUN_DIR` established here, so one `decisions.md` accumulates this whole
firing's audit trail across every record it attempts. Resolve it before
this firing's first claim, via `_shared/pipeline-run-dir.md`'s
standalone-auto fallback (Resolution order step 4) — `specify` is on that
file's allowlist as of this task, added alongside
`/claude-tweaks:dispatch`'s own bare-drain entry, for the identical
reason: bare drain is the headless-safe form a scheduled Routine fires
unattended, so step 5's interactive fallback is never a real option for
it:

```bash
RUN_DIR=$(node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --standalone specify --mode auto --create)
```

Call the result `$RUN_DIR`; the resulting directory's basename is this
firing's `runId`. Log every claim (and, below, every release) to that
directory's `decisions.md` per `_shared/issue-claims.md`'s own logging
convention — cited, not restated, here.


**Split across two files (#1346).** This file holds Flag rejection through Claim. The Framing
Guard, Shape, Release, and Failure self-report sections continue in `next-mode-shape.md`, this
skill's directory. Section numbering/naming is unchanged across the split, so a cross-reference
naming a section by name still resolves regardless of which file it lands in. Continue there now.
