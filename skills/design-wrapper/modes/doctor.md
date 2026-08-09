# Design Mode — doctor

Invoked via `/claude-tweaks:design-wrapper doctor`. Returns `{mode, result: "advisory", findings, ...}` or `{mode, skipped, ...}` to caller.

A **thin delegation**. `doctor.mjs` is Impeccable's own staleness pass over Impeccable's own project artifacts — `PRODUCT.md`, `DESIGN.md` and its sidecar, `.impeccable/config.json`, surface briefs, the design hook. This mode runs it, normalizes nothing away, and hands the findings to the caller. It reimplements none of `doctor`'s checks and restates none of its rules: doing so is precisely the drift this wrapper exists to prevent.

## When this runs

Called by `/claude-tweaks:tidy` as one scan step (Step 4.9). Takes **no target** — `doctor` audits project artifacts, not a diff, so there is nothing to scope it to.

`/tidy` and not `/claude-tweaks:harness-health`: `doctor` reports drift in a *project's* design record. `harness-health` owns claude-tweaks' own harness docs, a different corpus.

## Never `--fix`

**This mode invokes `doctor.mjs --json` and never `doctor.mjs --fix`.**

The reason, so a later reader does not add `--fix` as an obvious convenience: `--fix` writes to `PRODUCT.md` on disk, and editing a user's project files on a third party's judgment is exactly the file-modifying decision `_shared/auto-mode-card.md` reserves for an explicit human approval. `auto`-severity findings are surfaced as staged proposals carrying their own `fix` text — the user runs `--fix` themselves if they want it.

This holds even though upstream calls `auto` migrations "the ones with no judgment in them." Whether *Impeccable* needs judgment to apply a migration and whether *this wrapper* may apply it unattended are different questions, and only the second one is ours.

## Preconditions

**Not the universal three-layer chain.** Run **Layer 1 only** (the `design-integration` kill-switch from `../SKILL.md`), then this mode's own two checks below. Layers 2 and 3 are structurally inapplicable and must not be run:

- **Layer 2** reads a record's `Surface:` line. `doctor` receives no spec — same exemption `shape` and `live` already carry.
- **Layer 3** sniffs a changed-file list for frontend extensions. `doctor` has no file list, and `/tidy` typically runs on a clean tree. Running Layer 3 here would skip `doctor` on exactly the runs it exists to serve.

