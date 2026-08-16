---
files:
  - bin/resolve-policy.js
  - bin/lib/policy-schema.js
  - bin/lib/policy.js
  - skills/_shared/policy-schema.md
---

# Resolve a Policy Key Through the Canonical Read Path

**Persona:** claude-tweaks skill author (or a maintainer of a project using the plugin) who wants proof that policy resolution honors the documented precedence chain — run config, then `policy.yml`, then schema default — rather than trusting each skill's prose to have re-implemented it correctly.
**Goal:** Watch one key resolve under three configurations and confirm the returned `{value, source}` envelope changes exactly as `skills/_shared/policy-schema.md` §Canonical read path says it will.
**Entry point:** A terminal at a project checkout root (any repo with — or even without — a `.claude-tweaks/policy.yml`).
**Success state:** Three JSON objects whose `source` fields read `default`, `policy`, and `run-config` respectively, plus one `renamed-from` resolution proving the alias table is live, plus one `--all` snapshot whose every row carries `{value, source}` decorated with schema metadata.

## Steps

### 1. Resolve a schema default — terminal
- **URL:** `node bin/resolve-policy.js autonomy` (from the plugin checkout root; in another project, substitute the resolved plugin root per `docs/skill-authoring.md`'s plugin-root contract)
- **Action:** Run the command in a checkout whose `policy.yml` does not set `autonomy`.
- **Should feel:** Instant and unambiguous — one JSON line, no configuration needed.
- **Should understand:** `{"autonomy":{"value":"supervised","source":"default"}}` — `source: "default"` with no `invalid` flag means known-but-unset: the value came from `POLICY_KEYS`' schema row, the single place defaults live.
- **Red flags:** A stack trace (invocation failures are one stderr line + exit 1); an unknown key killing the whole call — `{"error":"unknown-key"}` must appear per key while siblings still resolve.

### 2. Read a configured value — `.claude-tweaks/policy.yml`
- **URL:** `node bin/resolve-policy.js autonomy worktree.always` in a checkout that sets both keys
- **Action:** Run against a project whose `policy.yml` sets `autonomy: unattended` and `worktree.always: true`.
- **Should feel:** Like one lookup replacing a grep pipeline — several keys per call, natively typed.
- **Should understand:** `source: "policy"` names the layer that decided each value; `worktree.always` comes back as boolean `true`, not the string `"true"` — coercion happens in the resolver, so no read site re-implements it. A malformed value (e.g. `trust-revert-window-days: banana`) degrades to the schema default with `"invalid": true` rather than silently activating some other source's value.
- **Red flags:** String-typed integers or booleans in the JSON; a deprecated key name resolving nothing — `dispatch-pick-max-concurrent: 5` must answer a request for `dispatch-batch-size` with value `5` plus `"renamed-from"`.

### 3. Overlay a pipeline run's config — `--run`
- **URL:** `node bin/resolve-policy.js --run "$PIPELINE_RUN_DIR" review-severity-floor`
- **Action:** Run with `--run` pointing at an active pipeline run directory whose `config.yml` sets the requested lever.
- **Should feel:** Deterministic layering — the run's Manifesto answer wins over the project default, and `source: "run-config"` says so.
- **Should understand:** This is the whole precedence chain made mechanical: run config beats `policy.yml` beats the schema default, per key, in one call. A run dir that exists but has no `config.yml` yet is not an error — the overlay is simply absent.
- **Red flags:** A nonexistent `--run` dir resolving anything (must exit 1 with a stderr message); the overlay applying to `model-profiles` (policy-only by contract).

### 4. Snapshot the whole config — `--all`
- **URL:** `node bin/resolve-policy.js --all`
- **Action:** Run with no key arguments.
- **Should feel:** One call replacing key-by-key enumeration — the whole config, self-describing.
- **Should understand:** Every schema key returns its `{value, source}` envelope decorated with `summary`/`category`/`tier`/`type`/`default` — a JSON `null` default means no default. `--all` composes with `--run`. `--all --values` and `--all <key>` are invocation errors.
- **Red flags:** A registered key missing from the output; a row missing `summary`/`category`/`tier`; `--all` accepting key arguments.
