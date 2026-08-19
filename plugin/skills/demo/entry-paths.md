# Demo Step 1 — Entry Paths

Referenced by `skills/demo/SKILL.md` Step 1. `$ARGUMENTS` already selected which path runs before
this file is read — load only the branch that matches (no-arguments vs. `#N` given), never both. For a `#N[,#M...]` list, the `#N` branch is entered once per ref, in list order — each entry is a fresh, independent lookup.

## No arguments: session-recall

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation. Work with no correlating `#N` is a session-recall candidate —
compose its Verification Brief content now, directly from recall, into the same shape
`verification-brief.md` renders (`### The ask` / `### What shipped` / `### Confirmed` / `###
Observation plan`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **Observation plan** — compose the `### Observation plan` section directly from recall, per
  `../_shared/observation-plan.md`'s schema, grammar, and per-kind semantics — picking the
  Surface kind by builder judgment from what this session actually did, never from a classifier.
  First recall which paths this unit of work actually touched this session — unlike the
  record-backed path there is no `{base}...HEAD` range to diff here (session-recall work rarely
  sits on a dedicated branch, and may be interleaved with unrelated commits in the same session),
  so this path list comes from the session's own memory of what it edited or created, not a git
  command.

  **If that recall yields no path list** — nothing was touched, or recall can't confidently name
  what was, or nothing about it resolves a confident Surface/Entry point — omit the Observation
  plan section entirely and compose the brief without it, straight to Step 2's verdict. Do not
  compose a plan from an empty or invented path list: an unconfident guess reads as authored
  evidence, which is worse than no section at all. This is the same omission rule that already
  applied under the pre-schema brief format (what was then called "See it yourself"), restated
  here for the Observation plan schema.

This path has no fetch step — there is no comment or record body to read from. A fresh `/claude-tweaks:demo`
session with no memory of any unrecorded work naturally finds nothing here; that's expected, not
a bug (session-recall never discovers *other* sessions' unrecorded work). Report "Nothing
awaiting sign-off." and stop — do not call `AskUserQuestion` — when recall finds nothing.

Almost always this yields exactly one candidate — skip straight to Step 2 with it. On the rare
occasion this session did 2+ genuinely distinct, uncorrelated units of work, walk each through
Step 2 in sequence — no batch table, no bulk-decision question, since session-recall entries
never carry the `risk:*`/`size:*` data a pre-fill would need.

## `#N` given: single-record lookup

**`work-backend: github-issues`:**

```bash
gh issue view {n} --json number,title,body,labels,url,state
```

If the result carries the `demo:pending` label, fetch its Verification Brief: the last issue
comment **containing** `## Verification Brief`. Fetch every comment (`gh issue view {n} --json
comments`) and take the last one carrying that heading — test the heading, never assume the
position. A `.comments[-1]` shortcut holds only when the brief happens to be the most recent
comment, which nothing about the record predicts: any later reply or bot notification displaces
it, and a decomposition parent whose gate was completed by the Parent-Gate Procedure's
already-posted-brief branch (`wrap-up/verification-brief.md`'s **Apply the gate**) received its
label with no comment posted at all, leaving its brief arbitrarily far from last. Go straight to
Step 2 with it.

This `#N` may itself be a decomposition parent gated by the Parent-Gate Procedure
(`wrap-up/verification-brief.md`) rather than a single build, in which case its Verification
Brief covers the whole parent issue's primary path rather than one diff, but resolves and renders
through this same branch exactly like any other label-backed entry. Two things can have applied
that gate: `/claude-tweaks:wrap-up`'s own eager path (closing the parent's last sub-issue), or `/claude-tweaks:tidy`'s
`Open parent gate` action backstopping a parent issue that missed it (surfaced by
`_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope under `work-backend: github-issues`, or by
`tidy/step-1-records.md`'s Shape 7 under `local-files`) — all of them write the identical
`demo:pending` + brief, so this branch never needs to know or care which one ran.

If the result does **not** carry `demo:pending` (e.g. it was built ad hoc in some other session
and closed by a `Fixes #N` commit, never reaching `/claude-tweaks:wrap-up`'s Phase 4 execution step
— **or it reached Phase 4 and simply didn't clear the oversight floor, per `#367`** — a normal,
common case now, not an anomaly), recover that **closing
commit** before reaching for session recall. This is the population `/claude-tweaks:tidy`'s
`acceptance-gap` sweep surfaces — its `github-pr-scan-acceptance.md` scope under `work-backend:
github-issues`, `tidy/step-1-records.md`'s Shape 8 under `local-files` — and it is by construction
*other* sessions' work. Recall will have nothing, but the commit that closed the record is still
on disk, and this recovery reads git rather than the backend, so it is identical on both drivers:

```bash
git log --perl-regexp -i \
  --grep='(?m)\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#{n}(?!\d)(\s*,\s*(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#\d+(?!\d))*\s*$' \
  --max-count=1 --format='%H' origin/main HEAD
```

Search `origin/main` and `HEAD` together, and nothing wider. A closing keyword only closes a
record once its commit reaches the **default branch**, so that ref is where the closure actually
happened; `HEAD` additionally covers a close made on the current branch that has not been pushed
yet. `--all` would sweep abandoned and unmerged branches, whose commits closed nothing — a brief
built from one of those would describe work that never shipped. Substitute the repo's own default
branch when it is not `main`, drop `origin/` when there is no remote, and `git fetch origin` first
if the remote-tracking ref may be behind.

`--grep` searches the whole commit message with no positional restriction, so prose that merely
quotes a closing phrase — a commit *documenting* the convention rather than invoking it — satisfies
a bare keyword-plus-ref match exactly as well as a real closer, and because `--max-count=1` returns
the newest hit first, one illustrative quote permanently shadows the true closer for as long as it
stays the newest match. A real GitHub closer is structural, not buried mid-sentence: it ends the
commit subject (`… — closes #144`) or stands alone as a body line (`Fixes #14`); prose quoting the
same phrase has more sentence after it on the same line. The `(?!\d)` lookahead is the same
digit-boundary guard the original pattern had (keeps `#14` from matching inside `#141`). The new
part is `(?m)…\s*$` plus the optional `, keyword #M` repeat group: the match must reach the end of
a line, with nothing but whitespace or further comma-joined closing references in between — so a
ref followed by a closing quote and more sentence fails to match, while `closes #138, closes #139`
still resolves each of its two refs. `--perl-regexp` is what makes `(?m)`, the lookahead, and the
repeat group available; it is not reused from `bin/lib/hooks/post-tool-use.js`'s own closing-keyword
matcher (`checkClosingKeyword`) — that check only tests whether a keyword immediately precedes a
ref, with no line-position anchor at all, because a false positive there just skips a non-blocking
warning. Here a false positive silently returns the *wrong* commit, so the anchor is load-bearing
and new. The keyword vocabulary itself is unchanged and still mirrors `ISSUE_REF_SOURCE`
(`bin/lib/issue-branch-tracking.js`) so the two can't drift on which keywords GitHub recognizes.

**Found** — one command reads both halves of the brief:

```bash
git show --name-only --first-parent --format='%H%n%s%n%n%b' {sha}
```

(`--first-parent` so a merge commit lists its files rather than nothing.) Compose the brief in the
same shape as the no-arguments path, sourced like this:

- **The ask** — the record's own title and body, from the `gh issue view` above. The commit
  subject says what shipped, not what was asked for.
- **What shipped** — the commit subject and body, plus its changed-path list.
- **Confirmed** — this brief is a **reconstruction**: it was composed after the fact from a
  commit, by an agent that did not watch the work run. Open the section by saying exactly that,
  then report only what the commit itself evidences — verification its own message claims, and
  the test files in its path list. Assert nothing past that boundary. The standing `### Confirmed`
  rule binds harder here, not less: describe what was actually verified, including what wasn't
  checked, never a checklist pretending completeness.
- **Observation plan** — run the commit's changed-path list through `verificationSurface`
  (`bin/lib/issues/acceptance.js`) as the floor classification, then compose the `### Observation
  plan` section per `../_shared/observation-plan.md`'s schema from what it returns: `interactive`
  → compose a best-effort `app-route` plan, resolving the entry point via
  `skills/_shared/dev-url-detection.md`. `non-interactive` → compose the manual steps exactly as
  before — concrete commands, file paths, or behavior the commit's own message or path list
  evidences — presented as a `cli` plan when those steps name a runnable command, else a `diff`
  plan (Entry point: `{sha}^..{sha}`). That changed-path list is a real `git` result here, so the
  "recall can't produce a path list" omission case does not arise.

Go to Step 2 with it.

**Not found** — fall back to session-recall for this specific `#N`: does this conversation have
memory of building and/or verifying it? If yes, compose a Verification Brief exactly as the
no-arguments path does above, scoped to this one record, and go straight to Step 2. If this
session has no memory of it either, report plainly: "`#N` has no Verification Brief, no closing
commit in git history, and no memory in this session — nothing to show." and stop.

**`work-backend: local-files`:** `readRecord(filePath)` for the single record
(`bin/lib/issues/local-store.js`); the Verification Brief is the record's own `## Verification
Brief` body section. Same `demo:pending` → closing-commit → session-recall fallback order as
above, keyed on `facets.acceptance === 'pending'` instead of the label. The closing-commit step is
identical — it reads git, not the backend, so a local record closed by a `Fixes #N` commit
reconstructs the same way.
