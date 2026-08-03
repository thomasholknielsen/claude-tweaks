# Harness Health — Step 7: FILE

The full filing procedure for `/claude-tweaks:harness-health` Step 7, lazy-loaded from `SKILL.md`. Covers the classification-to-scoring fold, the born-`ready` rule, the retry-queue drain and regressed-reopen mechanics, label bootstrapping, the interactive filing gate, and the Type-expression branch.

Read this when a run actually reaches Step 7 — a firing that finds nothing due, or emits no surviving findings, never needs it.

---

**Step 7 — FILE.**

Every harness-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:harness-health`; classification folds into the scoring axis instead of staying a producer-specific label the gate must know:

| Classification | risk | effort |
|---|---|---|
| `additive` | `risk:low` | `effort:low` |
| `restructural` | `risk:medium` | `effort:high` |
| kind `new-skill` (no classification-driven scoring) | unscored — no `risk:*` label | unscored — no `effort:*` label |

`new-skill` candidates file with no scoring labels by design — there is no classification-driven
tier to guess from a kind that carries no scoring evidence. `/claude-tweaks:assess-agent-autonomy`'s
`grant-check` mode (`backlog refine`'s grant sub-stage) recognizes a `new-skill` finding from its body content
directly (it reads "**New skill candidate**" with a "Proposed new skill" deliverable) rather than
depending on a scoring label being present, and can still recommend `auto:build` for a
well-specified proposal — building the draft autonomously is reasonable, since a human confirms the
grant and reviews again before any merge — while recommending against `auto:merge`, since a new
skill file shapes future agent behavior regardless of how clean the diff looks. Every filed finding
is **born-`ready`** — harness-health findings are agent-sized and spec-shaped by construction
(Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already
applied and appear directly in the authorization gate's worklist, skipping maturation. `toIssuePayload` (`bin/lib/harness-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload`, then appends the classification/kind-derived diagnostic label (`harness-health:additive` / `harness-health:restructural` / `harness-health:new-skill`) after the canonical labels — the emitted label set is exactly `by:harness-health` + scoring (when present) + `ready` + the diagnostic label, matching the table above.

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures and check for regressed reopens (see `_shared/health-state.md`) — both mechanics below follow the canonical shape in `_shared/health-filing-mechanics.md` (`{BINARY}` = `harness-health.js`, `{PREFIX}` = `harness-health`); check that file when either changes to keep this skill's copy in sync with its three siblings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue drain --root . > /tmp/harness-health-retry-payloads.json
```

For each payload in `/tmp/harness-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/harness-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue update /tmp/harness-health-retry-results.json --root . > /tmp/harness-health-escalated.json
```

If `/tmp/harness-health-escalated.json` is non-empty, file (or update) a `harness-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Canonical pairs copied verbatim from `_shared/label-bootstrap.md`'s `LABELS_JSON`, plus harness-health's own diagnostic labels:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:harness-health", "Origin: filed by the harness-health skill"],
#  ["risk:low",          "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",       "Scoring: moderate blast radius — review before merge recommended"],
#  ["effort:low",        "Scoring: small, agent-sized change"],
#  ["effort:high",       "Scoring: large change — consider decomposition before building"],
#  ["ready",             "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
#  ["harness-health:additive",     "Safe, mechanical patch - additive change with no removed behavior"],
#  ["harness-health:restructural", "Structural change requiring human review before applying"],
#  ["harness-health:new-skill",    "Proposes a new skill candidate surfaced by harness-health"],
#  ["harness-health:filing-failed", "Escalation: gh issue create failed repeatedly for this fingerprint — needs human attention"]]
```

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, and `intent` are all present directly on the payload object, alongside `title`, `body`, `labels`, and `type`. These stay on the payload as triage metadata — nothing here branches on them anymore, though Step 7's batch table renders `category`/`classification`/`confidence`/`reversibility` as columns. The finding's `oldString`/`newString` patch text is deliberately **not** duplicated as top-level fields: `payload.body` already carries both verbatim in its fenced Current/Proposed (or "Remove this content") blocks, and that markdown is what ships to GitHub. Read the patch out of `body` if you need it. `intent` is the exception that stays: it is a one-word classification rather than duplicated content, and with `newString` gone it is the only top-level signal distinguishing a removal from a replacement.

For a payload whose fingerprint marker (embedded in `payload.body`, read via `extractFingerprint`) matches a `status: "regressed"` entry in `.claude-tweaks/harness-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility | Recommended |
   |---|-------|----------|-----------------|------------|----------------|-------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`. (When `--min-confidence` was passed, findings below it never reach this table at all — Step 6's `validate-findings` already diverted them into the `remembered` cache before Step 7 runs.)

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

3. If "Override specific items" was chosen, the follow-up is ordinary free-text chat in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's `Other` field. The user names findings by number and states each one's disposition — `File issue` (file as a GitHub harness-health issue), `Capture` (via `/claude-tweaks:capture` for later triage), `/claude-tweaks:specify directly` (promote straight to a spec, skipping the issue), or `Dismiss` (run `mark` so it doesn't reappear) — e.g. "file 2, capture 5, dismiss 7." Apply the stated disposition to those specific findings; every finding not named keeps its Recommended-column value.

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-overridden ones otherwise), call `gh issue create`.

**Type expression branch** (canonical shape in `_shared/health-finding-shapes.md` — check that file when either changes to keep this skill's copy in sync with its three siblings). Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table; the key is written by `/init`). `work-types: native` applies `payload.type` (always `task`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:task` label instead (the pair lives in `record.js`'s `TYPE_LABELS`):

```bash
# Example: an additive finding, work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type task \
  --label by:harness-health --label risk:low --label effort:low --label ready --label harness-health:additive

# Same finding, work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:harness-health --label risk:low --label effort:low --label ready --label harness-health:additive --label type:task
```

Apply the same branch to every payload regardless of classification/kind — a `restructural` payload's call carries `risk:medium`/`effort:high`/`harness-health:restructural` instead, and a `new-skill` payload's call carries only `by:harness-health`/`ready`/`harness-health:new-skill` (no scoring labels), per the mapping table above; only the `--type task` vs. `--label type:task` branch and the `--label` list change, never the underlying `gh issue create --title/--body`. This applies uniformly — CLAUDE.md findings, design-artifact findings, additive skill/rule patches, restructural patches, and new-skill candidates all file the same way. `/harness-health` never edits anything directly; matching `/code-health`, it only ever judges and files.

In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.
