# Tidy — Action Execution (`work-backend: github-issues`)

The actions documented here for the `github-issues` driver: four whose execution diverges by
backend (`Delete`, `Defer`, `Absorb`, `Open family gate` — `actions-local-files.md` is their
twin) plus one that exists only on this backend, with no `local-files` counterpart at all
(`Sync to GitHub`). Everything else stays inline in `SKILL.md`'s Action Vocabulary table. Each
action is atomic — complete all its steps or none.

## Delete

(1) Comment explaining why (audit trail — never close silently), (2) `gh issue close {n} --reason "not planned"` — close-not-planned-with-comment.

## Defer

(1) Build the base payload via `recordPayload({..., parked: true})` (`bin/lib/issues/record.js`), first appending a `**Watched paths:** {paths}` line to the body when the trigger names files — plain body text; `recordPayload` doesn't take a watched-paths field, the same way `/specify`'s metadata block is composed manually rather than passed through it — write to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (per `_shared/label-bootstrap.md`'s canonical `LABELS_JSON` pair), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach.

This is a multi-step GitHub-side sequence with no local file involved — if a later step fails after an earlier one succeeded, the record is left partially updated. Report exactly which step failed rather than assuming all-or-nothing (see `SKILL.md`'s Anti-Patterns).

## Absorb

Continuing from the shared step (1) in `SKILL.md`'s table: (2) comment naming the target (`Absorbed into #{M}.`), (3) `gh issue close {n} --reason "not planned"`.

## Open family gate

The `[family-gate]` findings this action resolves come from `_shared/github-pr-scan.md`'s
`family-gate` scope, which queries the `family:parent` label and therefore only ever finds
`work-backend: github-issues` families — `_shared/forge-detection.md`'s Detection Ladder (which that scope runs behind) gates on `gh` reachability,
not on the driver. The `local-files` driver has its own twin of this action
(`actions-local-files.md`'s `## Open family gate`), fed by `step-1-records.md`'s Shape 7
instead; both run the same Family-Gate Procedure, and the finding prefix is identical on either
driver.

Approving a `[family-gate]` finding runs `wrap-up/verification-brief.md`'s Family-Gate
Procedure from **Enumerate the family's leaves** onward, using the **parent-side** entry shape
that section documents (`$PARENT_NUM` is already known from the scan; re-fetch leaf state
and the parent's labels fresh, and re-run **Evaluate the gate** — do not reuse the scan's own
snapshot, since time has passed since Step 4.8 ran). If the re-verified gate no longer reads
`due` (another process already gated the family, or a leaf reopened), this is a silent no-op —
skip it, don't error, and don't recommend `/claude-tweaks:demo #{n}` for it in the applied-report
either. If it still reads `due`, compose the parent brief and apply the gate exactly as that
procedure's own **Compose the parent brief** and **Apply the gate** sections describe — posting
the brief comment before adding `demo:pending`, matching that same invariant.

This action is **staged, never auto-applied, at every aggressiveness tier** in auto mode
(`step-6-auto.md`'s `Open family gate` row reads `Stage`/`Stage`/`Stage`) — it runs only after
`/tidy`'s own Step 6 batch approval, exactly like the other outward-facing GitHub mutations in
that table. Posting a comment and adding a label is an outward-facing GitHub API write, and
`_shared/auto-mode-contract.md` puts that out of auto-resolution's reach twice over: its
reversibility floor requires `high` — "undoable via file edit or `git revert`" — and its
never-reversible list separately forbids "network calls beyond reads (no API writes, no message
sends)" at every tier regardless of mode. Neither bar is clearable by this write, however
mechanical or precondition-only it is. `_shared/github-pr-scan.md`'s `family-gate` scope states
the same reasoning at the scope level.

This action never applies `demo:approved` or `demo:changes-requested` — those two labels stay
exclusively `/claude-tweaks:demo`'s job, applied only after an explicit human verdict. Opening
the gate is the precondition for that verdict, not the verdict itself, which is why the
recommendation still ends with `/claude-tweaks:demo #{n}` even once the gate is open.

## Sync to GitHub

This action exists only on this backend — a local record carrying `unsynced: true` while `work-backend: github-issues` is what it fixes.

Build the payload via `recordPayload` (`bin/lib/issues/record.js`) from the local record's own facets — `type` (guessed the same way `/capture`'s Guessing-the-Type heuristic does, when `facets.type` was never stamped), `origin` when present (`facets.origin`; omitted for a human-shaped record, e.g. a `/specify` decomposition leaf, which carries no `by:*` label by design), `risk`/`size` when present, `ready: facets.stage === 'ready'`, `parked: facets.stage === 'parked'`. For a parked record, judge the trigger the same way Defer above does — file-shaped trigger → append `**Watched paths:**`; moment-in-time → attach/create a milestone after creation. Bootstrap the labels the payload assembled (per `_shared/label-bootstrap.md`), then `gh issue create --title ... --body-file ... --label ...` (repeat `--label` per entry in `recordPayload`'s returned array; add `--type {t}` under `work-types: native`, or the matching `type:{t}` label under `work-types: labels`). Delete the local record file only after `gh issue create` confirms success — writing to GitHub first is deliberate: if the local record is removed first and the GitHub write fails, the item is lost entirely, not just unsynced.
