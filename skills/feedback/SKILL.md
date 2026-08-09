---
name: feedback
description: Use when a learning belongs upstream in the claude-tweaks plugin rather than in this project — a skill that behaves wrongly (defect) or has no opinion where it should (gap). Files it as a GitHub issue against thomasholknielsen/claude-tweaks after an explicit scrub and confirmation.
argument-hint: "[<learning text>] [--kind=defect|gap] [--dry-run] [--queue]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Feedback — Route a learning upstream to the claude-tweaks plugin

The D5 writer of `_shared/learning-routing.md`. Files learnings that would help
every adopter of the plugin, not just this project.

Lifecycle: `/claude-tweaks:reflect` → **`/claude-tweaks:feedback`** → upstream issue

## When to Use

- The routing classifier returned **D5** for a learning (rule 1 or rule 7).
- A `/claude-tweaks:*` skill behaved wrongly, errored, or was missing a
  capability, and the lesson would hold in any project using the plugin.
- A health sweep surfaced a finding whose subject is a claude-tweaks skill
  rather than this project's own code.
- Invoked bare (no arguments) to check this project's own `upstream-candidate`
  backlog — findings the health sweeps' headless path already filed locally
  and left for a human to forward (see Step 0).

Do **not** use this skill to file against any repository other than
`thomasholknielsen/claude-tweaks`. A learning owned by a third-party dependency
is reported to the user and stopped — see `_shared/learning-routing.md`,
"Non-claude-tweaks upstream".

## Input

`$ARGUMENTS` is parsed as `[<learning text>] [--kind=<value>] [--dry-run] [--queue]`:

