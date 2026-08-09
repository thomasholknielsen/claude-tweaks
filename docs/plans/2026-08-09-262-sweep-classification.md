# Sweep classification — record #262 (denominator: 124 files)

Command: `git grep -il superpowers -- ':!docs/superpowers' ':!docs/incident-log.md' ':!docs/plans/2026-08-09-262-sweep-classification.md'`
Run at: `12bb612fa4d183715aabee1983511455d250cbae`

The third exclusion clause is self-reference: once this ledger file is committed, it necessarily contains the word "superpowers" dozens of times (it's a table classifying files that say "superpowers"), so it would otherwise match its own defining grep and inflate the count to 125. This mirrors the `docs/incident-log.md` exclusion already in the command — both are files that quote the search term about the files the command finds, not files that depend on superpowers content themselves.

Installed superpowers artifact used for all literal verification: `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/`.

## Assertion reference

The six known assertions (1–6) come from the plan brief verbatim. Assertions 7–14 are new, derived and verified against the installed artifact during this sweep. `[FAILED]` means a candidate literal was checked against the installed artifact and did **not** match — recorded as a finding, not an assertion.

| # | Claim | Must-match literal | Verified against |
|---|---|---|---|
| 1 | `_shared/subagent-output-contract.md`'s four-status vocabulary mirrors SDD's implementer statuses (file never says "superpowers" — grep-invisible; see the addendum below) | `DONE \| DONE_WITH_CONCERNS \| BLOCKED \| NEEDS_CONTEXT` | `skills/subagent-driven-development/implementer-prompt.md:130` — confirmed |
| 2 | `build/SKILL.md` claims SDD ends by invoking finishing-a-development-branch | `Use superpowers:finishing-a-development-branch` | `skills/subagent-driven-development/SKILL.md:423` — confirmed (also :77,:106,:414,:502) |
| 3 | `build/SKILL.md` claims SDD has a per-task model-selection heuristic the tier override overrides | `## Model Selection` | `skills/subagent-driven-development/SKILL.md:157` — confirmed |
| 4 | `CLAUDE.md` claims brainstorming's terminal step invokes writing-plans | `Invoke the writing-plans skill` | `skills/brainstorming/SKILL.md:131` — confirmed |
| 5 | The `.superpowers/sdd/` workspace path | `base="$root/.superpowers/sdd"` | `skills/subagent-driven-development/scripts/sdd-workspace:36` — confirmed |
| 6 | `build/failure-recovery.md`'s "built-in retry" deferral is backed by SDD's re-dispatch/escalation ladder | `**BLOCKED:** The implementer cannot complete the task. Assess the blocker:` | `skills/subagent-driven-development/SKILL.md:244` — confirmed |
| 7 | Step 0 worktree-isolation detection heuristic (`GIT_DIR != GIT_COMMON` + submodule guard) | `` **If `GIT_DIR != GIT_COMMON` (and not a submodule):** `` | `skills/using-git-worktrees/SKILL.md:33` — confirmed |
| 8 | Step 1a (native tool) before Step 1b (git fallback); Step 1b's "Safety Verification" substep; `.worktrees/` project-root default | `#### Safety Verification (project-local directories only)` | `skills/using-git-worktrees/SKILL.md:78` — confirmed (Step 1a/1b headings at :47-61, `.worktrees/` default at :76) |
| 9 | `.worktrees/`/`worktrees/` is the *only* directory `finishing-a-development-branch` cleans up — a permanently separate, superpowers-owned domain from `.claude/worktrees/` | `` Clean up only worktrees under `.worktrees/` or `worktrees/`. Everything else belongs to the host. `` | `skills/finishing-a-development-branch/SKILL.md:198` — confirmed (also :169-170) |
| 10 | `using-git-worktrees` (v5.1.0+) asks user consent before creating a worktree (fixes upstream #991) | `ask for consent before creating a worktree` | `skills/using-git-worktrees/SKILL.md:41` — confirmed |
| 11 | `[FAILED]` brainstorming has a numbered "Step 5" / "Step 7" / "Step 8" structure, with Step 8 being a spec-review blocking-wait gate before writing-plans | `Step 5` / `Step 7` / `Step 8` | `skills/brainstorming/SKILL.md` — **zero matches**; the file has no numbered `## Step N` headings at all (only `## Checklist`, `## Process Flow`, `## The Process`, `## After the Design`, `## Visual Companion`). The actual blocking wait is the unnumbered "User Review Gate" subsection ("Wait for the user's response... Only proceed once the user approves") |
| 12 | `finishing-a-development-branch`'s exact git mechanics: Option 1 ("Merge Locally") runs a bare `git merge` with no `--no-ff`, so a fast-forward-eligible merge produces no merge commit | `git merge <feature-branch>` | `skills/finishing-a-development-branch/SKILL.md:96` — confirmed no `--no-ff` anywhere in Option 1. **Partial finding:** the co-located claim "[Option 2] never calls `gh pr create`" does not hold against 6.2.0 — Option 2's prose explicitly instructs creating the PR "with the forge's tooling — its CLI if one is available" (`:121-122`), which for a GitHub remote is `gh pr create`. Recorded as a finding, not folded into the verified half of this assertion. |
| 13 | `brainstorming`'s default design-doc write path | `` docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md `` | `skills/brainstorming/SKILL.md:29` (also `:107`) — confirmed |
| 14 | `writing-plans`'s default plan write path | `` docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md `` | `skills/writing-plans/SKILL.md:18` — confirmed |

**Addendum — grep-invisible pin, outside the 124-row denominator.** `skills/_shared/subagent-output-contract.md` never contains the literal string "superpowers" (`git grep -in superpowers -- skills/_shared/subagent-output-contract.md` returns nothing, confirmed), so the Step-1 enumeration command does not return it and it is correctly **excluded** from N=124. Per the plan brief's own instruction, assertion 1 is still live and pin-worthy for this file — the coupling (this file's four-status vocabulary mirrors SDD's implementer statuses) is exactly the kind of dependency that needs pinning precisely because it's invisible to a keyword sweep (`[IL-15]`). Task 2/4 should carry assertion 1 forward even though this file isn't one of the 124 rows below.

## Classification table

| File | Verdict | Detail |
|---|---|---|
| `.claude-tweaks/pipelines/2026-08-06T224105-spec-141/work/141-spec.md` | inert | Materialized spec — historical audit artifact |
| `.claude-tweaks/pipelines/2026-08-07T171359-spec-176-177-178-106-115-179-180/spec-176/work/176-spec.md` | inert | Materialized spec — historical audit artifact |
| `.claude-tweaks/pipelines/2026-08-09T140101-spec-262/work/262-spec.md` | inert | Materialized spec — historical audit artifact (this record's own spec file) |
| `.claude-tweaks/pipelines/archive/2026-07-16T215020-record-36/work/36-spec.md` | inert | Materialized spec, archived — historical audit artifact |
| `.claude-tweaks/pipelines/archive/2026-07-19T124004-spec-15/work/15-spec.md` | inert | Materialized spec, archived — historical audit artifact |
| `.claude-tweaks/pipelines/archive/2026-07-20T050513-spec-37-33-27-12/spec-12-work-12-spec.md` | inert | Materialized spec, archived — historical audit artifact |
| `.claude-tweaks/pipelines/archive/2026-08-02T162615-record-46/work/46-spec.md` | inert | Materialized spec, archived — historical audit artifact |
| `.claude/settings.json` | inert | `"superpowers@claude-plugins-official": true` — plugin-enablement boolean; fails loudly (install/load error) if the identifier is wrong, no silent breakage |
| `.gitignore` | pin | Rides assertion 5: literal line `.superpowers/sdd/`. If upstream renamed the SDD workspace directory, new ledger files at the new path would silently stop being gitignored (untracked-but-unprotected → risk of accidental commit) |
| `CHANGELOG.md` | inert | Historical release-note prose (past-tense descriptions of already-shipped changes) — same treatment as an ADR describing a past decision |
| `CLAUDE.md` | pin | Assertion 4 (brainstorming → writing-plans override); sanity-checked, still present verbatim at line 143 |
| `README.md` | inert | Install command + descriptive comparison table for human readers; bare invocation references |
| `bin/lib/code-health/scope.js` | inert | Comment citing one specific already-written design doc filename as rationale — a historical pointer, not a dependency on a general upstream pattern |
| `bin/lib/docs-health/findability.js` | inert | Comment describing this file's own interaction with `scope.js`'s (separately pinned) exclusion set — doesn't independently assert anything about upstream |
| `bin/lib/docs-health/scope.js` | pin | Rides assertions 13+14: `EXCLUDE_TOP_LEVEL_DIRS = new Set(['superpowers', 'journeys'])` mechanically excludes `docs/superpowers/**` from the rotation pool, depending on both upstream skills nesting their default write paths under that shared parent directory name |
| `bin/lib/docs-health/tests/scope.test.js` | inert | Test validates own exclusion code against fabricated fixtures, never parses upstream content |
| `bin/lib/docs-health/tests/skill-md.test.js` | inert | Test fixture — asserts `docs-health/SKILL.md` itself contains the literal string `docs/superpowers` (meta-test on our own doc, not on upstream) |
| `bin/lib/health-core/durable-state.js` | inert | Citation comment to one specific already-written design doc |
| `bin/lib/hooks/post-tool-use.js` | pin | Rides assertion 13: `DESIGN_DOC_PATH_RE = /(^|\/)docs\/superpowers\/specs\/[^/]+-design\.md$/` is keyed directly to brainstorming's default write path to drive the warn-tier hook; a changed upstream default would make this regex silently stop firing for real design docs |
| `bin/lib/hooks/pre-tool-use.js` | inert | Bare `/superpowers:using-git-worktrees` reference in an advisory error message — fails loudly/harmlessly if wrong (message just names the wrong skill) |
| `bin/lib/hooks/session-start.js` | inert | Same as above — advisory message, bare invocation reference |
| `bin/lib/hooks/worktree-detect.js` | pin | PROMOTE: assertion 7. Comment: "Ports the same `GIT_DIR != GIT_COMMON` + submodule-guard heuristic superpowers:using-git-worktrees Step 0 uses, so the hook and the skill never disagree about what counts as isolated." If upstream's Step 0 detection changed, the hook and the skill could silently diverge on what counts as an isolated worktree |
| `bin/lib/hooks/worktree-reap.js` | pin | PROMOTE: assertion 9. `HARNESS_WORKTREE_DIR = path.join('.claude', 'worktrees')` scope restriction is explicitly justified by the comment's claim that `.worktrees/` is cleaned by superpowers' `finishing-a-development-branch`; if that stopped being true, orphaned `.worktrees/` entries would go permanently unreaped with no error |
| `bin/lib/issues/autonomy.js` | inert | Citation comment to one specific already-written design doc |
| `bin/lib/issues/blast-radius.js` | inert | Citation comment to one specific already-written design doc |
| `bin/lib/issues/initiative-budget.js` | inert | Citation comment to one specific `docs/superpowers/specs/*.md` design doc. Note: `git grep -l` reports this file as binary (a stray NUL byte elsewhere in the file, `[IL-74]`-relevant) — confirmed by direct byte inspection that the actual "superpowers" occurrence is this ordinary citation comment, unaffected |
| `bin/lib/issues/trust.js` | inert | Citation comment to one specific `docs/superpowers/plans/*.md` file |
| `bin/lib/issues/unattended-tier.js` | inert | Citation comment to one specific already-written design doc |
| `bin/lib/record-graph/encode.js` | inert | Citation comment to one specific already-written design doc |
| `bin/lib/release/tests/precheck.test.js` | inert | Test fixture strings using `docs/superpowers/plans/*.md`-shaped paths as fake plan-file inputs |
| `bin/lib/routine-template-parser.js` | inert | Citation comment to one specific already-written plan doc |
| `bin/lib/skill-audit/tests/fixtures/review-SKILL-pre-2b.md` | inert | Frozen test fixture — a pre-change snapshot of `review/SKILL.md` content used by skill-audit tests |
| `bin/release.js` | pin | Rides assertion 14: `path.join(repoRoot, 'docs/superpowers/plans')` reads the directory listing to scan un-shipped plans for version-bump mentions before a release |
| `docs/decisions/0003-worktree-always-init-rollout.md` | inert | ADR — historical decision record |
| `docs/decisions/0004-worktree-two-domain-convention.md` | inert | ADR — historical decision record. Documents the same `.worktrees/`-is-superpowers-owned fact that `bin/lib/hooks/worktree-reap.js` and `skills/init/bootstrap/step-06-worktree-configuration.md` actively depend on (both pinned separately); this ADR itself is the historical-record type the classification rule explicitly carves out as inert |
| `docs/decisions/0005-health-state-durable-storage-branch.md` | inert | ADR — historical decision record |
| `docs/decisions/0006-ceremony-tiering-owned-by-specify.md` | inert | ADR — historical decision record |
| `docs/decisions/0007-historical-design-doc-archive-is-periodically-pruned.md` | inert | ADR — historical decision record |
| `docs/decisions/0008-gh-cli-locally-github-mcp-in-cloud-capability-detected.md` | inert | ADR — historical decision record |
| `docs/decisions/0009-guided-environment-creation-attaches-the-real-routine.md` | inert | ADR — historical decision record |
| `docs/decisions/0012-autonomy-ceiling-top-tier-ships-shut.md` | inert | ADR — historical decision record |
| `docs/getting-started.md` | inert | Descriptive Diátaxis onboarding prose explaining skill relationships to a human reader; no literal-content dependency on upstream |
| `docs/github-issues-integration-review.md` | inert | Historical review document, table entry describing a bypass — descriptive |
| `docs/journeys/verify-eval-harness-sandbox-security.md` | inert | Citation to one specific already-written plan file |
| `docs/plans/2026-07-08-worktree-directory-convention-brief.md` | inert | Historical debiasing brief (superseded by ADR-0004) — documents a past investigation, same treatment as an ADR |
| `docs/plugin-structure.md` | inert | Reference-doc inventory entry describing this repo's own `build/failure-recovery.md` file, not asserting upstream literal content itself |
| `docs/skill-authoring.md` | pin | PROMOTE attempted, **FAILED** — assertion 11. Claims `/superpowers:brainstorming` has a "Step 8 (the spec-review gate before writing-plans)" overridable when "Step 5's approval was clean and Step 7's self-review made no substantive change." The installed 6.2.0 `brainstorming/SKILL.md` has no numbered `## Step N` structure anywhere — confirmed via `grep -n "Step 5\|Step 7\|Step 8"` returning zero matches. The real gate is the unnumbered "User Review Gate" subsection's blocking wait. The underlying coupling (this repo overrides brainstorming's own review-gate wait) is genuinely pin-worthy; the specific step-numbering literal this file cites does not exist in the current artifact — a real finding for Task 2/4, not a verified assertion |
| `docs/skill-graph.md` | inert | Relationship/citation table — bare `/superpowers:{name}` pointers and citations to specific already-written design docs; no general-pattern mechanical dependency |
| `evals/README.md` | inert | Citation to one specific already-written design doc |
| `evals/fixtures/code-health-repo/CLAUDE.md` | inert | Eval fixture (explicit inert category) |
| `evals/fixtures/complexity-repo/CLAUDE.md` | inert | Eval fixture |
| `evals/fixtures/init-baseline/CLAUDE.md` | inert | Eval fixture |
| `evals/fixtures/minimal-node-repo/CLAUDE.md` | inert | Eval fixture |
| `evals/history.js` | inert | Citation comment to one specific already-written design doc |
| `evals/runner.js` | inert | Lists `.superpowers/` among directories excluded when building a plugin snapshot for eval sandboxes. If the path were stale, worst case is a harmless leftover exclusion entry — no leak, no test failure |
| `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml` | inert | Eval scenario citing a specific `.superpowers/sdd/task-9-report.md` evidence file — eval fixture |
| `evals/scenarios/code-health-seeded-findings.yaml` | inert | Eval scenario citing a specific SDD task-report evidence file — eval fixture |
| `evals/scenarios/dispatch-local-files-preflight-stop.yaml` | inert | Eval scenario citing a specific SDD task-report evidence file — eval fixture |
| `scripts/claude-cloud-setup.sh` | inert | `PLUGIN_SPECS=... superpowers@claude-plugins-official` — plugin package identifier; fails loudly at `claude plugin install` if wrong |
| `skills/_shared/auto-mode-contract.md` | pin | Rides assertion 10: table row "Worktree consent (`/build` Common Step 1) \| `/superpowers:using-git-worktrees` consent prompt \| Pre-authorized by `auto`" restates the same consent-prompt existence claim `build/worktree-setup.md` pins in full |
| `skills/_shared/criteria-docs-diataxis.md` | pin | Rides assertions 13+14: restates the `docs/superpowers/**` rotation-pool exclusion enforced by `bin/lib/docs-health/scope.js` — a second, independent restatement of the same fact that can go stale on its own (`[IL-93]`/`[IL-17]` pattern) |
| `skills/_shared/git-discipline.md` | inert | Bare `/superpowers:using-git-worktrees` invocation reference in prose |
| `skills/_shared/harness-health-analysis.md` | inert | `grep -vE 'claude-tweaks:\|superpowers:\|https?://'` — regex literal filtering out any line merely mentioning the `superpowers:` prefix; no dependency on upstream content itself |
| `skills/_shared/issue-claims.md` | inert | Descriptive prose scenario, bare invocation reference |
| `skills/_shared/learning-routing.md` | inert | Illustrative examples ("for example `superpowers:writing-plans`"), bare references |
| `skills/_shared/local-files-preflight-stop.md` | pin | Assertion 5 (`.superpowers/sdd/` workspace path), per known verdict |
| `skills/_shared/policy-schema.md` | inert | Config-schema table row naming which skills consume the `section-confirmation` policy lever — not a claim about upstream's literal content |
| `skills/_shared/reproduce-first-discipline.md` | inert | Bare `/superpowers:systematic-debugging` invocation reference |
| `skills/_shared/routine-diagnostic-probe.md` | inert | Citation to one specific already-written plan file |
| `skills/_shared/scratch-worktree.md` | pin | PROMOTE: assertion 8. "Fall back to `git worktree add` only when none is — `superpowers:using-git-worktrees` Step 1a before Step 1b — and when falling back, create it under `.worktrees/`, verifying it's gitignored first (that skill's own Safety Verification substep)" — all three sub-claims (ordering, `.worktrees/` default, "Safety Verification" heading) verified against the installed artifact |
| `skills/assess-agent-autonomy/SKILL.md` | inert | Citation to one specific already-written design doc |
| `skills/backlog/overview-mode.md` | pin | Rides assertion 14: `hasPlan` mechanically checks whether `docs/superpowers/plans/` contains a filename referencing the record's id/slug |
| `skills/backlog/refine-mode.md` | inert | Citation to one specific already-written design doc |
| `skills/build/SKILL.md` | pin | Assertions 2+3 per known verdict (finishing-branch suppression; Model Selection tier override). Additionally rides assertion 14: "Search `docs/superpowers/plans/` for a plan matching this spec... this is where `/superpowers:writing-plans` actually writes execution plans" and the literal format string "written to `docs/superpowers/plans/YYYY-MM-DD-{feature}.md`" match writing-plans' own default exactly |
| `skills/build/build-options.md` | pin | Rides assertion 13: routing table row `` **Design mode** \| `docs/superpowers/specs/*-design.md` `` keys design-doc detection off the general upstream glob pattern |
| `skills/build/failure-recovery.md` | pin | Assertion 6 per known verdict |
| `skills/build/worktree-setup.md` | pin | PROMOTE: assertion 10. "`/superpowers:using-git-worktrees` now asks the user before creating a worktree (fixes superpowers #991)" and the "Consent prompt (v5.1.0+)" section this repo pre-authorizes in `auto` mode — the consent-ask instruction is confirmed present in the installed 6.2.0 artifact |
| `skills/capture/SKILL.md` | inert | Bare invocation references, lifecycle diagram |
| `skills/challenge/SKILL.md` | inert | Bare `/superpowers:brainstorming` reference in an `AskUserQuestion` option description |
| `skills/demo/SKILL.md` | inert | Descriptive boundary statement ("not for... merging \| finishing-a-development-branch's job"), bare reference |
| `skills/dispatch/SKILL.md` | inert | Bare invocation references + citation to one specific already-written plan file |
| `skills/dispatch/mcp-transport.md` | inert | Citations to one specific already-written plan file |
| `skills/dispatch/routine-template.yml` | inert | Generic "the superpowers plugin [must be present] in the cloud environment" dependency note — no specific literal content claim |
| `skills/dispatch/settle-and-merge.md` | inert | Citation to a specific design doc + descriptive prose about this repo's own headless-bypass logic |
| `skills/docs-health/SKILL.md` | pin | Rides assertions 13+14: restates the `docs/superpowers/**` rotation-pool exclusion that `bin/lib/docs-health/scope.js` mechanically enforces — an independent restatement, per the `[IL-93]` pattern |
| `skills/flow/SKILL.md` | pin | Rides assertion 13: Step 2.7's routing condition — "If only a design doc exists at `docs/superpowers/specs/*-design.md`, stop and route to `/claude-tweaks:specify`" — is a mechanical existence check against the general upstream glob |
| `skills/flow/manifesto.md` | inert | Citation to one specific already-written design doc |
| `skills/flow/materialize.md` | inert | Bare invocation reference + citation to one specific already-written design doc |
| `skills/flow/multi-spec.md` | pin | Rides assertion 7: explicitly names "superpowers Step 0: `GIT_DIR != GIT_COMMON`" as the detection this file's own shared-worktree reuse logic depends on and reinforces |
| `skills/flow/multispec-review-console.md` | inert | Bare `/superpowers:finishing-a-development-branch` reference, descriptive |
| `skills/harness-health/judge-procedure.md` | inert | `grep -vE 'claude-tweaks:\|superpowers:\|https?://'` — same regex-literal pattern as `harness-health-analysis.md`, no upstream content dependency |
| `skills/help/SKILL.md` | inert | Lifecycle diagram bare reference, descriptive suggestion |
| `skills/help/context-flow.md` | inert | Diagram/reference-card content for a human reader — illustrative, not an executable scan |
| `skills/help/reference-card.md` | inert | Reference table, bare invocation references |
| `skills/help/status-scan.md` | pin | Rides assertions 13+14: the same mechanical `hasPlan` check over `docs/superpowers/plans/` as `backlog/overview-mode.md`, plus "Stage 2: Design Docs (`docs/superpowers/specs/*-design.md`)" as an active scan target |
| `skills/init/SKILL.md` | inert | General plugin-availability check + generic description of what `/init` declares in `enabledPlugins` — no specific upstream literal |
| `skills/init/bootstrap-steps.md` | inert | Summary table row, descriptive pointer to step-01 |
| `skills/init/bootstrap/step-01-check-plugin-dependencies.md` | inert | Bare `/superpowers:{name}` invocation list (fails loudly at the Skill tool if wrong) + install command literal (fails loudly at `claude plugin install` if wrong) |
| `skills/init/bootstrap/step-02-create-directory-structure.md` | pin | PROMOTE: rides assertions 13+14 as their origin point. "`docs/superpowers/specs/` → Design docs (from `/superpowers:brainstorming`)" and "`docs/superpowers/plans/` → Execution plans (from `/superpowers:writing-plans`)" — `/init` creates these exact directories *because* that's where upstream writes by default; if that default moved, `/init` would keep creating directories nothing ever populates |
| `skills/init/bootstrap/step-06-worktree-configuration.md` | pin | Rides assertion 9: "the git-fallback path... → `.worktrees/`... superpowers-owned — this is the only directory `/superpowers:finishing-a-development-branch` cleans up" governs `/init`'s live migration guidance (explicitly telling users NOT to migrate `.claude/worktrees/` into `.worktrees/`) |
| `skills/init/bootstrap/step-14-cloud-routine-parity.md` | inert | Plugin identifier declaration (`superpowers@claude-plugins-official`) for cloud settings — fails loudly at install if wrong |
| `skills/init/claude-md-template.md` | pin | Rides assertion 4: this is the literal template source that generates a fresh project's `CLAUDE.md`, carrying the identical "Superpowers overrides" text CLAUDE.md itself pins |
| `skills/init/summary-templates.md` | inert | Status-display template line ("Superpowers plugin \| present") — no literal-content dependency |
| `skills/init/update-mode.md` | inert | Same status-display line pattern |
| `skills/init/worktree-policy-finalization.md` | inert | Bare `/superpowers:using-git-worktrees` invocation reference in a user-facing message |
| `skills/research/verify-mode.md` | inert | Lifecycle diagram bare reference; sequencing note about this repo's own recommended ordering (verify before brainstorming), not a claim about brainstorming's internals |
| `skills/review/SKILL.md` | inert | Citation to one specific already-written design doc + bare `/superpowers:dispatching-parallel-agents` reference |
| `skills/review/step3-routing.md` | inert | Bare invocation references, descriptive |
| `skills/routine/create-and-update.md` | inert | Bare `/superpowers:using-git-worktrees` invocation reference |
| `skills/specify/SKILL.md` | pin | Rides assertion 13: case 3's mechanical search "Search `docs/superpowers/specs/*-design.md` for a matching design doc" is an active glob scan against the upstream default. (The file's own case-4 text explicitly hedges "(or wherever superpowers writes it)" — self-aware of the risk, which is exactly why the coupling needs pinning rather than trusting the hedge alone) |
| `skills/specify/decomposition-mode.md` | pin | Known-rejected candidate preserved unchanged: "3–8 tasks-per-work-unit sizing" is **not** pin-worthy — no upstream literal encodes that count; writing-plans' granularity vocabulary is per-step ("bite-sized", "2-5 minutes"), and the local 3–8 figure is claude-tweaks' own convention (gets its manifest.yml comment per Task 2). Separately, this file contains a genuine, independent pin not covered by the six knowns: PROMOTE rides assertion 13 — literal `git rm docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` / `git add docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` commands operate directly on the upstream default write-path pattern. Verdict is `pin` for the file as a whole because of this second claim |
| `skills/specify/record-creation.md` | inert | Bare `/superpowers:writing-plans` reference, descriptive |
| `skills/specify/red-team.md` | inert | Citation to one specific already-written design doc |
| `skills/specify/spec-template.md` | inert | Descriptive rationale referencing `/superpowers:writing-plans` as the eventual consumer of each template section — explains why the template is shaped this way, not a claim about writing-plans' literal output |
| `skills/test/SKILL.md` | inert | Bare `/superpowers:systematic-debugging` references (reproduce-first discipline) |
| `skills/tidy/SKILL.md` | pin | Rides assertions 13+14: scan-target table rows `` docs/superpowers/specs/*-design.md → [doc] `` and `` docs/superpowers/plans/, ~/.claude/plans/ → [plan] `` name the same general patterns `scan-procedures.md` mechanically scans |
| `skills/tidy/scan-procedures.md` | pin | Rides assertions 13+14: "Scan `docs/superpowers/specs/*-design.md`" and "Scan `docs/superpowers/plans/` for execution plan files" are literal, executed scan commands over both upstream default paths |
| `skills/wrap-up/cleanup-procedures.md` | pin | PROMOTE: assertion 12 (partially verified — see reference table: the no-`--no-ff` fast-forward-merge claim is confirmed; the "never calls `gh pr create`" sub-claim is a finding, not confirmed). Also rides assertion 9 (release-reason mapping from finishing-a-development-branch's outcome) and assertion 14 ("Do NOT delete `docs/superpowers/plans/*.md`" preservation rule) |
| `skills/wrap-up/execution-and-verification.md` | pin | Rides assertion 14: literal verification command `ls docs/superpowers/plans/*{spec-slug}* docs/plans/*-ledger.md` |
| `skills/wrap-up/review-console.md` | inert | Citation to one specific already-written design doc + bare `/superpowers:finishing-a-development-branch` reference — doesn't itself restate the literal option-set `cleanup-procedures.md` pins |
| `skills/wrap-up/skill-curation.md` | inert | Citation to one specific already-written design doc |
| `skills/wrap-up/summary-template.md` | pin | Assertion 5 (per known verdict) — "SDD ledger" wording rides the `.superpowers/sdd/` workspace path assertion |
| `tests/hooks-post-tool-use-design-doc.test.js` | inert | Test validates the local `DESIGN_DOC_PATH_RE` regex against fabricated fixture paths — never parses upstream content itself (the regex it tests is pinned separately, at `bin/lib/hooks/post-tool-use.js`) |
| `tests/hooks-worktree-reap.test.js` | inert | Test validates the local reaper's domain-scoping logic against fabricated fixtures. Comment cites ADR-0004 as rationale (historical reference) — doesn't itself parse or depend on live upstream content (the actual dependency is pinned separately, at `bin/lib/hooks/worktree-reap.js`) |

## Verdict counts

- Total rows: 124 (matches the Step 1 denominator)
- `pin`: 31
- `inert`: 93

## Parity check

Step 1 command line count (re-run at Step 4, corrected 3-clause form — see fix round 1 below): `git grep -il superpowers -- ':!docs/superpowers' ':!docs/incident-log.md' ':!docs/plans/2026-08-09-262-sweep-classification.md' | wc -l` → **124**
Table data rows (excluding header/separator): **124**
Match: confirmed — no tree movement between Steps 1 and 3 in this session.

**Fix round 1 (self-reference correction):** the original 2-clause command (matching the plan brief's Step 1 literal at commit time) returns **125** once this ledger file itself is committed — the ledger necessarily contains the word "superpowers" throughout its own table, so it matches its own defining grep. Added `':!docs/plans/2026-08-09-262-sweep-classification.md'` as a third exclusion clause (see the Command line above), mirroring the existing `docs/incident-log.md` self-reference exclusion. With the corrected 3-clause command, the count returns to 124, matching the table unchanged — no row content was affected, only the documented command.
