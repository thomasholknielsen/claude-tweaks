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
`Design-intent: none` internally (mirroring `--chained`'s own headless
default) without prompting, since a headless firing has nobody to answer
Step 2.5c's design-intent question. Report the rejection notice, then
proceed with `next`'s own procedure below — a rejected flag is a warning,
never a hard stop.

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

## Eligibility query

Per `_shared/record-queue-fetch.md`'s `work-backend: github-issues` fetch:
open records carrying none of `ready`, `needs:definition`, `parked`,
`parent-issue`, and holding no live claim per `_shared/issue-claims.md`'s
Reading claim state.

```bash
gh issue list --state open --json number,title,labels,createdAt --limit 500 \
  | node -e "
    const records = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const EXCLUDE = new Set(['ready', 'needs:definition', 'parked', 'parent-issue']);
    const eligible = records.filter((r) =>
      !r.labels.some((l) => EXCLUDE.has(l.name))
    );
    console.log(JSON.stringify(eligible));
  " > /tmp/specify-next-candidates.json
```

Then filter out any record already carrying a live or stale-but-unbroken
claim — read each candidate's claim state per `_shared/issue-claims.md`'s
"Reading claim state" section (`state: 'live'` excludes it; `'absent'`,
`'tombstone'`, and `'stale'` — the last reclaimed at claim time in the Claim
step below, not here — do not).

## Selection

Exactly one record, by dispatch's own ranking (`dispatch/SKILL.md` Step 3):
`priority:high` > `priority:medium` > `priority:low` > unprioritized,
oldest `createdAt` first within each band.

```bash
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => {
    const p = r.labels.find((l) => l.name.startsWith('priority:'));
    return p ? RANK[p.name.slice('priority:'.length)] : 3;
  };
  const candidates = require('/tmp/specify-next-candidates.json');
  const ranked = candidates.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0] : null));
" > /tmp/specify-next-pick.json
```

## Zero eligible

A `null` result in `/tmp/specify-next-pick.json` (no candidates after the
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
`needs:definition`, `parked`, or `parent-issue`) — exit as a clean no-op
for this firing. No same-firing re-selection; the next firing picks up
(dispatch's no-retry posture, mirrored exactly).

Otherwise, claim it per `_shared/issue-claims.md`'s "The lock": read the
claim blob, classify with `classifyClaimBlob`, and write create-only
(`'absent'`) or conditionally (`'tombstone'`/`'stale'`). If the write is
contested (`'live'`, or a write rejection) — exit as a clean no-op for this
firing, same as an ineligible re-read. This is not a failure; file no
self-report.

`runId` for this claim is this firing's own resolved run directory
identity. Resolve it once, before claiming, via `_shared/pipeline-run-dir.md`'s
standalone-auto fallback (Resolution order step 4) — `specify` is on that
file's allowlist as of this task, added alongside `/claude-tweaks:dispatch`'s
own `next`-form entry, for the identical reason: `next` is the headless-safe
form a scheduled Routine fires unattended, so step 5's interactive fallback
is never a real option for it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --standalone specify --mode auto --create
```

The resulting directory's basename is this claim's `runId`. Log the claim
(and, below, the release) to that directory's `decisions.md` per
`_shared/issue-claims.md`'s own logging convention — cited, not restated,
here.

## Shape

**Invocation choice: in-process, not a recursive `Skill()` call** — `shaping-mode.md`
is a procedure `SKILL.md` itself already reads and follows directly (never
via `Skill()`, even from `SKILL.md`'s own entry paths), so this file does
the same rather than re-fetching the just-claimed record through an
external `Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")`
call (the shape `/claude-tweaks:capture`'s born-ready chain uses to invoke
this skill from *outside*, which does not apply here).

Read `shaping-mode.md` in this skill's directory and follow its procedure
directly against the record claimed above, under the same headless posture
`--chained` uses: Step 2.5c's design-intent question resolves to
`Design-intent: none` without prompting (already established in Flag
rejection above), and no `## Next Actions` renders at the end (headless —
nobody is present to answer it). Shaping mode's own `ready` stamp is what
removes the record from future `next` eligibility — no extra state change
is needed here.

A shaping-stage failure — the compose-then-write-once call failing, or
`shaping-mode.md`'s own read-back verification failing — is a failure for
this file's purposes: it reaches Failure self-report below, not a silent
stop, before Release runs.

## Release

Release the claim (`_shared/issue-claims.md`'s release operation) on the
success path AND on every failure path below this point — try/finally
semantics: whatever happens during Shape, Release always runs before this
procedure's turn ends. If the release write itself fails, do not retry
in-firing — the claims contract's stale-claim TTL is the backstop
(`/tidy`'s sweep eventually reclaims it).

## Failure self-report

Any Preflight failure (Preflight section above), and any post-claim
shaping-stage failure (Shape section above throwing or returning an error),
files the shared headless self-report (`_shared/headless-self-report.md`,
`{caller}` = `specify`) before stopping — deduplicated against any existing
open report. A zero-eligible exit (Selection section) or a contested-claim
exit (Claim section) is NOT a failure and files nothing.