| Argument | Behavior |
|----------|----------|
| Free-text learning | The substance of the report. When absent, gather it from the conversation or ask. |
| `--kind=defect` | The plugin does something wrong. Skips Step 2's inference. |
| `--kind=gap` | The plugin has no opinion where it should. Skips Step 2's inference. |
| `--dry-run` | Run Steps 1-7 (classification, self-reference, dedup, drafting, scrub, and the confirm gate's dry-run branch), then render the draft and **stop** — Step 8 (label resolution and `gh issue create`) never runs. Step 4's dedup search is a real, read-only `gh issue list` call; no `gh` call ever creates, labels, or files anything. |
| `--queue` | Explicit bare-invocation mode (see Step 0) even when free-text is also present — process this project's own `upstream-candidate` backlog instead of (or in addition to) the free-text learning. |

## Workflow

### Step 0: Local upstream-candidate queue (bare invocation)

When `$ARGUMENTS` carries no free-text learning (or `--queue` was passed), this project may already hold headless-filed candidates waiting for a human — the health sweeps' Subject check (`_shared/learning-routing.md`) files these locally with `upstream-candidate` plus the sweep's own `by:` label, deliberately without `ready`, precisely because nothing else in the plugin queries them (#239). Check for them before falling back to "gather from the conversation or ask":

```bash
gh issue list --label upstream-candidate --state open --json number,title,body,labels --limit 50
```

- **None found:** proceed to Step 1 as usual (gather from the conversation, or ask).
- **One or more found:** present a batch table (number, title, originating sweep from the `by:*` label) and ask which to forward now — "Apply all" runs each selected issue through Steps 1-8 below in turn (Step 1's gather is seeded from that issue's own body: component and symptom are already in it), then closes the local `upstream-candidate` issue with a comment linking the new upstream issue once Step 8 successfully files it. "None — I have a new learning to report" falls through to Step 1 with whatever free-text was given (or a fresh ask). Selecting individual issues to skip is a normal batch-table override — the interaction convention in CLAUDE.md's Interaction patterns section, not a per-item prompt.

This is what resolves `upstream-candidate`'s dead-write state (#239): the label's own consumer was always meant to be a human eyeball plus a manual `/claude-tweaks:feedback` invocation (`_shared/learning-routing.md`'s Headless-runs paragraph says exactly this), and this step is what makes that eyeball's job a single command instead of a `gh issue list` a human has to remember to run.

### Step 1: Gather

Determine the summary (one line), the affected component (the skill, contract,
or CLI involved, or "unclear / general"), and a title naming the component and
the symptom. For a defect, also gather repro steps and expected-vs-actual. For a
gap, gather the use case — what the user was trying to do and why the plugin's
current behavior does not support it.

### Step 2: Classify the kind

Read `_shared/learning-routing.md` and confirm the learning is D5 at all.

**If it is not D5, stop.** Report the destination the contract actually returned
and hand the learning back to the caller. This skill files D5 learnings and
nothing else — a misrouted learning filed here becomes an off-topic public issue.

Otherwise:

- Classifier **rule 1** fired → `defect`
- Classifier **rule 7** fired → `gap`

The kind comes from which rule fired. Never guess it, and never infer it from
tone. If `--kind=` was passed, use that and skip the inference.

A defect and a gap differ in triage, urgency, and what a maintainer does with
them. They must not arrive looking identical.

### Step 3: Self-reference check

```bash
git remote get-url origin
```

If the remote resolves to the claude-tweaks repository itself, **stop**. Report
that the learning belongs in this project's own records and re-run the
classifier from rule 4 per `_shared/learning-routing.md`. Do not file.

### Step 4: Dedup

Derive a fingerprint basis from the affected component plus the core symptom,
then search:

```bash
gh issue list --repo thomasholknielsen/claude-tweaks --search '<keywords>' --state all --limit 10 --json number,title,state,url
```

Show any plausible matches and ask whether to file anyway, comment on the
existing issue instead (then stop), or cancel.

Reuse `bin/lib/health-core/fingerprint.js` (`createFingerprint`, `normalizeText`)
for the fingerprint marker embedded in the body, so a later run recognizes its
own prior filing.

### Step 5: Draft

Title: `<component>: <symptom>`

```
**Summary:** <one line>

**Kind:** Defect | Gap

**Affected component:** <skill, contract, or CLI — or "unclear / general">

**Repro steps:** (defect only)
1. ...

**Expected vs. actual:** (defect only)
Expected: ...
Actual: ...

**Use case:** (gap only)
<what you were trying to do and why current behavior does not support it>

**Plugin version:** <from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json>

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: <marker> -->
```

Resolve the plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`,
never from install metadata or `gitCommitSha` (`[IL-89]`).

### Step 6: Scrub — HARD GATE

The target repository is **public** and the learning was derived from a codebase
that may not be. Before showing the draft, remove:

- Credentials, tokens, and connection strings
- Absolute paths outside the plugin itself
- Code excerpts from the reporting project
- The reporting project's name, when that project is private — say "a private
  project" instead

Keep only what a maintainer needs to reproduce or understand the report.

This gate is unconditional. It runs on every invocation, including `--dry-run`
and including invocations that began inside a pipeline.

**If the learning cannot survive the scrub, stop.** When the report is only
intelligible with content that must be removed — the reproduction depends on
private code, or the symptom cannot be stated without naming private
infrastructure — do not file a gutted version and do not file the original.
Report that the learning is unfileable as-is and hand it back. A learning that
cannot be scrubbed cannot be published.

### Step 7: Confirm — HARD GATE

Show the full scrubbed draft and call `AskUserQuestion`:

- `question`: `"File this upstream against thomasholknielsen/claude-tweaks?"`,
  `header`: `"File upstream"`, `multiSelect`: `false`
- Option 1 — `label`: `"File it (Recommended)"`, `description`: `"Create the issue as drafted"`
- Option 2 — `label`: `"Edit first"`, `description`: `"Tell me what to change before filing"`
- Option 3 — `label`: `"Don't file"`, `description`: `"Discard — the learning stays local"`

Never file without this confirmation, in any mode. Publishing to a public
repository is outward-facing and effectively irreversible.

When `--dry-run` was passed, render the draft, state the classified destination
and kind, and **stop here** — do not call `AskUserQuestion` and do not file.

### Step 8: File

**First**, resolve the label. Never pass one that has not been confirmed to
exist:

```bash
gh label list --repo thomasholknielsen/claude-tweaks --limit 200
```

Pass `--label bug` for a defect or `--label enhancement` for a gap **only** when
that label is present in the output.

**Then** file, appending the resolved `--label` argument if and only if the
previous command confirmed it:

```bash
BODY_FILE=$(mktemp)
cat > "$BODY_FILE" <<'BODY'
<body>
BODY
gh issue create --repo thomasholknielsen/claude-tweaks \
  --title '<title>' \
  --body-file "$BODY_FILE"
```

Omit `--label` entirely otherwise and say
why — never substitute a guessed label, and never apply the repository's own
internal automation taxonomy (`by:*`, `type:*`, `risk:*`, `ready`, `effort:*`),
which belongs to records that moved through its in-repo pipeline.

On failure, do not silently drop the payload. Report the `gh` error verbatim,
write the drafted body to the run directory's `staged/` as
`upstream-unfiled-{N}.md` when a run directory exists — deliberately outside
the `staged/wrap-up-upstream-*.md` aggregation glob `review-console.md` and
`multispec-review-console.md` both scan, so a stop-and-resume never
re-enumerates a failed draft as a fresh upstream proposal — and tell the
user the filing did not happen and the draft is preserved. There is no
automatic retry for upstream filings.

### Step 9: Report

Give the user the created issue URL. If the flow stopped early — at Step 2 (not
a D5 learning), Step 3 (self-reference), Step 4 (duplicate), Step 6 (unscrubbable),
or Step 7 (declined or `--dry-run`) — report which step stopped it and why.
Nothing further is needed.

## Next Actions

Render one `AskUserQuestion` with options drawn from context: continue the
parent workflow, file a second related learning, or open the created issue.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:feedback` is running inside a
pipeline (invoked by `/claude-tweaks:wrap-up`, `/claude-tweaks:reflect`, or
another pipeline orchestrator). In that case omit the `## Next Actions` block —
the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when
ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

Being inside a pipeline never relaxes Steps 6 and 7. `auto` mode does not
silence this skill — see `_shared/auto-mode-contract.md`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Filing without showing the scrubbed draft | Publishing to a public repo is outward-facing and irreversible; confirmation is the contract, not a formality |
| Filing against a repo other than `thomasholknielsen/claude-tweaks` | Out of scope by design — a third-party owner has different consent requirements |
| Inferring the kind from tone rather than from which classifier rule fired | Defect and gap differ in triage; a mislabelled report wastes a maintainer's time in both directions |
| Applying a label `gh label list` did not confirm | Guessing risks importing the repo's internal automation taxonomy from outside its pipeline |
| Skipping the scrub because the reporting project "looks fine" | The scrub is unconditional; the cost of one leak exceeds the cost of every scrub |
| Filing when `git remote` shows claude-tweaks itself | Self-filing duplicates a record the project should hold directly |
