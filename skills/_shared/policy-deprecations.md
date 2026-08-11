# Policy — Deprecated Key Removal Conditions

The removal-condition home that `bin/lib/policy-schema.js`'s `RENAMED_KEYS` comments point at, for the five policy keys collapsed or retired in #331. Each entry states what a stray `policy.yml` line does now, and a re-checkable condition under which the key's `RENAMED_KEYS` entry (and this file's entry) gets deleted. `skills/dispatch/deprecated-aliases.md` holds its own two dispatch-alias conditions — same pattern, separate entries.

All five share one predicate form: **(a)** `grep -n "{key}" .claude-tweaks/policy.yml` in this repo returns nothing, and **(b)** the release that shipped #331 is at least 6 months old per its date row in `docs/shipped-versions.tsv` — checked at the next minor release after both hold. (a) guards regression; (b) is the marketplace grace period, since users' `policy.yml` files cannot be enumerated and their only migration signal is the audit report below.

## `execution.always` (merged into `execution-strategy`)

Now: migrates at read — the resolver maps `subagent` → `subagent-only` and `batched` → `batched-only` (full lock semantics preserved, `renamed-from` attribution); any other value null-migrates, falling through to `execution-strategy`'s schema default (`subagent`, unlocked), never minting a malformed `-only` value. `auditPolicy` reports the stray line under `renamedKeys` with the suggested replacement. A file setting **both** keys follows the resolver's uniform alias rule: the `execution-strategy` line wins and the old lock key contributes nothing — a plain-value line therefore leaves the axis unlocked; the audit report and `/claude-tweaks:init --update`'s drift check are what surface that conflict for the user to resolve.

Removal condition: the shared predicate above, with `{key}` = `execution.always`.

## `merge-check` (renamed to `branch-divergence-check`)

Now: migrates at read — identity `migrate`, boolean semantics unchanged, `renamed-from` attribution. The rename resolves the old name's collision with `/claude-tweaks:assess-agent-autonomy`'s `merge-check` verdict mode, which keeps its name.

Removal condition: the shared predicate above, with `{key}` = `merge-check`.

## `review-diff-heuristic-thresholds` (retired, no replacement)

Now: reports as retirement — `auditPolicy` lists it under `renamedKeys` with `replacedBy: null` (deliberate retirement, not a typo); `/claude-tweaks:init --update` offers to delete the line, warn-tier, never blocking. The resolver treats the line as contributing nothing and a request for the name as unknown-key. The threshold values are stated constants in `skills/review/review-effort-derivation.md` step 3.

Removal condition: the shared predicate above, with `{key}` = `review-diff-heuristic-thresholds`.

## `promise-register-min-leaves` (retired, no replacement)

Now: reports as retirement — same audit/init/resolver behavior as the entry above. The value `4` is hardcoded at its read sites (`skills/specify/record-creation.md`, `skills/wrap-up/verification-brief.md`, `skills/_shared/work-record.md`).

Removal condition: the shared predicate above, with `{key}` = `promise-register-min-leaves`.

## `section-confirmation` (retired, no replacement)

Now: reports as retirement — same audit/init/resolver behavior as the entries above. Adaptive section batching is the unconditional behavior (`docs/skill-authoring.md`); the `per-section`/`batch` overrides no longer exist.

Removal condition: the shared predicate above, with `{key}` = `section-confirmation`.
