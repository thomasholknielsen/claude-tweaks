# Policy read-path unification and key collapse — design

**Date:** 2026-08-11
**Status:** Approved in brainstorming; awaiting `/claude-tweaks:specify` decomposition
**Refs:** #288 (lever-consolidation prior art), #159 (parked work-record-config home question — untouched by this design, but Phase 1's resolver is the natural home if it ever un-parks)

## Problem

`.claude-tweaks/policy.yml` is one flat file read four different ways:

1. `bin/lib/policy.js` — three bespoke readers (`isWorktreeAlwaysOn`, `readIntegrationBranch`, `readListKey`), each with its own regex.
2. `bin/lib/policy-schema.js#resolveValue` — documented as the canonical coercion contract, with exactly one caller today (`bin/lib/issues/trust.js`).
3. `bin/lib/model-profiles/policy-fragment.js` — a dedicated nested-block parser for the one nested key (`model-profiles`).
4. The dominant idiom: a verbatim `grep -E "^{key}:" … | sed …` pipeline copy-pasted across skill prose (measured 2026-08-11: roughly forty sites; `work-links` alone has six literal instances, `integration-branch` five). Each prose site also restates the key's default inline — the IL-40 drift class, once per site.

Because every consumer hardcodes both the key name and the default, any rename or default change is a repo-wide sweep. That architecture — not the key names — is what makes the schema feel sprawling. Secondary problems, confirmed against the consumer map:

- **Lock/default axis duplication:** `execution.always` vs `execution-strategy` are two keys for one axis.
- **Literal name collision:** `merge-check` the boolean pre-flight lever vs `merge-check` the `/claude-tweaks:assess-agent-autonomy` verdict mode — flagged inside `_shared/policy-schema.md` itself.
- **Unsettable key:** `review-diff-heuristic-thresholds` is a nested object; the flat-line format has no encoding for it, and validation is presence-only. It cannot be configured today.
- **Part-fiction ownership:** `section-confirmation` names `/superpowers:brainstorming` (an out-of-repo plugin that cannot read this file) as an owner; its only in-repo consumer is `/claude-tweaks:deepen`.
- **Dead contract half:** `research-mode`'s schema row claims `/flow`'s pipeline config is consulted first, but `skills/flow/**` contains no occurrence of the key and it is not a Manifesto lever.
- **Restated precedence:** the decision chain (CLI arg > run `config.yml` > `policy.yml` > skill default) is defined once in `_shared/auto-mode-contract.md` but re-executed in prose at every Manifesto-lever read site.

Ground truth on usage: this repo — the plugin's most intensive user — sets 7 keys.

## Decision

Sequence the work as **read-path unification first, logic collapse second, wholesale renaming last-and-optional**:

- Phase 1 builds one resolver; Phase 2 migrates all prose read sites onto it. After that, a key's name and default exist in exactly one place (`POLICY_KEYS`), so any later rename costs one schema row plus one alias entry.
- Phase 3 collapses the small set of keys that cause real confusion. It does **not** chase key-count: the consumer map showed zero dead keys, and the Manifesto-only levers are legitimate project-level defaults that Phase 1's `--run` overlay resolves uniformly.
- Phase 4 is a decision gate, not scheduled work: re-judge the cosmetic `namespace.key` rename program (`auto-mode` vs `autonomy`, `review-effort-floor` vs `review-severity-floor`, dash/dot consistency) against the post-Phase-3 schema, when renames are cheap.

Rejected alternatives:
- **Wholesale rename first** — maximum churn (every prose read site edited for names alone), a merge-conflict magnet across concurrent sessions, and it leaves the four parsers and the axis duplication intact.
- **Nested YAML restructure** — the zero-runtime-deps flat-line constraint is deliberate and load-bearing; dot-prefixes already provide namespacing within it.
- **Merging `git-strategy` into `worktree.always`** — symmetry at the highest churn-and-risk price in the repo: `worktree.always` is the hook-enforced hot path with a test-pinned coverage contract and the widest consumer set, while `git-strategy` has one real read site. The asymmetry (one is enforcement, one is a default) is tolerable.

## Phase 1 — Resolver

**Deliverable:** `bin/resolve-policy.js`, invoked from skill prose as:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" autonomy work-links integration-branch
```

- Positional args are key names; output is a single JSON **object** (never a bare array — IL-121) keyed by requested name: `{"autonomy": {"value": "unattended", "source": "policy"}, …}`.
- `--run <dir>` is optional. When present, the run's `config.yml` is overlaid ahead of `policy.yml` in precedence; `source` reports `run-config | policy | default`. Verified 2026-08-11 against a live run dir: `config.yml` is flat `key: value` lines, `parseFlatLines`-compatible; its non-policy bookkeeping keys (`specs:`, `created:`, `mode:` …) are never requested and therefore never resolved. CLI-arg overrides stay with the calling skill — only it knows them.
- Coercion and defaults come from the existing `resolveValue` / `POLICY_KEYS`; `source: "default"` means the schema default was applied.
- An unknown key resolves to an explicit `{"error": "unknown-key"}` entry — never a silent empty (IL-115: absence and failure must not degrade to the same sentinel).
- **Alias resolution is centralized here:** when a requested key has a `RENAMED_KEYS` entry pointing to it and the project's file still holds only the *old* key, the resolver applies that entry's `migrate` mapping and reports it (`"renamed-from": "<old-key>"`), so an un-migrated `policy.yml` never silently changes behavior between a plugin update and `/claude-tweaks:init --update`'s migration offer. This is the `dispatch-pick-max-concurrent` deprecated-alias pattern generalized into one code path instead of per-key prose; each alias keeps a recorded removal condition (IL-85), and `auditPolicy` still reports the stray old key for migration.
- `model-profiles`, when requested, delegates to `bin/lib/model-profiles/policy-fragment.js`'s existing nested-block reader.
- **Untouched:** `bin/lib/policy.js#isWorktreeAlwaysOn` in the PreToolUse hook keeps its direct read (measured ~42 ms hot path; it never shells out to a second node process). `policy.js`'s three readers become thin wrappers over the shared flat-line parse so exactly one parser implementation remains, but their JS callers keep calling them.
- JS-internal consumers (`trust.js`, `grant-gate.js`, `issues/autonomy.js`, …) migrate to the shared library function where they don't already use it — not to the CLI.
- Tests live with the module; if a new `bin/lib/{name}/tests/` directory is created, its glob is added to `package.json`'s test script in the same change (IL-84).
- `docs/plugin-structure.md` gains the CLI row; `_shared/policy-schema.md` documents the resolver as the canonical read path.

