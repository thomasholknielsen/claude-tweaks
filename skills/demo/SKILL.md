---
name: demo
description: Use when you want a human verdict — approve or request changes — on one built thing: this same conversation's own unrecorded work, or a specific `#N` record, whether it is marked demo:pending or was closed with no disposition at all. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review); discovery of what's outstanding across the backlog is /help's job (Stage 4.7), not this skill's. Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall, closing commit.
argument-hint: "[#N]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

# Demo — Human Acceptance Sign-Off

Gives one built thing a real human verdict — approve or request changes: either this
conversation's own unrecorded work, or a specific `#N` record. Sits after wrap-up when a record
exists; independent of it entirely for conversation-based work with no record to wait on. This
skill resolves one item per invocation — it never discovers or lists what's outstanding across
the backlog; `/claude-tweaks:help`'s dashboard (Stage 4.7) is where that list lives:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, on one item at a time)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

## When to Use

- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.
- `/claude-tweaks:help`'s dashboard told you a specific `#N` is awaiting sign-off (Stage 4.7) — including an autonomously `auto:merge`'d record already closed — and you want to walk through that one record now.
- `/claude-tweaks:tidy`'s `acceptance-gap` rows (Step 4.8) named an `#N` that closed with no disposition at all — no brief, no label, and typically no session anywhere that remembers it. Step 1 reconstructs one from the closing commit.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a harness or skill file) — this skill still gives it a lightweight human look, just not a click-through.

Not for: discovering what's outstanding across the backlog (`/claude-tweaks:help`'s job — Stage 4.7 lists every `#N`), merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis, one item at a time.

## Input

`$ARGUMENTS` — *(none)* resolves this session's own unrecorded work via session-recall (Step 1);
`#N` resolves that single record's Verification Brief, falling back — when no `demo:pending`
label exists on it — first to the record's closing commit in git history, then to session-recall
scoped to that `#N` (Step 1). Never sweeps the backlog — `/claude-tweaks:help` (Stage 4.7) is
where the full outstanding list lives.

## Step 1: Resolve the one item

`/demo` resolves one item at a time — never a sweep. `$ARGUMENTS` selects which path runs.

