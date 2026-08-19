---
record: 331
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: policy-read-path-and-collapse:collapse-policy-keys-execution-merge-branch-divergence-check
blocked-by: [330]
surface: backend
---
# 331: Collapse policy keys: execution merge, branch-divergence-check rename, retirements

Surface: backend

## Overview

Collapse the policy keys that cause real confusion, now that every read routes through the resolver: merge the execution lock/default pair into one key, rename the colliding `merge-check` boolean, retire three single-consumer knobs, and fix `research-mode`'s dead contract sentence. This leaf deliberately does not chase key-count — the 2026-08-11 consumer map found zero dead keys, and the Manifesto-only levers are legitimate project-level defaults the resolver's `--run` overlay now resolves uniformly. Ships as its own minor release, after the resolver + migration release.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- The cosmetic rename program (`auto-mode`, `review-effort-floor` vs `review-severity-floor`, dash-vs-dot consistency) — that is the parked Phase 4 decision gate, judged by a human after this leaf ships
- Merging `git-strategy` into `worktree.always` — rejected in the design: hook-enforced hot path with a test-pinned coverage contract vs a one-real-read-site default key; the asymmetry is tolerable
- Removing `dispatch-pick-max-concurrent` — it has its own recorded removal condition and runs its course
- Any change to `worktree.always` semantics or the PreToolUse gate

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #330 | Migrate policy prose-grep read sites to the resolver | must be merged first |

## Current State

