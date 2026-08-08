---
name: upstream-drift
description: Use when you want to check whether this repo's claims about an upstream dependency still hold, and what upstream surface has appeared that this repo does not know exists. Reads the deterministic checks in tools/upstream-drift/, then diffs a dependency's contract subtree between the installed and latest tags to triage new capability. Never edits anything. Keywords - upstream drift, dependency drift, contract breach, capability triage, new capability, Impeccable, pin, manifest.
argument-hint: "[--dep <name>] [--latest-tag <tag>] [--drift-only|--capability-only] [--json]"
allowed-tools: Read, Grep, Glob, Bash, Task, AskUserQuestion
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

# Upstream Drift — What Broke, and What Arrived

A project-local audit of this repo's upstream dependencies: reports contract **drift** from the deterministic checks, then judges **capability** — upstream surface that is new and unclaimed — by diffing the dependency's contract subtree between the installed tag and the latest. Never edits anything, including the dependencies themselves.

```
tools/upstream-drift/manifest.yml
        |
        +-- checks.js (deterministic) ------> drift findings ----+
        |     version / assertions / fixtures                     |
        |                                                          +--> report
        +-- upstream tree @ installed vs latest --> JUDGE ------->+
              judge-procedure.md                capability findings
```

**Lifecycle:** utility, no fixed position. Runs standalone today; `#143` will add the runner, version-driven triggers, and issue filing that make it schedulable.

`allowed-tools` is declared to **restrict**, per CLAUDE.md: `Edit` and `Write` are deliberately absent, which is what makes "never edits anything" a contract rather than a promise. `Task` is present because Step 2 dispatches — a declared set that omits a tool the skill actually uses is a bug, not a tighter restriction.

**Not shipped.** This is maintainer-only tooling. It lives under `.claude/skills/` — a project-local skill, loaded only when working in this repo, never for plugin consumers. It is deliberately **not** under `skills/`, which is the plugin's shipped payload. For the same reason its frontmatter `name` is the bare `upstream-drift` rather than CLAUDE.md's `claude-tweaks:{skill}` form: that namespace belongs to the shipped plugin, and claiming it here would imply this skill ships. The deviation is intentional, not drift.

## When to Use

- An upstream dependency released a new version and you want to know what this repo's own files now get wrong about it, before deciding whether to upgrade.
- You want to know what upstream can do that this repo has never used — the class of finding no assertion can produce, because there is nothing yet to assert against.
- A pin in `tools/upstream-drift/manifest.yml` changed, or you added an entry, and you want to see what the checks say about it now.

Not for: editing upstream, editing `skills/**`, or filing issues. This skill produces findings; `#143` owns turning them into `by:upstream-drift` GitHub issues. Not for auditing this repo's own harness documentation — that is `/claude-tweaks:harness-health`.

## Input

`$ARGUMENTS` may contain:

- `--dep <name>` — audit one manifest entry by its `name` (e.g. `impeccable-plugin`). Default: every entry in the manifest.
- `--latest-tag <tag>` — override the resolved latest tag. Use to preview a specific upgrade, or to work offline against a tag you already know. The installed side is never overridable — it is resolved from the artifact.
- `--drift-only` — run the deterministic half and report; skip the capability judgment and every network call it needs.
- `--capability-only` — skip the drift report. Use when the deterministic half was already run this session.
- `--json` — emit the raw findings array instead of the rendered report.

## Workflow

> **Parallel execution:** Use parallel tool calls aggressively — reading the manifest, resolving upstream tags, and fetching both file trees are independent and should run concurrently.

### Step 1 — Load the manifest and run the deterministic checks

From the repository root:

```bash
node -e "const{loadManifest}=require('./tools/upstream-drift/manifest.js');const{checkVersion,checkAssertions,replayFixtures}=require('./tools/upstream-drift/checks.js');const m=loadManifest('./tools/upstream-drift/manifest.yml');console.log(JSON.stringify(m.dependencies.map(d=>({name:d.name,upstream:d.upstream,contractPaths:d['contract-paths'],version:checkVersion(d),assertions:checkAssertions(d),fixtures:replayFixtures(d)})),null,2))"
```

Use `node -e`, not a script file: inside `-e`, `require` resolves relative paths against the current working directory, which is what makes the `./tools/...` paths above correct. The same lines saved to a file resolve against the *file's* directory and fail with `MODULE_NOT_FOUND`.

`tools/upstream-drift/` is read-only input to this skill. Never edit `checks.js`, `manifest.js`, or `manifest.yml` from here — a manifest change is a deliberate act, not an audit side effect. If a check reveals the manifest itself is wrong (a pin naming a version that was never installed, a `contract-path` that resolves nowhere), report it as a finding and stop.

Filter to `--dep` if given. Under `--capability-only`, still run this step — the capability judgment needs `checkVersion`'s installed version to pick the diff's starting tag — but emit no drift findings from it.

### Step 2 — Decide sequential or parallel

> **Parallel execution (conditional):** When more than one dependency is due, dispatch one Task agent per dependency. Otherwise, run Step 4 sequentially in the main thread.

