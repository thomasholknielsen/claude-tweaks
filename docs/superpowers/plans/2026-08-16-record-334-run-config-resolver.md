# Migrate the six run-config direct reads onto the resolver's `--run` overlay (#334) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every skill-prose site that reads a pipeline run's `config.yml` directly (with an inline copy of the schema default) resolves through `bin/resolve-policy.js --run "$PIPELINE_RUN_DIR"` instead — one read path, defaults stated once in `POLICY_KEYS`, and the documented `policy.yml` fallback level served between run config and schema default.

**Architecture:** Prose-only. Six sentences in five skill files change shape from "read `{key}` from `config.yml` (default `{x}`)" to "resolve `{key}` — `{VAR}=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values {key})`". One site (`review/step3-routing.md:75`) layers a ceiling-conditional default on top of "nothing set" — it keeps that logic but detects "nothing set" from the resolver's JSON envelope (`source: "default"`) rather than from a missing `config.yml` line. No code changes.

**Tech Stack:** markdown skill prose; `node --test` conformance suites pin prose repo-wide.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T122937-spec-332-602-334/spec-334/work/334-spec.md`

## Global Constraints

- Work from the run's shared worktree — verify with `pwd` + `git rev-parse --show-toplevel` before every commit; both must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-332-602-334`.
- Commit messages: `{Verb} {what} — {detail}`, imperative, ending with `refs #334`.
- One plain Bash command per tool call; Edit tool for edits; `git add <paths>` then `git commit -m ...` as separate calls; no `git stash`.
- Canonical invocation form (from `skills/_shared/policy-schema.md` § Canonical read path): `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" [--values] [--run "$PIPELINE_RUN_DIR"] <key>`; `${CLAUDE_PLUGIN_ROOT}` is a model-resolved placeholder per `docs/skill-authoring.md` — write it exactly like that. Run-dir resolution before the call is `_shared/pipeline-run-dir.md`'s job — cite it, do not restate.
- The key names are post-#332: `auto-fix-threshold`, `tidy-aggressiveness`, `review-auto-apply-ceiling`, `overlap`, `design-intent`. Never reintroduce `review-severity-floor`.
- Never write `TBD`/`TODO`; never restate a schema default inline (the point of the record).
- Do not run the full `npm test`; the controller runs it after the task.

---

### Task 1: Migrate all six sites (one batched dispatch — same-shape edits)

**Files:**
- Modify: `skills/test/SKILL.md:175`
- Modify: `skills/tidy/step-6-auto.md:6`
- Modify: `skills/review/step3-routing.md:51` and `:75`
- Modify: `skills/specify/decomposition-mode.md:56`
- Modify: `skills/specify/design-pre-steps.md:107`
- Test: `tests/sweep-backstop.test.js`, `tests/policy-key-naming.test.js`, and every `tests/*.test.js` whose name matches `test|tidy|review|specify|conform|manifesto|flow` (run them — conformance suites pin prose)

**Interfaces:** none — prose only.

- [ ] **Step 1: `skills/test/SKILL.md:175`** — replace `Read \`auto-fix-threshold\` from \`config.yml\` (resolve the run dir via \`_shared/pipeline-run-dir.md\`; default \`lint+type\`) and route per` with: `Resolve \`auto-fix-threshold\` — \`AUTO_FIX_THRESHOLD=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values auto-fix-threshold)\` (run dir per \`_shared/pipeline-run-dir.md\`; the resolver serves the run's Manifesto answer, then \`policy.yml\`, then the schema default) and route per`. Keep the rest of the sentence.

- [ ] **Step 2: `skills/tidy/step-6-auto.md:6`** — replace `read \`tidy-aggressiveness\` from \`config.yml\` (default \`moderate\`; \`conservative\` is the documented opt-down).` with `resolve \`tidy-aggressiveness\` — \`TIDY_AGGRESSIVENESS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values tidy-aggressiveness)\` — the same variable the standalone-auto path below already resolves without \`--run\`; \`conservative\` is the documented opt-down.` (The opt-down note stays; the parenthetical default goes.) Check line ~53 (the standalone-auto read) uses the same variable name — align if it differs.

