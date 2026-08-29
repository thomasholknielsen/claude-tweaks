# Backlog Refine — Step 5: Apply

Loaded by `refine-mode.md`'s Step 5 at render time — this file is the full apply-and-log
procedure the stub there points to: the pre-write reverify rules (label and body), the per-lane
write mechanics (priority/related, grant, dependency-repair, flag-back, needs-decision), the
`decisions.md` logging templates, the closing summary, and closing the run dir.

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Pre-write reverify (every write below).** Row confirmation happened at Step 4's `AskUserQuestion` render, which may have sat unanswered for hours — long enough for a concurrent session to grant, claim, or flag back the same record. Immediately before writing any row below (priority/related, grant, flag-back — never dependency-repair, which wires a `blocked-by` link and isn't this same label race; its own body-text write path has a separate body reverify below), re-fetch that record's live labels (`gh issue view "$ISSUE" --json labels -q '.labels[].name'`) and compare against the row's own premise — the facets already captured at Step 1's fetch (`{tmp-faceted-file}`, not re-derived), projected as: `ready` ↔ `facets.stage === 'ready'`, `auto:build` ↔ `facets.grants.build`, `bot:in-progress` ↔ `facets.bot.inProgress`. A fetch failure (network error, non-zero `gh` exit) is treated the same as a mismatch — fail closed: skip the write, log it as `AUTO … skipped …` with `{what changed}` = `live-state fetch failed: {error}`, and report it — never write on an unread premise. A grant row whose live labels lost `ready`, or a flag-back row whose live labels gained `risk:*`/`size:*`/`auto:build`/`bot:in-progress` since Step 1, has had its premise invalidated by a concurrent write: drop it from this write, log an `AUTO … skipped …` line (per the template below), and skip the `gh edit`/`writeRecord` calls below for that row. Flag-back reverify checks labels only — Step 3.5's body-shape downgrade signal isn't re-checked, so a body fixed between Step 1 and Step 5 can still draw a stale downgrade comment (narrower, separately-scoped from the label race above). A priority/related row has no grant/`ready` gate to invalidate — re-fetch and compare its current `priority:*`/`**Related:**` state the same way: a genuine no-op needs no log line (not an anomaly); when a concurrent write already set a different value, log an `AUTO … skipped …` line and drop the write rather than overwrite a fresher decision.

Local-files driver: the equivalent re-read is `readRecord(path).facets` immediately before `writeRecord` — same skip-on-mismatch rule, since a concurrent session's edit to the tracked file is exactly the same class of stale-premise race as a concurrent GitHub label write; a `readRecord` failure (missing/corrupt file) skips the same way — don't write.

**Body pre-write reverify (Related rows and dependency-repair's body-text append only).** Both of these writes rewrite the record's full body — `gh issue edit "$ISSUE" --body-file` (Related rows, below) and the `work-links: body-text` `Blocked by #N` append (dependency-repair, below) — from the body captured at Step 1's fetch (`{tmp-faceted-file}`'s `body` field for `$ISSUE`), which can be just as stale by Step 5's write as the labels the reverify above guards, across the same long-lived confirm gate. Unlike the label reverify, a body mismatch isn't a small enum to diff field-by-field: immediately before either write, re-fetch the record's live body (`gh issue view "$ISSUE" --json body -q .body`) and compare it verbatim against the Step 1-fetched premise; any difference — a sibling `/specify` reshape, another session's own `Blocked by #N` append, a human editing the issue directly — means the write's premise no longer holds. Skip the write rather than overwriting it, log it with the same `AUTO … skipped …` template as the label reverify (below), `{what changed}` = `record body changed since Step 1 fetch`, and fold it into the same `skipped` tally bucket — a body mismatch is the same class of stale-premise race as a label mismatch, so it reuses the label reverify's log line and tally bucket as-is rather than inventing a parallel one; the generic `{what changed}` text is enough here, since (unlike a label diff) there is no small enum of possible prior/new values to name — "what changed" for a full-body diff is just that the premise is stale, not a value pair. A fetch failure (network error, non-zero `gh` exit) is treated the same as a mismatch — fail closed, same as the label reverify: skip the write, log it as `AUTO … skipped …` with `{what changed}` = `live-state fetch failed: {error}` (reusing the label reverify's own fetch-failure wording verbatim, not the mismatch case's `record body changed since Step 1 fetch` text above), and report it.

