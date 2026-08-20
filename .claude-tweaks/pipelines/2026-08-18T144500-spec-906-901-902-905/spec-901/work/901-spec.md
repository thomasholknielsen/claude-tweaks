---
record: 901
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: wrapup-objective-audit-fixes:calibration-read-out-consumer-for-wrap-up-outcomes-tsv-archi
surface: terminal
---
# 901: Calibration read-out: consumer for wrap-up-outcomes.tsv, archived decisions, and events

Surface: terminal

## Overview

Wrap-up writes calibration data nobody reads: the curation engine appends per-row outcome telemetry to `.claude-tweaks/wrap-up-outcomes.tsv`, run-dir archival keeps every `decisions.md` explicitly "for the user's calibration of project policy," and `events.jsonl` records gate denials and friction events. `docs/skill-graph.md` names the telemetry "a future data source for proposing demotion of consistently empty registry rows (report-only note; no consumer today)" — the same dead-write shape `upstream-candidate` had before #239. This record builds the consumer: a read-only calibration report that turns the accumulated data into lever-facing signals ("Skills row: 0 findings in 14 runs", "console resolved Approve-all 14/14 at supervised — consider trusted"), surfaced as a `/claude-tweaks:tidy` report row.

**Complexity:** Medium
**Estimated tasks:** 5-7

## Non-Goals

- No thresholds enforced, no lever auto-changed, no registry row auto-demoted — report-only.
- No new telemetry writes; this consumes what exists.
- No `/help` integration in this record (tidy is the one surface; a `/help` row can follow later if the report earns it).
- No transcript parsing — inputs are the TSV, `decisions.md` files, and `events.jsonl` files only.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none (adjacent: #380 extracts a shared `events.jsonl` reader into `bin/lib/hooks/context.js` — check at build via `grep -n "scanSkillEvents" plugin/bin/lib/hooks/context.js`; if present, note it, but its reader is scoped to `skill_invoked` scans, so this record ships its own general fail-open line reader either way, with a comment naming #380's reader as the sibling — if a future need makes them converge, that unification is a capture, not silent duplication) | — |

## Current State

- `.claude-tweaks/wrap-up-outcomes.tsv` — appended by `bin/wrap-up-engine.js` (`plan` for closed rows, `record` for open rows; path resolved at `wrap-up-engine.js:89`). Columns per row: read the writer before assuming — the shape is engine-owned.
- `.claude-tweaks/pipelines/archive/{run-id}/decisions.md` — archived audit logs; entry kinds `AUTO` / `STAGED` / `KEPT-PROMPT` / `REFUSED` / `SCANNED` per `_shared/auto-decision-log.md`'s schema. Console terminal decisions are logged as `AUTO … Review Console …` lines.
- `.claude-tweaks/pipelines/archive/{run-id}/events.jsonl` — typed hook events; `wd-deny`, `wd-push-mismatch`, `contract-violation`, `gate-denial` are the friction kinds the console already surfaces per-run.
- `docs/skill-graph.md` `## wrap-up` section — carries the "no consumer today" note this record retires.
- `plugin/skills/tidy/scan-procedures.md` — tidy's scan-row roster (this decomposition's upstream-unfiled backstop record also edits this file — build that one after this).
- `plugin/bin/` — flat CLI convention; multi-file logic goes in `plugin/bin/lib/{name}/`.

## Deliverables

