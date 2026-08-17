---
files:
  - plugin/bin/resolve-profile.js
  - plugin/bin/lib/model-profiles/profiles.js
  - plugin/bin/lib/model-profiles/policy-fragment.js
  - plugin/skills/_shared/subagent-output-contract.md
---

# Resolve a Dispatch's Model Profile

**Persona:** claude-tweaks skill author (or a maintainer of a project using the plugin) who wants proof that dispatch-time model resolution actually honors the documented override chain — table default, policy row, stance, ceiling, Frontier gates — rather than trusting the contract's prose.
**Goal:** Watch one profile resolve under three configurations and confirm the returned `model`/`effort`/`source` change exactly as `plugin/skills/_shared/subagent-output-contract.md` §Model Selection says they will.
**Entry point:** A terminal at this repo's checkout root — the repo that ships `plugin/bin/resolve-profile.js`, not the `plugin/` payload directory itself.
**Success state:** Three JSON lines whose `source` fields read `default`, `policy`, and `degraded:cap` respectively, with the models the contract's table and override rules predict.

## Steps

### 1. Resolve the table default — terminal
- **URL:** `node plugin/bin/resolve-profile.js standard`
- **Action:** Run that command from the checkout root (profile lowercase).
- **Should feel:** Instant and unambiguous — one line of JSON, no configuration needed.
- **Should understand:** `{"model":"sonnet","effort":"high","source":"default",...}` is the canonical Standard row from the contract's table — the same data `PROFILES` exports and the table-pinning test enforces, so this output and the contract's prose cannot silently diverge.
- **Red flags:** A thrown stack trace (the CLI is fail-loud by contract — errors are one named line on stderr, exit 1); `source` anything other than `default` in a checkout with no `.claude-tweaks/policy.yml` model keys.

### 2. Override a row from project policy — `.claude-tweaks/policy.yml`
- **URL:** temporarily append to `.claude-tweaks/policy.yml`: a `model-profiles:` block with `  standard:` / `    model: opus` / `    effort: low`, then re-run `node plugin/bin/resolve-profile.js standard`
- **Action:** Add the block, re-run, then remove the block.
- **Should feel:** Like configuration, not code — a project remaps what "Standard" means in one place and every dispatch site inherits it.
- **Should understand:** `{"model":"opus","effort":"low","source":"policy",...}` — the `source` field is the audit trail: it names which layer of the precedence chain decided this pair. Partial rows merge (a row with only `effort:` keeps the table's model).
- **Red flags:** `source` still `default` after adding the block (indentation must be 2 spaces per level); a typo'd effort value resolving anything at all — `effort: hgih` must exit 1 naming the value, never silently resolve.

### 3. Watch the Frontier cap degrade — terminal with a scratch run dir
- **URL:** `mkdir -p /tmp/mp-journey && node plugin/bin/resolve-profile.js frontier --run-dir /tmp/mp-journey` (run it four times)
- **Action:** Run the command four times; inspect `/tmp/mp-journey/frontier-tally.log` between runs.
- **Should feel:** Deterministic — three `fable` resolutions, each appending one `frontier\t{timestamp}` tally line, then a fourth returning `{"model":"opus",...,"source":"degraded:cap"}` with no fourth tally line.
- **Should understand:** This is the per-run spend ceiling on the most expensive model tier: the cap (default 3, policy key `frontier-run-cap`) is enforced mechanically by the resolver, and degradation is visible in `source` rather than silent. `--unattended` degrades immediately the same way — headless contexts never resolve Frontier. The two are independent inputs, not one mechanism: the tally flags (`--run-dir`, `--frontier-used`) answer "how much Frontier has this run already spent", while `--unattended` answers "is a human present" — it resolves `{"source":"degraded:unattended"}` (never `degraded:cap`), reads no tally and appends no tally line even with `--run-dir` passed. Run `node plugin/bin/resolve-profile.js frontier --run-dir /tmp/mp-journey --unattended` on a fresh dir to see both: a degraded line and no `frontier-tally.log` at all.
- **Red flags:** A fourth tally line appearing after the degraded resolution (the tally must only record actual Frontier results); the cap counting non-`frontier` lines in the log.
