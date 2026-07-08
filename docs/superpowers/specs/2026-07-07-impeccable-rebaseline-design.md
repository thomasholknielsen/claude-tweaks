# Impeccable re-baseline and automatic hook integration — Design

## Problem

claude-tweaks' Impeccable integration (`skills/design/`, `/init` Step 0.9) was
built against Impeccable skill `3.0.6`. Current upstream is `3.9.1` — 210
commits and 10 skill releases later, including a CLI major version bump
(2.x → 3.0.0). Three concrete drifts fell out of that gap:

- `bootstrap-steps.md` Step 0.9 tells users to run
  `/impeccable:impeccable teach`, which is now a deprecated alias for
  `/impeccable:impeccable init`.
- `impeccable-cli.md` documents `--fast` as meaningfully skipping slow
  heuristic passes. It's now a no-op — the detector always full-scans.
  Harmless, but the stated rationale is false.
- `impeccable-cli.md`'s own "Open items" section says to
  *"re-validate sample output after every Impeccable major version bump."*
  The CLI just crossed one. That self-flagged trigger has fired and nothing
  has acted on it.

Separately — and unrelated to staleness — Impeccable shipped a genuinely new
capability after this wrapper was designed: an automatic hook
(`plugin/hooks/hooks.json`, `PostToolUse` on `Edit|Write|MultiEdit`) that runs
the anti-pattern detector inline during editing and surfaces findings via
Claude Code's native `additionalContext` channel, gated by a one-time
`/impeccable hooks on` consent. claude-tweaks has no story for this at all —
not offered during setup, not documented, not checked against known
interaction risks.

That hook has a worktree-specific correctness bug, confirmed by direct
experimentation (not tracked in any upstream issue): its per-developer
consent/cache files (`.impeccable/config.local.json`, `hook.cache.json`,
`hook.pending.json`) live in the working tree and are meant to be excluded
via `.git/info/exclude` rather than a committed `.gitignore`. That exclusion
mechanism does not follow a linked worktree's `commondir` indirection — it
writes to `<main>/.git/worktrees/<name>/info/exclude`, a path real git never
reads for that worktree. Practical effect: in every claude-tweaks worktree
(all of them, given the `worktree.always` policy), these files would surface
as untracked files in `git status`.

(A related bug, upstream issue #305 — the hook recreating `.impeccable/` on
non-UI edits with cache keyed to session cwd — is already fixed upstream in
PR #346, merged 2026-07-06. No action needed on that one beyond being on a
current version.)

## Solution

### Part A — Re-baseline

1. **`skills/init/bootstrap-steps.md` Step 0.9** — replace
   `/impeccable:impeccable teach` with `/impeccable:impeccable init` in the
   documented setup sequence. `/impeccable:impeccable document` is unchanged
   (that command wasn't renamed).

2. **`skills/init/bootstrap-steps.md` Step 0.4** (.gitignore suggestions) —
   add three explicit entries:
   ```
   .impeccable/config.local.json
   .impeccable/hook.cache.json
   .impeccable/hook.pending.json
   ```
   Never a blanket `.impeccable/` line — `.impeccable/config.json` is
   Impeccable's committed, shared team config. Blanket-ignoring the parent
   directory would make that file un-committable the same way a blanket
   `.claude-tweaks/` line once did to `.claude-tweaks/routines/*.yml` (see
   CLAUDE.md's existing Don't on this exact mistake). This entry is the
   load-bearing fix that makes Part B safe to recommend.

3. **`skills/design/impeccable-cli.md`** — correct the `--fast` flag's
   documented rationale (no-op as of CLI 3.x; full scan always runs) and add
   a version-stamp line ("Last verified against skill 3.9.1 / CLI 3.2.0") to
   close the file's own self-flagged open item. Full line-by-line JSON
   schema re-validation against the current detector happens at
   implementation time (see Testing section) — this design only commits to
   the correction and the stamp.

4. **`skills/design/command-map.md`** — add `/hooks <on|off|status>` as a new
   entry, categorized "Never (in flow) — manual, one-time enablement," the
   same bucket as `pin`/`unpin`. It is not dispatched by any wrapper mode.

### Part B — Hook integration

5. **`skills/init/bootstrap-steps.md` Step 0.9** — after the existing
   Full/Plugin-only/Skip prompt (and only when Impeccable was installed),
   add a separate follow-up offer:

   ```
   Enable Impeccable's automatic design hook? It runs the anti-pattern detector
   after every UI edit and surfaces findings inline — no slash command needed.

   Note: consent lives in the working tree, not .git/ — a fresh git worktree
   (via /build worktree or /flow worktree) won't have this enabled until you
   run /impeccable hooks on inside it again.

   1. Yes — run /impeccable hooks on (Recommended)
   2. Skip — enable later, or per-worktree, as needed
   ```

   This is a separate offer, not folded into the existing three-option
   prompt, because it's a materially different kind of decision (automatic
   runtime behavior during editing, vs. one-time context-file setup).

