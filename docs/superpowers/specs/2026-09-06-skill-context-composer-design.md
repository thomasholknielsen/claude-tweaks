# Skill Context Composer — per-run bundles composed by resolved condition, not per-file ceilings

**Status:** Design — brainstormed 2026-09-06 from a footprint audit of the 40 KB per-file ceiling. Route to `/claude-tweaks:specify`, never to `/superpowers:writing-plans` directly. Phase 1 is the vertical slice; Phases 2–5 are sized from Phase 1's measured ratio.

## Problem

The 40 KB per-file ceiling (`CEILING_BYTES`, `tests/bin-lib/skill-audit/context-cost.test.js`) was adopted 2026-08-04 (#102) for within-file coherence. It has held every file under 40 KB while the corpus doubled into sub-files that the same sessions still read. It measures the wrong unit.

Measured on this repo (release commits, `plugin/skills/**/*.md`):

| Snapshot | Files | SKILL.md total | `_shared` total | All skill md |
|---|---|---|---|---|
| 2026-07-19 | 155 | 871 KB | 264 KB | 1.85 MB |
| 2026-08-04 (ceiling adopted) | 214 | 811 KB | 361 KB | 2.31 MB |
| 2026-08-16 | 311 | 814 KB | 784 KB | 3.61 MB |
| 2026-09-04 | 398 | 893 KB | 1.12 MB | 4.78 MB |

Measured on the 40 largest recent session transcripts for this project (main agents and their `subagents/` transcripts, 2026-08 to 2026-09-06):

| Measure | Value |
|---|---|
| Distinct skill files read by the main agent, full `/flow` session | 60–72 |
| Skill markdown bytes read by the main agent, full `/flow` session | 0.83–1.14 MB, plus up to 0.53 MB of injected skill bodies |
| Median skill bytes per session | 122 KB |
| Compaction events in the heaviest session | 6 |
| Within-session re-reads of the same file | 1.23× overall; 45 of 116 reads in the heaviest session |
| Subagent transcripts / skill-file reads / bytes | 708 / 2,289 / 22.7 MB |
| Most-read file by subagents | `_shared/pr-early-run-lifecycle.md`, 102 reads |
| Heaviest single subagent | dispatch second-call group agent, 36 reads, 439 KB |

The maintenance cost of the per-file cap is separately visible: ~165 commits and ~25 issues in five weeks are ceiling work, most reactive ("trim X back under 40 KB" after a merge); 16 of 35 SKILL.md files sit within 7 KB of the cap; 14 sub-files sit in the 90–100% band; `[IL-140]`, `[IL-144]`, `[IL-70]` record real damage from byte-hunting; 349 of 500 test files pin skill prose, so every trim moves pins.

The repo's reflex for a ceiling hit — split into more sub-files — lowers bytes per file and raises Read calls per run. Each Read is a model turn. Fragmentation serves bytes and nothing else.

Structural cause: shared contracts carry every branch of a condition the run has already resolved. 45 files (883 KB) carry both `pr-first` and `local-merge` prose; 14 files (288 KB) carry both `gh` and MCP transport prose; 18 files (376 KB) carry both auto and interactive prose. A project resolves each of those once, and every reader pays for the untaken branch.

## Goal

Four criteria, all of which the design must move at once:

1. **Instruction fidelity** — a full `/flow` run does not compact several times, so the skill text the model was given is still present at wrap-up.
2. **Token cost** — fewer bytes of skill prose loaded per pipeline run, measured.
3. **Maintenance tax** — no more reactive trim commits and CI failures against a per-file cap.
4. **Speed** — fewer Read turns per run (process) and less wall-clock per operation.

A mechanism that serves only bytes (more sub-files) is rejected by criterion 4. A mechanism that serves only the tax (raise the cap) is rejected by criteria 1, 2, and 4.

## Approach

**Composition, not fragmentation.** A `bin/` CLI assembles exactly the text a step needs, for the branches this run has already resolved, into one file the agent reads once. The composer follows the precedent `bin/build-review-context.js` set: the runner owns assembly and bounding, the skill owns judgment.

Three pieces, all inside the shipped `plugin/` payload:

### Markers in source markdown

An HTML-comment pair fences a branch:

```markdown
<!-- when: integration-model=pr-first -->
… pr-first-only prose …
<!-- /when -->
```

- Keys are the run's already-resolved facts (table below). Values are the exact vocabulary the resolver returns. A marker may carry one `key=value` pair; a block needing two conditions nests, one level at most.
- A block with no marker is unconditional.
- Sources stay one coherent document. Text outside any marker, and the file as a whole, must still read correctly to a session that reads the source directly. A fenced branch never contains the only copy of a heading, step number, or anchor another file cites by name — the marker conformance test (below) enforces this.
- Markers are inert to every existing reader: a session without the composer sees both branches, exactly as today.

### Composer CLI

`bin/compose-context.js`, module under `bin/lib/compose-context/` (flat sibling directory per `docs/plugin-structure.md`).

```
node bin/compose-context.js --run <run-dir> --step <name> <source-file>...
```

- Resolves the condition set once per call from the run and the existing resolvers (table below).
- Strips untaken blocks, concatenates the sources in argument order, writes `{run}/context/{step}.md` with a `resolved:` header line naming every key's value (or `unresolved`) so a reader and a later audit both know which branches were kept.
- Prints one JSON line: `{path, bytes, sources, unresolved: [...]}`. Exit 0 ok; 2 malformed invocation or malformed marker (file and line named, nothing written); 1 filesystem failure. Same `run(argv, deps)` injectable-runner seam and exit-code vocabulary as the other `bin/` CLIs (`gh-api-module-pattern` skill).
- Regenerated on every call, never cached: conditions can change mid-run when the Manifesto is re-answered, and a stale bundle would be a silent shadow copy of the kind `_shared/pipeline-run-dir.md` already warns about.
- `{run}/context/` lives inside the run dir, so it is archived with the run and never committed on its own.

Condition resolution — the composer never guesses:

| Key | Source | Vocabulary |
|---|---|---|
| `integration-model` | `detectIntegrationModel` (`bin/lib/policy-schema.js`) | `pr-first`, `local-merge` |
| `mode` | run `config.yml` `mode:` (Manifesto-written; absent on standalone runs) | `auto`, `confirm`, `interactive`, `hybrid` |
| `attendance` | run `config.yml` autonomy ceiling: `unattended` vs anything else | `headless`, `attended` |
| `transport` | `_shared/github-write-transport.md`'s check (`command -v gh`) | `gh`, `mcp` |
| `worktree-policy` | `policy.yml` via `bin/resolve-policy.js` (`worktree-always`) | `always`, `optional` |
| `work-backend` | `policy.yml` via `bin/resolve-policy.js` | `github-issues`, `local-files` |

A key the run cannot resolve (no `config.yml` on a standalone run, no policy file) is not an error: the composer keeps both branches for that key and lists it under `unresolved` in the header and the JSON line. Unresolvable is not false; silently dropping a branch is the failure `[IL-144]` already paid for.

### Call sites

A skill step that today says "read `_shared/pr-first-merge.md`" instead carries the compose command naming its files, then "read `{run}/context/{step}.md`". The file list lives at the call site, in the step prose that needs it — there is no manifest to drift from the prose it describes. Subagent prompts cite the bundle path instead of the tree.

**Fallback (never-break-a-session):** every call site's prose states that if the compose command is unavailable (older installed build, failed cloud setup) or exits non-zero, the agent reads the named source files directly — same content, both branches, exactly today's behaviour.

### Measurement

`bin/lib/skill-audit/context-cost.js` gains a per-call-site measure: for every compose call site found in the corpus, composed bytes under each condition set the call site's sources actually branch on, and the count of source files it folds (the Read-turn proxy). The existing 40 KB per-file test keeps running, on marker-stripped size, and becomes a **warning** reported by `/claude-tweaks:harness-health` rather than a hard failure. The hard gate moves to composed bytes per step, 40 KB, the number a reader actually pays.

## Key decisions

- **Per-run bundle over author-time rendering or per-read slicing.** Author-time rendering makes the shipped tree diverge from the source tree and forces every prose-pinning test to choose which one it pins. Per-read slicing is still one call per need and the model must know to use it. The per-run bundle fits the existing run-dir convention and is the only shape that also fixes subagent tree-reads for free.
- **In-source markers over an external manifest.** A manifest holds "what loads when" in a second place that drifts from the prose it describes — the failure `docs/skill-graph.md`'s single-edge rule exists to prevent — and section-level references break on every heading rename. Markers keep one coherent source, degrade to today's behaviour without the composer, and let the prose tests keep pinning the source.
- **File list at the call site, not in a manifest.** The citations already live there.
- **Unresolvable keeps both branches.** Stated above; the alternative is a silent content loss.
- **The 40 KB per-file test becomes a warning; the per-step composed gate is the hard test.** The file cap's real job is single-file coherence (#102's actual rationale) and it keeps doing that as a warning. Raising it does not address the shape; lowering it raises the tax.
- **Composition over fragmentation** as the response to every future ceiling pressure: a file near a budget gets markers or a compose call site, not another sub-file, unless the sub-file is a genuinely lazy unit that some runs never read.

