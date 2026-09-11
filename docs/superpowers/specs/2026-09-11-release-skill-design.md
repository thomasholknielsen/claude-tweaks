# Design: `/claude-tweaks:release` — a consumer-facing release driver

Date: 2026-09-11
Status: approved in brainstorm, pending `/claude-tweaks:specify` decomposition

## Summary

claude-tweaks ships no release skill. The only release tooling is `plugin/bin/release.js`, a maintainer script hardcoded to this repo (marketplace mirror, `docs/shipped-versions.tsv`, this repo's CHANGELOG heading grammar) that nevertheless ships in the plugin payload. Consumers get a "Cut the release" Next Action row in `flow/summary-template.md:96` that has nothing to hand off to, and `/init`'s workflow detection (`init/detection-tables.md:102`, "Release process (semantic-release, changesets, manual tags)") detects release tooling and writes the result nowhere.

This design adds a `/claude-tweaks:release` skill that **drives** a release rather than implementing one. The engine is release-please for GitHub-backed projects and a small plugin-owned CLI for no-forge projects. The plugin's leverage is what the engine cannot know: which work records shipped, the pre-release whole-branch review, the version-collision and CI gates, and the post-release bookkeeping on records. This repo migrates to the same process and becomes the first consumer.

## Decisions (stances the plugin asserts)

These are asserted in every consuming project, with conflict detection rather than deference — the `#187` ruling: opinions are the product; the failure to design against is two conventions in one repo.

1. **Version of record is an annotated `vX.Y.Z` git tag plus a GitHub Release (pr-first) or the tag alone (local-merge).** Semver. Manifest files follow the tag, never the reverse. "Which release carried this merge" is `git describe --contains {sha}`, in every ecosystem, replacing `release.js status`'s bump-commit walk.
2. **Conventional Commits on the integration branch, written by the plugin at merge time.** Humans and subagents write free-form commits on feature branches. The plugin already sets the merge subject on both paths (`_shared/pr-first-merge.md:276,310` `-t … -b …`; `_shared/local-merge-auto-finish.md:114` `-m`), so the conventional subject is a one-line change per path, derived from the work record:
   - `type:feature` → `feat`, `type:bug` → `fix`, `type:task` → `chore`
   - new `breaking` label → `!` suffix plus a `BREAKING CHANGE:` footer carrying the record's stated migration note
   - subject `{type}: {record title} (#N)`; body: the record's one-line summary
3. **pr-first merges squash; local-merge stays `--no-ff`.** release-please reads every commit reachable since the last tag, not first-parent, so a branch commit that happens to look conventional would become its own changelog bullet and could nudge the bump. Squash makes main one conventional commit per PR. The local engine reads `--first-parent`, so `--no-ff` is safe there. Cost lands in reconcile, not in release: `prune-remote.js:68` skips a branch that is not cherry-equivalent, and squash commits have different patch ids than the branch commits, so remote pruning would silently stop. Phase 2 re-examines this.
4. **Engine follows `integration-model`; no new engine key.** `pr-first` → release-please. `local-merge` → `bin/release-local.js`. Both emit byte-compatible artifacts (same tag scheme, same CHANGELOG grammar, same manifest handling) so a project can move between models with no format boundary in its CHANGELOG.
5. **CHANGELOG grammar is release-please's**, not Keep-a-Changelog and not this repo's `## v{version} — {summary}`: `## [6.122.0](compare-url) (2026-09-12)` with `### ⚠ BREAKING CHANGES`, `### Features`, `### Bug Fixes` sections and one bullet per conventional commit (`* subject ([#N](pr-url)) ([sha](commit-url))`). Chosen because the pr-first engine emits it and the local engine can be pinned to it by fixture.
6. **Publish and deploy are a project hook, never the plugin's job.** pr-first: a workflow on `release: published` (`npm publish`, marketplace mirror, deploy). local-merge: the `release-hook` policy command, run after the tag. The skill asserts where the hook lives and verifies it ran; it never holds registry credentials or deploy logic.
7. **Existing release automation is a conflict, not a wrap target.** Detection reuses `_shared/existing-convention-detection.md` (glob → floor → parse → `plugin` / `project` / `conflict`). semantic-release, changesets, or a foreign release-please config yield `conflict`; bootstrap refuses and reports. Rationale: driving a second engine is exactly the mixing failure; supporting N engines is a product the plugin does not want.
8. **The whole-branch review runs before the bump on every path, including the unattended train.** `[IL-97]` (v6.48.0 → v6.48.1: a Critical found twenty minutes after the release it should have blocked) is the reason `docs/releasing.md:5` exists. A train that skipped it would reintroduce that failure at higher frequency.
9. **Cadence: three tiers, all built, policy selects.** On demand (default), suggested from wrap-up/flow Next Actions, and an unattended release train gated by the existing `autonomy` ceiling rather than a new lever. The train merges minor and patch only; a major bump (a `breaking` record reached main) always waits for a human.
10. **Supported backends are the two the plugin already has.** `pr-first` (GitHub via gh or MCP) and `local-merge` (no forge). No GitLab/Bitbucket tier is introduced — nothing else in the plugin has one.

## Non-goals

- Implementing registry publishers or deploy steps (stance 6).
- Wrapping semantic-release / changesets / goreleaser as alternative engines (stance 7).
- A second-forge tier (stance 10).
- Rewriting this repo's historical CHANGELOG entries into the new grammar. The switch point is a deliberate one-time boundary; pre-boundary entries keep their heading form and the tag-to-CHANGELOG test only asserts headings at or after the bootstrap version.
- Enriching release notes beyond what the conventional subject carries. The GitHub Release links each PR; the record body is one click away. Revisit only if consumers ask.

## Policy keys (both `bin/lib/policy-schema.js`, non-core tier, `_shared/policy-schema.md` table row each)

| Key | Type | Default | Read by |
|---|---|---|---|
| `release-hook` | string (command) | unset | `bin/release-local.js` after the tag; ignored under `pr-first` (the `release: published` workflow is the hook there) |
| `release-train` | bool | `false` | `/release --train`; honored only when `autonomy` resolves `unattended`, else the run logs `train: refused — autonomy {value}` and behaves as on-demand |

Naming per `_shared/policy-key-naming.md` (flat kebab-case). Neither is a Manifesto lever, so `auto-mode-contract.md`'s five-site checklist does not apply. `core` tier stays at 8 of 12.

## Phase 1 — Merge-time conventional subject and the `breaking` label

**Deliverables**

- `_shared/pr-first-merge.md`: both `gh pr merge` sites (`:276`, `:310`) switch `--merge` to `--squash`; `-t` becomes the conventional subject, `-b` the body, composed by a new `bin/lib/release/subject.js` (`composeSubject({type, title, number, breaking, summary, migrationNote})` → `{title, body}`) with the mapping in stance 2. `tidy/SKILL.md` Step 7.5's creation-time `--auto` arm inherits the change through the same file.
- `_shared/local-merge-auto-finish.md:114` and the wrap-up `git merge --no-ff {branch} -m "[{tag}] …"` site: same composer, same subject.
- The `breaking` label: a new **Compatibility** row in `_shared/work-record.md`'s label taxonomy table (`breaking` | no label) with its code twin in `bin/lib/issues/record.js`'s facets, so the composer reads type and breaking through the same facet accessor that already abstracts `work-types: labels` (`type:*` label) from `work-types: native` (GitHub Issue Type); stamped by `/specify` shaping mode when the spec's acceptance criteria name a contract change (the CLAUDE.md expand-contract discipline already forces the spec to say so), and settable by hand. Headless shaping never infers it — absent label means not breaking; a missed breaking change surfaces at the release console as a minor bump the human can override with `Release-As:`.
- `bin/lib/release/subject.js` unit tests: each type mapping, `!` and footer on breaking, title truncation at 72 chars with the `(#N)` suffix preserved.

**Acceptance**

- A pr-first merge of a `type:feature` record #N lands on main as exactly one commit whose subject is `feat: {title} (#N)`; `git log --first-parent -1 --format=%s` proves it in the integration test fixture.
- A `breaking`-labelled record's merge subject is `feat!: …` and its body ends with `BREAKING CHANGE: {note}`.

## Phase 2 — Reconcile under squash

**Deliverables**

- `bin/lib/reconcile/prune-remote.js` and `archive-branches.js`: `isCherryEquivalent` remains the proof for merge-commit history but is no longer required when the PR-state screen (`resolvePrStatesBulk`) returns `MERGED` for the branch's PR **and** the merge commit on the integration branch carries the branch's `(#N)` subject suffix. Squash merges satisfy the second signal; the first-parent subject check replaces patch-id equivalence as the content proof.
- `decideRemotePrune` gains a `squashMerged` input; `not-cherry-equivalent` becomes `not-proven-merged` and is emitted only when neither proof holds.
- `docs/reconcile-checks.md` updated; `tests/bin-lib/reconcile/` fixtures gain a squash-merged branch case for both checks.

**Acceptance**

- Fixture: a branch squash-merged via PR #N is pruned; the same branch with no merged PR and no matching subject is skipped with `not-proven-merged`.
- Existing merge-commit fixtures pass unchanged.

## Phase 3 — Init bootstrap and detection

**Deliverables**

- `init/detection-tables.md:102`'s release-process row gets a destination: a `release` entry in the Step 2e findings, resolved through `_shared/existing-convention-detection.md` with globs for `release-please-config.json`, `.releaserc*`, `release.config.*`, `.changeset/`, `.goreleaser.*`, and `v*` tags.
- New `init/bootstrap/step-21-release.md` (after `step-20-integration-model.md`, which it depends on): on `plugin` (nothing found) or an already-plugin-shaped config, write
  - `.github/workflows/release-please.yml` (`googleapis/release-please-action`, pinned major, `contents: write` + `pull-requests: write`) — pr-first only
  - `release-please-config.json` with `release-type` from the stack table (`node`, `python`, `rust`, `go`, `java`, `ruby`, `php`, `dotnet`, else `simple` with `extra-files` naming the manifest and its JSON/regex path — this repo: `plugin/.claude-plugin/plugin.json` `$.version`), `bump-minor-pre-major: false`, `include-component-in-tag: false`
  - `.release-please-manifest.json` seeded from the newest `v*` tag, else the manifest version, else `0.1.0`
  - `release-hook` and `release-train` rows in `.claude-tweaks/policy.yml` (commented defaults), via the isolated-worktree write procedure `init/worktree-policy-finalization.md:17` already uses
  - On `conflict`: write nothing, report the found tool and its evidence path, and record `release: conflict — {tool}` in the init summary. Re-running init with the tool removed clears it.
- `init/claude-md-template.md` gains a `## Releasing` section: the engine in use, the hook location, and the one-line invocation.

**Acceptance**

- A fresh Node repo with no release tooling ends init with the three files present, `release-type: node`, manifest `0.1.0`.
- A repo with `.changeset/` ends init with none of the three files and the conflict line in the summary.
- This repo's own init run (Phase 8) chooses `simple` with the plugin.json extra-file.

## Phase 4 — The local engine `bin/release-local.js`

**Deliverables**

- `bin/release-local.js` + `bin/lib/release-local/`: `run(argv, deps)` seam per `gh-api-module-pattern`'s CLI wrapper contract.
  - `commits.js`: `git log --first-parent {lastTag}..HEAD` parsed with a conventional-commit header regex (`^(\w+)(\([^)]*\))?(!)?: (.+)$`) plus `BREAKING CHANGE:` footer detection; unparseable subjects are reported as `unconventional` in the plan, never silently dropped (`parse-signal-discipline`).
  - `bump.js`: `!`/footer → major, any `feat` → minor, else `fix` → patch; only `chore`/`docs`/etc. → `none`, exit 3 (nothing to release).
  - `manifest.js`: the same stack table as Phase 3 (package.json `version`, pyproject `[project].version` / `[tool.poetry].version`, Cargo.toml `[package].version`, `simple` extra-files JSON path or regex). Byte-preserving edits — only the version token changes.
  - `changelog.js`: prepends a section in stance 5's grammar; compare URL from `origin` when it parses as a GitHub remote, else omitted; no PR links under local-merge (there are none).
  - Reused from `bin/lib/release/`: `precheck.js` (collision across origin, local integration branch, sibling worktrees, plan claims — now against tags, not the tsv), `run.js`'s clean-tree/branch guard and the fetch → ancestry re-check → push ordering.
  - Sequence: guard → plan → (`--dry-run` prints plan, exit 0) → manifest + CHANGELOG edit → one commit `chore(release): v{version}` → `git tag -a v{version} -m "v{version}"` → push branch and tag (skipped when no `origin`) → `release-hook` if set, exit code surfaced as the CLI's own.
  - Exit vocabulary: 0 released, 1 git/engine failure (nothing written or a named partial state with recovery text, per `run.js:67-74`'s "do NOT re-run" pattern), 2 usage, 3 nothing to release, 4 collision, 5 hook failed after the tag landed.
- **Grammar pin:** `tests/bin-lib/release-local/changelog-fixture.test.js` holds a real release-please-generated CHANGELOG section as a fixture and asserts the local engine reproduces it byte-for-byte from the equivalent commit list (excluding PR links). This is the mechanism behind stance 4.

**Acceptance**

- On a fixture repo with `v1.2.0` tagged and two `fix:` commits plus one `feat:` since: `--dry-run` reports `1.3.0`, three bullets, no hook; the live run lands the commit, the tag, and the hook output, and `git describe --contains HEAD` prints `v1.3.0`.
- A history with only `chore:` commits exits 3 and writes nothing.

## Phase 5 — The `/claude-tweaks:release` skill

`plugin/skills/release/SKILL.md` per `docs/skill-authoring.md`'s 8-part structure; sub-files lazy-loaded per step.

**Input** (`argument-hint` in sync): none | `--dry-run` | `--train` | `--as {version}` (the `Release-As:` override).

**Steps**

1. **Preflight fact pack** — `bin/release-preflight.js` per `run-directory-fact-packs` (`{ok, value|error}` envelope per field, 0/2/3 exits): `engine` (from `integration-model`), `lastTag`, `unreleased` (first-parent commits since it, with the conventional parse of each), `proposedVersion`, `releasePr` (pr-first: the open release-please PR's number/state/mergeable, or `none`), `ciTip` (checks on the integration tip), `openReleasePrConflict` (a human-edited release PR), `hook` (workflow file present / `release-hook` set). Written to `$PIPELINE_RUN_DIR/release-preflight.json` when a run dir exists, else the scratch dir.
2. **Nothing to release** → report and stop (exit 3 path). No console.
3. **Whole-branch review** — invoke `/claude-tweaks:review` with base `{lastTag}` and the full first-parent diff. Findings stage per `_shared/staged-patch.md`; any `Critical`/`High` marks the run `review: blocking`.
4. **Console** — one table: records shipped (from the `(#N)` suffixes, joined to record titles/types), the proposed bump and why (which commit drove it), the review verdict, the hook status, and the two overrides (`--as`, `--allow-blocking` for a human who has read the finding). Auto mode: rendered read-only then proceeds, except `review: blocking` and a major bump, which are HARD-GATEs and stop regardless.
5. **Execute** — pr-first: `gh pr merge {releasePr} --squash` (the release PR's own subject is release-please's `chore(main): release X.Y.Z`; squash is fine); if `--as` was given, push a `Release-As: {version}` empty commit first and wait for release-please to re-render the PR (bounded poll). local-merge: `node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js" [--dry-run] [--as]`.
6. **Verify** — tag exists on origin (`git ls-remote --tags`), GitHub Release exists (pr-first), the `release: published` workflow / `release-hook` concluded successfully (bounded poll on the workflow run). Any miss is reported as a named partial state with the recovery command, never as a clean release.
7. **Bookkeeping** — for each record in the shipped set: comment `Shipped in v{version}` with the Release URL and close it if still open (pr-first; through `_shared/github-write-transport.md` so MCP-only sandboxes work). local-merge with local records: append `shipped: v{version}` to the record file. Logged per `_shared/auto-decision-log.md`.
8. **Next Actions** — `/claude-tweaks:backlog overview` (recommended), `/claude-tweaks:help`.

**`--train`** — Step 4's console is never interactive; a major bump or `review: blocking` stages a `release-held.md` in the run dir and exits 0 with `HELD` in the summary; everything else proceeds to Step 5 without a click. Refused unless `release-train: true` and `autonomy: unattended`.

**Component-Skill Contract** — parents: `/wrap-up` (suggested tier), the train Routine. `$PIPELINE_RUN_DIR` signal, `--source` fallback, per the canonical CSC template.

**Anti-Patterns** — bumping a manifest by hand; running the engine without the review; treating a missing hook run as success; rendering the release row from an unverified premise (#680).

**Acceptance**

- Fixture repo, pr-first, with an open release-please PR: `--dry-run` prints the console with the correct record set and proposed version and merges nothing.
- local-merge fixture: the live run produces the tag and the `shipped:` lines, and the summary names the version.
- `--train` with a `breaking` record on main writes `release-held.md` and merges nothing.

## Phase 6 — Lifecycle wiring

**Deliverables**

- `flow/summary-template.md:96-108` and `multispec-summary.md:19`: the release row becomes `/claude-tweaks:release` (recommended only when the preflight pack's `unreleased` is non-empty — the #680 rule; the row is omitted when the pack did not run). The `release.js status`-shaped fallback paragraph at `:106` is deleted.
- `wrap-up/SKILL.md` Next Actions: the same row, same gating.
- `_shared/pr-first-merge-post-merge.md` Step 4.1: "which release carried it" becomes `git describe --contains {merge-sha}` against `origin/{integration-branch}`; the `release-backfill-v{version}.md` staging is retired (a squash commit is named in its release by construction). The `release-status` PR comment stays, now carrying the tag or `unreleased`.
- `tidy/scan-procedures.md:90` + `bin/lib/residue/probes/release.js`: the probe generalizes from this repo's triple to "every `v*` tag at or after the bootstrap version has a matching CHANGELOG heading and vice versa" and no longer gates on `manifest.name === 'claude-tweaks'`.
- `docs/skill-graph.md`: a `## release` section (edges to `/review`, `_shared/staged-patch.md`, `_shared/auto-decision-log.md`, `_shared/github-write-transport.md`, `_shared/integration-model.md`, `bin/release-local.js`, `bin/release-preflight.js`); wrap-up → release and flow → release rows.
- `/help` workflow diagrams and reference card list the skill; README's lifecycle diagram stays in sync.
- `docs/journeys/release-a-version.md` replaces `release-a-plugin-version.md`; `learn-which-release-carried-a-merge.md` rewritten around `git describe`.

## Phase 7 — The release train Routine

**Deliverables**

- `release/routine-template.yml` (mirrors `specify/routine-template.yml`'s fleet-slottable shape): daily, invokes `/claude-tweaks:routine-kickoff` then `/claude-tweaks:release --train`.
- `/claude-tweaks:routine` gains `release` as an instantiable skill.
- `_shared/autonomy-ceiling.md`: a row stating what the train may do at `unattended` (merge the release PR / tag locally for minor and patch) and what it never does (major, blocking review, hook failure).

**Acceptance**

- Instantiating the routine against this repo produces a schedule whose firing on a main with unreleased `fix:` commits ends in a tag, and whose firing on a main with a `breaking` record ends in `HELD` with no tag.

## Phase 8 — This repo's migration (first consumer)

Runs last; it is the acceptance test for Phases 1–7. One PR, in this order:

1. **Retro-tag history.** For every line of `docs/shipped-versions.tsv`, find the bump commit (`status.js`'s `iterBumpCommits` is the last legitimate use) and create an annotated tag `v{version}` dated to that commit (`GIT_COMMITTER_DATE`), message `v{version} — {CHANGELOG summary}`. Push tags. History survives the tsv's retirement.
2. **Bootstrap release-please** at the v6.121.0 commit via Phase 3's init step: `release-type: simple`, `extra-files: [{type: json, path: plugin/.claude-plugin/plugin.json, jsonpath: $.version}]`, manifest `6.121.0`, `last-release-sha` pinned. The CHANGELOG gains a one-line boundary comment above the first release-please entry naming the grammar switch.
3. **Marketplace mirror as a workflow.** `.github/workflows/mirror-marketplace.yml` on `release: published`: PUT the catalog entry `{source: git-subdir, url, path: plugin, sha: {release commit}}` into `thomasholknielsen/claude-tweaks-marketplace` — the exact write `lib/release/mirror.js` performs today, with the same `sha`-never-`ref` and no-`version`-field invariants. **Human step:** a fine-grained token with `contents: write` on the marketplace repo, stored as `MARKETPLACE_TOKEN`. The design cannot do this; the migration PR's description lists it as the merge precondition and the workflow fails loudly without it.
4. **Retire**: `plugin/bin/release.js`, `plugin/bin/lib/release/{compose,mirror,precheck,run,status,unnamed-records}.js` (precheck's collision logic having moved into `release-local` in Phase 4), `plugin/bin/lib/shipped-record.js`, `docs/shipped-versions.tsv`, `tests/bin-lib/release/`, `tests/changelog-coverage.test.js` (replaced by the Phase 6 tag-to-CHANGELOG probe's test), the `kind: release` triple wording.
5. **Docs**: `docs/releasing.md` rewritten around `/claude-tweaks:release`; CLAUDE.md's Versioning bullet ("Version lives in plugin.json / bump minor…") becomes "Version is the `v*` tag; release-please bumps plugin.json; `/claude-tweaks:release` cuts it"; the Releasing section's invocation line changes; the commit-message-style bullet gains "on `main`, subjects are conventional and plugin-written — feature-branch commits keep the `{Verb} {what} — {detail}` style"; `docs/plugin-structure.md`'s CLI list; `docs/decisions/0018-release-please-engine.md` recording stances 1, 3, 5, 7 as an ADR (hard to reverse, surprising, real trade-off).
6. **First release through the new path** cuts the version that carries this family, proving Phase 5 end to end.

**Acceptance**

- `git tag -l 'v*' | wc -l` equals the tsv's line count before the tsv is deleted.
- `npm test` green with the retired suites gone and the new ones present.
- The release that ships this family has a tag, a GitHub Release, a release-please CHANGELOG entry, and a mirrored catalog entry whose `sha` is the release commit.

## Testing (cross-phase)

- Every new `bin/` CLI: `run(argv, deps)` fake-runner unit tests sized like `tests/bin-lib/release/`.
- Skill prose: conformance tests per `skill-prose-conformance-tests` for the `#680` gating in flow/wrap-up Next Actions and for the fully-qualified `/claude-tweaks:release` form in actionable text.
- `tests/integration-model.test.js`'s consumer-citation check: every file routing on `pr-first`/`local-merge` for the engine choice cites `_shared/integration-model.md`'s consumer section.
- Phase 4's grammar fixture is the contract between engines; a release-please upgrade that changes the grammar fails this test first, which is the intended alarm.

## Risks and open items

- **release-please major-version drift.** Pin the action's major; the grammar fixture catches format changes. Accepted.
- **Squash changes `git blame` granularity on main.** Feature-branch history is preserved on the (archived) branch and in the PR. Accepted; note in the ADR.
- **`--as` override latency under pr-first.** release-please re-renders the PR on the next push; Step 5 polls up to a bound and reports `partial: override pushed, PR not re-rendered` past it. Not silent.
- **MCP-only sandboxes.** Step 7's record comments go through the write transport; Step 5's `gh pr merge` has an MCP fallback per `console-execute.js`'s precedent decision (gh-only) — under MCP-only, the skill stops at the console with the merge as a paste-ready command. Same posture as the Review Console today.
- **Headless `breaking` detection is deliberately absent.** A missed breaking change ships as a minor unless the human overrides at the console. The alternative (LLM-inferred breaking labels) produces false majors, which are worse. Revisit if it happens in practice; log it when it does.

## Next

`/claude-tweaks:specify docs/superpowers/specs/2026-09-11-release-skill-design.md` — decompose into one record per phase (Phase 8 depends on all others; Phase 2 depends on Phase 1; Phase 5 depends on 3 and 4; 6 and 7 depend on 5).
