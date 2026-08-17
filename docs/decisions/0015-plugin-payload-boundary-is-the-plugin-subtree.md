# 0015. The plugin payload boundary is the `plugin/` subtree

- **Status:** accepted
- **Date:** 2026-08-17
- **Context:** #418 (the cutover build), executing the no-transition decision taken on #416

## Context

Until this change the repo root *was* the plugin. `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, and `bin/` sat at the top level, and the marketplace's `git` source cloned the entire ~14 MB repository — `tests/`, `evals/`, `docs/`, `perf/`, `tools/`, and full history included — into every user's plugin cache. None of it is reachable from a running skill; all of it was shipped.

The obvious fix — keep a manifest at the repo root that points into a `plugin/` subdirectory — was tried and does not work. `${CLAUDE_PLUGIN_ROOT}` resolves to **the directory containing the loaded manifest**, and does not follow a manifest's component-path fields into a subdirectory. A root manifest therefore hands every hook command, every `bin/` invocation, and every `_shared/` citation a root one level above the files they name, breaking roughly 365 payload-internal references at once — in installed builds, not merely locally. Three independent attempts at such a shim ended at the same wall. The premise is falsified, not awkward, and no amount of care in the shim's authoring recovers it.

What does work is a marketplace source that names the subdirectory itself. Under a `git-subdir` source the subtree root *becomes* the cache root: Probe 1 installed a fixture with `"path": "plugin"` and found `.claude-plugin/`, `bin/`, `hooks/`, and `skills/` directly under the version directory, no `plugin/` level anywhere in the path, and a `SessionStart` hook resolving `${CLAUDE_PLUGIN_ROOT}` to that subtree root. The `${CLAUDE_PLUGIN_ROOT}`-relative references are consequently **not** rewritten by this cutover — they resolve unchanged. That is the half of the original premise that survived; the falsified half was the shim's whole-repo-clone case only.

One mechanism is worth stating precisely, because the natural description of it is wrong. The install does perform a genuine partial clone (`git clone --filter=tree:0 --no-checkout`, then `git sparse-checkout set --cone -- <path>`), and that partial clone is the bandwidth win: trees and blobs outside the cone are never fetched. But cone-mode sparse-checkout always materializes top-level files, so the transient clone still contains the repo-root `README.md`. **Root content is excluded from the install by the copy step, not by sparse-checkout** — only `<clone>/<path>` is copied into the plugin cache, which is why the cache holds no `README.md` and no `.git`. Root files are excluded because they are outside `path`, and that holds regardless of sparse-checkout semantics (Probe 1 §6, §5).

## Decision

**The plugin payload is the `plugin/` subtree, and nothing else in this repo ships.** The catalog entry is a `git-subdir` source — `{"source": "git-subdir", "url": …, "path": "plugin", "sha": <release commit>}` — re-pinned to the release commit by `plugin/bin/lib/release/mirror.js` on every release, carrying no entry-level `version` field: the payload's own `plugin.json` is the single version authority, and a duplicate in the catalog can only drift.

The move ships as a **single-release atomic cutover** (#416). No root manifest, no shim, no synced root copy, no transition window, no grace machinery. Installs are per-version cached snapshots, so an already-installed build is untouched by anything the repo does to its own layout; the only exposure is an *update attempt* made against a stale catalog, in the seconds-to-minutes before the mirrored catalog refreshes.

`PLUGIN_SNAPSHOT_DIRS` in `evals/runner.js` is **not** this boundary and never was. It is the eval harness's fixture-snapshot list — the directories a skill invocation needs copied into a throwaway tmpdir — and it now carries a `plugin/` prefix because those files moved, not because it defines what ships. Documentation citing it as the payload definition (ADR-0011, `docs/skill-graph.md`, `docs/plugin-structure.md`) cites this record instead.

## Alternatives considered

- **Root-manifest shim, transitioning to `git-subdir` later** — the original design on this issue, and the reason it sat open. Rejected on evidence: `${CLAUDE_PLUGIN_ROOT}` does not follow component paths into a subdirectory, so the shim breaks ~365 references for installed builds. Falsified by three independent attempts.
- **Keep a synced copy of the payload at the root for a release or two** — the textbook expand-contract shape. Rejected: two live copies of ~365-reference payload is exactly the drift this project's own convention warns about, and the contract step depends on a wait nothing can observe. The per-version cache makes the wait unnecessary anyway.
- **Leave the payload at the root and accept the ~14 MB clone** — free, and the status quo. Rejected: it ships `tests/`, `evals/`, and history to every user forever, and forecloses the monorepo-shaped layout the rest of the repo already wants.
- **Pin the catalog entry by `ref` rather than `sha`** — simpler to write and self-updating. Rejected: `ref` follows a moving branch, so an install resolves whatever `main` holds at install time rather than the commit released. Both fields were verified discriminating in Probe 1; `sha` is the one that makes a release reproducible.

## Consequences

**The accepted exposure, and its measured shape.** A stale or wrong catalog entry makes an *update attempt* fail loudly: Probe 2 broke the entry four ways — nonexistent commit SHA, nonexistent subdirectory, unreachable repository, and a break landed while a real version bump was pending — and every attempt exited non-zero with a message naming the specific defect. No silent fallback to another ref, no stale cache passed off as fresh, no partial version directory left behind, and the cached install byte-identical throughout. That is the exposure #416 accepted, and it is well evidenced.

One observation is recorded against it rather than smoothed over: **once, and unreproducibly, the plugin stopped loading entirely** — dropped from `claude plugin list`, hooks silently not firing — while its files stayed byte-perfect. Three targeted reproduction attempts were all negative, the cause is unexplained, and recovery was one command (`claude plugin install <name>@<marketplace> --scope <scope>`). Full account in `probe-2-findings.md` §11.4. This is a recorded exposure, not a change of decision: byte-level intactness and loud failure are strongly supported; "keeps loading" is stated with the exception attached rather than as a guarantee.

**This repo's history now straddles a boundary.** Every commit before the cutover carries the manifest at `.claude-plugin/plugin.json`, every commit after at `plugin/.claude-plugin/plugin.json`. Working-tree reads only ever see the new path, but anything reading a manifest at an arbitrary historical ref — the release pre-check, the version-bump walk, the post-commit release nudge — would otherwise report a pre-cutover commit as having never shipped a version. `plugin/bin/lib/manifest-path.js` owns that two-path resolution; it is a permanent property of the history, not a transitional shim.

**Reversibility.** Moving back is mechanically a `git mv` plus a catalog edit, but it would re-ship the whole repo to every user and re-break the manifest-path history in the other direction. The decision is hard to reverse in the sense that matters: the reasons for it do not expire.

Revisit if the CLI ever teaches `${CLAUDE_PLUGIN_ROOT}` to follow component paths (the shim becomes possible, though no longer needed), or if a reproducible mechanism is found for the §11.4 deregistration — at which point it becomes an upstream report rather than a recorded caveat.
