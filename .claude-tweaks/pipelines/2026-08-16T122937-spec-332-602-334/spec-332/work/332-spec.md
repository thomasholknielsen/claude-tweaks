---
record: 332
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: policy-read-path-and-collapse:parked-policy-key-rename-program-decide-after-the-collapse-s
surface: backend
---
# 332: Policy key naming convention + rename program: flat kebab-case, review-auto-apply-ceiling, auto-merge spelling

Surface: backend

## Current State

The policy read-path family (#328: #329 resolver, #330 prose migration, #331 collapse) shipped 2026-08-12. This record was its Phase 4 decision gate — "judge the surviving key names against the post-collapse schema." The gate has now been judged (2026-08-16), against `bin/lib/policy-schema.js`'s 48 `POLICY_KEYS`:

**Verdict per candidate**

1. **Dot-vs-dash is a missing rule, not a taste question.** Six keys use a dot (`worktree.always`, `project.maturity`, `harness-health.scoped-rule-budget`, `harness-health.always-loaded-budget`, `doc-convention.adr`); the other 42 are dashed. The dot does not encode ownership — `harness-health.*` is a skill, but `worktree`, `project`, `doc-convention` are not, while `dispatch-*`, `automerge-*`, `model-*`, `review-*` are just as skill-owned and are dashed. Nothing in `skills/_shared/policy-schema.md` states a naming convention. Worse, a dotted key masquerades as a nested-YAML path in a flat-line parser: a user who writes `worktree:\n  always: true` gets silently defaulted, and neither `auditPolicy` nor the hook can tell that from "unset". Grouping already lives in the schema's `category` metadata (#533) — the key should be an identity, not carry classification. **Rule: flat kebab-case, no dots.**
2. **`review-severity-floor` is misnamed.** It is the *maximum* severity auto-applied (`medium` → auto-apply Low AND Medium; stage High — `skills/review/step3-routing.md`), i.e. a ceiling, and this schema already uses `-ceiling` for "max" (`model-ceiling`, `dispatch-retry-ceiling`, the autonomy ceiling). Its `-floor` suffix also collides with `review-effort-floor`, which *is* a genuine floor. **Rename to `review-auto-apply-ceiling`.**
3. **`auto-mode` vs `autonomy` — keep, deliberately.** Orthogonal axes (interaction stops vs. authority); the confusion is conceptual, not spelling — any name containing "auto" stays proximate, and a key not named after the `auto-mode` contract it toggles (`_shared/auto-mode-contract.md`, 90+ citing files) would be worse. The category split (`pipeline-behavior` / `autonomy-trust`) is the correct disambiguation surface. **No rename.** Recorded here so the question is not re-opened.
4. **Spelling split surfaced by this pass:** `automerge-max-lines` / `automerge-max-files` vs `housekeeping-auto-merge` and the `auto:merge` label. **Rename to `auto-merge-max-lines` / `auto-merge-max-files`** — the hyphenated form is what the label and the newer key already use.

`worktree.always` is in the rule's scope but is **carved out to its own record** (#602 — "Rename `worktree.always` → `worktree-always`"): it is the hook's hot path, read by a bespoke literal in `bin/lib/policy.js:34` that bypasses the resolver's aliases, cited by 15 test files and ~70 prose files, and deserves an independently revertible change — the same reasoning that gave #537 its own release. This record's conformance test therefore carries an explicit pending-rename allowance for that one key, which the sibling removes.

## Deliverables

1. **Naming convention, written once.** A `## Key naming` section in `skills/_shared/policy-schema.md` stating: keys are flat kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), never dotted (with the nested-YAML-masquerade reason); grouping is the `category` metadata, never the key; suffix vocabulary — `-floor` = minimum the value may fall to, `-ceiling` = maximum permitted, `-cap` = count limit; renames go through `RENAMED_KEYS` + `_shared/policy-deprecations.md`, never a bare rename.
2. **Conformance test** — a new test in `tests/policy-schema.test.js` (or a sibling file under `tests/`) asserting every `POLICY_KEYS` key and every `RENAMED_KEYS.replacedBy` matches the regex, with a named `PENDING_RENAMES = ['worktree.always']` allowance and a comment naming #602 as the record that empties it. Discrimination check per `[IL-105]`: temporarily add a dotted key and confirm the test fails.
3. **Seven renames**, each = one `POLICY_KEYS` row renamed (metadata preserved) + one `RENAMED_KEYS` alias (identity `migrate`, `renamed-from` attribution — the same shape as `merge-check` → `branch-divergence-check`) + one entry in `skills/_shared/policy-deprecations.md` + citation sweep:
   | Old | New |
   |---|---|
   | `review-severity-floor` | `review-auto-apply-ceiling` |
   | `automerge-max-lines` | `auto-merge-max-lines` |
   | `automerge-max-files` | `auto-merge-max-files` |
   | `project.maturity` | `project-maturity` |
   | `harness-health.scoped-rule-budget` | `harness-health-scoped-rule-budget` |
   | `harness-health.always-loaded-budget` | `harness-health-always-loaded-budget` |
   | `doc-convention.adr` | `doc-convention-adr` |