Local-files driver: the equivalent re-read is `readRecord(path).body` immediately before either write — same skip-on-mismatch rule and log line, since a concurrent session's edit to the tracked file is exactly the same class of stale-premise race; a `readRecord` failure (missing/corrupt file) skips the same way — don't write.

**General rule.** This is an instance of `_shared/reverify-before-write.md`'s pattern: any batch-confirm-then-apply flow with a long-lived `AskUserQuestion` gate between building a row's premise and writing it needs the same pre-write reverify. `/claude-tweaks:tidy`'s Step 6 auto-apply table (`skills/tidy/step-6-auto.md`) applies the identical rule to its own gated `[parent-gate]` finding — same shape, not new.

**Priority/Related rows:** For every record the priority decision resolved to apply:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['priority:high', 'Priority: dispatch picks this band first'],
#  ['priority:medium', 'Priority: dispatch picks after priority:high'],
#  ['priority:low', 'Priority: dispatch picks last among prioritized records']]
CURRENT_PRIORITY=$(gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -E '^priority:' || true)
if [ -n "$CURRENT_PRIORITY" ] && [ "$CURRENT_PRIORITY" != "priority:$TIER" ]; then
  gh issue edit "$ISSUE" --remove-label "$CURRENT_PRIORITY" --add-label "priority:$TIER"
else
  gh issue edit "$ISSUE" --add-label "priority:$TIER"
