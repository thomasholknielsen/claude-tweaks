# Init Argument Handling — Enhancement Scopes, Combinability & Bootstrap-State Versioning — Design

## Problem

`/claude-tweaks:init --routines` was run against a real project. `--routines` isn't one of
`/init`'s recognized scope keywords (`bootstrap`, `config`, `skills`, `journeys`, `docs`) or
modifier flags (`--update`, `--full`, `--core-only`), so it silently fell through to the
"free-text project description" branch of the `## Input` section — the invocation ran Phase 0
with an ad hoc "focus on routine setup" reading of the string, then stopped normally at the
Scope Selection Gate. Nothing told the user the flag wasn't recognized.

Digging into why `--routines` had no natural home surfaced four separate, related gaps:

1. **Optional Enhancements are all-or-nothing.** Phase 0's Steps 9-16 (GitHub issue form,
   Impeccable, diagram suggestions, shadcn, Cloud/Routine parity, Routine installation,
   non-default-branch tracking, work-record backend) are either all offered, or none
   (`--core-only`). There is no way to ask for just one — e.g. "I only want the routine
   installation step" — without wading through every other optional prompt first.
2. **Unrecognized tokens silently degrade instead of being flagged.** This is inconsistent with
   an existing, established convention elsewhere in this plugin: `/tidy`'s "Unknown scope
   name — stop before dispatching anything and report the invalid name(s)," `/capture`'s
   "Unknown or invalid `N` — stop before writing or closing anything and report," and
   `/version`'s "not silently treated as any of the documented modes — state plainly that the
   argument wasn't recognized." `/init`'s own `## Input` section has no equivalent rule.
3. **Steps 1-8 (Core Bootstrap) re-verify from scratch on every invocation**, even on a project
   that was fully bootstrapped, unchanged, under the exact same plugin version, moments ago.
   Each step is individually idempotent (skips already-done work) but still costs a real tool
   call per step to confirm that.
4. **No version-awareness.** `/init` has no way to know a project was last configured under an
   older claude-tweaks version, so it can't tell the user what's changed since then — even
   though the project already maintains a per-release `CHANGELOG.md` that would support this.

## Design

### 1. Enhancement filter tokens

Introduce a set of **enhancement filter tokens** — one per Optional Enhancement step, including
Steps 13 and 14 individually (see Section 2 for why they are not bundled) — that narrow which
of Steps 9-16 Phase 0 offers:

- No filter tokens present → unchanged: Phase 0 offers all 8, or none under `--core-only`.
- One or more filter tokens present → Phase 0 offers *only* the named step(s), regardless of
  whether a goal-based Phase scope (`config`, `skills`, etc.) is also present.