- [ ] `plugin/bin/calibration-report.js` (thin CLI over `plugin/bin/lib/calibration/`): reads the TSV, every archived run's `decisions.md`, and archived `events.jsonl` files; prints a compact markdown report: (a) per-registry-row finding rate, (b) console terminal-decision distribution (Approve all / Approve all + merge / leave PR open / Override / Stop counts, parsed from the archived console log lines), (c) auto-decision volume by reversibility (the `Reversibility: high|med|low` field of `_shared/auto-decision-log.md`'s entry schema — that closed vocabulary, nothing new), (d) friction-event counts by kind, (e) refused-proposal count. **One window governs all five sections:** the last N archived runs by run-id timestamp (default 20, `--runs N`). TSV rows join to that window by run identity where the TSV carries one — determine at build time by reading the writer; if it carries none, section (a) windows over the row's last N TSV entries instead and the report legend states that the two sources' windows are per-source, not joined. The registry-row universe for (a) is `bin/lib/wrap-up/registry.js`'s roster — a row absent from every run in the window renders `no runs in window`, distinct from present-with-zero-findings. `--json` for the raw aggregate.
- [ ] Signal lines: a registry row that appears in **≥10** runs within the window with 0 findings renders "consider narrowing its gate" (below 10 appearances the signal is suppressed and the legend says so); an Approve-all rate of 100% over ≥10 console stops at a `supervised` ceiling renders "consider trusted", annotated "ceiling read at report time — stops earlier in the window may predate the current setting" (the ceiling is not historically tracked; the legend states this limitation rather than pretending precision). Each signal line names the lever and carries a paste-ready command on its own line (e.g. the `policy.yml` key to edit, or the CLI to re-run with `--runs 50`).
- [ ] Format-drift guard: a one-line comment in `wrap-up-engine.js` beside the TSV write pointing at the calibration reader, plus a fixture test that fails loudly on TSV column-count drift; the five console-decision label strings are enumerated in one place in `bin/lib/calibration/` with a comment citing the console prose that emits them, and a build-time check confirms each exists as a distinct loggable string in the current console log-line formats (collapse any that turn out indistinguishable, and say so in the report legend rather than miscounting).
- [ ] `_shared/auto-decision-log.md` gains `bin/lib/calibration/` in its consumer list — the reader depends on that file's entry-kind schema, and the expand-contract discipline for `_shared` changes needs the dependency recorded to catch it later.
- [ ] Empty/missing inputs are explicit: no TSV → "no telemetry yet ({path} absent)"; no archived runs → stated; never a crash, never a silent empty table.
- [ ] `/claude-tweaks:tidy` gains a calibration report row in `scan-procedures.md` invoking the CLI and rendering its output (report-only, no action drill).
- [ ] `docs/skill-graph.md`'s wrap-up section: "no consumer today" note replaced with the consumer's name and surface.
- [ ] Tests over fixture inputs in `tests/bin-lib/calibration/`.

## Acceptance Criteria

1. Against a fixture tree (TSV with 3 rows' outcomes over 5 runs — fixture columns matching the writer's real shape, read from `wrap-up-engine.js` before authoring the fixture — two archived `decisions.md` with console lines, one `events.jsonl` with a `gate-denial`), the CLI prints all five report sections with correct counts, and `--json` round-trips the same numbers.
2. A zero-findings row appearing in ≥10 fixture runs produces the narrowing signal line with a paste-ready command on its own line; the same row over 5 runs produces no signal and the legend names the suppression; a sub-10-stop window produces no ceiling signal (insufficient-data guard).
3. On a repo with no `.claude-tweaks/wrap-up-outcomes.tsv`, exit 0 with the explicit "no telemetry yet" line.
4. `grep -n "no consumer today" docs/skill-graph.md` returns nothing.
5. `npm test` green.

## Technical Approach

Pure read-only aggregation. `bin/lib/calibration/` gets a reader per source (TSV parser; `decisions.md` line classifier keyed on the entry-kind vocabulary; fail-open JSONL reader) and one aggregator; the CLI renders. Parse defensively — archived logs span plugin versions, so unrecognized lines are counted as `other`, never fatal. The ceiling for the "consider trusted" signal is read via `resolve-policy.js --values autonomy` at report time (current setting, not historical). Line-format details come from reading the writers (`engine-record.js`, `_shared/auto-decision-log.md`) at build time, not from this spec.

### Data / API Surface

CLI: `node bin/calibration-report.js [--runs N] [--json] [--root <path>]`. Exit 0 on success including empty-input cases; exit 2 on malformed invocation. No writes anywhere.

### Key Files

- `plugin/bin/calibration-report.js` — new CLI
- `plugin/bin/lib/calibration/` — readers + aggregator (flat sibling module dir, not a nested `_shared/`)
- `plugin/skills/tidy/scan-procedures.md` — new report row
- `docs/skill-graph.md` — consumer note update
- `tests/bin-lib/calibration/` — new suites

## Gotchas

- Signal wording must not overclaim: "consider" phrasing only — this project deliberately keeps lever changes human-gated, and a report that says "change X" reads as an instruction to an unattended agent someday.
- Insufficient-data guards are load-bearing: a 3-run window saying "0 findings — narrow the gate" is noise; minimum window sizes are part of the deliverable, stated in the report when they suppress a signal.
- Sequencing within this decomposition: the tidy upstream-unfiled backstop record edits `scan-procedures.md` too — build this record first (it's the larger edit); the backstop record carries the Blocked-by link.
- `decisions.md` archives contain lines from older plugin versions whose shapes predate the current schema (#671 documents shipped-vs-schema drift) — classify by prefix keyword, tolerate everything else as `other`.
- Recursive greps honor `.gitignore` (run dirs are gitignored) — readers must walk `.claude-tweaks/pipelines/archive/` with `fs` directly, never rely on `git grep`/ugrep-style enumeration.


<!-- work-fingerprint: wrapup-objective-audit-fixes:calibration-read-out-consumer-for-wrap-up-outcomes-tsv-archi -->