fi
```

A record can already carry a different-tier `priority:*` label from an earlier run or a human edit — swap it out rather than adding the new tier alongside it, the same way every other label-state transition in this skill family pairs `--remove-label` with `--add-label` (demo's `demo:pending`→`demo:approved`, this same skill's own grant rows' `bot:blocked`→`auto:build` below, dispatch's `auto:build`→`bot:blocked`). Two contradictory `priority:*` labels on one record would corrupt `/claude-tweaks:dispatch`'s `next` tie-break ordering, which reads `facets.priority` as a single value via `parseRecordFacets`.

Local-files driver: recompose the record's full facets (`priority: $TIER`, replacing any prior value) and call `writeRecord` (`bin/lib/issues/local-store.js`) — same compose-then-write-once pattern `/claude-tweaks:specify`'s local-driver path already uses. `writeRecord` writes a tracked file, not a GitHub issue edit, so immediately follow it with:

```bash
git add "$RECORD_PATH"
git commit -m "Backlog Refine: set priority:$TIER on {id}"
```

— the same commit-after-write step `/claude-tweaks:specify`'s local-driver path takes for the identical reason (an uncommitted `specs/*.md` edit has no audit trail and risks being lost or swept into an unrelated later commit).

A record carrying `facets.unsynced === true` (Step 1's local fallback fold-in) has no `$ISSUE` GitHub number to edit even under `work-backend: github-issues` — it exists only as a local `specs/{id}-{slug}.md` file (its `.path`, from `queryRecords`). For these records, regardless of the project-wide driver, take the local-files branch above instead: `writeRecord` against the record's own `.path`, then `git add`/`git commit` the same way.

For every record the `**Related:**` decision resolved to apply, replace the existing `**Related:** {...}` line in the body (github: `gh issue edit "$ISSUE" --body-file`, rewriting the fetched body with the line replaced; local-files, and any `facets.unsynced === true` record regardless of driver: `writeRecord` with the updated body against the record's `.path`, followed by the same `git add`/`git commit` step). Run the body pre-write reverify above immediately before this write — a mismatch skips it rather than overwriting.

**Grant rows:** When Step 4 resolved to `"Grant auto:build only, hold merge"` (Option 3 of the confirm gate, `refine-lanes.md`), skip every `auto:merge` grant below for the remainder of this session — apply `auto:build`/re-authorize exactly as the Grant lane recommended, but never the `gh issue edit "$ISSUE" --add-label auto:merge` line, regardless of what the row's own Recommended column said. This is a session-wide override, not a per-row judgment call — it doesn't change what Step 3 recommended or what the Grant lane displayed, only what Step 5 writes.

For every row still marked for granting after Step 3.5:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['auto:build', 'Grant: agents may build this record autonomously (human-granted; machinery only removes)'],
#  ['auto:merge', 'Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)']]
# — add the matching risk:low|medium|high / size:low|medium|high pair too, only for a row where
# the human supplied scoring inline during the override step (Step 4).

if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
fi
# Row also grants auto:merge:
gh issue edit "$ISSUE" --add-label auto:merge
# Row's scoring came from an inline override in Step 4 (a grant row missing risk/size the human
# supplied risk:$RISK_TIER / size:$SIZE_TIER for directly, rather than flagging back or accepting the
# default "needs scoring" recommendation) — persist the human-supplied scoring as labels too,
# not just the grant, so the record doesn't re-enter later batch views (e.g.
# /claude-tweaks:backlog overview risk-value's ranked table) still showing as missing risk/size:
gh issue edit "$ISSUE" --add-label "risk:$RISK_TIER" --add-label "size:$SIZE_TIER"
```

Stripping `bot:blocked` in the same edit as the grant matters: without it, the record carries both `bot:blocked` and a fresh `auto:build`, and `/claude-tweaks:dispatch`'s skip rule ignores anything `bot:blocked` forever regardless of the new grant.

**Dependency-repair rows:**

- Refine runs the detection itself — it does not consume overview's output. After Step 1's fetch (which already carries `,body`), and after performing the same `work-links: native` blocked-by attachment overview's Step 3 specifies (one aliased `buildNativeDependencyQuery` call over the fetched candidates; per-node failures attach nothing), run `findUnresolvedDependencyProse` via the same `{ flags }` output shape. Attaching native blockers first means already-natively-wired records resolve non-empty and are never flagged for re-wiring. The same per-node failure narration line applies here — when any alias in an otherwise-successful batch failed, render one failure-only narration line naming exactly those ids (e.g. `blocker data incomplete for #12, #40 — node fetch failed; they rank on body-text fallback this run`) — and probe unavailability or whole-fetch failure degrades to the body-text fallback with one failure-only narration line, never a hard stop (restated here at point of use rather than left to the cross-reference). Under `work-links: body-text`, no attachment is needed — the body fallback resolves canonical lines on its own. Offer the mode-aware repair as a new confirmable item type in the existing Step 4 lanes + confirm gate — surfaced and applied exactly like every other write in this step, never bypassing or altering when the gate fires or that it blocks until confirmed.
- **`work-links: native`**: wire the native blocked-by link via the same dependency API `/claude-tweaks:specify`'s Step 4 linking uses.
- **`work-links: body-text`**: append a canonical line-start `Blocked by #N` line to the record body (`gh issue edit --body-file` under `github-issues`; `writeRecord` + `git add`/`git commit` under `local-files`, same as the Related-line path above). Run the body pre-write reverify above immediately before this write, the same as the Related-line path — a mismatch skips it. The `work-links: native` path above writes no body text, so it has nothing for this reverify to guard.
- **Never write both representations for one edge.**

**Flag-back rows:** For every row flagged back — Step 3.5's auto-downgrade, a row missing risk/size accepted as recommended, or a human override in Step 4 — remove `ready` and post a comment. Step 3.5's downgrade always uses its exact wording above; every other flag-back uses a shorter comment: `Flagged back by /claude-tweaks:backlog refine: {reason}. Re-add 'ready' once addressed.`, where `{reason}` is `needs scoring` for the recommended case or the human's own free-text reason for an explicit override.

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" "BACKLOG_REFINE_FLAGBACK=backlog-refine-flagback-${ISSUE}.md")"
gh issue edit "$ISSUE" --remove-label ready
gh issue comment "$ISSUE" --body-file "$BACKLOG_REFINE_FLAGBACK"
```

**Needs-decision rows:** `grant-lane-decision.md`'s Write mechanics — label, comment, keep `ready`,
no `auto:*`. Logged the same as any row above.

Check each write's own result before logging it — a non-zero exit from any `gh`/`writeRecord` call
above is a failure, not a success, regardless of which lane produced it (a reverify fetch above
is not itself a write; it follows its own skip rule instead). Log every action to this
run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md`) via the matching
template below, success, failure, or skipped-before-write:

```
AUTO {time} — Backlog refine: set priority:{tier} on #{n}.
AUTO {time} — Backlog refine: updated **Related:** on #{n} to reference #{m}.
AUTO {time} — Backlog refine: granted auto:build{ + auto:merge} to #{n} (risk:{riskTier}, size:{sizeTier}). Rationale: {grant-check RATIONALE}.
AUTO {time} — Backlog refine: re-authorized #{n} — stripped bot:blocked, granted auto:build{ + auto:merge}.
AUTO {time} — Backlog refine: repaired dependency on #{n} — {wired native blocked-by referencing #{m} | appended Blocked by #{m} line}.
AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
AUTO {time} — Backlog refine: stamped needs:decision on #{n} — {grant-check RATIONALE}.
AUTO {time} — Backlog refine: skipped #{n} — premise changed since confirmation ({what changed}); dropped without writing.
FAILED {time} — Backlog refine: {priority | Related | grant | dependency-repair | flag-back | needs-decision} write failed on #{n}: {error}.
```

The closing summary below counts these lines by type — `FAILED` feeds the tally's `failed` count and per-failure lines; `AUTO … skipped …` (including a reverify-fetch failure) feeds `skipped` and its per-skip lines; a write with no matching line was never attempted and counts toward neither.

**Closing summary (required, rendered as assistant text — never delegated to tool output; a
shell print of the tally does not satisfy this):** after the apply pass above completes, render
a closing block from the same per-write outcomes already logged to `decisions.md` above — no
second bookkeeping channel:

1. **Per-type tally line** — one count per write type applied this run, with `skipped` and `failed` always
   present, even at zero:

   ```
   34 priority set · 2 Related updated · 7 granted · 5 flagged back · 1 dependency-repair · 1 needs-decision · 0 skipped · 0 failed
   ```

2. **One line per failed write** — the record ref and the error, followed by a paste-ready retry
   command on its own line (this repo's report-line convention: no inline/same-line comments).
   The retry command reproduces that write type's own Step 5 mechanics above, not a generic
   `gh issue edit --add-label`:

   ```
   #123 — priority write failed: {error}
   gh issue edit 123 --add-label priority:high
   ```

   (assumes the removal already landed and only the add failed — see the caveat below before
   pasting this literally)

   For a priority write, re-derive the conditional swap from the failure point: re-read the
   record's current `priority:*` label state and emit the add-only form only when no prior-tier
   label remains — safe when the removal already landed and only the add failed; before any
   removal it leaves two contradictory labels, exactly what the swap above exists to prevent.
   Grant rows (up to four chained `gh` calls) and Related/Flag-back rows (a `--body-file` edit)
   retry as the single failed call from that row's own mechanics, not the whole row.

3. **One line per skipped write** — the record ref and what changed, informational only (no retry command needed — the human re-runs refine to pick it up fresh next time):

   ```
   #123 — skipped: premise changed since confirmation (lost ready label)
   ```

4. **The run-directory path, absolute** — never relative (a bare relative
   `.claude-tweaks/pipelines/` path silently shadows the main-checkout copy when run from a
   worktree):

   ```
   Audit trail: /abs/path/to/.claude-tweaks/pipelines/{run-id}/decisions.md
   ```

A fully clean run still renders `0 failed` explicitly (and `0 skipped` alongside it), omitting
both the per-failure and per-skip lines — that's the only signal a clean run needs.

**Close the run dir.** After the closing summary above renders, close this run's standalone run
directory so resume/reconcile paths can classify it as terminal instead of `status: unknown`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run <absolute-run-dir>
```

Always pass an explicit `--run <absolute-run-dir>` — the run directory itself: the closing summary's
audit-trail line above names the `decisions.md` *file* inside it, so strip the trailing
`/decisions.md` to get the directory `close-run` requires (it rejects a file path outright).
Omitting `--run` falls back to the newest non-terminal run dir under the
project's `.claude-tweaks/pipelines/` — `close-run` already refuses to close it when that run's
`run-state.json` carries a `sessionId` stamp differing from the caller's own
`CLAUDE_CODE_SESSION_ID`, but a fallback run never stamped with one (or a caller with none set)
still closes silently even when it belongs to a different, active session — passing an explicit
`--run` avoids the ambiguity entirely. `close-run`
creates `run-state.json` when the run dir never had one — every refine standalone run — and stamps
it `status: clean`, so no separate direct write is needed. A "no recorded wrap-up invocation"
warning line is expected here and not an error; refine runs standalone and never invokes
`/claude-tweaks:wrap-up`.
