# Materialization — Records to Build-Time Files

One shared procedure, referenced by both `/claude-tweaks:flow` and `/claude-tweaks:build` wherever either accepts a work record reference (`#N` / `#A,#B`) as input. It resolves the record, hard-gates on spec shape, and writes the one build-time file everything downstream (`/superpowers:writing-plans`, execution, verification, review) then treats exactly as it treated a spec file. This is the single definition of the materialized header — every consumer of `surface:`/`design-intent:`/`effort:`/etc. reads it from here; nothing else restates the format.

## Resolution

Input is one or more record references: `#N` (single) or `#A,#B,...` (comma-joined, no spaces — mirrors the existing multi-spec-number convention). Resolve each record independently, the same way regardless of how many are in the batch.

Read the project's `work-backend` config key (`_shared/work-record.md`'s Config keys table):

- **`work-backend: github-issues`** — `gh issue view {n} --json number,title,body,labels,url`. Derive `facets` from the returned `labels` via `parseRecordFacets` (`bin/lib/issues/record.js`).
- **`work-backend: local-files`** — glob `specs/{n}-*.md` for the matching filename, then `readRecord(path)` (`bin/lib/issues/local-store.js`). `facets` is already on the returned record (`.facets`).

This is the same fetch `/specify`'s Resolve-the-input case 1 uses for a record reference — deliberately identical, so a record looks the same to both skills.

`fingerprint` — `extractFingerprint(body)` (`record.js`), run against the raw fetched body on either driver.

### Bare numeric input under `work-backend: local-files`

Under this driver, a local record's storage location *is* `specs/{n}-{slug}.md` — the same path the legacy spec-file alias (below) reads. There is no separate GitHub issue to disambiguate against, so bare numeric input (no `#`) resolves through this same local-files branch, not the legacy alias — it is a strict superset of reading the file directly (identical content, plus the shape gate below as a safety net). The bare-vs-`#` distinction only carries real weight under `work-backend: github-issues`, where a legacy `specs/{n}-*.md` file and a GitHub issue are genuinely different things and must be told apart.

## Materialization hard gate

Before composing anything, check the fetched body against `_shared/work-record.md`'s spec-shaped body definition: the sections `## Current State`, `## Deliverables`, and `## Acceptance Criteria` are present and each non-empty, and no unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) remains anywhere in the body.

- **Passes** — proceed to header composition.
- **Fails** — STOP before any worktree or run-dir work happens: "Record #{n} is not spec-shaped ({missing/empty section list}) — run `/claude-tweaks:specify #{n}` first." For a multi-record run, gate every record before proceeding with any of them — report every failing record's gap in one message, not just the first one encountered.

This gate is the record-level replacement for `/flow`'s legacy pre-flight Step 2.4 (spec-committed check) and Step 2.7 (design-doc rejection) — see `SKILL.md` Steps 1-2. Those two steps continue to apply, unchanged, to the legacy numeric spec-file alias; this gate applies instead whenever any target in the run is a record reference.

## The pinned header format (single definition — materialize.md owns it)

```markdown
---
record: {n}
origin: {code-health|harness-health|journey-health|docs-health|capture|human}
risk: {low|medium|high}            # omitted when unscored
effort: {low|medium|high}          # omitted when unscored
ceremony: fast-lane                # omitted when standard — see ceremony-check mode below
grants: [build, merge]             # as held at materialization time; may be [build] or []
fingerprint: {fp}                  # omitted when none
blocked-by: [n1, n2]               # omitted when none — see Populating the header
surface: {web|mobile|desktop|backend|infra}
design-intent: {value}             # omitted for backend/infra
parked-at-shaping: true            # omitted unless the record was parked when shaped
---
{record body verbatim}
```

| Field | Named reader |
|---|---|
| `record` | `/wrap-up` close-via-merge carrier (`Fixes #{n}`) + Section E claim release |
| `origin` | `/wrap-up` summary/Review Console display (provenance line) |
| `risk` | Audit snapshot (preserved in the committed file; no active mechanical reader today) |
| `effort` | `/build` effort-based model-tier selection (replaces `code-health-effort`) |
| `ceremony` | `/flow`'s Manifesto (Step 3) bundle-fold into the `ceremony-profile` lever |
| `grants` | Snapshot for audit; `/wrap-up`'s auto-merge check RE-READS LIVE LABELS before any merge (truth, not projection) |
| `fingerprint` | Audit snapshot / dedup cross-reference |
| `blocked-by` | `/flow`'s multi-spec dependency-aware ordering — DAG construction, cycle detection, and Prerequisites check (`multi-spec.md`) |
| `surface` | `/claude-tweaks:design-wrapper` wrapper Layer-2 detection (via /build Common Step 1.7 and /flow polish phase) |
| `design-intent` | design wrapper polish-mode intent-driven dispatch |
| `parked-at-shaping` | `/wrap-up` Section E release-with-abandon restores `parked` |