## Relationship to existing records

- **#1909 (open, `ready`, instruction-prose diet + per-pipeline-step loaded-bytes budget).** Its measurement deliverable — "the sum of bytes of every `plugin/skills/**` file the step's procedure reads on its default path, computed by `bin/lib/skill-audit/` and reported by `/claude-tweaks:harness-health`" — is Phase 1's Measurement here, made composer-aware (composed bytes under each resolved condition set, not the raw sum). Its authoring rule and trimming pass are Phase 5 here. `/claude-tweaks:specify` should link #1909 to this design's parent as the existing record for Phase 5 and narrow its measurement bullet to cite Phase 1, rather than filing a duplicate.
- **#1929 (open, tokens per phase: transcript usage join, procedure bytes loaded, tool round-trips in `phase-timing.js`).** That is the empirical channel for this design's success criteria — procedure bytes loaded and tool round-trips per phase, from real transcripts. This design does not rebuild it. Until #1929 lands, the before/after is measured with the audit script's method (sum of `Read` results under `plugin/skills/**` per transcript, main and `subagents/`), recorded in the PR description.
- **#1930 / #1931 (fact packs).** Deterministic *data* packs (git/gh/fs facts as one JSON document). This design composes *procedure prose*. Same runner-owns-assembly boundary, different payload; a step may read both.
- **#1765 (fast-lane digest).** A procedure-discovery digest for the fast-lane path only. Superseded on any path a compose call site covers; untouched elsewhere.
- **#1880 (CRLF inflates the per-file byte count).** Becomes moot for the hard gate once it measures composed bytes the composer wrote with `\n`; the per-file warning should measure the git blob (`git cat-file -s`) rather than the working tree, which #1880 already proposes.
- **#1881 (three files still in the WARN band).** Resolved by Phase 2's markers on those files or by the per-file test becoming a warning, whichever lands first.