- An explicit filter token together with `--core-only` is a contradiction (one says "only
  this," the other says "none") — handled by the same stop-and-report rule as Section 4 below,
  not silently resolved either way.

This reframes the fix from "add N new top-level scopes" to "teach the existing
Optional-Enhancements gate to accept a whitelist" — it composes for free with everything
`## Input` already documents (`--core-only`, goal-based scopes, `--full`, `--update`).

### 2. Token names

One token per Optional Enhancement step. Reuses the exact CLAUDE.md flag-key name where one
already exists (Steps 10, 11, 12, 16), for grep-consistency with what later shows up in a
project's own CLAUDE.md.

| Token | Maps to | Notes |
|---|---|---|
| `issue-form` | Step 9 — GitHub issue form template | No existing flag key; descriptive name |
| `design-integration` | Step 10 — Impeccable | Matches the flag Step 10 already writes |
| `diagram-suggestions` | Step 11 — Diagram suggestions | Matches the flag Step 11 already writes |
| `shadcn-integration` | Step 12 — shadcn bootstrap | Matches the flag Step 12 already writes |
| `cloud-parity` | Step 13 — Cloud/Routine Parity Setup, alone | Plugin declarations for cloud sessions, `scripts/claude-cloud-setup.sh`, the `## Cloud parity` CLAUDE.md section — independent of whether any Routine is ever created |
| `routines` | Step 14 — Routine Installation, alone | Discovers/installs routine templates. Hard-depends on Step 13 having run (a Routine created before cloud parity is declared silently fails its first cloud firing) — if `cloud-parity` wasn't also selected (or already configured from an earlier run), selecting `routines` alone silently forces Step 13 to run first anyway, exactly as the full unfiltered flow already orders 13 before 14 today |
| `branch-tracking` | Step 15 — Non-default-branch issue tracking | No existing flag key; descriptive name |
| `work-backend` | Step 16 — Work-record backend | Matches the flag Step 16 already writes |

`cloud-parity` and `routines` are kept as two separate tokens rather than one bundled
`routines` token — cloud/plugin parity for a project's cloud sessions is a real, standalone
thing to want (e.g. "make sure cloud sessions have the same plugins" with zero interest in
scheduling any Routine), and collapsing them would re-hide that distinction the same way the
original `--routines` complaint hid it. Selecting `cloud-parity routines` together is
redundant but harmless — the same net effect as `routines` alone forcing Step 13 in.

Selecting `routines` (or any Enhancement token whose step depends on an earlier one, should a
future step introduce the same kind of ordering dependency Step 13/14 already has) always
silently satisfies that dependency first — this is not a user-facing choice, it mirrors how
the unfiltered Optional Enhancements flow already orders Step 13 before Step 14 unconditionally
today.

### 3. Parsing & combinability

`$ARGUMENTS` splits on whitespace into tokens, unless the whole string resolves as a path or a
GitHub URL (unchanged from today — that branch is evaluated first, before token-splitting).
Each token then classifies as one of:

- A **modifier flag**: `--update`, `--full`, `--core-only`
- A **Phase scope**: `bootstrap`, `config`, `skills`, `journeys`, `docs`, `update`
- An **Enhancement filter token**: the 8 from Section 2

Multiple Phase-scope and/or Enhancement tokens may appear together in one invocation. Net
effect: Phase 0 offers the *union* of any named Enhancement tokens (or everything, if none
given; or nothing, under `--core-only`), then the *union* of any named Phase scopes' phases
runs afterward — or nothing further (stop after Phase 0, matching `bootstrap`'s existing
stop-after-Phase-0 semantics) if no Phase scope was given. `bootstrap` combined with one or
more Enhancement tokens is redundant but harmless (same net effect as the Enhancement token(s)
alone, since the default with no Phase scope present is already "stop after Phase 0").

Examples:

- `routines` → Steps 1-8, then only Steps 13+14 (13 forced in), then stop.
- `config routines` → Steps 1-8, then only Steps 13+14, then Phases 2, 3, 5.
- `shadcn-integration branch-tracking` → Steps 1-8, then only Steps 12 and 15, then stop.
- `routines --core-only` → contradiction, see Section 4.

### 4. Unknown-token clarification

If every token classifies into one of the three categories above, proceed as described. If a
token matches none of them, and the overall `$ARGUMENTS` string doesn't read as prose (no
commas, not multiple natural-language connector words) — stop before running anything and call
`AskUserQuestion`: name the unrecognized token(s) specifically, list the valid scope/flag
keywords (grouped: modifier flags / Phase scopes / Enhancement tokens), and include an explicit
"No — treat this literally as a project-context description" option, so a genuine single-word
description (e.g. "monorepo") still works, at the cost of one confirmation click instead of a
silent guess either way.

A string that *does* read as prose (commas present, or multiple words with the shape of a
sentence, e.g. "Ruby on Rails monolith, team of 5") is treated as a description with no
interruption, exactly as today — this rule only changes behavior for single tokens or
short token sequences that look like an attempted (but unmatched) keyword.

This mirrors three existing precedents in this plugin: `/tidy`'s "Unknown scope name — stop
... and report," `/capture`'s "Unknown or invalid `N` — stop ... instead of guessing a fallback
route," and `/version`'s "not silently treated as any of the documented modes." `/init` adopts
the same posture instead of being the one skill in the plugin that silently guesses.

The `--core-only` + explicit-Enhancement-token contradiction (Section 1) is reported the same
way: state plainly that the two conflict, and ask which was actually meant, rather than
silently letting one win.

### 5. Bootstrap state marker + version-gap changelog notice

A new local, gitignored state file, `.claude-tweaks/init-state.yml` — joins the same
"transient local claude-tweaks state" list Step 4 already suggests for the health-skill
caches, since this is about avoiding redundant tool calls on this machine's next run, not
team-shared policy:

```yaml
core-bootstrap:
  plugin-version: "6.21.0"
  verified: "2026-07-29"
```

