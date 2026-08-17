<!-- Sibling of `_shared/policy-schema.md` — its "## Model profiles" lever-table detail, split out per IL-70 (split-by-unit) when merged branch content pushed that file over the 40,960 B ceiling. -->

## Model profiles

Registered by #219; the resolver that actually reads these four (`model-stance`/`frontier-run-cap`/`model-ceiling`/`model-profiles`) is `bin/lib/model-profiles/profiles.js` (`resolve()`), fed by `bin/lib/model-profiles/policy-fragment.js`'s dedicated nested-block reader — `bin/lib/policy-schema.js`'s `auditPolicy()` validates these four shallowly (key names / value types only; `model-profiles`' own row *fields* are never inspected here, since the resolver validates those deeply at resolve time and rejects an unknown one there). `research-mode` is unrelated to the resolver — it feeds `/claude-tweaks:research` directly.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `model-stance` | `policy.yml` | `bin/resolve-profile.js`, `bin/lib/model-profiles/profiles.js`, `/flow` Manifesto (lever 10) | `default` | `economy`/`default`/`max-rigor` — shifts a resolved profile's effort one notch on `EFFORT_SCALE` (`economy` also degrades a Frontier resolution to Capable); never promotes a profile's model upward |
| `frontier-run-cap` | `policy.yml` | `bin/resolve-profile.js`, `bin/lib/model-profiles/profiles.js` | `3` | Per-pipeline-run ceiling on Frontier (`fable`) dispatches; `0` disables Frontier entirely for the run |
| `model-ceiling` | `policy.yml` | `bin/resolve-profile.js`, `bin/lib/model-profiles/profiles.js` | unset (no ceiling) | A profile name (`fast`/`standard`/`capable`/`frontier`) above which a resolved profile is clamped down to the ceiling's row; does not clamp an explicit CLI override — the ceiling defends against skill defaults, not against a human's typed choice |
| `model-profiles` | `policy.yml` | `bin/resolve-profile.js`, `bin/lib/model-profiles/profiles.js` | unset (table defaults apply) | Per-profile `{model, effort}` override rows, keyed by profile name, as a nested block (not a flat `key: value` line — see `bin/lib/model-profiles/policy-fragment.js`'s reader for the shape). **Shallow schema validation**: `auditPolicy()` checks only that each row's key names a real profile; a row's own field shape is validated deeply by the resolver instead |
| `research-mode` | `policy.yml` | `/claude-tweaks:research` | unset (falls through to `standard`) | `quick`/`standard`/`deep`/`ultradeep` — project-level default research depth tier, read when no `--mode=` flag or prompt answer is given. Vocabulary lifted from `/claude-tweaks:research`'s own `## Input` section (that file is authoritative, not this row — IL-24) |

