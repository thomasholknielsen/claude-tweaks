# Dispatch — Headless Self-Report (`next` form only)

Loaded by `/claude-tweaks:dispatch`'s Preflight, and only on the `next` form — the unit a scheduled
Routine fires with nobody present to read a stop message. Every other form (bare, `#N`,
`#N,#M,...`) runs with a human present per the Input table in `SKILL.md`, reports the failing check
directly, and never reads this file.

**Ordering.** This procedure runs *before* the stop it accompanies — both for Preflight's
`work-backend` checks and for its Detection Ladder. It does not soften or defer any of them: the
stop still happens, this just leaves a durable trace first.

---

A Preflight failure on this form needs a durable trace instead of a message nobody sees. Before stopping on any Preflight failure (`SKILL.md`'s `work-backend` checks, or its Detection Ladder), search for an existing open report first, to avoid re-filing on every firing — never via `gh issue list --search`, which rides GitHub's eventually-consistent search index (the same anti-pattern documented in `_shared/github-write-transport.md`); use the same plain-list + marker-match idiom instead:

```bash
gh issue list --label by:dispatch --state open --json number,title,body,createdAt --limit 500 > /tmp/dispatch-selfreport-issues.json

rm -f /tmp/dispatch-selfreport-lookup.json
node -e "
  const { findByMarker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js');
  const issues = require('/tmp/dispatch-selfreport-issues.json');
  const marker = '<!-- dispatch-preflight-marker: ' + process.argv[1] + ' -->';
  const result = findByMarker(issues, marker);
  require('fs').writeFileSync('/tmp/dispatch-selfreport-lookup.json', JSON.stringify(result));
" "{failing-check-name}"
```

Read `/tmp/dispatch-selfreport-lookup.json`:
- `null`: read the project's `work-types` config key (per `_shared/work-record.md`'s Config keys table) and branch —
same pattern `/capture`'s Backend Selection already uses, Type is always `bug` here (a Preflight
failure is definitionally a defect). The body now carries the marker so future firings can find it reliably:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['by:dispatch', 'Origin: self-filed by /claude-tweaks:dispatch on a headless Preflight failure']]
# — bootstrap the matching type:bug pair too under work-types: labels, same as /capture does.

# work-types: native
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --type bug \
  --label by:dispatch

# work-types: labels
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --label by:dispatch \
  --label type:bug
```
- Otherwise (`canonical` is set — a match was found): if `duplicates` is non-empty (however that happened — this is the hedge, not the expected path), resolve this firing's run dir first — via `_shared/pipeline-run-dir.md`'s standalone-auto fallback (dispatch is on the allowlist; this block runs in Preflight, before Workflow Step 1 would otherwise resolve `$RUN_ID`, so it cannot be assumed already resolved here) — then close every duplicate entry: `gh issue close {n} --reason "not planned"` with a comment `` "Duplicate of #{canonical.number} — same `dispatch-preflight-marker` match, closing to keep one open self-report per failing check." `` — then log one line per closed duplicate to that run dir's `decisions.md`: `AUTO {time} — dispatch headless self-report: closed duplicate issue #{n} (marker match with canonical #{canonical.number}). Reversibility: low (GitHub state; issue can be manually re-opened).` Then, whether or not any duplicates were found, reference `#{canonical.number}` in the stop output and file nothing new.

No `ready`/`auto:build` on the filed issue — a human confirms and applies the fix, the same conservative default `/capture`'s `keep` route uses elsewhere in this codebase. The bare/`#N`/explicit-list forms always run with a human present (per `SKILL.md`'s Input table) — they still just report and stop; self-filing is `next`-only.

**MCP path** (`gh` unavailable; CRUD mapping per `_shared/github-write-transport.md`): this block's `gh` calls also have a documented MCP path — the list-then-filter lookup (`gh issue list --label by:dispatch ...`) uses the confirmed "list issues by label" mapping (`list_issues`, filtered by label/state — never `search_issues`, same eventually-consistent-index caveat as elsewhere in this skill), issue creation (`gh issue create`, both the `work-types: native` and `work-types: labels` variants) uses `issue_write` (create mode), and the duplicate-closing `gh issue close` uses `issue_write` (update mode, state change) — same as every other create/close call site in `SKILL.md` and `mcp-transport.md`.