`verified` is informational only — surfaced in the skip/re-verify messaging (e.g. "Core
bootstrap already verified at v6.21.0 on 2026-07-29 — skipping Steps 1-8") so a user can see
how stale the last check was. It plays no role in the skip decision itself, which is driven
entirely by the version comparison below.

Every `/init` invocation, regardless of scope, checks this file before running Steps 1-8,
comparing its `plugin-version` against `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`'s
`version` field — the same field `/claude-tweaks:version` already treats as the sole source of
truth. This check is independent of `--full`/`--update` — those modifiers govern Phases 2-8.5's
reconnaissance depth and mode, not Core Bootstrap, so they don't force a Steps 1-8 re-run on
their own; a version mismatch is the only thing that does.

| Marker state | Action |
|---|---|
| Missing entirely — first-ever `/init` run, **or** a pre-existing claude-tweaks project upgrading to the plugin version that introduces this marker | Run Steps 1-8 fully (as today), then write the marker with the current version. No changelog notice — there is nothing to diff against yet. |
| Present, recorded version matches installed version | Skip Steps 1-8 entirely — print one line confirming this, no per-step re-verification. |
| Present, recorded version differs from installed version | Re-run Steps 1-8 fully (a newer plugin may have changed Core Bootstrap logic), update the marker to the new version, **and** surface the changelog notice below. |

**Changelog notice.** Reuses the project's existing root `CHANGELOG.md` (already maintained
per-release, one `## v{X.Y.Z} — {title}` section per version) rather than inventing a second
data source. On a version-differs hit, read the entries between the marker's old recorded
version and the newly-installed version (exclusive of the old version, inclusive of the new),
and synthesize a short summary filtered to entries that change what `/init` offers, writes to
CLAUDE.md, or exposes as a scope/config key — internal-only entries (bug fixes, refactors with
no user-visible `/init` behavior change) are omitted from the summary. Presented as an
informational note, not a gate, ending with a pointer to `/init update --full` (or a narrower
scope) if the user wants to act on anything it surfaces. No silent cap on how large a version
range this covers — if the gap spans an unusually large number of releases, say so explicitly
rather than truncating quietly.

### 6. Documentation updates

- `skills/init/SKILL.md`'s `## Input` section is restructured into three labeled groups
  (modifier flags / Phase scopes / Enhancement filter tokens) instead of one flat bulleted
  list, followed by the parsing/combinability/clarification rules from Sections 3-4.
- `argument-hint` in the frontmatter is regenerated to match the restructured `## Input`
  section, per this repo's own frontmatter convention ("Keep it in sync when `## Input`
  changes").
- The Phase 0 section's "Optional Enhancements (Steps 9-16)" preamble gains one line pointing
  at the `## Input` section's Enhancement-token table instead of restating it, matching how
  `--core-only` is already referenced there today.
- A new short subsection documents the `.claude-tweaks/init-state.yml` marker and its role in
  both the Steps 1-8 skip and the changelog notice, near the existing "Finalizing the
  worktree.always Decision" subsection (both are end-of-Phase-0 bookkeeping concerns).
- `bootstrap-steps.md`'s Step 4 `.gitignore` suggestion block gains
  `.claude-tweaks/init-state.yml` alongside the existing health-skill cache entries.

## Out of scope

- **Fuzzy/synonym matching** for a near-miss token name (e.g. a user typing `impeccable`
  instead of `design-integration`). The stop-and-ask clarification (Section 4) already handles
  this safely at the cost of one extra round trip; a fuzzy-matching layer is not worth the
  added complexity for a rare case.
- **Extending combinability to the free-text path/URL/description branches** — e.g. combining
  an explicit path argument with a scope token in the same invocation. That ambiguity predates
  this design and isn't introduced or worsened by it; leaving it alone.
- **Retrofitting Update Mode's existing Phase 1u/1u.5 contract-drift detection.** The
  changelog notice (Section 5) is a separate, additive signal surfaced at Phase 0 — it does
  not replace or merge with the structural drift markers Update Mode already checks.

## Risks / open considerations for the implementation plan

- Extracting the CHANGELOG.md entry range between two versions needs a semver comparison
  (major.minor.patch ordering) and a parse of `## v{X.Y.Z} — {title}` headers. `/version`'s own
  `--min` comparison (SKILL.md Step 2.5) is prose-driven, not a shared code helper — the plan
  should decide whether this reuses that same prose-driven approach or is worth a small
  deterministic helper (e.g. `bin/lib/changelog.js`) given the added responsibility of
  extracting a range, not just a single boolean comparison.
- A pre-existing claude-tweaks project that predates this marker will show "missing entirely"
  on its first run after upgrading to the plugin version that introduces it — this is expected
  and handled (see Section 5's table), not an error state, but should be called out clearly in
  the implementation so a task doesn't misdiagnose it as a bug.