- `bin/lib/policy-schema.js` — `POLICY_KEYS` rows for all affected keys; `RENAMED_KEYS` with one entry (`unattended-tier` → `autonomy`, `migrate` mapping, no dual-read); `auditPolicy` reporting `renamedKeys` / `unrecognizedKeys`
- Resolver (from #329 (the resolver leaf)) applies `RENAMED_KEYS` `migrate` mappings at read time with `"renamed-from"` attribution
- `execution.always` (enum lock, unset default) and `execution-strategy` (enum default, `subagent`) — two keys, one axis; this repo's own `policy.yml` sets `execution.always: subagent`
- `merge-check` boolean, **current default `true`** (`bin/lib/policy-schema.js`'s POLICY_KEYS row — verified 2026-08-11, so the renamed row's `default true` is default-parity, not a behavior change; consumers: `skills/_shared/worktree-setup.md`, `skills/build/worktree-setup.md`, `skills/flow/{validation,SKILL}.md`) colliding with `/claude-tweaks:assess-agent-autonomy`'s `merge-check` verdict mode — the collision is flagged inside `skills/_shared/policy-schema.md` itself. The two are already structurally separate at runtime: the verdict mode is a skill-prose mode word passed to a Skill invocation, never a policy key, and policy lookup goes through `POLICY_KEYS` (which post-rename no longer contains `merge-check` at all) — the collision's cost is human/reader confusion and grep noise, which the rename removes
- `review-diff-heuristic-thresholds` — nested-object value with no flat-line encoding specified, presence-only validated, single consumer (`skills/review/review-effort-derivation.md`)
- `promise-register-min-leaves` (default 4) — read sites: `skills/specify/record-creation.md`, `skills/wrap-up/verification-brief.md`, `skills/_shared/work-record.md`; also indexed in `skills/_shared/work-record-config.md`'s table (that file wins on disagreement for its keys — update both together)
- `section-confirmation` — in-repo consumer `skills/deepen/SKILL.md` only; its schema row names `/superpowers:brainstorming`, an out-of-repo plugin that cannot read this file
- `research-mode` — schema row claims `/flow`'s pipeline config is checked first; `skills/flow/**` contains no occurrence of the key and it is not a Manifesto lever
- Index tables: `skills/_shared/work-record-config.md`, `skills/help/reference-card.md`

## Deliverables

- [ ] `execution-strategy` value set becomes `subagent | batched | subagent-only | batched-only`; `execution.always` row removed from `POLICY_KEYS`; `RENAMED_KEYS` entry whose `migrate` maps only the two valid enum values (`subagent` → `subagent-only`, `batched` → `batched-only`) and returns `null` for anything else — a malformed `execution.always` value falls through to `execution-strategy`'s schema default (`subagent`, unlocked), per the resolver's null-migrate rule, never minting a malformed `-only` value. **Lock semantics are preserved exactly:** a `-only` value keeps `execution.always`'s full lock behavior — it beats an explicit CLI argument (the other value is substituted with an inline notice, per `skills/build/SKILL.md`'s existing Execution-axis paragraph), unlike plain `subagent`/`batched` which an explicit argument overrides; the enforcement prose lives in `skills/build/{SKILL,build-options}.md` and `skills/_shared/git-discipline.md`, updated to the one-key model, plus `skills/flow/SKILL.md`
- [ ] `merge-check` renamed to `branch-divergence-check` (boolean semantics unchanged): `POLICY_KEYS` row renamed, `RENAMED_KEYS` entry with identity `migrate`, four consumer files updated, collision note in the schema doc replaced by a "resolved by rename" line
- [ ] `RENAMED_KEYS` extended to support `replacedBy: null` ("retired — delete the stray key, no replacement"), with `auditPolicy` reporting such keys as deliberate retirements, not typos; `/claude-tweaks:init --update`'s Config Home Drift consumer renders the retirement wording
- [ ] `review-diff-heuristic-thresholds` retired (`replacedBy: null`); its threshold values become stated constants in `skills/review/review-effort-derivation.md`
- [ ] `promise-register-min-leaves` retired (`replacedBy: null`); the value 4 hardcoded at its read sites; `skills/_shared/work-record-config.md`'s row removed in the same change
- [ ] `section-confirmation` retired (`replacedBy: null`); `skills/deepen/SKILL.md` keeps `adaptive` as its sole behavior; the out-of-repo owner claim disappears with the schema row
- [ ] `research-mode` schema row's false `/flow`-precedence sentence deleted (key and its `/claude-tweaks:research` read stay)
- [ ] Every alias/retirement records its removal condition, and each condition meets a shared minimum bar: a re-checkable predicate — either a date, or a grep/metric that can be run against live state — never "when it feels safe". Extend `skills/dispatch/deprecated-aliases.md`'s pattern or a sibling file; the five conditions must be mutually consistent in form
- [ ] Retired-key audit behavior pinned: a `policy.yml` still holding a retired key gets a warn-tier report from `auditPolicy` and a delete offer from `/claude-tweaks:init --update` — informational only, never blocking; declining the offer leaves the stray line untouched
- [ ] Pre-retirement override check: before hardcoding any retired key's value, grep this repo's `.claude-tweaks/policy.yml` for it — a configured non-default value (none exists as of 2026-08-11; the repo sets 7 keys, none of them these) becomes the hardcoded constant instead of the schema default. Marketplace users' files cannot be enumerated; their mitigation is the audit retirement report — accepted in the design
- [ ] Citation sweep: every prose mention of a renamed/retired key updated repo-wide — schema doc, `skills/_shared/auto-mode-contract.md`, both index tables, `skills/flow/manifesto.md`'s lever list (drops `section-confirmation` if listed, keeps `review-severity-floor` etc.), README/help if they name keys

## Acceptance Criteria

1. Resolver fixture tests cover all four `execution.always` cases: `subagent` → `subagent-only` and `batched` → `batched-only` (each with `renamed-from`), and a malformed value (e.g. `execution.always: yes`) → null-migrate fall-through to `subagent` with `source: "default"` + `renamed-from`; plus `merge-check: false` resolving `branch-divergence-check` to `false` with `renamed-from`
2. `auditPolicy` on a fixture holding all three retired keys reports each under `renamedKeys` with `replacedBy: null` and suggests deletion; none appear under `unrecognizedKeys`
3. Case-insensitive repo-wide sweep for `execution.always`, `merge-check` (policy-lever sense), `review-diff-heuristic-thresholds`, `promise-register-min-leaves`, `section-confirmation` finds only: the `RENAMED_KEYS` entries, the removal-condition records, and incident-log/CHANGELOG history — with a planted-line negative control proving the sweep can fail. The `merge-check` verdict-mode exclusion is mechanical, not judgment-per-line: exclude paths `skills/assess-agent-autonomy/**` plus lines elsewhere whose match co-occurs with `verdict`, `grant-check`, `failure-check`, or `ceremony-check` on the same line (the four-mode enumeration context); any other `merge-check` hit is a stale policy-lever citation and fails the sweep
4. `skills/deepen/SKILL.md` describes adaptive batching unconditionally, with no policy read
5. `skills/review/review-effort-derivation.md` states the file/line thresholds as constants and reads no policy key for them
6. This repo's own `.claude-tweaks/policy.yml` is migrated in the same change (`execution.always: subagent` → `execution-strategy: subagent-only`)
7. Full `npm test` green, including the new audit-output tests