4. **`policy-deprecations.md`'s shared predicate generalized** — clause (b) currently hard-codes "the release that shipped #331"; reword to "the release that shipped the key's rename or retirement (named per entry) is at least 6 months old per `docs/shipped-versions.tsv`", so each new entry names its own release.
5. **Citation sweep** of live prose and code — every occurrence of the seven old names under `skills/`, `bin/`, `tests/`, `docs/`, `README.md`, `agents/`, `hooks/` becomes the new name, *except* deliberate tombstones: the `RENAMED_KEYS` entry, its `policy-deprecations.md` entry, and historical narrative in `docs/incident-log.md` / `docs/shipped-versions.tsv` / archived `.claude-tweaks/pipelines/**` run artifacts (untouched). `bin/lib/wrap-up/facts.js:131` passes both harness-health keys to the resolver by literal — rename there. `skills/init/**` writes `project.maturity` and `doc-convention.adr` into generated `policy.yml` files — must write the new names.
6. **This repo's own `.claude-tweaks/policy.yml`** — none of the seven keys are set here; verify with `grep -nE "^(review-severity-floor|automerge-max-(lines|files)|project\.maturity|harness-health\.|doc-convention\.adr)" .claude-tweaks/policy.yml` (expect no hits) and state that in the change.
7. **The `auto-mode` keep verdict** recorded in the new `## Key naming` section as a one-line "deliberately not renamed" note with the reason, so it is not re-litigated.

## Acceptance Criteria

- `node bin/resolve-policy.js --values review-auto-apply-ceiling auto-merge-max-lines auto-merge-max-files project-maturity harness-health-scoped-rule-budget harness-health-always-loaded-budget doc-convention-adr` resolves all seven with schema defaults; requesting any old name resolves the replacement key's value (the alias contract pinned by `tests/resolve-policy-lib.test.js` — `unknown-key` is reserved for retirements with `replacedBy: null`).
- A `policy.yml` line using each old name resolves under the new name with `"renamed-from"` attribution and `auditPolicy` lists it under `renamedKeys` with the suggested replacement — one test per rename, or one table-driven test over the seven.
- The naming-conformance test exists, passes on the new schema, and was shown to fail when a dotted or non-kebab key is temporarily added (state the discrimination check's output in the change).
- `grep -rnE "review-severity-floor|automerge-max-(lines|files)|project\.maturity|harness-health\.(scoped-rule|always-loaded)-budget|doc-convention\.adr" skills bin tests docs README.md agents hooks` returns only the tombstone sites named in Deliverable 5 (list them in the change).
- `skills/_shared/policy-schema.md`'s per-key table shows the seven new names and no old ones (the schema-doc parity test already pins this); the `## Key naming` section exists and states the `auto-mode` keep verdict.
- `skills/_shared/policy-deprecations.md` has seven new entries and a per-entry release reference in its shared predicate.
- `npm test` green.

## Technical Approach

- Follow the exact mechanics #331 used for `merge-check` → `branch-divergence-check` (see the `RENAMED_KEYS` comment block in `bin/lib/policy-schema.js` and that key's `policy-deprecations.md` entry): rename the `POLICY_KEYS` row, add the alias with `migrate: (value) => value`, add the deprecations entry, sweep. The `renamed-from` envelope tagging and the old+new precedence rule (new key wins) are already implemented generically — no resolver code change is expected beyond the two arrays.
- Update `tests/policy-schema.test.js`'s `RENAMED_KEYS names every alias and retirement` test and the doc-parity assertions; the `doc-convention.adr` and `harness-health.scoped-rule-budget-style` tests in `tests/policy.test.js` / `tests/policy-schema.test.js` were written to exercise dotted-key regex safety — keep that coverage by pointing them at a synthetic dotted key or by keeping one dotted fixture in `RENAMED_KEYS` (the aliases themselves remain dotted, which is a real input the parser must still handle).
- Sweep with `grep -rlF` per old name, then edit; re-run the Acceptance Criteria grep as the negative control. Do not touch `docs/incident-log.md` history or `.claude-tweaks/pipelines/**`.
- The build order relative to siblings: this record first, then #602 (removes the `PENDING_RENAMES` allowance), then #334 (which reads `review-auto-apply-ceiling` at the two `step3-routing.md` sites).

## Gotchas

- `review-severity-floor` appears in `skills/flow/manifesto.md`'s config.yml example and in the `_shared/auto-mode-contract.md` lever list — both are live prose, sweep them. Archived run dirs under `.claude-tweaks/pipelines/**` (140+ hits) are history — do not touch.
- The `harness-health.*` keys are passed to the resolver by literal in `bin/lib/wrap-up/facts.js` — a prose-only sweep would leave that call requesting an `unknown-key`.
- `skills/init/**` *writes* `project.maturity` and `doc-convention.adr` into generated policy files (bootstrap-steps, isolated-write-step, worktree-policy-finalization, phase-3-classification) — a rename that only fixes reads leaves init minting deprecated keys on every new project. This is the `[IL-97]` write-vs-read sweep class recorded for `work-links`.
- The `POLICY_KEYS` metadata test forbids a summary containing its own key verbatim — check the seven renamed rows' summaries after renaming (`auto-merge` may now appear in the auto-merge rows' summaries).
- As built (architecture alignment, Beneficial): the sweep also renamed the five sibling `doc-convention.<genre>` keys proposed in the still-live design doc `docs/superpowers/specs/2026-08-07-doc-prior-art-detection-design.md` to `doc-convention-<genre>` — beyond this record's seven-key table, but that doc's Phase 2 is unshipped and must not mint dotted keys under the convention this record establishes.
- Framing: this record bakes its solution by design — the whole point of the parked gate was to make the naming decision, and the decision is recorded above with its reasoning. The premise ("dotted keys are an unstated, inconsistent convention with a nested-YAML hazard") was validated by reading the schema and the flat-line parser; the solution (flat kebab-case) was judged on its own merits against the `owner.key` alternative (which needs a per-key ownership judgment and an allowlist to maintain, and grows the masquerade hazard).

