# Deriving `review-effort` — /claude-tweaks:review Step 2.5

Read from `SKILL.md`'s Step 2.5 when no explicit effort token was passed. An explicit token
(Input resolution rule 8) always wins and resolves the tier without this file. The ambiguity rule
step 3 below cites as "below", and the line recording the resolved tier for Step 7's summary, both
stay in `SKILL.md`'s Step 2.5, after its pointer to this file.

Resolution order — stop at the first that applies:

1. **Explicit argument.** If `$ARGUMENTS` contained an effort token (Input resolution rule 8), use it. Always wins — including over a high-risk record's own labels. A user who explicitly asks for `low` on a scary change, or `max` on a trivial one, gets what they asked for.

2. **Record risk/effort labels.** Applies only when Input resolution resolved a spec/record number (rules 1-2) — file-path and no-argument reviews (rules 3, 7) have no record to read and go straight to step 3 below. Fetch the record's `risk:*`/`effort:*` labels with a fresh, minimal read — independent of whether Step 1 ran (Step 1 is skipped under `ceremony-profile: fast-lane`, so this cannot assume a Step 1 fetch happened), per `work-backend`:

   **`github-issues`:**
   ```bash
   gh issue view {n} --json labels > /tmp/review-record-{n}.json
   node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const d=JSON.parse(require('fs').readFileSync('/tmp/review-record-{n}.json'));
     const {risk, effort}=parseRecordFacets(d.labels);
     console.log(JSON.stringify({risk, effort}))"
   ```

   **`local-files`:**
   ```bash
   node -e "const {readRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
     const {risk, effort}=readRecord(process.argv[1]).facets;
     console.log(JSON.stringify({risk, effort}))" "{record-file-path}"
   ```

   Both resolve to the same `{risk, effort}` shape. If either is `null`/`undefined` (record never scored) or the read fails (malformed labels, backend error), fall through to step 3 below — never default straight to `low`. Otherwise combine via this table:

   | risk ↓ / record effort → | low | medium | high |
   |---|---|---|---|
   | **low** | low | low | medium |
   | **medium** | medium | medium | high |
   | **high** | high | xhigh | max |

   Risk (blast radius/safety) is the primary driver — `risk:high` always yields at least `high`. `risk:low` floors at `low` unless the record's own size (`effort:*`) compounds it to `medium`.

3. **Diff heuristic (fallback).** No record, the record carries no `risk:*`/`effort:*` labels, or the label read failed. Derive proxies from Step 2's change analysis and feed the same table above:
   - Risk proxy = **high** if the diff touches a path matching the `merge-sensitive-paths` config key (the same key `assess-agent-autonomy`'s `merge-check` mode already reads for the identical "elevated risk from touched paths" purpose), a schema/migration file, infra/CI-CD config, or introduces a new dependency (Step 2 already flags all of these for its ops-ledger check); **medium** if it touches public API surface or a cross-package interface; **low** otherwise.
   - Record-effort proxy (size — not the `review-effort` tier being derived here): read `review-diff-heuristic-thresholds` from `.claude-tweaks/policy.yml` — shape `{high: {files, lines}, medium: {files, lines}}`, default `{high: {files: 10, lines: 300}, medium: {files: 3, lines: 50}}` (matches this skill's pre-existing hardcoded behavior when the key is unset). **high** at `high.files`+ files or `high.lines`+ lines changed; **medium** at `medium.files`-`(high.files - 1)` files or `medium.lines`-`(high.lines - 1)` lines; **low** otherwise. Both counts come from Step 2's `git diff --stat` totals — this proxy never needs the full diff.
   - If `git diff --stat` produces no output to classify, default to `high` directly (skip the table) — see the ambiguity rule below.

4. **Project-level floor (non-explicit resolutions only).** After step 2 or 3 above resolves a tier, read `review-effort-floor` from `.claude-tweaks/policy.yml`, mirroring `review-severity-floor`'s existing lookup precedent (`step3-routing.md`). If set, raise the resolved tier to at least the floor — never lower it (e.g. `review-effort-floor: high` turns a diff-heuristic `low` into `high`, but leaves an already-`xhigh` record-label resolution untouched). This step never applies when step 1 (explicit argument) already set the tier — an explicit token always wins, per step 1's rule above. Unset by default — no floor, current behavior unchanged.