### No arguments: session-recall

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation. Work with no correlating `#N` is a session-recall candidate —
compose its Verification Brief content now, directly from recall, into the same shape
`verification-brief.md` renders (`### The ask` / `### What shipped` / `### Confirmed` / `### See
it yourself` or `### Verify it yourself (manual)`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **See it yourself, or Verify it yourself (manual)** — mutually exclusive, at most one, never
  both. First recall which paths this unit of work actually touched this session — unlike the
  record-backed path there is no `{base}...HEAD` range to diff here (session-recall work rarely
  sits on a dedicated branch, and may be interleaved with unrelated commits in the same session),
  so this path list comes from the session's own memory of what it edited or created, not a git
  command.

  **If that recall yields no path list** — nothing was touched, or recall can't confidently name
  what was — omit both sections entirely and skip the classification below. Do not call the
  classifier on an empty or invented list: it answers `non-interactive` for an empty one, which
  would render an empty **Verify it yourself (manual)** section instead of no section at all.
  This is the same omission rule that already applied to "See it yourself" alone.

  **With a path list in hand**, run it through the same classifier `verification-brief.md` Step 2
  uses — `verificationSurface` (`bin/lib/issues/acceptance.js`) — rather than re-deriving which
  categories count as non-interactive. `interactive` — render **See it yourself**, an entry
  point, only if one was actually exercised/known this session. `non-interactive` — render
  **Verify it yourself (manual)** instead, composed the same way `verification-brief.md` Step 2
  does for a non-testable record: concrete commands, file paths, or behavior actually run or
  checked this session, not a generic checklist.

This path has no fetch step — there is no comment or record body to read from. A fresh `/demo`
session with no memory of any unrecorded work naturally finds nothing here; that's expected, not
a bug (session-recall never discovers *other* sessions' unrecorded work). Report "Nothing
awaiting sign-off." and stop — do not call `AskUserQuestion` — when recall finds nothing.

Almost always this yields exactly one candidate — skip straight to Step 2 with it. On the rare
occasion this session did 2+ genuinely distinct, uncorrelated units of work, walk each through
Step 2 in sequence — no batch table, no bulk-decision question, since session-recall entries
never carry the `risk:*`/`effort:*` data a pre-fill would need.

### `#N` given: single-record lookup

**`work-backend: github-issues`:**

```bash
gh issue view {n} --json number,title,body,labels,url,state
```

If the result carries the `demo:pending` label, fetch its Verification Brief: the last issue
comment containing `## Verification Brief` (`gh issue view {n} --json comments -q
'.comments[-1].body'` if only one build/demo cycle occurred; otherwise search all comments for
the last one containing that heading). Go straight to Step 2 with it.

If the result does **not** carry `demo:pending` (e.g. it was built ad hoc in some other session
and closed by a `Fixes #N` commit, never reaching `/wrap-up`'s Step 10), recover that **closing
commit** before reaching for session recall. This is the population `/claude-tweaks:tidy`'s
`acceptance-gap` scope surfaces, and it is by construction *other* sessions' work — recall will
have nothing, but the commit that closed the record is still on disk:

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
- **See it yourself / Verify it yourself (manual)** — run the commit's changed-path list through
  `verificationSurface` (`bin/lib/issues/acceptance.js`) and render whichever section it selects,
  exactly as the no-arguments path does. That list is a real `git` result here, so the
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

## Step 2: Per-item walkthrough

Render this record's full Verification Brief (The ask / What shipped / Confirmed / See it
yourself — or Verify it yourself (manual) for a non-testable record — evidence the human can
judge, not a checklist to complete). Label-backed entries were
fetched per `verification-brief.md`'s digest template in Step 1's `#N` lookup; closing-commit
reconstructions and session-recall entries were composed directly, in Step 1's `#N` and
no-arguments paths respectively — all three render identically here, and a reconstruction says so
in its own `### Confirmed` section rather than being flagged separately at this point. Then render
the design-contract section below when one resolves, and ask for the verdict.

### The design contract this was built against

Design work built through Impeccable carries a **direction contract** in the opening comment of the
artifact it produced — five blocks, written *before* the code. That is the one thing an acceptance
gate cannot reconstruct afterward: once the artifact exists, the intent behind it is only inferable
from the result, which is circular. Surfacing it here is what lets a human answer "is this what it
was trying to be?" instead of only "does this look fine?".

Run the locate-and-parse procedure in `../_shared/design-contract.md` over the changed-path list
Step 1 already produced — the closing commit's `--name-only` list, the label-backed brief's paths,
or session recall's own list. Do not go looking for files beyond it.

**When a contract resolves,** render this section under exactly this heading, above the verdict
question, with the five blocks reproduced **verbatim** — never summarized, re-worded, or reordered.
Introduce it as *what this was promising to be*, and make the direction of the check explicit: the
human is comparing the result against a promise made beforehand, not reading a description of what
shipped. `### What shipped` already covers the latter, and collapsing the two wastes the only
section here that carries pre-build intent.

Then a `Design-seed:` line, when there is one — the record body's own `Design-seed:` metadata line
(fetched with the record in Step 1) if present, otherwise the seed the parse just read out of the
artifact. If both exist and disagree, render the artifact's and say in one line that the record's
differs, which means the artifact was rebuilt on a different roll after the record was stamped.
Omit the line entirely when neither source has one — upstream carries a seed key only *"when the
seed dealt stagings,"* so a contract without one is complete, not truncated.

**When no contract resolves,** render nothing — no heading, no empty section, no "not found" note.
This includes the malformed case, which that procedure already collapses into absence. Most records
have no design contract and never will; a placeholder on every one of them would be noise, and a
half-rendered contract would be worse, because it reads as complete.

This section never becomes a reason to block, and it is never audited here. Whether the render
actually honors the contract is `impeccable-finish-reviewer`'s job upstream — this skill puts the
promise in front of a human and asks them.

### Verdict

Call `AskUserQuestion` with `question`: `"Does {title} do what you asked
for?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 — the label names the section it actually walks: `"See it yourself"` when the brief's `### See it yourself` entry point resolved and browser tools are available, `"Verify it yourself"` when the brief carries `### Verify it yourself (manual)`. Offer it under either condition, never both labels at once; `description`: `"Check this before deciding"`
- Option 3 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 4 — for a label-backed entry: `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`. For a closing-commit reconstruction (never carried `demo:pending` — there is nothing to leave): `label`: `"Skip for now"`, `description`: `"Nothing is written — it still has no demo:* label, so /claude-tweaks:tidy's acceptance-gap scan will surface it again"`. For a session-recall entry: `label`: `"Skip for now"`, `description`: `"Nothing is written — unlike a label-backed record, this won't resurface in a later session"`

### Option 2 ("See it yourself" / "Verify it yourself"): pre-flight, then live or manual

**Non-interactive record** (the brief carries `### Verify it yourself (manual)` instead of
`### See it yourself` — `verificationSurface` classified the changed paths as having no
interactive surface, per whichever path composed this brief: `verification-brief.md`'s Step 2 for
a label-backed record, Step 1's own classification for a session-recall or closing-commit entry):
skip the browser pre-flight below entirely — there is no dev server or page to reach. Walk the
brief's manual steps with the user directly, one at a time — the command, file path, or behavior
to check, and what to expect. After the human finishes, re-render this record's
`AskUserQuestion` with only Approve / Request changes / Skip for now (the manual walk already
happened — don't offer "Verify it yourself" twice for the same record).

**Interactive record:** picking this option never hands over untested instructions. First, run a
pre-flight check:

1. Resolve a working dev server via `dev-url-detection.md`'s existing procedure — already
   project-agnostic (port probing, `CLAUDE.md`/`package.json` command detection, worktree
   awareness) and already auto-starts an ephemeral server on a free port when nothing is running.
2. Open a quick `agent-browser` session at the resolved entry point (following
   `/claude-tweaks:browse`'s conventions directly — the same relationship
   `/claude-tweaks:visual-review` already has with `/claude-tweaks:browse`) and confirm the target
   page actually renders, not just an HTTP 200. If the page requires auth and credentials are
   already resolvable (the Auth Vault, the same source `/stories` uses), attempt
   login too. No configured credentials → skip the login check; reachability/render alone is
   still worth confirming.
3. Close the session.

Runs once per record per `/demo` session and is reused for the rest of that record's walkthrough.

**Pre-flight succeeds:** ask one short follow-up — `question`: `"Open a live session and show
you, or give you the steps to check it yourself?"`, `header`: `"How to check"`, `multiSelect`:
`false`:

- Option 1 — `label`: `"Show me live"`, `description`: `"Open a live browser session now"`
- Option 2 — `label`: `"Give me the steps"`, `description`: `"I'll run it myself"`

**"Show me live" (sub-choice):** open a fresh `agent-browser` session at the already-verified
entry point (or reuse the pre-flight's own session if still open). After the human finishes
looking, close the session (leaked sessions consume resources — same discipline
`/claude-tweaks:browse`'s own Anti-Patterns table requires), then re-render this record's
`AskUserQuestion` with only Approve / Request changes / Skip for now (the live look already
happened — don't offer "See it yourself" twice for the same record).

**"Give me the steps" (sub-choice):** compose manual instructions from the pre-flight's own
verified URL/port/credentials — never a guessed default — following this checklist:

- **Self-contained** — every command block includes its own `cd` to the right checkout/worktree;
  never assume an inherited working directory.
- **Copy-paste-clean** — no inline commentary inside a block meant to be pasted as-is;
  explanation goes in prose before/after the block, never inside it.
- **Proactively explain surprising-but-correct state** the pre-flight itself observed while
  rendering (e.g. an empty dashboard on first load) — inline, before the human has to ask.

After presenting the steps, re-render this record's `AskUserQuestion` with only Approve / Request
changes / Skip for now, same as the live sub-choice above.

**Pre-flight fails:** this is evidence, not a side quest to chase mid-conversation. Capture what
broke (screenshot, console error) and fold it directly into this record's brief as grounds for
**Request changes** — skip the live-vs-manual follow-up question entirely, a broken environment
is broken either way. `/demo` never debugs or fixes the underlying application code itself — that
stays out of scope the same way code-quality judgment already does (`/review`'s job).

**Browser tools unavailable:** same fallback `verification-brief.md` already documents — skip
without blocking, note visual verification wasn't available in this environment, proceed with
Approve / Request changes / Skip for now only (no "See it yourself" option at all in this case).

### Scope-fork checkpoint

If, anywhere in this walkthrough, the human asks for something beyond confirming this record's
existing behavior — a new feature, a change beyond what pre-flight needed to make the environment
checkable — stop once (the first time this happens in this `/demo` session) before doing it. Call
`AskUserQuestion` with `question`: `"That's new scope beyond what's being demoed here. Want me to
capture it as a backlog item now and come back to your sign-off decision, or build it now as its
own thing outside /demo?"`, `header`: `"Scope fork"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Capture it"`, `description`: `"File it as a backlog item, then come back to your sign-off decision"`
- Option 2 — `label`: `"Build it now"`, `description`: `"Build it now as its own thing, outside /demo"`

"Capture it" routes through the same follow-up-record mechanism Step 3's Request-changes branch
already uses, with one difference: the body's `Origin:` line reads `Origin: demo scope-fork from
#{n}` (or `from session recall` for a session-recall entry) instead of the changes-requested
variant — a scope-fork capture isn't a changes-requested verdict, so it needs its own provenance
marker. If the human picks "Build it now," don't re-ask for further closely-related work in this
same session.

### Task-anchor discipline

This record's verdict — not yet Approved/Request-changes/Skipped — must never be silently
dropped because the conversation moves on, whether from a declined `AskUserQuestion`, a
pre-flight failure that grows its own back-and-forth, a scope-fork detour above, or any other
detour. Once any such detour concludes, before shifting to a new unrelated topic, restate that
this record's decision is still outstanding and offer to resume. Never end a `/demo` run with a
record left mid-decision and unmentioned.

## Step 3: Apply verdicts

**Label-backed entries** (Step 1's `#N` lookup): bootstrap `demo:approved` and
`demo:changes-requested` via the check-then-create loop from `_shared/label-bootstrap.md` before
the first swap this run.

- **Approve** — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`). One command covers both entry shapes: `--remove-label` on a label the record does not carry is a silent no-op — verified on this repo, exit 0, and `--add-label` in the same invocation still lands — so a closing-commit reconstruction, which never had `demo:pending`, needs no variant.
- **Request changes** — prompt for a short reason inline, then:
  1. **`work-backend: github-issues`:** `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`. **`work-backend: local-files`:** set `facets.acceptance = 'changes-requested'` via `writeRecord`.
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. `work-backend: github-issues`:
     use the same `recordPayload` composition `/claude-tweaks:capture` uses
     (`bin/lib/issues/record.js`), just without invoking `/claude-tweaks:capture` itself —
     and, unlike `/capture`'s own call, **omit the `origin` field entirely** rather than passing
     `origin:'demo'`: `record.js`'s `ORIGINS` enum has no `'demo'` entry, so passing it throws;
     omitting `origin` is also what keeps this follow-up label-free, consistent with the
     "no `by:*` label" requirement above (`recordPayload` only pushes a `by:*` label when
     `origin` is set).
     `work-backend: local-files`: use `createRecord(dir, { slug, title, body, facets })` from
     `bin/lib/issues/local-store.js` — `title` is the reason text just collected, `body` is the
     reason plus the link back to the original plus the `Origin:` line above, `facets: { type,
     stage: 'backlog' }` (`type` being `bug` or the overridden type). Compute `slug` via that
     same module's `deriveSlug(title, existingSlugs)`. Never `allocateId`+`writeRecord`
     separately — same allocateId+writeRecord race `capture/SKILL.md`'s Backend Selection
     section documents (two near-simultaneous filings, e.g. two `/demo` "Request changes"
     verdicts landing in the same run, or `/demo` racing a `/capture`/`/specify` decomposition,
     can silently share one numeric id); see that section for the full call shape to mirror.
  3. Note the bidirectional link back on the original record. `work-backend: github-issues`:
     comment on the original issue with the new follow-up's issue number. `work-backend:
     local-files`: there is no comment mechanism (same constraint `verification-brief.md` and
     `_shared/work-record.md` already document) — append a short note with the follow-up's id to
     the original record's body instead, via the same `readRecord`/`writeRecord` round trip.
- **Skip for now** — no label change.

**Session-recall entries** (Step 1's no-arguments path) — no record exists, so nothing here ever
bootstraps a label or writes to GitHub/local-files for Approve or Skip:

- **Approve** — nothing written anywhere. The verdict lives in this conversation.
- **Skip for now** — nothing written anywhere. Unlike a label-backed record, this will not
  reappear in a future `/demo` run — a different session has no memory of this conversation to
  recall from. This is the accepted tradeoff of not persisting anything, not a bug.
- **Request changes** — the exact same follow-up-filing procedure as the label-backed path's
  Request changes above (step 2), reusing `recordPayload` (`work-backend: github-issues`) or
  `createRecord`+`deriveSlug` (`work-backend: local-files`) directly — the only difference is
  there is no original record to relabel or comment a link back onto, or reference within the
  follow-up's own body — the `Origin:` line is the sole provenance marker for a session-recall
  follow-up. The `Origin:` body line reads `Origin: demo changes-requested from session recall`
  instead of `from #{n}`.

## Next Actions

Render via `AskUserQuestion`, `question`: `"What's next?"`, `header`: `"Next step"`,
`multiSelect`: `false`:

- Option 1 (when any `demo:changes-requested` follow-up was filed) — `label`: `"Triage the new follow-up (Recommended)"`, `description`: `"/claude-tweaks:backlog refine — the new gap record needs shaping/authorization like any other backlog item"`
- Option 2 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — full pipeline status"`
- Option 3 (when this record remains `demo:pending` after Skip) — `label`: `"Check what else is outstanding"`, `description`: `"/claude-tweaks:help — lists every #N still awaiting sign-off (Stage 4.7)"`

## Component-Skill Contract

`/claude-tweaks:demo` is a **standalone-only** skill — it is never invoked by a parent skill
in the workflow. There is no `PIPELINE_RUN_DIR` signal to check; the `## Next Actions` block
always renders.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Handing over "Give me the steps" instructions without running the pre-flight first | The human becomes the integration test, hitting port collisions and broken auth one round-trip at a time |
| Re-deriving "how do I test this" from the diff when a brief already exists | `/wrap-up` wrote it at build time with full context — Step 1's closing-commit reconstruction is the fallback for records that never got a brief, not a substitute for reading one |
| Writing a reconstruction's `### Confirmed` as though someone watched the work | A closing commit evidences what shipped, not that anyone checked it — name the reconstruction and stop at what the commit itself shows |
| Merging or opening a PR from within this skill | Those belong to `/superpowers:finishing-a-development-branch` — `/demo` only resolves the Acceptance axis |
| Silently dropping a record mid-decision because the conversation moved on | A pending verdict must be restated before shifting topic — see Step 2's Task-anchor discipline |
| Treating a record with no interactive surface as not needing sign-off | Non-testable work still gets a lightweight human look — the brief pairs the diff/rationale with concrete manual verification steps, not just "review the diff" |
| Debugging or fixing an application bug a pre-flight check uncovers | Out of scope like code-quality judgment — capture it as a Request-changes candidate |
| Leaving a "See it yourself" live session open after the verdict is captured | Leaked sessions consume resources — close it as `/browse` requires, right after the human looks, before re-rendering the verdict |
| Writing `demo:approved`/`demo:pending` for a session-recall entry | No record holds it — the verdict lives in the conversation, not a label; only Request-changes produces a real record |
| Sweeping the `demo:pending` backlog from within this skill | Discovery is `/claude-tweaks:help`'s job (Stage 4.7 lists every outstanding `#N`) — `/demo` resolves one item per invocation |
| Summarizing, re-wording, or reordering the direction contract's five blocks | The blocks are the pre-build promise the human is checking the result against; a paraphrase is one more reading of the result, which is exactly the circularity this section exists to break |
| Rendering the design-contract heading when no contract resolved, or with only the blocks that parsed | Most records have no contract — an empty section is noise on all of them, and a partial one is worse, because it reads as complete (`_shared/design-contract.md` collapses malformed into absent for this reason) |
