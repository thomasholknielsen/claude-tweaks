# Release Console — Step 4

Read by `/claude-tweaks:release` Step 4. Renders one table naming the version this run would ship, who drove it, and what still stands between here and Step 5 — then evaluates the two HARD-GATEs on the effective version, before Step 5 ever executes anything.

## Inputs

- The preflight fact pack (`{run-dir}/release-preflight.json`, read once in Step 1): `engine`, `lastTag`, `unreleased`, `proposedVersion`, `releasePr`, `ciTip`, `openReleasePrConflict`, `hook`.
- Step 3's whole-branch review verdict: `review: blocking`, `review: findings (n medium/low, staged)`, or `review: clean`, plus the staged finding paths when any exist.
- The arguments: `--as {version}` (the effective-version override) and `--allow-blocking`.

## The table

Render exactly these rows, in this order, as a two-column `| Row | Value |` table:

| Row | Value |
|---|---|
| Engine | `pr-first (release-please)` when `engine.value` is `pr-first`; `local-merge (bin/release-local.js)` when it is `local-merge`. |
| Since | `{lastTag.value.tag}` when `lastTag.ok`; otherwise `first release`. |
| Records shipped | One line per `(#N)` suffix found in `unreleased.value.commits[].subject`, joined to that record's title and type. pr-first: one `gh issue view N --json title,labels` call per distinct `N` (batched, not one shared call — `_shared/github-write-transport.md`'s "Get a single issue by number" read mapping, `issue_read` get mode where `gh` is absent). local-merge: the local record file. Duplicate `(#N)` suffixes across commits collapse to one line. A commit subject carrying no `(#N)` suffix never drops out of this row — it renders instead under a nested `Unattributed commits` line, one `{sha7} {subject}` per commit. |
| Proposed bump | `{proposedVersion.value.version} ({proposedVersion.value.part}) — driven by {sha7} {subject}`, where the driving commit is the first breaking commit in `unreleased.value.commits[]`, else the first `feat`, else the first `fix`. With `--as {version}` given, render instead: `{version} (Release-As override; commits alone justify {proposedVersion.value.part})` — `{version}` here is the effective version every later row and gate uses. |
| Review | `blocking ({n} critical/high — staged/review-*.patch)`, `clean`, or `findings ({n} staged)` — Step 3's verdict, `{n}` the count of findings at that tier. |
| CI on tip | From `ciTip`: `{state} ({success}/{total})`, with `, tipBehind: local origin/{branch} is behind` appended when `ciTip.value.tipBehind` is true; `n/a` under local-merge; `unknown (error)` when the field is degraded — never rendered as passing. |
| Release PR | `#{number} {state} {mergeable}` when `releasePr.value` is a PR object; `none` when it is the string `none`; `unknown` when the field is degraded. Append `, human-edited: yes` when `openReleasePrConflict.value` is `true` **or** that field is degraded — an edit that cannot be ruled out renders exactly as a confirmed one. |
| Hook configured | Presence only, never Step 6's post-execution result: `yes (release: published workflow)` (pr-first), `yes (release-hook)` (local-merge), `no`, or `unknown` when `hook` is degraded. This row answers "is a hook wired up", not "did it run" — Step 6 verifies that separately, after Step 5, from evidence this row never touches. |
| Overrides | `--as {version}` and/or `--allow-blocking`, each on its own line when given; `none` when neither was passed. |

## Gates

Two HARD-GATEs evaluate here, on the **effective** version (the `--as` value when given, otherwise `proposedVersion.value.version`) — never only the commit-derived proposed bump:

1. **`review: blocking`** — unless `--allow-blocking` was passed, and never lifted by it under `--train` (Step 3's override rule: no human read the finding in an unattended firing).
2. **A major bump** — `effective.major > lastTag.value.version.major`, or a first release (`lastTag` not `ok`) whose effective version is `>= 1.0.0`. State why in the render: a first tag is a public contract, so shipping it at `1.0.0` or above is a major decision even with no prior tag to compare against.

Under `--train`: either gate stages `release-held.md` (naming which gate fired, the effective version and its base, and the blocking findings' staged paths — SKILL.md's `--train semantics`) and the run exits `HELD` at Step 8. Step 5 never runs.

Otherwise (an on-demand or refused-train invocation): in `auto` or headless mode, stop here with the console already rendered and a one-line reason naming the gate — these are registered HARD-GATEs (`_shared/auto-mode-contract.md`'s "HARD-GATE / BLOCKED / STOP conditions" row), not a new mid-flow stop this skill invents. In `interactive` mode: one `AskUserQuestion` — `question`: `"A HARD-GATE fired on the effective version {effective} — {which gate} — proceed?"`, `header`: `"Release gate"`, `multiSelect`: `false`, option 1 `label`: `"Proceed (Recommended when the finding is read)"`, option 2 `label`: `"Stop"`.

## Auto mode

The console renders read-only and the run proceeds to Step 5 with no `AskUserQuestion` call — except at the two gates above, which stop regardless of mode.

## Log lines

```
AUTO {time} — Step 4: console rendered — {version} ({part}), {n} records, review {verdict}, hook {value}. Reversibility: n/a.
STAGED {time} — Step 4: HARD-GATE {which} — release held. Stage path: staged/release-held.md. Reversibility: high.
```

The first line logs every render, gated or not. The second logs only a `--train` HARD-GATE stage.