## Phase 1 — Vertical slice: composer, markers on the merge path, one consumer, measurement

Scope, nothing beyond it:

- **Composer CLI and module** as specified, with the condition-resolution table.
- **Markers** in `_shared/pr-first-merge.md` (30,166 B; `pr-first`/`local-merge` — its `## Local-merge fallback` section is the obvious first fence) and `_shared/pr-early-run-lifecycle.md` (28,446 B; `pr-first`/`local-merge` and `gh`/`mcp` — its `## Skip / degrade behavior` and the MCP sanitization root-cause section are the first fences). Marking up is fencing text that already exists, not rewriting it, so the diff reviews as "is this sentence really pr-first only".
- **One consumer switches:** wrap-up's merge execution — `wrap-up/cleanup-procedures-execution.md` Section C's merge row, which runs `_shared/pr-first-merge.md`'s procedure — composes `merge` from the two marked files and reads the bundle. `wrap-up/auto-merge-short-circuit.md` runs the same procedure and switches with it (same step name, same call). Every other citing file (roughly 30 per source) is untouched and keeps reading the sources.
- **Measurement** in `context-cost.js` and its test, plus the per-file test's switch to marker-stripped size and warning posture.
- **Docs:** `docs/skill-authoring.md` gains the marker syntax, the call-site form, the fallback sentence, and "composition over fragmentation"; `docs/plugin-structure.md` registers the CLI and module; `docs/skill-graph.md` is unchanged (no new skill edge).

Tests, sized like the neighbouring suites:

- **Composer unit tests** on fixtures: strip, keep, nested, unresolved-key-keeps-both, malformed marker exits 2 and writes nothing, `resolved:` header content, argument-order concatenation. Each proven red first (`verify-test-discrimination-by-reverting`).
- **Marker conformance test** on the live corpus: every `when:` opens and closes; keys and values are from the allowed vocabulary; no fenced block contains a heading, `Step N` label, or anchor that another file cites by name. The last clause is the `[IL-144]` guard in mechanical form.
- **Byte-identity test** for the migration: for each marked file, stripping every marker line yields the pre-migration text byte for byte (pinned as a fixture from the pre-migration blob). This is the "nothing was lost" proof; it lets the review focus on placement alone.
- **Budget test:** composed bytes for the `merge` step under each of the four `integration-model` × `transport` combinations, gated at 40 KB; the per-file test switched to marker-stripped size and warning posture.

Success criteria, measured the same way the audit was, on the next ten pipeline sessions after release:

| Criterion | Before | Target |
|---|---|---|
| Distinct files read for the merge step, main agent | 2 sources, often re-read | 1 bundle |
| Bytes loaded for the merge step, `pr-first` + `gh` | ~58 KB | < 35 KB |
| Subagent reads of the two source files | 148 across 40 sessions | approaching zero on the switched path |