6. **`skills/build/worktree-setup.md`** — add an operational note: hook
   consent is per-worktree by design (Impeccable stores it in the working
   tree, not `.git/`), so a freshly created worktree starts with the hook
   off even if the main checkout has it enabled. This is documentation only
   — claude-tweaks does not auto-propagate Impeccable's consent state into
   new worktrees (see Out of scope).

## Out of scope (YAGNI)

- The five deeper-integration ideas surfaced earlier in this brainstorm
  (DESIGN.md refresh triggered from `/wrap-up`, persona unification between
  `/visual-review` and Impeccable's `personas.md`, a persisted `register:`
  spec-frontmatter field, Impeccable's `craft` driving `/build` directly,
  and revisiting the advisory-vs-blocking policy for `/design review`) — an
  explicit follow-up brainstorm, not part of this spec.
- Auto-copying Impeccable's hook consent/config into newly created worktrees.
  Documenting the per-worktree behavior is enough; automating it would
  create an ongoing dependency on Impeccable's internal config file shape
  for marginal convenience.
- Filing the worktree `.git/info/exclude` indirection bug with Impeccable's
  maintainers. Worth doing, but it's not a claude-tweaks deliverable — the
  `.gitignore` fix in Part A already neutralizes the practical impact
  regardless of whether upstream ever fixes their side.
- Rewriting `impeccable-cli.md`'s full JSON schema documentation. The
  defensive parsing rules already tolerate unknown/new fields from
  detector v2 (screenshot-based visual-contrast checks, etc.); this spec
  only commits to confirming compatibility and stamping the version, not a
  speculative rewrite of fields that may not have changed.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Scope | Two sub-projects in one spec (re-baseline + hook integration); the five broader integration-depth ideas deferred to a separate follow-up brainstorm |
| Hook adoption stance | Adopt now, with claude-tweaks fixing the worktree git-status leak itself, rather than waiting on upstream (which doesn't know the bug exists) or skipping the hook entirely |
| `.gitignore` fix shape | Explicit named entries, never a blanket `.impeccable/` line — `.impeccable/config.json` is committed/shared |
| Hook offer placement | Separate follow-up prompt in Step 0.9, not folded into the existing three-option install prompt |
| Per-worktree hook consent | Document only; do not auto-propagate consent state into new worktrees |
| `/hooks` command categorization | Same "Never (in flow) — manual, one-time" bucket as `pin`/`unpin` in `command-map.md` |

## Testing / verification approach

These are documentation/prose changes to skill markdown files — no unit
tests apply directly to the content itself. Verification for the
implementation plan:

1. Grep the touched files after editing to confirm no remaining
   recommendation of `/impeccable:impeccable teach` as the setup command
   (a "deprecated alias, still works" mention is fine if useful, but the
   documented sequence must use `init`).
2. Grep to confirm the new `.gitignore` suggestion lists the three specific
   files and never a blanket `.impeccable/` line.
3. Run `npm test` to confirm the existing suite passes unchanged (no code
   is touched by this spec, so this is a no-op check, but matches this
   project's standard verification discipline).
4. Manually re-read the new Step 0.9 hook-offer prompt against the existing
   three-option Impeccable install prompt in the same file for tone/format
   consistency (numbered options, **(Recommended)** marker convention).
5. As a separate, real fact-check (not a unit test): confirm the CLI sample
   invocation in `impeccable-cli.md` still produces output matching the
   documented schema shape by running `npx impeccable --version` and, if
   feasible, a sample `detect --json` call against a throwaway frontend
   file — this is the "re-validate after major version bump" step the file
   already asks for.
