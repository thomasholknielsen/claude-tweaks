Surface: backend
Parent: #149

## Overview

Add a thin `doctor` mode to `/claude-tweaks:design-wrapper` that delegates wholesale to Impeccable's `doctor.mjs`, and call it as one scan step in `/claude-tweaks:tidy`. Findings are **staged** into `/tidy`'s existing batch table, never auto-repaired.

**Complexity:** Medium
**Estimated tasks:** 5-7

## Why /tidy and not harness-health

`doctor` reports drift in **Impeccable's project artifacts** — `PRODUCT.md`, `DESIGN.md`, `.impeccable/*.json`. That is project state. `/claude-tweaks:harness-health` owns claude-tweaks' own harness docs, a different corpus. Putting `doctor` there would file issues about a project's design record under a sweep that audits this plugin's skills.

## Non-Goals

- Running `doctor --fix`. It edits `PRODUCT.md` in place. Auto-repairing project files on a third party's judgment violates the auto-mode contract's staging model, which reserves file-modifying decisions for the Review Console or an explicit user approval.
- Reimplementing any of `doctor`'s checks. The mode is a delegation: run it, normalize the findings, hand them to `/tidy`. Restating its rules is precisely what this whole design exists to stop.
- Native-surface routing (#151) or any other mode's behavior.

## Current State

- `skills/tidy/SKILL.md:55` — "Steps 1-4.8 and 5.5: Scan Everything" is where scan steps live; `skills/tidy/scan-procedures.md` holds their procedures. `Step 6` presents the report and takes approval, with `step-6-auto.md` / `step-6-interactive.md` splitting by mode. `Step 7` executes approved actions.
- `skills/design-wrapper/SKILL.md` — the Input table, the Universal preconditions, and the availability table all need a `doctor` row. The file is 23 KB against a 40 KB soft ceiling, so the procedure belongs in `modes/doctor.md`.
- `skills/design-wrapper/modes/*.md` — one file per mode; the pattern to follow.
- No `doctor` reference exists anywhere in this repo today.

### Executed behavior, 2026-08-06

`node <impeccable>/skills/impeccable/scripts/doctor.mjs --json` from this repo's root: **exit 0**, JSON on **stdout**, **empty stderr**. It returned two genuine findings against this repo's own `PRODUCT.md`, so the integration has a live test case without constructing a fixture.

```
{projectRoot, repoRoot, isMonorepo, productPath, designPath, platform,
 ruleRegistryAvailable, findings[], workspaces[]}

finding: {id, artifact, path, severity, summary, fix}
```

Severities, in upstream's own display order: `route`, `mention`, `auto`. `--fix` applies only `auto` — its docblock calls those "the ones with no judgment in them: stamp the product record."

## Deliverables

- [ ] `skills/design-wrapper/modes/doctor.md` — the mode procedure
- [ ] `skills/design-wrapper/SKILL.md` — `doctor` in the Input table, availability table, mode list and Reference sub-files
- [ ] `skills/tidy/scan-procedures.md` — the new scan step
- [ ] `skills/tidy/SKILL.md` — the scan step registered in the Steps 1-4.8/5.5 block
- [ ] Findings flow into Step 6's batch table under the existing apply-all/override pattern

## Acceptance Criteria

1. `doctor` mode invokes `doctor.mjs --json` and **never** `--fix`. State the reason in the mode file in one sentence so a later reader does not add `--fix` as an obvious convenience.
2. The mode returns the wrapper's standard shape — `{mode, result, ...}` or `{mode, skipped, ...}` — and reports `skipped` in four cases: the plugin is **absent**; the plugin resolves at a version **other than the pin**; the project has **no `PRODUCT.md`/`DESIGN.md`**; or `doctor.mjs` **fails at execution** (non-zero exit, or stdout that does not parse as JSON). The fourth case is the one an implementer will skip: the 2026-08-06 run's exit 0 / empty stderr / clean JSON is one observation, not a guarantee, and an uncaught exception here would break every `/tidy` run on every project.
3. **"At the pin" means what #146's resolver means by it.** Both leaves resolve the same plugin root, so they share one interface: `resolveImpeccablePlugin({searchRoot}) -> {root, version} | null`, documented in `impeccable-plugin.md`. Whichever leaf lands first writes it; the other imports it. Do not ship two resolvers for one plugin root (`[IL-32]`).
4. Findings are normalized once and carry `severity` through unchanged. Do not collapse `route`/`mention`/`auto` into claude-tweaks' own severity vocabulary — upstream's `--fix` boundary is defined in terms of these exact values.
5. **All three severities render; none is auto-applied.** `auto` findings carry their `fix` text as a staged proposal — staged, not applied, because `--fix` edits `PRODUCT.md` and that is the user's call. `route` and `mention` have no mechanical fix by construction, so they render as informational rows. The Step 6 decision is therefore *surface or suppress*, not *apply or skip*: nothing in this scan step ever edits a project file, and the batch table must not imply otherwise.
6. Findings appear in `/tidy` Step 6's batch table using **Template A's four columns** — `Severity | Path:Line | Finding | Evidence` — read through the tidy-specific column semantics `skills/tidy/SKILL.md` already documents for its scan agents. Map: `Path:Line` ← the finding's `path`; `Finding` ← `[doctor] {id} — {summary}`; `Evidence` ← the finding's `fix` text; `Severity` ← tidy's own urgency scale, with upstream's `route`/`mention`/`auto` preserved verbatim inside the `Finding` cell so AC4 still holds. **`| Action | Detail | Ref |` is not this table** — that is CLAUDE.md's *Actions Performed* convention, a different table for a different job, and the first draft of this record named it by mistake.
7. The `/tidy` scan step degrades silently on `skipped`. `/tidy` runs on every project; most have no Impeccable context, and a scan step that reports "unavailable" every run trains users to ignore the report.
8. Verified during implementation against this repo: the scan step surfaces the two live `PRODUCT.md` findings (`product-deprecated-register`, `product-schema-legacy`) rather than an empty result. An integration returning nothing on a project that demonstrably has findings has not been tested (`[IL-78]`). **This is an implementation-time manual check, not an automated assertion** — a test asserting against live `PRODUCT.md` content breaks the moment someone fixes those findings, which is the opposite of what it should measure (`[IL-80]`). Any automated coverage uses a frozen fixture of `doctor.mjs`'s output.

## Technical Approach

### Key Files

- `skills/design-wrapper/modes/doctor.md` (create — **owns the finding schema**)
- `skills/design-wrapper/SKILL.md` (modify)
- `skills/design-wrapper/impeccable-plugin.md` (modify or create — the shared resolver, per AC3)
- `skills/tidy/scan-procedures.md` (modify — references the schema, does not restate it)
- `skills/tidy/SKILL.md` (modify)

### Gotchas

- `/tidy` opens PRs (Step 7) and #71 records that it has no automated path to merge them. Do not extend that surface here — this leaf adds a scan step, not an action type.
- `modes/doctor.md` owns `doctor`'s finding schema; `scan-procedures.md` references it. Naming the owner is the point — "one owns it, the other references it" without saying which is how two copies get written.
- The `--fix` temptation is real and will look like an obvious improvement to a future reader. AC1's one-sentence reason is what stops that, so write the reason, not just the prohibition.
