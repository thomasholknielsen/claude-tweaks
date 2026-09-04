# Unresolved provenance — swept from repo-root `work/`

These `{n}-spec.md` files were committed directly at the repo-root `work/` directory
(the legacy pre-run-dir-anchoring shape — see `plugin/bin/lib/hooks/pre-tool-use.js`'s
`hasMaterializeCommit` comment, which counts ~100 such legacy files reachable in this
repo's history) and swept here by #1568's build. Unlike their siblings (moved to
`archive/{run-id}/work/`), no `claude-tweaks-run: {run-id}` marker could be recovered
for these — the PR that merged each one predates, or never carried, the dual-marker
scheme (`_shared/pr-early-run-lifecycle.md`'s #929 fix), so there is no live run-id to
reconstruct a path from. Kept here rather than deleted, per #1568's Acceptance
Criterion 2 (no silent deletion).

| Record | Adding commit | Merging PR | Why unresolved |
|---|---|---|---|
| #252  | de6aaf5d | [#1209](https://github.com/thomasholknielsen/claude-tweaks/pull/1209) | Reconciler-composed PR body ("Pre-flight the vocabulary guard..."), no run-id marker in either form |
| #458  | 076241be | [#1081](https://github.com/thomasholknielsen/claude-tweaks/pull/1081) | Hand-composed PR body, no run-id marker |
| #500  | dbb4950d | [#1115](https://github.com/thomasholknielsen/claude-tweaks/pull/1115) | Body states the draft PR was opened by the dispatching session after the build agent skipped that step — never carried a run-id marker |
| #644  | a3c5133b | [#1217](https://github.com/thomasholknielsen/claude-tweaks/pull/1217) | Rebase-and-rescue of an abandoned branch ("Rescue #644..."), hand-composed body, no run-id marker |
| #1117 | dfc35d4e | [#1603](https://github.com/thomasholknielsen/claude-tweaks/pull/1603) | Hand-composed PR body, no run-id marker |
| #1246 | 5ba84e74 | [#1607](https://github.com/thomasholknielsen/claude-tweaks/pull/1607) | Hand-composed PR body, no run-id marker |
| #1299 | 03eaaf56 | [#1614](https://github.com/thomasholknielsen/claude-tweaks/pull/1614) | Hand-composed PR body ("Fix #1299:..."), no run-id marker |
| #1329 | b51f6b22 | [#1618](https://github.com/thomasholknielsen/claude-tweaks/pull/1618) | Hand-composed PR body, no run-id marker |

Lookup method for every row above (both this table and the resolved siblings in
`archive/{run-id}/work/`): `git log --diff-filter=A --format=%H -- work/{n}-spec.md |
tail -1` for the adding commit, `gh api repos/thomasholknielsen/claude-tweaks/commits/{sha}/pulls
--jq '.[0].number'` for the merging PR, `gh pr view {pr} --json body -q .body` read for a
`claude-tweaks-run: {run-id}` line (HTML-comment or plain-text form, per
`_shared/pr-early-run-lifecycle.md`'s dual-marker scheme) — absent on every row above.
