# Policy Configuration Review

Read by `update-mode.md`'s "Policy Configuration Review" entry in Phase 1u.5. A general "does
your `policy.yml` look right?" pass, distinct from Config Home Drift and Renamed key drift —
those catch a key in the wrong file or under a retired name, this reviews the full
recognized-lever surface: every key currently set, whether its value validates, and (skippable)
what each one does.

## Procedure

Read `auditPolicy(repoRoot)` from `bin/lib/policy-schema.js` — the same module Config Home Drift
and Renamed key drift already call:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); const r=auditPolicy(process.cwd()); console.log(JSON.stringify({invalidValues:r.invalidValues,unrecognizedKeys:r.unrecognizedKeys}))"
```

- **`invalidValues`** — a recognized key set to a value its schema entry rejects (wrong type, an
  enum value outside its list, an out-of-range integer). The lever silently runs on its schema
  default until fixed (`resolveValue`'s coercion contract — see `_shared/policy-schema.md`).
- **`unrecognizedKeys`** — a `policy.yml` line whose key names no lever in `POLICY_KEYS` and no
  retired key in `RENAMED_KEYS` — most often a typo, or a stray leftover from a lever removed
  outright rather than renamed.

**Always surface a one-line count**, even when both lists are empty (`"Policy config: {N}
lever(s) set, 0 issues found"`) — this is the piece that must never be silently skipped. Both
empty means nothing further to do for this check. Otherwise each non-empty list counts toward
Phase 1u.6's Total drift count, the same self-classifying convention every check in
`update-mode.md`'s Phase 1u.5 already uses.

Then offer the detailed pass in one `AskUserQuestion` call — the low-friction skip this check
requires (one click, never "type no"):

- `question`: `"Show the full policy.yml review — {N} issue(s) found, {M} lever(s) set?"`,
  `header`: `"Policy review"`, `multiSelect`: `false`
- Option 1 — `label`: `"Skip (Recommended if you already know your config)"`, `description`:
  `"Keep the one-line count above; move on to the rest of Update Mode"`
- Option 2 — `label`: `"Show details"`, `description`: `"Render every set lever with its value
  and what it does, plus a table of the {N} issue(s) found"`

On **Show details**: render `invalidValues`/`unrecognizedKeys` as batch tables (Key | Current
value | Expected/Note), then for every recognized key present in `.claude-tweaks/policy.yml`
(from the Phase 1u inventory), look up its row in `_shared/policy-schema.md`'s lever tables and
render Key | Current value | Meaning — reusing that file's own Meaning column rather than
re-authoring lever descriptions here, so the two never drift apart. A project with no recognized
keys set at all still gets the table, sourced from `POLICY_KEYS`'s own `default` field instead,
so the walkthrough functions as onboarding even on a from-scratch `policy.yml`.

This check never writes to `policy.yml` — a malformed or unrecognized line needs a human's actual
intended value, not a guessed one. Record the outcome in Phase 9's Actions Performed table as an
`Operational` row: `"Policy Configuration Review: {N} issue(s) found, walkthrough {shown |
skipped}."`
