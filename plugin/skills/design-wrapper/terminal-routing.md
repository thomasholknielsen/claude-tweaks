# Terminal Routing — everything downstream of a `terminal` track result

Sibling of `native-routing.md`, loaded only when track resolution returns `terminal` (see
`SKILL.md`'s track table) — a web or native run never needs it. The track exists for this
repository's own kind of surface: CLI/TUI help text, output formatting, colour/TTY degradation,
progress feedback, error-message craft, exit codes. It is **declared-only** (`Surface: terminal`
on the record) — Layer 3's sniff has no terminal trigger by design: a repo full of `.js` files
with a CLI entry point would otherwise be sniffed as terminal on every diff.

## Why `Surface:` wins on this track

`setup.platform` describes Impeccable's rendered-product platform, and its closed value domain
(`web`/`ios`/`android`/`adaptive`/`null` — `impeccable-plugin.md`) has no terminal value: a
non-null `platform` against `Surface: terminal` is a category mismatch, not a contradiction to
arbitrate. `Surface:` wins; the disagreement is still recorded in `surface_track_override` and,
when `$PIPELINE_RUN_DIR` is set, in `decisions.md` — a stale `PRODUCT.md` never silently redirects
a record's declared surface.

## Terminal-track outcomes

| Mode / step | Outcome |
|---|---|
| `test` | `{skipped: "terminal surface — CLI detector is web-only"}` |
| `live` | `{skipped: "terminal surface — CLI detector is web-only"}` |
| `review` — Impeccable `critique`/`audit` (Step 3) | `{skipped: "terminal surface — upstream has no terminal track"}`; Steps 3.5–3.7 have nothing to read and do not run. **Step 3.8 critics still run** — the terminal critic is `_shared/terminal-ux.md` per `critics.md`'s terminal row, resolved at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md` (plugin-authored — no two-path lookup, never absent). No decisions layer is inlined on this track — (e) item 3 carries the literal absence sentence, and terminal critics emit `code` rows only, so Step 5.5 never sees a terminal `decisions` finding and the remedy table is unreachable here. |
| `polish` — refinement set, suggestion-driven, intent-driven | Skipped — `"terminal surface — upstream has no terminal track"`. The craft-context assembly still carries `_shared/terminal-ux.md` (see `skills/flow/polish-execution.md`), so a future terminal-capable dispatch inherits it. |
| `survey` | Skipped — same reason. |
| `pre-build` | **Runs.** The always-load set is `_shared/terminal-ux.md` plus `_shared/design-craft.md` (the contract file) only — no Impeccable references, no Emil skills, no `DESIGN.md`/sidecar read; `missed` stays empty (nothing on this track has an install to miss). |
| `shape`, `explore` | **N/A — never read `Surface:`** (structurally inapplicable per `SKILL.md`'s mode notes; unaffected by this track). |
| `doctor` | **Unchanged** — track-independent by `SKILL.md`'s own note; no `doctor` outcome depends on which track resolved. |
| `reset-recommendations` | **Unchanged** — cache utility, track-independent. |

## Revisit condition

The Impeccable skips above are honest, not permanent. When `tools/upstream-drift`'s capability
triage surfaces a terminal/CLI reference or track in Impeccable's `reference/` tree, re-open this
table — file a record; never silently flip a row.
