# Backlog entry unification (one file per entry, drop legacy backstop) — Design

## Problem

The backlog-on-GitHub-issues feature and its follow-on simplification
(`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`,
`docs/superpowers/specs/2026-07-09-backlog-simplify-tidy-scope-routine-variants-design.md`)
already settled *which backend is active when* — `github-issues` is the default
whenever a GitHub remote exists, `local-files` remains available as a deliberate,
permanent choice (no remote, or an explicit manual override), and local files are
also the load-bearing fallback for transient GitHub failures (`/capture`'s write
failure path, `/tidy`'s Sync to GitHub action). None of that is revisited here.

What wasn't addressed is the *shape* of local storage itself, and it has two
concrete problems:

1. **Two files instead of one, mirroring a distinction GitHub already unified.**
   The GitHub side already treats "inbox" and "parked" as one object with a stage
   (`backlog` label + `parked` label present/absent), but the local side is still
   two separate files (`specs/INBOX.md`, `specs/DEFERRED.md`), two separate
   `/tidy` steps (1 and 1.5), and two separate classification tables — a
   structural difference the GitHub-issues design never had to invent.
2. **`DEFERRED.md` carries less structure than a `parked` GitHub issue.** Today's
   local DEFERRED entry is `**Deferred:** date | **From:** source | **Trigger:**
   condition` — no `Category` field (INBOX.md has one), and `Trigger` is always
   unstructured prose even when the trigger is objectively a date or a set of
   file paths, unlike the GitHub side's `Sync to GitHub` action, which already
   judges a trigger's type live (date → milestone-equivalent check, paths →
   `watchedPaths`, otherwise → prose).

Separately: `code-health:remembered` (`/tidy` Step 4.8a) is a one-time backstop
for issues filed before code-health's filing threshold changed to high-risk-only.
It's explicitly documented as "a one-time backstop, not a recurring behavior" —
we're dropping it rather than continuing to carry migration-compatibility logic
for a threshold change that's already old news.

## Solution

### A. One file per entry: `specs/backlog/{slug}.md`

Replace `specs/INBOX.md` and `specs/DEFERRED.md` with one file per entry in
`specs/backlog/`, flat (no `inbox/`/`parked/` subdirectories). This is a closer
mirror of the GitHub model than a shared file ever was — one GitHub issue is one
persistent, individually-addressable object; a section inside a shared markdown
file isn't. It also matches how `specs/` itself already works (one file per spec,
never all specs appended to one file).

Entry format:

```markdown
## [Short Title]

**Stage:** inbox | parked
**Added:** YYYY-MM-DD | **Category:** {product|technical|legal|infrastructure} | **Related:** (spec numbers or "none")

Context: 1-2 sentences on why this came up

Scope: Rough sense of what it might involve

<!-- parked-stage only, below -->
**From:** {source spec, or "none"}
**Trigger:** {a date, a comma-separated list of paths, or free prose}
**Options considered:** {optional}
```

`**Stage:**` flips in place when an entry is promoted from inbox to parked (or
back) — mirroring "add/remove the `parked` label," not "move the file." This
keeps the git diff to one changed line instead of a rename, and closes the
`Category`-field gap DEFERRED.md has today (every entry now carries it,
regardless of stage).

`Trigger` stays free-form text — the same `**Trigger:**` field DEFERRED.md
already has — but `/tidy`'s classification judges it the same live way the
GitHub side's `Sync to GitHub` action already does: parses as a date first
(milestone-equivalent check), then checks whether it names file paths (checked
against `git log`, same as `Sync to GitHub`'s `watchedPaths` handling), and
falls back to prose only when neither applies. This is a real rigor upgrade for
local-files projects — today's local DEFERRED classification is pure prose
judgment even when the trigger is objectively a date or a path.

The filename (slug) is the stable local handle — the local equivalent of a
GitHub issue number. No separate index file: unlike specs, backlog entries are
lightweight and short-lived (captured, then promoted, merged, or deleted within
weeks), so a directory glob is enough; maintaining an index would add write
overhead the entries' own lifecycle doesn't justify.

### B. `/tidy` Steps 1 + 1.5 collapse into one step

Read `specs/backlog/*.md` once, split entries by `**Stage:**` client-side —
the same "one query, split by stage" pattern Step 4.8's `repo-wide` scan
already uses for GitHub backlog issues. Apply the existing classification
tables unchanged (inbox: age-based Fresh/Review/Stale; parked: trigger-met/
not-met/no-trigger), just fed by the upgraded live trigger-type judgment from
Solution A.

### C. Drop `code-health:remembered` / Step 4.8a entirely

No relabeling backstop, no migration compatibility layer. Old low/medium-
severity code-health issues stay exactly as `code-health:low`/`code-health:medium`
with no distinguishing marker — indistinguishable from a freshly-filed one in
Step 4.8's "still valid" bucket. Accepted tradeoff, consistent with not carrying
migration scaffolding for a threshold change that's no longer current.

### D. No auto-migration; a throwaway script instead

No migration tooling ships in the plugin — existing `INBOX.md`/`DEFERRED.md`
content in any project is not automatically ported, matching the "no legacy
versions" decision in C. A separate, throwaway migration script (not part of
this plugin's shipped skills) is queued as a follow-up deliverable, to be
produced once this schema is final, so a specific other project's existing
INBOX/DEFERRED content can be ported by hand.

## Out of scope (YAGNI)

- **Revisiting backend-selection logic.** `backlog-backend: github-issues` vs.
  `local-files` — when each is active, and the manual-override path — is
  unchanged from `2026-07-09-backlog-simplify-tidy-scope-routine-variants-design.md`.
  This design only changes the *shape* of local storage, never which backend
  is active when.
- **An index file for `specs/backlog/`.** Entries are transient enough that a
  directory glob is sufficient; see Solution A.
- **Auto-migrating existing INBOX.md/DEFERRED.md content.** Explicitly rejected
  per Solution D — a throwaway script is a separate, later deliverable, not
  part of this design.

## Key decisions (from conversation)

| Decision | Choice |
|---|---|
| File structure | One file per entry (`specs/backlog/{slug}.md`), not a shared growing file |
| Stage representation | A `**Stage:**` field that flips in place, not a directory move |
| Index file | None — directory glob is sufficient given entries' short lifecycle |
| `code-health:remembered` | Dropped entirely, no legacy-migration backstop kept |
| Local trigger evaluation | Upgraded to the same live date/path/prose judgment the GitHub side already uses |
| Migration of existing local content | Not automated in-plugin; a throwaway one-off script is a queued follow-up, separate from this design |
| Backend-selection logic itself | Unchanged — out of scope, already decided in the prior backlog-simplification design |

## Testing / verification approach

1. Capture a fresh idea under `backlog-backend: local-files` — confirm it lands
   in `specs/backlog/{slug}.md` with `Stage: inbox` and all fields present.
2. Defer an INBOX-stage entry via `/tidy`'s Defer action — confirm the same
   file flips to `Stage: parked` in place (`git diff` shows one changed line,
   not a rename) and gains `From`/`Trigger`/`Options considered`.
3. Run `/tidy` (no `--scope`, or `--scope=inbox`) against a mix of inbox- and
   parked-stage entries — confirm both are read from one directory glob and
   classified per their existing tables, with a date-shaped `Trigger` correctly
   judged as met/not-met against today's date, and a path-shaped `Trigger`
   correctly checked against `git log`.
4. Confirm `/tidy` no longer performs the `code-health:remembered` relabeling
   pass (Step 4.8a) at all, against a repo with pre-threshold-change
   `code-health:low`/`code-health:medium` issues present.