`surface`/`design-intent` values are LIFTED from the record body's `Surface:`/`Design-intent:` metadata lines (spec 17's wire format). Materialized files live under the run dir — committed as audit trail, never gitignored.

## Populating the header

Every field except `surface`/`design-intent` (next section), `ceremony` (below), and `blocked-by` under `work-links: native` (one extra read — see its bullet below) comes straight off data already fetched during Resolution — nothing extra to read:

- `record` — the id used to resolve it.
- `origin` — `facets.origin` (`code-health` / `harness-health` / `journey-health` / `docs-health` / `capture`), or the literal `human` when `facets.origin` is `null` (no `by:*` label — human-filed, or a side-effect record, per `_shared/work-record.md`'s origin axis).
- `risk` / `effort` — `facets.risk` / `facets.effort`; omit the line when the value is `null` (unscored).
- `grants` — `facets.grants.build` / `facets.grants.merge`, as the bracket list `[build, merge]` / `[build]` / `[]`. Unlike every other optional field here, always emit the `grants:` line, even empty — a record can reach materialization ungranted (a human running `/flow #{n}` directly against a record nobody authorized).
- `fingerprint` — from Resolution; omit the line when `null`.
- `blocked-by` — the record's dependency targets, driver/`work-links`-dependent: `work-backend: github-issues` + `work-links: body-text` — `parseDependencies(body)` (`bin/lib/issues/record.js`) over the already-fetched body, no extra read; `work-backend: github-issues` + `work-links: native` — one batched `gh api graphql` call across every record in the run (aliased per record number, reusing `buildNativeDependencyQuery`/`hasOpenNativeBlocker` from `bin/lib/issues/record.js` — the same pattern `/claude-tweaks:dispatch` Step 2 uses for its candidate pool), resolving `blockedBy` (the field `capabilities-probe.js`'s `probeSchema` checks for), added to Resolution. A single-record run is the degenerate one-alias case of the same call; `work-backend: local-files` — `facets.blockedBy`, already present on the read record. Emit as `blocked-by: [n1, n2, ...]`; omit the line when empty. Resolution is read-only and safe to run before any run dir or worktree exists (see "When this runs" below), so this data is available to `/flow`'s multi-spec pre-flight (`multi-spec.md`'s "Frontmatter pre-flight") immediately after Resolution — it does not need to wait for the header to be composed and written to disk.
- `parked-at-shaping` — `true` when the labels/facets fetched at materialization time still carry `parked`, omitted otherwise. `/specify` strips `parked` on promotion to `ready` (its permission-matrix row in `_shared/work-record.md`), so this is normally absent by the time a record is buildable; it stays meaningful for a record re-parked after promotion — e.g. by `/tidy`'s Defer action — that still got dispatched anyway, which is exactly the case `/wrap-up`'s restore-on-abandon step (see the reader table above) needs to detect.
- `ceremony` — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`), once per record, using the same body/labels already fetched during Resolution. Its `CEREMONY` output becomes this field verbatim; omit the line when the verdict is `standard` (mirrors `risk`/`effort`'s omit-when-unscored convention). See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the full mode contract.

`surface` / `design-intent` / `ceremony` are the exceptions — `surface`/`design-intent` via the lift rule below, `ceremony` via the invocation above. `blocked-by` is a partial exception: free under `work-links: body-text`/`local-files`, one extra read under `work-links: native` — see its bullet above.

## The Surface / Design-intent lift rule

`/specify`'s Metadata block (`spec-template.md`) writes two plain body-metadata lines at the very top of every shaped record body:

```
Surface: {web | mobile | desktop | backend | infra}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
```

(`Design-intent:` is omitted on backend/infra records — Step 2.5a's frontend detection only asks the design-intent question for a frontend surface.) These are body text, not labels and not frontmatter — `parseRecordFacets`/`readRecord` never see them. Lift them verbatim by reading the first one or two lines of the fetched body: the header's `surface:` copies the body's `Surface:` value; `design-intent:` copies `Design-intent:` when that line is present in the body, omitted from the header otherwise. Legacy `frontend` (pre-migration spec frontmatter) reads as `web`; `mixed` is retired — a record whose body still declares it needs re-shaping via `/specify` first, since a leaf that's genuinely both frontend and backend at once is a decomposition smell, not a valid surface value.

This is a lift, not a move: the body keeps its own `Surface:`/`Design-intent:` lines exactly where `/specify` put them — see Composing the file below.

## Composing the file

```
---
{header fields from above}
---
# {n}: {title}

