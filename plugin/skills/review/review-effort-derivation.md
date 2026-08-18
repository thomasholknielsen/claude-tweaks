# Deriving `review-effort` — /claude-tweaks:review Step 2.5

Read from `code-mode-steps.md`'s Step 2.5 when no explicit effort token was passed. An explicit token
(Input resolution rule 8) always wins and resolves the tier without this file. The ambiguity rule
step 3 below cites as "below", and the line recording the resolved tier for Step 7's summary, both
stay in `code-mode-steps.md`'s Step 2.5, after its pointer to this file.

Resolution order — stop at the first that applies:

1. **Explicit argument.** If `$ARGUMENTS` contained an effort token (Input resolution rule 8), use it. Always wins — including over a high-risk record's own labels. A user who explicitly asks for `low` on a scary change, or `max` on a trivial one, gets what they asked for.

2. **Record risk/size labels.** Applies only when Input resolution resolved a spec/record number (rules 1-2) — file-path and no-argument reviews (rules 3, 7) have no record to read and go straight to step 3 below. Fetch the record's `risk:*`/`size:*` labels with a fresh, minimal read — independent of whether Step 1 ran (Step 1 is skipped under `ceremony-profile: fast-lane`, so this cannot assume a Step 1 fetch happened), per `work-backend`:

   **`github-issues`:** First mint the review's scratch dir if Step 3 hasn't yet — `node "${CLAUDE_PLUGIN_ROOT}/bin/build-review-context.js" mint` (append `--run "$PIPELINE_RUN_DIR"` when a run directory exists); it prints `{dir}` once and the same `{ctx-dir}` is reused by Step 3's `build --dir {ctx-dir}` call. Never a fixed shared `/tmp` name — concurrent sessions reviewing the same record would clobber it. Then:
   ```bash
   gh issue view {n} --json labels > {ctx-dir}/record-{n}.json
   ```
   ```bash
   node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js'); const d=JSON.parse(require('fs').readFileSync(process.argv[1])); const {risk,size}=parseRecordFacets(d.labels); console.log(JSON.stringify({risk,size}))" "{ctx-dir}/record-{n}.json"
   ```

   **`local-files`:**
   ```bash
   node -e "const {readRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
     const {risk, size}=readRecord(process.argv[1]).facets;
     console.log(JSON.stringify({risk, size}))" "{record-file-path}"
   ```

   Both resolve to the same `{risk, size}` shape. If either is `null`/`undefined` (record never scored) or the read fails (malformed labels, backend error), fall through to step 3 below — never default straight to `low`. Otherwise combine via this table:

   | risk ↓ / record size → | low | medium | high |
   |---|---|---|---|
   | **low** | low | low | medium |
   | **medium** | medium | medium | high |
   | **high** | high | xhigh | max |

   Risk (blast radius/safety) is the primary driver — `risk:high` always yields at least `high`. `risk:low` floors at `low` unless the record's own size (`size:*`) compounds it to `medium`.

3. **Diff heuristic (fallback).** No record, the record carries no `risk:*`/`size:*` labels, or the label read failed. Derive proxies from Step 2's change analysis and feed the same table above:
   - Risk proxy = **high** if the diff touches a path matching the `merge-sensitive-paths` config key (the same key `assess-agent-autonomy`'s `merge-check` verdict mode already reads for the identical "elevated risk from touched paths" purpose), a schema/migration file, infra/CI-CD config, or introduces a new dependency (Step 2 already flags all of these for its ops-ledger check); **medium** if it touches public API surface or a cross-package interface; **low** otherwise.
   - Record-size proxy (the record's own `size` facet — not the `review-effort` tier being derived here): **high** at 10+ files or 300+ lines changed; **medium** at 3-9 files or 50-299 lines; **low** otherwise. These thresholds were the `review-diff-heuristic-thresholds` policy lever until its retirement in #331 (removal trail: `_shared/policy-deprecations.md`) — stated constants now, not configurable. Both counts come from Step 2's `git diff --stat` totals — this proxy never needs the full diff.
   - If `git diff --stat` produces no output to classify, default to `high` directly (skip the table) — see the ambiguity rule below.

4. **Project-level floor (non-explicit resolutions only).** After step 2 or 3 above resolves a tier, resolve `review-effort-floor` — `EFFORT_FLOOR=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values review-effort-floor)` — mirroring `review-auto-apply-ceiling`'s existing lookup precedent (`step3-routing.md`). If set, raise the resolved tier to at least the floor — never lower it (e.g. `review-effort-floor: high` turns a diff-heuristic `low` into `high`, but leaves an already-`xhigh` record-label resolution untouched). This step never applies when step 1 (explicit argument) already set the tier — an explicit token always wins, per step 1's rule above. Unset by default — no floor, current behavior unchanged.