- [ ] **Step 3: `skills/review/step3-routing.md:51`** — replace `- \`review-auto-apply-ceiling\` value from \`config.yml\` (default \`low\`).` with `- \`review-auto-apply-ceiling\`, resolved per the Auto mode section below (resolver \`--run\` overlay; ceiling-conditional default when nothing is set).`

- [ ] **Step 4: `skills/review/step3-routing.md:75`** — replace `read \`review-auto-apply-ceiling\` from \`config.yml\` (default \`low\`). When no explicit value was set (no CLI arg, no Manifesto override, no project policy), the default is ceiling-conditional:` with `resolve \`review-auto-apply-ceiling\` — \`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" review-auto-apply-ceiling\` (JSON envelope, not \`--values\`, because the next sentence needs \`source\`). When the envelope's \`source\` is \`default\` (no CLI arg, no Manifesto override, no project policy — nothing set at run or policy level), the effective default is ceiling-conditional:` and keep the rest of the paragraph verbatim (medium at `unattended`, `low` otherwise; explicit value at any level still wins). Then, in the routing table's header row that says `Default action under \`review-auto-apply-ceiling: low\``, no change.

- [ ] **Step 5: `skills/specify/decomposition-mode.md:56`** — replace `read \`overlap\` from \`config.yml\` (default \`companion\`). Apply per policy:` with `resolve \`overlap\` — \`OVERLAP=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values overlap)\`. Apply per policy:`. The table below it that labels one row `\`companion\` (default)` may keep that label — it describes the schema default, it does not re-declare it as a fallback constant. Leave it.

- [ ] **Step 6: `skills/specify/design-pre-steps.md:107`** — replace `**Auto mode:** read \`design-intent\` from \`config.yml\`. Apply per the Manifesto value:` with `**Auto mode:** resolve \`design-intent\` — \`DESIGN_INTENT=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values design-intent)\`. Apply per the resolved value:`.

- [ ] **Step 7: Negative controls**

Run: `grep -rn "from \`config.yml\`" skills` → no output.
Run: `grep -rnE "\(default \`(lint\+type|moderate|low|companion)\`\)" skills/test/SKILL.md skills/tidy/step-6-auto.md skills/review/step3-routing.md skills/specify/decomposition-mode.md` → no output.
Run: `grep -c "resolve-policy.js\" --run" skills/test/SKILL.md skills/tidy/step-6-auto.md skills/review/step3-routing.md skills/specify/decomposition-mode.md skills/specify/design-pre-steps.md` → every file ≥ 1 (step3-routing ≥ 1 since line 51 now points at line 75's read).

- [ ] **Step 8: Run the prose-pinning suites**

Run: `node --test tests/sweep-backstop.test.js tests/policy-key-naming.test.js`
Then `ls tests/*.test.js | grep -iE "test-skill|tidy|review|specify|conform|manifesto|flow"` and run each match. Expected: PASS. If a conformance test pins the exact old sentence, update the assertion to the new sentence (state which in the report).

- [ ] **Step 9: Commit**

```bash
git add skills/test/SKILL.md skills/tidy/step-6-auto.md skills/review/step3-routing.md skills/specify/decomposition-mode.md skills/specify/design-pre-steps.md
git commit -m "Migrate the six run-config direct reads onto resolve-policy.js --run — inline defaults deleted, policy.yml fallback level gained, review's ceiling-conditional default keys off the envelope's source, refs #334"
```

Behavior delta to state in the commit body: each site now honors a `policy.yml` value when the run's `config.yml` has no line for the key (previously it jumped straight to the inline default).

## Self-review notes

- Spec coverage: Deliverable 1 → Steps 1-6; 2 (state the delta) → Step 9 commit body; 3 (post-#332 name) → the review sites already spell `review-auto-apply-ceiling` (verified at plan time), so this record reads the new key.
- ACs: greps → Step 7; suites → Step 8 + controller `npm test`.
- Fact-check at plan time: all six sentences quoted above were read verbatim from HEAD (`89f71a0d`); `tidy/step-6-auto.md:53` already uses `TIDY_AGGRESSIVENESS=$(node ".../resolve-policy.js" --values tidy-aggressiveness)`.