{record body verbatim}
```

`{title}` is the title fetched during Resolution (`gh issue view`'s `.title` field, or `readRecord(path).title`) — title is a record facet, never body content (`spec-template.md`'s Facets section), so it is not part of "record body verbatim" and needs this explicit heading line to stay visible to everything downstream that expects a spec file's first line to be its title, unchanged from the legacy `# {Number}: {Title}` convention. `{record body verbatim}` is exactly the fetched body, unmodified — including its own `Surface:`/`Design-intent:` lines; the header's copies of those two values are a lift, never a strip.

## Multi-record layout

Each record in a multi-record run (`#A,#B,...`) materializes to its own file, one per record — a partial materialization never happens silently; the hard gate above checks every record in the batch before any file is written.

Single-record and multi-spec runs use the two run-dir shapes already established by `_shared/pipeline-run-dir.md` and `multi-spec.md`:

```
{run-dir}/work/{n}-spec.md                       ← single-record run
{parent-run-dir}/spec-{a}/work/{a}-spec.md        ← multi-record run, record a
{parent-run-dir}/spec-{b}/work/{b}-spec.md        ← multi-record run, record b
```

The multi-record case reuses `multi-spec.md`'s existing `spec-{N}/` per-spec subdirectory, keyed by record id instead of spec number — the subdirectory name pattern is unchanged, only what number fills `{N}` changes.

## Legacy spec-file alias

A bare numeric argument with no `#`, under `work-backend: github-issues` (`/flow 42`, `/build 42`) — reads `specs/{n}-*.md` directly, exactly as before this contract existed: no resolution, no shape gate, no header, no `work/` file. This path survives for as long as a project still carries plain numbered spec files predating the record-materialization system; it is the alias, not the primary path. Do not delete it, and do not route it through this procedure.

## When this runs

**Resolution and the hard gate are read-only** — safe to run at any point, including before a run directory or worktree exists. `/flow` runs them early (Step 1), replacing the legacy pre-flight's spec-committed and design-doc checks at the record level.

**Composing, writing, and committing the file needs two things: a resolved `$PIPELINE_RUN_DIR` (`_shared/pipeline-run-dir.md`), and a checkout the write can land in before the run's worktree exists** — mirroring the legacy spec-committed check's own requirement (a worktree branches from the base commit and will not contain anything left uncommitted in the working tree it branched from; see `validation.md`'s 2.4). Concretely: write the file, commit it on the current (pre-worktree) branch, and only then let worktree creation (`/build`'s Common Step 1, or `/flow`'s own up-front shared-worktree creation for a multi-record run) branch from that now-updated HEAD — the new worktree's initial checkout then already contains the materialized file, the same way it already contains a committed legacy spec file today.

**Standalone fallback (no run dir resolves).** When `/claude-tweaks:build #{n}` runs standalone — no `/claude-tweaks:flow` parent, and neither the `PIPELINE_RUN_DIR` env var nor a most-recent matching directory resolves per `_shared/pipeline-run-dir.md`'s Resolution order (steps 1-2) — create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-record-{n}-standalone/` (per `_shared/pipeline-run-dir.md`'s standalone conventions: `decisions.md` + `staged/`) and materialize into its `work/{n}-spec.md`. This is narrower than that file's Resolution-order step 3 (the auto-mode standalone allowlist): it applies regardless of mode — materialization needs somewhere to write the file whether or not `auto` is active — and `/build` is not itself on that allowlist. The resulting standalone run dir becomes this build's `$PIPELINE_RUN_DIR` for the rest of the run (ledger, decisions, and cleanup all resolve against it the same as any other run dir).

A record already materialized by a caller earlier in the same run (e.g. `/flow` wrote it before invoking `/claude-tweaks:build #{n}`) is not re-fetched or re-composed — the caller checks for an existing `{run-dir}/work/{n}-spec.md` (or its `spec-{N}/` equivalent) first and reads it in place when present.

## Committed as audit trail, never gitignored

Materialized files are meant to survive as ordinary tracked history on the branch that builds them — the same durability a legacy spec file already has. Unlike the rest of the pipeline run directory (`config.yml`, `decisions.md`, `staged/`, `run-state.json`, `events.jsonl` — all gitignored, archived as plain files at wrap-up, never committed; see `_shared/auto-mode-contract.md`), the `work/` subdirectory is a deliberate, narrow exception: `.gitignore` carves it out of the otherwise-blanket `.claude-tweaks/pipelines/` ignore so `git add`/`git commit` actually track it, at both the single-record depth (`{run-id}/work/`) and the multi-record depth (`{run-id}/spec-{N}/work/`).

Per this project's own convention for a committable child of an ignored parent (see CLAUDE.md's `.gitignore` guidance — a blanket ignore on a parent directory silently and permanently defeats a naive single-line `!` re-inclusion of anything nested under it), the fix does not rely on that pattern. It explicitly un-ignores each directory level on the way down to `work/`, at both nesting depths.
