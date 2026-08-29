# Specify — `next` mode (headless selection form)

Entered from `SKILL.md`'s `### Resolve the input` case 0 (the literal `next`
first argument). The headless-safe unit a scheduled Routine fires — mirrors
`/claude-tweaks:dispatch`'s `next` form (`dispatch/SKILL.md` Step 3)
end-to-end: same ranking definition, same zero-eligible no-op posture, same
claim/release discipline. Shaping itself is unchanged: this file hands the
selected record to `shaping-mode.md` exactly as a `--chained` invocation
does — no shaping logic is duplicated here.

## Flag rejection

`phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected
with a one-line notice when combined with `next` on the command line: "next
takes no modifiers — {flag} ignored." This form always resolves
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
then proceed with `next`'s own procedure below — a rejected flag is a
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
interactive human is present to receive it — which is the `next` form's
entire reason for existing: the absence of a human to hand this off to is
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
exit or a contested-claim exit (below) is NOT a failure and files nothing.

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
is already shaped (nothing left for `next` to do), and a `parent-issue` is
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
`next`'s own oldest-first tie-break (Selection below) is designed to
surface first (the same risk `dispatch/queue-pull-script.md`'s own `next`
queue pull already guards against). Check the raw pre-filter fetch count
against the cap, not the post-filter `eligible` count, which will rarely
hit 500 exactly even when the raw fetch was truncated:

Resolve this fence's session-scoped temp paths first (`_shared/session-tmp-root.md`):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" RAW=specify-next-raw.json CANDIDATES=specify-next-candidates.json)"
gh issue list --state open --json number,title,labels,createdAt --limit 500 > "$RAW"
RAW_COUNT=$(node -e "console.log(require('$RAW').length)")
if [ "$RAW_COUNT" -ge 500 ]; then
  echo "Warning: the open-issue pull for /claude-tweaks:specify next returned exactly the --limit cap (500) — this repo may have more open records than fetched. gh issue list returns newest-first, so any records beyond the cap are the OLDEST ones, exactly what next's own oldest-first tie-break exists to surface first. Consider raising the cap, or filing this as a signal to re-triage the backlog down." >&2
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

Exactly one record, by dispatch's own ranking (`dispatch/SKILL.md` Step 3):
`priority:high` > `priority:medium` > `priority:low` > unprioritized,
oldest `createdAt` first within each band.

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

## Zero eligible

A `null` result at this fence's `$PICK` path (no candidates after the
Eligibility query's filter, or its initial fetch was empty): report "nothing
eligible this firing" and exit cleanly — no self-report, no notification.
The firing's own session transcript line is the only trace, deliberately
(mirrors dispatch's "Zero eligible groups" posture) — `/claude-tweaks:tidy`
and `/claude-tweaks:help` surface queue state independently on their own
cadence.

## Claim

Re-read the selected record's live labels immediately before claiming — the
Eligibility query snapshot (above) is stale by definition by the time
Selection picks a winner:

```bash
gh issue view {n} --json labels -q '[.labels[].name]'
```

If the re-read shows the record no longer eligible (now carries `ready`,
any `needs:*`-prefixed label, `parked`, `parent-issue`, or `bot:in-progress`) — exit
as a clean no-op for this firing. No same-firing re-selection; the next
firing picks up (dispatch's no-retry posture, mirrored exactly). This is
a different outcome from the `gh issue view` re-read command, or the
`resolve-run-dir` call below, failing to run at all (network error, `gh`
auth failure, malformed response, a non-zero exit from either command) —
that is a genuine infra failure, not an eligibility result, and is a
Claim-step failure per Failure self-report below; it must not be folded
into the silent no-op branch.

Otherwise, claim it per `_shared/issue-claims.md`'s "The lock": read the
claim blob, classify with `classifyClaimBlob`, and write create-only
(`'absent'`) or conditionally (`'tombstone'`/`'stale'`). If the write is
contested (`'live'`, or a write rejection) — exit as a clean no-op for this
firing, same as an ineligible re-read. This is not a failure; file no
self-report. Add `bot:in-progress` alongside a successful claim write
(bootstrap-then-add, per `_shared/issue-claims.md`'s "The bot:in-progress
label" section) — best-effort, never blocking the claim itself on a
failed add.

This firing always resolves its run directory in `auto` mode — a headless
`next` firing has no human present to answer an interactive-mode prompt,
so `--mode auto` below is a structural fact of the `next` form itself, not
a policy choice. `runId` for this claim is this firing's own resolved run
directory identity. Resolve it once, before claiming, via
`_shared/pipeline-run-dir.md`'s standalone-auto fallback (Resolution order
step 4) — `specify` is on that file's allowlist as of this task, added
alongside `/claude-tweaks:dispatch`'s own `next`-form entry, for the
identical reason: `next` is the headless-safe form a scheduled Routine
fires unattended, so step 5's interactive fallback is never a real option
for it:

```bash
RUN_DIR=$(node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --standalone specify --mode auto --create)
```

Call the result `$RUN_DIR`; the resulting directory's basename is this
claim's `runId`. Log the claim (and, below, the release) to that
directory's `decisions.md` per `_shared/issue-claims.md`'s own logging
convention — cited, not restated, here.


**Split across two files (#1346).** This file holds Flag rejection through Claim. The Framing
Guard, Shape, Release, and Failure self-report sections continue in `next-mode-shape.md`, this
skill's directory. Section numbering/naming is unchanged across the split, so a cross-reference
naming a section by name still resolves regardless of which file it lands in. Continue there now.