## Technical Approach

Expand-contract: `RENAMED_KEYS` entries land in the same commit as the `POLICY_KEYS` changes, so at no point does an existing project's file read as invalid without a migration path. The resolver (already shipped) picks the aliases up with zero code change beyond the entries themselves — that's the payoff of the previous two leaves.

### Data / API Surface

- `RENAMED_KEYS` entry shape gains `replacedBy: null` semantics; `auditPolicy`'s `renamedKeys` result rows carry it through to `/claude-tweaks:init --update`'s rendering
- `POLICY_KEYS`: `execution-strategy` enum widened, `execution.always` / `merge-check` / three retired rows removed, `branch-divergence-check` row added (boolean, default `true`)

### Key Files

- `bin/lib/policy-schema.js` — key rows, `RENAMED_KEYS`, audit wording
- `bin/lib/policy-schema` tests (wherever #329 (the resolver leaf) put them) — alias + retirement coverage
- `skills/_shared/policy-schema.md` — rows updated/removed, collision note resolved
- `skills/_shared/{git-discipline,worktree-setup,auto-mode-contract,work-record,work-record-config}.md` — consumer updates
- `skills/build/{SKILL,build-options,worktree-setup}.md`, `skills/flow/{SKILL,validation,manifesto}.md` — consumer updates
- `skills/review/review-effort-derivation.md`, `skills/specify/record-creation.md`, `skills/wrap-up/verification-brief.md`, `skills/deepen/SKILL.md` — retirement fallout
- `skills/help/reference-card.md` — index table
- `.claude-tweaks/policy.yml` (this repo) — self-migration
- `skills/init/update-mode.md` — the Config Home Drift renderer (verified by grep 2026-08-11) — retirement wording

### Package Dependencies

- none

## Gotchas

- `skills/_shared/work-record-config.md` wins over the schema doc for its keys on disagreement — remove/update its rows in the same commit as the schema rows, never one side first
- The renamed boolean's consumers hard-wrap prose — sweep with whitespace-flexible patterns, and remember the assess-agent-autonomy `merge-check` verdict mode is a *different concept that keeps its name*; a blind rename sweep that touches it reintroduces the confusion this leaf exists to kill
- A rename inside any conflict resolution still owes the full citation sweep — hunks under review won't show references elsewhere in the same file
- Re-verify each retired/renamed key's consumer list immediately before building, by a stated method, not loosely: confirm #330 actually merged (`git log origin/main --oneline` shows its merge), then `git diff <#330-merge-commit>^..<#330-merge-commit> --stat` against this leaf's Key Files list — any file this leaf names that #330 did NOT migrate is a blocking rediscovery (a read site the enumeration missed), not a formality. Regenerate each key's consumer list from the post-#330 tree; this body's line-level claims predate that rewrite
- Don't leave the retired keys' values as magic numbers without a comment stating they were policy levers once — future readers need the trail to the removal condition, not a bare `4`
- The `-only` migration mapping must handle both enum values (`subagent`/`batched`) and reject anything else to the default — a malformed `execution.always` value must not mint a malformed `-only` value

## Decision Rationale

See #329 (the resolver leaf)'s Decision Rationale (first spec of this decomposition).


<!-- work-fingerprint: policy-read-path-and-collapse:collapse-policy-keys-execution-merge-branch-divergence-check -->