Layer 1 still applies in full: a project that set `design-integration: disabled` has switched off Impeccable integration, and that includes this. A project with no `design-integration` field at all reads as `disabled` too — which is the common case, and is the intended behavior, not a gap (see `/tidy`'s silent-degradation rule).

### Skip conditions

Four, beyond the Layer 1 kill-switch above. Layer 1 is universal to every mode; these four are `doctor`'s own.

| # | Condition | Detected by | `skipped` reason |
|---|---|---|---|
| 1 | Plugin **absent** | `resolveImpeccablePlugin` returned `null`, glob matched nothing | `Impeccable plugin not installed` |
| 2 | Plugin **off-pin** | `resolveImpeccablePlugin` returned `null`, candidates found but none at the pin | `Impeccable plugin {found} does not match the pinned {pinned}` — `{found}` names **every** version found, as a list |
| 3 | **No project context** | Layer 0's `setup.hasProduct` and `setup.hasDesign` are both false | `no Impeccable project context (no PRODUCT.md or DESIGN.md)` |
| 4 | **Execution failure** | `doctor.mjs` exited non-zero, or its stdout did not parse as JSON | `Impeccable doctor unavailable (execution failed)` |

Rows 1 and 2 are the resolver's own two outcomes — see `../impeccable-plugin.md`'s degradation table, which is where those reasons are worded. Do not re-derive them here.

**Row 4 is the one an implementer will skip.** A single observed run — exit 0, empty stderr, clean JSON — is an observation, not a guarantee. `doctor.mjs` writes to stderr and exits 1 on any thrown error, and it loads a large dependency graph (`context.mjs`, the staleness modules, the detector rule registry) before it produces anything. An uncaught exception here would break **every `/tidy` run on every project**, which is a far worse failure than losing one scan step. Catch it, skip, and let `/tidy` continue.

Row 3 uses Layer 0's signals because Layer 0 has already run in the same wrapper invocation, so the check is free and happens *before* spawning a second process. When Layer 0 itself degraded on execution failure while the plugin still resolved at the pin, that signal is unavailable — in that case skip the precondition, run `doctor.mjs`, and apply row 3 post-hoc if its `productPath` and `designPath` both come back `null`.

## Procedure

### Step 1: Run preconditions

Layer 1, then the four skip conditions in order. On any skip, return the skip object — `/tidy` degrades silently (it does not render an "unavailable" row).

### Step 2: Resolve the script

Call `resolveImpeccablePlugin({searchRoot})` per `../impeccable-plugin.md`. The script is `<root>/skills/impeccable/scripts/doctor.mjs`, per that file's per-consumer script-path table. When Layer 0 already resolved in this invocation, reuse its `root` — do not re-glob the cache.

### Step 3: Execute

```bash
node "<root>/skills/impeccable/scripts/doctor.mjs" --json
```

Run from the **project root**; every path in the output is resolved relative to it.

**Pass `--json` and nothing else.** `doctor.mjs` parses its non-flag arguments in strict mode, so an unrecognized argument makes it exit 1 with a usage error — turning a supported invocation into skip condition 4 for no reason. In particular do not pass `--target`: monorepo workspace findings already arrive in the ordinary `findings` array without it.

Use the Bash tool's default timeout. `doctor` is heavier than Layer 0's `context-signals.mjs` — it shells out to git, walks workspace candidates, and loads the detector rule registry — but still completes in seconds. Treat a timeout as skip condition 4.

### Step 4: Parse and normalize

Parse stdout as JSON. It carries these top-level keys:

| Key | Notes |
|---|---|
| `projectRoot`, `repoRoot` | Absolute paths |
| `isMonorepo` | boolean |
| `productPath`, `designPath` | Relative to `projectRoot`; `null` when absent — the post-hoc form of skip condition 3 |
| `platform` | `web` \| `ios` \| `android` \| `adaptive` \| `null`; `null` is the expected common case |
| `ruleRegistryAvailable` | boolean — see below |
| `findings` | The array this mode exists to return |
| `workspaces` | Per-workspace summary rows. Not findings — real workspace problems already appear in `findings`. Ignore. |

`ruleRegistryAvailable: false` is a **degraded success, not a failure**: the run completed, but the bundled detector could not be resolved, so ignored rule ids went unvalidated and `detector-ignore-rules-unknown` could not fire. Do not treat it as skip condition 4, and do not surface it as a finding — carry it on the return so a caller can note the run was partial.

Normalization is **one step, done once, here**: pass each finding's six fields through unchanged. There is nothing else to do to them. `/tidy` maps them onto its own table columns for display; that mapping is `/tidy`'s and lives in `skills/tidy/scan-procedures.md`.

## Finding schema

**This file owns the schema.** `skills/tidy/scan-procedures.md` references this section rather than restating it — two copies of a schema is how the two drift apart.

Every element of `findings` is exactly:

```json
{
  "id":       "product-schema-legacy",
  "artifact": "PRODUCT.md",
  "path":     "PRODUCT.md",
  "severity": "route",
  "summary":  "PRODUCT.md has no schema stamp and none of the sections the current record adds ...",
  "fix":      "Offer `init`, which preserves confirmed answers and fills the gaps by interview. ..."
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier, e.g. `product-schema-legacy`, `design-md-drift`. Always present. The dedup key if a caller ever needs one. |
| `artifact` | string | Always present and always non-empty. **Not always a path** — it is a human label, and the observed set includes `hook manifest`, `live state`, and `surface brief` alongside real filenames like `PRODUCT.md` and `config.json`. |
| `path` | string \| **null** | Relative to `projectRoot`. **Nullable** — upstream's finding constructor defaults it to `null`, and findings that genuinely have no single file (`platform-native-evidence`, `surface-brief-orphaned`) pass `null` explicitly. **May also be a comma-joined list** of several paths rather than one path (`legacy-live-state`, `surface-brief-orphaned`). A consumer rendering this into a single-path column must handle both. |
| `severity` | `route` \| `mention` \| `auto` | See the table below. Carried through **verbatim**. |
| `summary` | string | What drifted, in upstream's own words. Always present. |
| `fix` | string | What to do about it. Always present. For an `auto` finding this is what `--fix` would have done — surfaced as a proposal, never executed. |

### Severities

Upstream's three values, with upstream's own labels. This vocabulary is **not** translated into claude-tweaks' severity words anywhere in this mode's return: the `--fix` boundary is defined in terms of these exact strings, so collapsing them would destroy the one distinction that decides what is mechanically applicable.

| `severity` | Upstream's label | Meaning | In `--fix`'s scope? |
|---|---|---|---|
| `route` | "needs a command" | The artifact predates the current schema, or has drifted from the code. Resolving it means running an Impeccable command. | No |
| `mention` | "worth saying" | A retired section, a coverage gap, a config key nothing reads. Informational. | No |
| `auto` | "automatic" | A mechanical migration with no judgment in it. | Yes — **and this mode still does not apply it.** |

Upstream's display order is `route`, `mention`, `auto`. That is a reading order for its own text renderer, not a claim about urgency — `/tidy` ranks them for its own table on its own terms.

## Output to caller

```json
{
  "mode": "doctor",
  "result": "advisory",
  "platform": null,
  "findings": [ { "id": "...", "artifact": "...", "path": "...", "severity": "...", "summary": "...", "fix": "..." } ],
  "counts": { "route": 1, "mention": 1, "auto": 0 },
  "product_path": "PRODUCT.md",
  "design_path": "DESIGN.md",
  "rule_registry_available": true
}
```

`result` is always `"advisory"` on a successful run, including when `findings` is empty — a clean project is a real, reportable result, not a skip. Per `_shared/design-wrapper-handling.md`, `advisory` means "the mode ran and produced output; surface the findings," and it never fails a caller's gate.

`counts` is a convenience tally by severity; `findings` remains the authority. `platform` is the wrapper's standard top-level Layer 0 field (see `../SKILL.md`'s Output contract), not something `doctor` computes — `doctor.mjs` reports its own `platform` too, and the two agree because both read the same `PRODUCT.md`.

**This mode modifies no file, in any project, under any condition.** It is read-only with respect to both source code and Impeccable's own artifacts.
