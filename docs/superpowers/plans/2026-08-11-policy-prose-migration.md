# Migrate policy prose-grep read sites to the resolver (#330)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-11T195542-spec-329-330-331/spec-330/work/330-spec.md` (record #330)

**Canonical invocation form (Task 0 records it — resolved by #170):** keep the `${CLAUDE_PLUGIN_ROOT}` spelling as a **model-resolved placeholder** per `docs/skill-authoring.md`'s "Plugin-root references (`CLAUDE_PLUGIN_ROOT`)" section — the hybrid option. Two shapes, used verbatim at every migrated site:

- JSON envelope (agent reads the JSON): `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" [--run "$PIPELINE_RUN_DIR"] <key> [<key>…]`
- Shell scalar capture (replaces `grep|sed` pipelines): `VAR=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values <key>)` — `--values` prints one value per line in request order (Task 0 adds it)

**Fresh enumeration (2026-08-11, post #329+#321 merge):** 69 files under `skills/**` mention `policy.yml`; 242 mention-lines total. The migration checklist below is authoritative; everything not listed is descriptive-only and is itemized per file in the superset review at the end.

## Task 0 (central): `--values` output mode + invocation-form record

**Files:** `bin/resolve-policy.js`, `tests/resolve-policy-cli.test.js`, `skills/_shared/policy-schema.md`

Additive CLI extension (expand-contract; #329's JSON contract unchanged): `--values` prints each requested key's resolved `value` as one plain line, in request order — no JSON. Coerced values print natively (`true`, `14`); list-typed keys print the raw comma string; a `null` value (no-default key unset) and an `{error}` entry both print an empty line (mirrors the old grep-empty behavior). `model-profiles` under `--values` is an invocation error (exit 1) — it has no scalar form. Spawn tests for each case; doc the flag in the Canonical read path section. Also close ledger #2 here: add the one documenting line that list-typed keys resolve to the raw comma string (callers split on `,`).

## Migration rules (every cluster task follows these verbatim)

1. Replace each checklist site with the canonical form above — `--values` shape for shell-variable captures, JSON shape where prose has the agent read values directly. Batch multi-key reads at sites reading several keys into ONE call.
2. Delete the site's inline default restatement (e.g. "(default 3)", "or 150 when absent") — the resolver applies defaults; `POLICY_KEYS` + `_shared/policy-schema.md` are the only default homes. KEEP behavioral prose where the number is the rule being described, not the key's default being quoted (AC 3's distinction).
3. Keep every purely descriptive mention (schema tables, "when policy.yml sets X…" behavior descriptions, write instructions — `/init` WRITES policy.yml and is untouched except where it *reads*).
4. Dispatcher-inlined regions: before editing a file that feeds subagent prompts, confirm which region gets inlined (grep `tests/` + `bin/lib/*/tests/` for the file's basename; read the dispatching skill's inline block when no pinning test exists). The resolver call must land INSIDE the inlined region.
5. `--run "$PIPELINE_RUN_DIR"` only at sites that are pipeline-scoped (Manifesto levers, run-config overlays); project-level reads (work-links, integration-branch, budgets) omit `--run`.
6. The deprecated-alias notice moves to prose: where dispatch prose reads `dispatch-batch-size`, it now surfaces the deprecation notice when the envelope carries `"renamed-from"` (the resolver itself never writes stderr).
7. Do not change what any skill DOES with a resolved value. Do not rename keys (#331). Do not touch `docs/skill-graph.md`.

## Task A: `_shared` read-site cluster

**Files (8):** `skills/_shared/integration-branch.md` (:20 pipeline), `skills/_shared/worktree-setup.md` (:96 merge-check prose read + :113 pipeline), `skills/_shared/pending-review-durability.md` (:106), `skills/_shared/trust-table.md` (:75 pipeline, :170 trust-revert-window-days prose read), `skills/_shared/github-pr-scan.md` (:182, :369 pipelines; :195, :323 backlog-fetch-limit prose reads), `skills/_shared/record-queue-fetch.md` (:25 backlog-fetch-limit prose read), `skills/_shared/health-filing-digest.md` (:35 — delete the "grep + sed" idiom reference), `skills/_shared/harness-health-analysis.md` (:97 pipeline; :92-93 budget reads with inline defaults)

## Task B: wrap-up / dispatch / backlog / assess / routine / visualize cluster

**Files (11):** `skills/wrap-up/verification-brief.md` (:134), `skills/wrap-up/unblocked-records.md` (:8), `skills/wrap-up/review-console.md` (:92), `skills/wrap-up/adr-curation.md` (:21 doc-convention.adr read), `skills/dispatch/SKILL.md` (:102 pipeline; :313/:321 config-table read framing + alias-notice rule 6), `skills/dispatch/settle-and-merge.md` (:27 default restatement, :30, :118), `skills/backlog/grant-mode.md` (:24-25 → one multi-key call; :143 JS-comment read; :153/:272 fleet-daily-grant-cap read framing), `skills/backlog/refine-mode.md` (:139, :148), `skills/assess-agent-autonomy/SKILL.md` (:232-233 → one multi-key call), `skills/routine/fleet.md` (:37 five-key read → one multi-key call, drop inline defaults; table render stays), `skills/visualize/record-graph.md` (:106)

## Task C: build / flow / specify / review / tidy / capture / research / harness-health cluster

**Files (14):** `skills/build/SKILL.md` (:192 project.maturity), `skills/build/worktree-setup.md` (:31 merge-check), `skills/build/plan-audit.md` (:22 scope-keywords-required, :30 scope-creep precedence → resolver with `--run`), `skills/build/build-options.md` (:33 default-resolution policy step → resolver), `skills/flow/SKILL.md` (:115 auto-mode, :120 git-strategy), `skills/flow/manifesto.md` (:20, :144 auto-mode), `skills/flow/validation.md` (:13 merge-check), `skills/flow/survey.md` (:12/:18/:63 depth/creative-survey operative checks — one resolver read each, descriptive mentions stay), `skills/specify/decomposition-mode.md` (:110 project.maturity), `skills/review/review-effort-derivation.md` (:42 thresholds — keep the default object AS the documented shape but source it via resolver; :45 review-effort-floor), `skills/tidy/step-6-auto.md` (:42 tidy-aggressiveness), `skills/capture/SKILL.md` (:60, :64), `skills/research/verify-mode.md` (:176 research-mode precedence step), `skills/harness-health/judge-procedure.md` (:50 pipeline; :45 budget default restatement)

## Task D: precedence-section rewrite

**Files (3):** `skills/_shared/auto-mode-contract.md` — rewrite the precedence section (:54, :239 region) to name `bin/resolve-policy.js` as the executing mechanism (CLI arg > run `config.yml` via `--run` > `policy.yml` > schema default); Manifesto-lever read sites now cite it instead of re-executing precedence in prose. `skills/_shared/auto-mode-card.md` (:20 precedence list — name the resolver). `skills/help/reference-card.md` (:164 — one-line pointer to the canonical read path, only if it currently implies a different mechanism; else untouched).

## Central verification (after all tasks)

1. **Idiom greps zero** (with planted-line negative control in a scratch copy first): `grep -rn 'grep -E "\^' skills --include='*.md'` filtered to policy.yml sites, and the `head -1 | sed` + policy.yml co-occurrence sweep — zero matches.
2. **Superset review:** `find skills -name '*.md' -print0 | xargs -0 grep -ln 'policy\.yml'` — every remaining file itemized, each mention classified descriptive-only (this list lands in the ledger + consolidated console).
3. `git diff docs/skill-graph.md` — empty.
4. Full `npm test` — the skill-audit and inlined-region suites in particular.