## Phase 2 — Prose migration

Replace every prose-grep read site with a resolver call and delete the site's inline default restatement — after this phase, a default is stated only in `POLICY_KEYS` (and its mirror row in `_shared/policy-schema.md`).

- The sweep enumerates sites **structurally** — grep for the read *idiom* (`policy.yml` pipe patterns), not for key names (IL-15: a keyword hunt cannot find a site whose defect is silence). Run the sweep with `find`+`xargs`, not a gitignore-honoring grep.
- `_shared/auto-mode-contract.md`'s precedence section is rewritten to name the resolver as the mechanism executing the chain; Manifesto-lever read sites in skills cite it instead of re-executing precedence in prose.
- Hybrid JS helpers that receive `policy` as an argument keep that shape — prose now obtains the values via the resolver before injecting them.
- Done in one focused window with a mid-work divergence check against `origin/main` (IL-20); three live worktrees exist at design time.
- Phases 1 and 2 ship as **one minor release** — a resolver with no consumers is a cross-file promise without its consumer (IL-02).

## Phase 3 — Collapse

Ships as a second minor release. All migrations ride the existing `RENAMED_KEYS` audit + `/claude-tweaks:init --update` Config Home Drift machinery; each entry records its removal condition per the compatibility-path rule.

| Action | Key(s) | Detail |
|---|---|---|
| Merge | `execution.always` + `execution-strategy` → `execution-strategy` | New value set: `subagent`, `batched`, `subagent-only`, `batched-only`; the `-only` suffix carries the lock semantics. `RENAMED_KEYS` migrate: `execution.always: <v>` → `execution-strategy: <v>-only` |
| Rename | `merge-check` → `branch-divergence-check` | Boolean semantics unchanged; kills the collision with the assess-agent-autonomy verdict mode. `RENAMED_KEYS` migrate: value carries over |
| Delete | `review-diff-heuristic-thresholds` | Unsettable today; thresholds become stated constants in `skills/review/review-effort-derivation.md`. No behavior change is possible |
| Delete | `promise-register-min-leaves` | Hardcode the default in `skills/specify/record-creation.md`; single-skill tuning constant |
| Delete | `section-confirmation` | Only in-repo consumer is `/claude-tweaks:deepen`, which keeps `adaptive` as its sole behavior; re-add on real demand |
| Fix doc | `research-mode` | Delete the false `/flow`-precedence sentence from its schema row; the key and its `/claude-tweaks:research` read stay |
| No change | `worktree.always`, `git-strategy`, `dispatch-pick-max-concurrent` | See Rejected alternatives; the deprecated alias runs its recorded course |

Deletions extend `RENAMED_KEYS` with `replacedBy: null` support ("retired, delete the stray key — no replacement"), so `auditPolicy` reports them as deliberate retirements rather than typos. Schema doc, `_shared/auto-mode-contract.md`, and the index tables (`_shared/work-record-config.md`, `skills/help/reference-card.md`) update in the same phase; the renumber sweep covers every citation of a renamed key (IL-93: widening or renaming a mechanism owes a sweep of prose describing its old reach).

## Phase 4 — Rename decision gate (unscheduled)

After Phase 3 ships, decide whether the cosmetic rename program is still wanted: `auto-mode` (confusable with `autonomy`), the two review floors, dash-vs-dot namespace consistency. Post-Phase-2 each rename costs one `POLICY_KEYS` row + one `RENAMED_KEYS` entry + a prose sweep of citations only (read sites no longer embed names beyond the resolver call's argument). This is a taste call against the post-collapse schema, made by a human, not scheduled work.

## Testing

- Resolver: unit suite over `parseFlatLines` reuse, precedence overlay, `source` attribution, unknown-key error entries, renamed-key resolution, `model-profiles` delegation. Fixtures are frozen files, never this repo's live `policy.yml` (IL-80).
- `RENAMED_KEYS` extensions: audit-output tests for the merge/rename/retire entries, including migrate-value mapping.
- Existing suites (`tests/`, `bin/lib/*/tests/`) must stay green; Final Verification runs the full suite, not the new module's alone (IL-120).
- Prose migration has no test reader — its verification is the structural idiom sweep plus a per-key spot check that each migrated site's behavior description matches the schema row.

## Risks

- **Wide prose sweep vs concurrent sessions:** Phase 2 touches many skill files at once. Mitigation: single focused window, IL-20 divergence checks, and re-verifying each spec's premise immediately before its build (IL-109).
- **Resolver as new single point of failure:** a bug in it now affects every prose read site at once. Mitigation: the unit suite above plus `source` attribution making misresolution visible in skill transcripts.
- **Stale run configs:** a live run dir's `config.yml` may hold retired keys (observed: `unattended-tier` in a 2026-08-09 run). The overlay only resolves requested keys, so stale entries are inert.
