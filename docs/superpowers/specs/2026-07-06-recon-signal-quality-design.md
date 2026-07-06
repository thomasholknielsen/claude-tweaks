# Recon Signal Quality & Granularity — v2.1 Hardening

**Status:** Design complete (brainstorm). Pending decomposition into specs.
**Date:** 2026-07-06
**Amends:** `2026-06-15-recon-v2-llm-judge-design.md` (v2). This is not a rewrite — v2's
architecture (LLM-as-judge, rotation, fingerprint/dedup, `/specify`-shaped payloads) stays
intact. Four specific mechanisms inside it are hardened.
**One-liner:** fix slice granularity, the severity filter, bundle/split consistency, and
rotation-state persistence so recon produces a small, high-confidence trickle instead of a
flood, on monorepos in particular.

---

## 1. Summary

memenu-app's recon history was audited directly (GitHub issue data + local
`.claude-tweaks/recon/` state) rather than reasoned about in the abstract. It surfaced four
independent problems in the shipped v2 engine, none of which are policy nuances — they're
gaps between what the engine is designed to do and what it actually does:

1. **Slices are too coarse for monorepos.** `listSlices()` goes one directory level deep from
   root; a monorepo's `apps/` (8 real apps) and `packages/` (31 real packages) each become a
   *single* slice, so one recon invocation reads and judges dozens of independent units at once.
2. **The severity filter is dead code.** `validate-findings` hardcodes
   `decide(finding, issueIndex, cache, { threshold: 'low' })`. Since `'low'` is the lowest
   severity rank, every finding that clears the confidence floor and dedup gets filed —
   regardless of severity. The engine's built-in "remember, don't file yet" path never fires.
3. **No rule for bundling recurring root causes.** The same anti-pattern recurring across
   sibling files is sometimes bundled into one issue, sometimes split into near-duplicate
   issues, with no documented rule governing which.