The wall-clock gain is the removed Read turns and is small on one step. The slice proves the mechanism moves the number so Phases 2–5 are sized from a measured ratio, not a guess.

## Phase 2 — Migrate the remaining hot shared contracts

Markers and compose call sites for the next tier, in order of measured reads: `_shared/pipeline-run-dir.md` (auto/interactive), `_shared/auto-mode-contract.md` (auto/interactive, headless/attended), `_shared/worktree-setup.md` (worktree-policy), `_shared/issue-claims.md` and `_shared/github-pr-scan.md` (`gh`/`mcp`), `flow/manifesto.md` and `flow/materialize.md` (mode), `review/code-mode-steps.md`, `test/verification.md`, `build/worktree-setup.md`. Each file's switch is one record: markers, byte-identity fixture, call sites, pin retargets. The 40 KB warning band (#1881) clears as a side effect. Sized from Phase 1's ratio.

## Phase 3 — Subagent boundary

Dispatched agents stop reading the skill tree. `dispatch/task-prompt.md`'s two call templates and `review/step3-lens-dispatch.md`'s lens prompts cite `{run}/context/{step}.md` bundles composed by the orchestrator before dispatch; `_shared/subagent-output-contract.md`'s input discipline gains the sentence "cite the run's composed bundle, never a `_shared/` path". Dispatch's second-call group agent, which runs whole skills inside a subagent by design (#296, two-call isolation), is the one dispatch that legitimately reads SKILL.md bodies; it reads composed bundles for everything those skills cite. Optional enforcement, decided on Phase 1–2 evidence: a `pre-tool-use.js` gate that denies a subagent's Read of `plugin/skills/_shared/**` when a bundle for the current step exists (`pre-tool-use-gate-exemptions` skill governs the exemption shape). Success: subagent skill-file reads per session drop by an order of magnitude on the audit's method.

## Phase 4 — Test reinterpretation and the retirement of per-file pins

Every per-file byte pin outside `context-cost.test.js` (the `BUDGETS` map in `run-dir-timestamp-utc.test.js`, and the ~15 ad-hoc `<= 40960` assertions listed by the audit in `capture-absorb-default`, `materiality-floor-conformance`, `tidy-residue-markers`, `dispatch-budget-drain`, `console-on-pr`, `sweep-backstop`, `specify-decomposition-collapse`, `deferred-live-verification-ac-class`, `policy-schema-metadata`, `transcript-judge-prose`, `reflect-transcript-judge-prose`) is either retargeted to the composed step it protects or deleted with a recorded removal condition. `docs/donts.md`'s three ceiling rules are rewritten to the composition rule. `[IL-140]`'s missing multi-spec pre-flight becomes a composed-bytes check in `plan-audit.js`'s size-headroom check (#903 shipped the per-file form).

## Phase 5 — Prose diet and scaffolding dedupe (#1909)

#1909's authoring rule and trimming pass, plus: the Interaction-style paragraph (501 B, pasted verbatim into 35 SKILL.md files, 17.5 KB) is injected once by the `SessionStart` hook and deleted from every file; the per-skill `## Input`, `## Anti-Patterns`, `## Component-Skill Contract`, `## Next Actions` scaffolding (~260 KB of the 888 KB SKILL.md payload) is audited for author-facing narration under `bloat.js`'s existing signals. Measured on injected-skill-body bytes per session.

## Targets across all phases

| Measurement | Before | After |
|---|---|---|
| Skill bytes loaded by a full `/flow` main agent | 0.8–1.1 MB read + up to 0.5 MB injected | < 40% of before |
| Distinct skill files read by a full `/flow` main agent | 60–72 | < 30 |
| Subagent skill-file reads per session | up to 521 | < 50 |
| Compaction events in a full `/flow` session | up to 6 | 0–1 |
| Reactive ceiling-trim commits per month | dozens (Aug 2026) | 0 |
| Skill listing (`/context` Skills row) | unmeasured | measured once; `skillListingBudgetFraction` raised if descriptions are being dropped |

## Out of scope

- The skill-listing budget (1% of the context window per the current Claude Code docs; least-used skills lose descriptions first). One `/context` check on a 200K-context session decides whether `skillListingBudgetFraction` needs setting in `.claude/settings.json`; that is a settings change, not a design.
- `paths:` frontmatter for conditional skill activation. Real, but almost every claude-tweaks skill is user-invoked; not a lever here.
- Author-time rendering of the payload. Rejected above.

## Origin

Footprint audit, 2026-09-06 session: transcript mining of 40 sessions, corpus growth across release commits, git and tracker history of ceiling work. Brainstormed in the same session; the audit's numbers are reproducible from the repo and `~/.claude/projects/` transcripts.