## Original request

[Parked] Policy key rename program — decide after the collapse ships

**Trigger:** #331 (the collapse leaf) closes — i.e. the second minor release of the policy read-path family ships. Judge this against the *post-collapse* schema, not today's.

**Parked:** 2026-08-11, at decomposition time of the policy read-path family (#328). This is Phase 4 of that design — an explicit decision gate, deliberately unscheduled, filed so the gate survives the design doc's deletion.

---

## The decision

Whether to run the cosmetic rename program over the surviving policy keys, now that (post-#329/#330) a rename costs one `POLICY_KEYS` row + one `RENAMED_KEYS` alias entry + a citation-only prose sweep, instead of a repo-wide read-site migration.

Candidates flagged by the 2026-08-11 analysis, to be re-judged against the post-#331 schema:

- `auto-mode` — confusable sibling of `autonomy` (unrelated semantics; reads as the same family)
- `review-effort-floor` vs `review-severity-floor` — similar names, different axes (review depth vs auto-apply cutoff)
- Dash-vs-dot namespace consistency — six keys use dot namespacing (`worktree.always`, `project.maturity`, `harness-health.*`, `doc-convention.adr`), the rest are dashed; a full `namespace.key` scheme was proposed and deferred
- Whatever new confusions the collapse itself surfaces or resolves

## Why it was parked rather than built

The design's core finding: the sprawl lived in the read architecture, not the names. With the collisions (`merge-check`) and the axis duplication (`execution.always`/`execution-strategy`) fixed by #331, most surviving names may be fine as-is — and a rename program's cost is then pure churn against marketplace users' existing `policy.yml` files (each rename is cheap, but every one still adds an alias with a removal condition to track). This is a taste call a human makes against the actual post-collapse schema, not scheduled work.

## What resolves it

Either: (a) a human reads `skills/_shared/policy-schema.md` post-#331 and decides the surviving names are acceptable → close this record with that verdict; or (b) decides on a rename list → `/claude-tweaks:specify` this record into a shaped leaf (the mechanics are one schema row + one alias entry + citation sweep per key, per the family's Decision Rationale on #328).

**Related:** #328



<!-- work-fingerprint: policy-read-path-and-collapse:parked-policy-key-rename-program-decide-after-the-collapse-s -->