4. **Rotation state silently fails to persist.** Cursor/run-log writes are optional
   (`--slice`/`--run-id` aren't required), and there's no post-file check confirming they
   happened — so a broken run looks identical to a working one until someone audits it.

### Evidence from memenu-app

181 `recon`-labelled issues, 176 open / 5 closed, filed across 3 dates (6 on 07-03, 135 on
07-04, 40 on 07-05) against only 4 distinct `areaId` values (`apps/web/server`: 72,
`packages/database`: 63, `apps/ingestion/src`: 40, `.`: 6) — consistent with 2–3 runs each
judging an entire `apps/` or `packages/` mega-slice in one pass.

- Severity breakdown of the 181: 33 low, 101 medium, 45 high, 2 critical. The local cache has
  7 entries, all `status: 'open'` — zero `'remembered'`, confirming the filter never engages.
- `#249` (`recipe-embedding-repository.ts#findNearest`) and `#212`
  (`ingredient-embedding-repository.ts#findNearest`) are the identical anti-pattern (raw
  escaped-SQL exclusion list instead of `notInArray`) filed as two separate issues, while `#238`
  bundled "half a dozen places" of an equivalent IN-clause pattern into one issue. `#233`'s
  evidence names two further occurrences its own anchor/acceptance never cover.
- `.claude-tweaks/recon/runs/` contains exactly **one** run record (07-03, 6 findings) and
  `cursors.json` reflects only that run — the 07-04/07-05 waves (175 of 181 issues, 96% of the
  backlog) left no trace, so rotation still believes `apps`/`packages` are effectively unswept.

## 2. Goals and non-goals

**Goals**
- A future recon run on a monorepo produces a per-workspace trickle, not a mega-slice flood.
- Only high-confidence, high-value findings hit the tracker by default; lower-severity findings
  are held in the existing `remembered` cache state rather than dropped or dumped.
- Recurring instances of one root cause become one `/specify`-sized unit, not N near-duplicates.
- A broken persistence run is caught at the moment it happens, not discovered in a later audit.
- The existing backlog is reconciled to reflect the new severity policy.

**Non-goals**
- No change to the judge's criteria catalog, the `/specify`-shaped issue body format, or the
  fingerprint basis (`criterion + areaId + normalizeAnchor(anchor)`).
- No cross-run bundling: a sibling occurrence of an already-filed pattern discovered in a
  *later* run still files standalone (see §7, known limitation).
- No new deterministic glob-matching dependency — minimal pattern support only (§4).

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Slice boundary detection | Read the workspaces manifest (`package.json#workspaces` or `pnpm-workspace.yaml`); expand to leaf packages. Fall back to today's one-level behavior when no manifest exists. |
| 2 | Default file threshold | `high` + `critical` only, via a `--min-severity` flag (default `high`), reusing the existing flag name from `pull-issues`. Everything below is `remembered`, not dropped. |
| 3 | Recurring-pattern policy | One issue per root cause: primary `anchor` + optional `relatedAnchors[]`, evidence enumerates every occurrence, acceptance criteria covers all of them. |
| 4 | Persistence hardening | Both: `validate-findings` hard-fails without `--slice`/`--run-id` on a real (non-dry-run) call, **and** the skill adds a mandatory post-file readback check. `--budget > 1` loop is spelled out explicitly (one full Steps 2–9 pass per returned slice). |
| 5 | Existing backlog | One-time reconciliation via `/tidy`'s existing recon-issue audit: open `recon:low`/`recon:medium` issues get relabelled `recon:remembered` (with an explanatory comment); high/critical untouched. |

## 4. Component 1 — Workspace-aware slicing

**File:** `bin/lib/recon/scope.js#listSlices`

1. Read root `package.json`. If it has a `workspaces` field (array of globs, or
   `{ packages: [...] }`), or a `pnpm-workspace.yaml` with a `packages:` list, expand each
   pattern.
2. Glob support is intentionally minimal — no new dependency, matching this project's zero-dep
   convention:
   - A pattern of the exact form `<dir>/*` (a single trailing wildcard segment, no other
     wildcard or special character anywhere in the pattern) lists that parent directory's
     immediate subdirectories.
   - A pattern with no wildcard anywhere is a literal package path (existence-checked).
   - Anything fancier (multiple wildcard segments like `apps/*/packages/*`, `**`, negation,
     brace expansion) is skipped with a stderr warning; that pattern's directories simply
     aren't turned into slices this run.
3. Expanded packages become slices with `id` = their path relative to root (`apps/web`,
   `packages/database`) — consistent with the path-shaped `areaId` convention findings already
   use.
4. No workspaces manifest found → **exact current behavior**, unchanged. Single-package repos
   are unaffected.
5. **Migration:** none needed. Old cursor entries keyed by `"apps"`/`"packages"` become inert —
   `selectSlice` simply won't find them under the new ids, so those ids read as "never swept"
   (correctly: they haven't been, at this grain) and Phase-1 staleness naturally sweeps them in
   over subsequent runs.

For memenu-app this turns 2 mega-slices into ~39 real ones (8 apps + 31 packages), which also
makes the routine's "one slice per firing, cheap and harmless to skip" philosophy actually hold.

## 5. Component 2 — Severity filter (file vs. remember)

**Files:** `bin/recon.js#cmdValidateFindings`, `bin/lib/recon/dedup.js` (unchanged), `bin/recon.js#cmdStatus`

- Replace the hardcoded `{ threshold: 'low' }` with `{ threshold: args['min-severity'] || 'high' }`.
  `--min-severity` is already parsed by `parseArgs` (currently consumed only by `pull-issues`) —
  reused here, not reinvented.
- `decide()` itself is correct as-is; this is a call-site wiring fix.
- `cmdStatus` gains a `remembered` count in its summary line (today: open / regressed / closed /
  wontfix / critical) so the held-back bucket is visible on demand rather than invisible cache
  contents.
- SKILL.md's Input section documents `--min-severity` (default `high`) alongside the existing
  flags.

## 6. Component 3 — Bundled findings for recurring root causes

**Files:** `bin/lib/recon/validate-finding.js`, `bin/lib/recon/issue-payload.js`, `skills/recon/SKILL.md` (Steps 5/6/7)

- Finding schema gains an optional `relatedAnchors: string[]` alongside the existing required
  primary `anchor`. `validateFindingV2` accepts it when present (array of strings); no change to
  required fields.
- SKILL.md Step 5/6 states the rule explicitly: when the same criterion + same suggested fix
  recurs at multiple call sites within the slice being judged, file **one** finding — primary
  anchor is the clearest/most representative occurrence, `relatedAnchors` lists the rest,
  `evidence` enumerates every occurrence, `acceptance` requires all of them fixed, not just the
  primary.
- `toIssuePayloadV2` renders `relatedAnchors` (when present) as an explicit "Also affects: ..."
  list under Current State, so the full scope is structurally visible in the issue body rather
  than only mentioned in evidence prose — closing the exact gap `#233` fell into, where two extra
  occurrences were named in evidence but never covered by the anchor or acceptance criteria.
- Fingerprint basis is unaffected: still `criterion + areaId + normalizeAnchor(primary anchor)`.

## 7. Component 4 — Persistence hardening

**Files:** `bin/recon.js#cmdValidateFindings`, `skills/recon/SKILL.md` (Steps 1, 9, 9.5)

- `cmdValidateFindings` hard-fails (usage error, exit 2) when `args.dryRun` is false and either
  `args.slice` or `args.runId` is missing. This closes the "forgot the flags" path at the code
  level — the most likely direct cause of memenu-app's persistence gap.
- SKILL.md Step 1 spells out the `--budget > 1` case: `next-slice` returns an array; the skill
  runs **one full Steps 2–9 pass per returned slice**, each with that slice's own
  `--slice`/`--run-id` — never a single shared call across a multi-slice batch.
- New SKILL.md Step 9.5 sub-check: immediately after filing, read back
  `.claude-tweaks/recon/cursors.json` and confirm this run's slice(s) show a fresh
  `lastSweptMs`. If not, report the discrepancy to the user instead of declaring the sweep
  complete. This is the safety net for the "previewed with `--dry-run`, then filed manually off
  that JSON" bypass — no engine flag alone can prevent an agent from skipping the real call
  entirely.
- New Anti-Patterns row: "Filing `gh issue create` directly off a `--dry-run` payload without a
  matching non-dry-run `validate-findings` call" → breaks rotation state silently.

## 8. Component 5 — Backlog reconciliation

**File:** `skills/tidy/scan-procedures.md` (Step 4.8's existing recon-issue audit)

- One-time pass, folded into `/tidy`'s existing walk of open `recon`-labelled issues (it already
  visits every one): any issue carrying `recon:low` or `recon:medium` gets a `recon:remembered`
  label added plus a comment noting the policy change; high/critical issues are untouched.
- Where the local cache entry is reconstructable (fingerprint present in the issue body marker),
  its `status` is updated to `'remembered'` to match.
- This is a one-time backlog pass, not a recurring mechanism — `/tidy` already owns the "walk
  open recon issues" behavior this piggybacks on.

## 9. Testing plan

- `scope.test.js`: workspace-manifest expansion — npm `workspaces` array, `pnpm-workspace.yaml`,
  a `/*`-glob pattern, a literal package path, and the no-manifest fallback (must match today's
  behavior exactly).
- `cli-validate-findings.test.js` / `dedup.test.js`: `--min-severity` actually filters — medium/low
  findings land in `remember`, high/critical in `file`; default with no flag behaves as `high`;
  explicit override works.
- `validate-finding.test.js`: `relatedAnchors` accepted when present (array of strings), absent
  is still valid.
- `issue-payload.test.js`: renders "Also affects" block when `relatedAnchors` is present, omits
  it when absent.
- `cli-validate-findings.test.js`: new case asserting exit code 2 when `--slice` or `--run-id` is
  missing on a non-dry-run call; dry-run without them still succeeds (preview mode unaffected).

## 10. Known limitations

- Cross-run bundling is out of scope: if a sibling occurrence of an already-filed pattern
  surfaces in a *later* run, it files as its own standalone finding rather than being appended to
  the existing issue's `relatedAnchors`. Solving that needs a pattern-level fingerprint distinct
  from the anchor-based one, deliberately deferred.
- Glob support (§4) handles trailing-`/*` and literal-path patterns only. Repos using `**` or
  negated workspace globs get a partial slice set (skipped patterns logged to stderr, not
  silently ignored) until a fuller matcher is justified by real demand.
- Backlog reconciliation (§8) is a one-time pass at ship time; issues filed after this change
  ships are governed by the new `--min-severity` default directly and never need reconciliation.

## 11. Phasing (each phase = its own spec)

1. **Severity filter wiring** (§5) — smallest, no schema change, immediately fixes the biggest
   share of the flood. Ship first.
2. **Persistence hardening** (§7) — also small, prevents silent recurrence of the audit-trail gap
   regardless of what else ships.
3. **Workspace-aware slicing** (§4) — the structural fix; independent of 1–2, larger surface
   (scope.js + its test suite).
4. **Bundled findings** (§6) — schema + judge-instruction change; independent of 1–3.
5. **Backlog reconciliation** (§8) — depends on 2 (the severity default) being live so the
   reconciliation matches the policy it's aligning the backlog to.

## 12. Glossary

- **Slice** — the unit of code recon reads and judges in one pass; historically one level below
  root, now workspace-aware.
- **Remembered** — a finding that cleared validation/confidence/dedup but fell below the file
  threshold; held in the local cache, not filed as an issue, until it escalates or a human
  deliberately lowers `--min-severity` for a deeper sweep.
- **Bundled finding** — one issue covering multiple call-sites of an identical root cause, via
  `anchor` (primary) + `relatedAnchors` (siblings).