Each dependency is fully independent — different upstream repos, different tags, different contract roots — so there is no shared state to serialize. When dispatching, follow `skills/_shared/subagent-output-contract.md`: give each agent a `Standard` model tier, the minimal input (the dependency's manifest entry, its Step 1 results, the repository root), and **inline the entire body of `judge-procedure.md` below its horizontal rule, verbatim**, into the agent's prompt. Agents see only their own prompt; a pointer to the file does not reach them. Require the four-value status line (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the first line of the reply.

Skip this step entirely under `--drift-only`.

### Step 3 — Resolve the tag pair

Per dependency, resolve `{installed-tag}` and `{latest-tag}` as described in `judge-procedure.md` step 2. The diff runs from the **installed** tag, never from an arbitrary recent one — a capability report against a version this machine is not running describes work that cannot be done yet.

`--latest-tag` overrides the resolved latest. If the two tags are equal, that dependency contributes drift findings only.

### Step 4 — JUDGE

Read `judge-procedure.md` in this skill's directory and apply it. It is the single canonical procedure and is shared verbatim with Step 2's dispatch prompt; do not restate or paraphrase it here.

Substitute `{dep.name}`, `{installed-tag}`, `{latest-tag}`, and `{root}` before applying.

### Step 5 — Report

Render two tables, drift first, each sorted by `severity` then `confidence`. Never merge them — a broken contract and an unexplored opportunity are different asks of the reader.

```
## Upstream Drift — {dep.name} ({installed-tag} → {latest-tag})

### Drift — {n} finding(s)
| Severity | What broke | Local file | Evidence |

### Capability — {n} finding(s)
| Severity | Upstream | What it is | Why it matters | Local seam | Effort |
```

If both tables are empty, say so in one line and stop. An all-green run is the expected steady state; do not pad it with near-findings to justify the run.

Under `--json`, emit the findings array from `judge-procedure.md` step 8 instead, and skip Next Actions.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"File the findings"`, `description`: `"/claude-tweaks:capture — capture the capability findings as backlog records; the automated by:upstream-drift filing path arrives with #143"`. Suffix the label `(Recommended)` when any finding is `severity: high`.
- Option 2 — `label`: `"Take the upgrade"`, `description`: `"/claude-tweaks:capture 'upgrade {dep.name} to {latest-tag} and re-pin tools/upstream-drift/manifest.yml' — record the upgrade itself as work"`. Suffix `(Recommended)` when the drift table is empty and the capability table is not.
- Option 3 — `label`: `"Audit one dependency"`, `description`: `"/upstream-drift --dep <name> — re-run against a single manifest entry"`
- Option 4 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold anything captured into a backlog-hygiene pass"`

## Component-Skill Contract

`/upstream-drift` is a **standalone-only** skill today — nothing in this repo invokes it, and `docs/skill-graph.md` records no edge to it. The `## Next Actions` block always renders.

`#143` (runner, version-driven triggers, issue filing) is the first foreseen parent. When it lands it must set `--source upstream-drift-runner`, and this contract must then gate `## Next Actions` on that flag — the runner owns the handoff once it exists. `$PIPELINE_RUN_DIR` is **not** the right signal here: that variable marks a `/claude-tweaks:flow` pipeline run, and this skill's runner is a scheduled sweep, not a pipeline orchestrator.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Reading upstream release notes to decide what changed | All five Impeccable `skill-v4.0.x` releases carry byte-identical bodies while 4.0.2 → 4.0.4 changes 300+ files — the notes report "nothing changed" and are wrong in the clean-bill-of-health direction |
| Treating an upstream's documented *runtime behavior* as an assertion this repo can rely on | A doc describes intent, not what the environment does. Anthropic's own docs state that plugins declared in a repo's `.claude/settings.json` are "installed at session start"; measured in a live cloud sandbox with every stated precondition satisfied, `~/.claude/plugins/` did not exist at all (`[IL-113]`). A behavioral claim is only a contract once a fixture executes it in the target environment — until then it is an upstream assertion this repo has adopted, which is precisely the drift class this skill exists to catch |
| Grepping this repo for an upstream file's name to decide whether it is handled | Only finds files that already mention it; structurally cannot find the file whose defect is total silence (`[IL-15]`) — which is the exact defect the capability class exists to catch |
| Assuming the upstream repo's layout matches the installed artifact's | Two entries against one upstream repo need different contract roots — `impeccable-cli` maps identically, `impeccable-plugin` maps under `plugin/`. Resolve the prefix from evidence, per entry |
| Diffing the whole upstream tree | Upstreams that vendor one source tree per agent harness report every change once per mirror — fifteen times over, for Impeccable at 4.0.4 |
| Diffing the canonical source directory instead of the contract root | `skill/` misses the four `reference/degraded/*.md` files that exist only as build outputs — the contract root is the subtree that mirrors what an upgrade actually delivers |
| Diffing from the latest tag to the one before it | The report then describes an upgrade path this machine is not on; the installed tag is the only correct starting point |
| Emitting a capability finding that names a file without saying what it does | A listing is not a triage — the finding must be actionable without re-running the diff or having network access |
| Re-deriving a deterministic check's verdict by reading the file yourself | `checks.js` owns that half; a second opinion here manufactures disagreement between two sources that were supposed to be one |
| Editing `tools/upstream-drift/manifest.yml` to silence a failing check | Re-pinning is a deliberate upgrade decision, not an audit side effect — the audit reports, a human re-pins |
| Padding an all-green run with near-findings | Zero findings is the expected steady state; noise here trains the reader to skim the run that finally matters |
