# Tidy — Action Execution (`work-backend: github-issues`)

The four actions whose execution diverges by backend, for the `github-issues` driver;
`actions-local-files.md` is its twin. Everything else stays inline in `SKILL.md`'s Action Vocabulary
table. Each action is atomic — complete all its steps or none.

## Delete

(1) Comment explaining why (audit trail — never close silently), (2) `gh issue close {n} --reason "not planned"` — close-not-planned-with-comment.

## Defer

(1) Build the base payload via `recordPayload({..., parked: true})` (`bin/lib/issues/record.js`), first appending a `**Watched paths:** {paths}` line to the body when the trigger names files — plain body text; `recordPayload` doesn't take a watched-paths field, the same way `/specify`'s metadata block is composed manually rather than passed through it — write to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (per `_shared/label-bootstrap.md`'s canonical `LABELS_JSON` pair), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach.

This is a multi-step GitHub-side sequence with no local file involved — if a later step fails after an earlier one succeeded, the record is left partially updated. Report exactly which step failed rather than assuming all-or-nothing (see `SKILL.md`'s Anti-Patterns).

## Absorb

Continuing from the shared step (1) in `SKILL.md`'s table: (2) comment naming the target (`Absorbed into #{M}.`), (3) `gh issue close {n} --reason "not planned"`.

## Sync to GitHub

This action exists only on this backend — a local record carrying `unsynced: true` while `work-backend: github-issues` is what it fixes.

Build the payload via `recordPayload` (`bin/lib/issues/record.js`) from the local record's own facets — `type` (guessed the same way `/capture`'s Guessing-the-Type heuristic does, when `facets.type` was never stamped), `origin` when present (`facets.origin`; omitted for a human-shaped record, e.g. a `/specify` decomposition leaf, which carries no `by:*` label by design), `risk`/`effort` when present, `ready: facets.stage === 'ready'`, `parked: facets.stage === 'parked'`. For a parked record, judge the trigger the same way Defer above does — file-shaped trigger → append `**Watched paths:**`; moment-in-time → attach/create a milestone after creation. Bootstrap the labels the payload assembled (per `_shared/label-bootstrap.md`), then `gh issue create --title ... --body-file ... --label ...` (repeat `--label` per entry in `recordPayload`'s returned array; add `--type {t}` under `work-types: native`, or the matching `type:{t}` label under `work-types: labels`). Delete the local record file only after `gh issue create` confirms success — writing to GitHub first is deliberate: if the local record is removed first and the GitHub write fails, the item is lost entirely, not just unsynced.
