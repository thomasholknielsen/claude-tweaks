# Design Mode — explore

Invoked via `/claude-tweaks:design-wrapper explore [<surface-topic>] [--scope identity|layout] [--source <parent-skill>]`. Returns `{mode: "explore", result: "ok", scope: "identity", ...}` or `{mode: "explore", skipped: "...", ...}` to caller.

**Interactive-only — has no auto-mode branch**, like `live`. Every step below assumes a human is present in a browser to answer the Verdict question; no caller may invoke this mode from `auto` or a `$PIPELINE_RUN_DIR`-set context.

**Mode contract:**

| Argument | Meaning |
|---|---|
| `<surface-topic>` | Optional free text. Consumed only by the `layout` scope's own procedure; this scope ignores it entirely. |
| `--scope identity\|layout` | Explicit scope. Wins over auto-resolution when present. |
| `--source <parent-skill>` | Same signal every other mode uses — see `../SKILL.md`'s Component-Skill Contract. |

This file covers the **`identity` scope only**: the genesis worlds tournament, run when a project has a `PRODUCT.md` but no coherent `DESIGN.md` yet. The `layout` scope (comparing compositions inside an already-locked identity) is a separate record — until it lands, `--scope layout` and auto-resolved `layout` both return the stub skip in the scope-resolution table below.

## When this runs

Called directly today via `/claude-tweaks:design-wrapper explore` — no lifecycle skill wires this mode in yet. Entry-point wiring into `/claude-tweaks:specify` (offering it at a genesis design doc) and `/claude-tweaks:init` is a separate decomposition sibling; this mode does not assume any particular caller and must work correctly when invoked standalone.

Division of labor, load-bearing: **upstream deals, this mode derives and renders.** `concept-seed.mjs` assigns and deals; its output is a single prose instruction block that tells the calling agent how to derive grounded directions, fuse dealt challengers, and weigh them — it emits no per-world card payloads. This mode is that calling agent. The dealing catalog, exclusion rules, and canon semantics stay upstream's; this mode never maintains a parallel catalog and never filters a deal on its own judgment.

## Preconditions

**Not the universal three-layer chain** — `doctor`-style, for the same structural reasons:

- **Layer 2** reads a record's `Surface:` line. `explore` receives no spec.
- **Layer 3** sniffs a changed-file list for frontend extensions. `explore` has no file list — it runs at genesis, typically against a clean or nearly-clean tree, where the diff is empty or irrelevant to the question this mode answers.

**Layer 1** (the `design-integration` kill-switch from `../SKILL.md`) applies in full. **Track resolution** runs — every mode resolves a track — and the **native track skips**:

```json
{ "mode": "explore", "skipped": "native surface — explore is web-only", "surface_track": "<ios|android|adaptive>" }
```

The genesis worlds tournament renders CSS skins over an HTML scaffold in a browser; a native app has no page for that scaffold to become. This mirrors `live.md`'s Step 1.5 exactly, on the same upstream constraint (`reference/routing.md`: web-only).

**Availability** is exact-pin `resolveImpeccablePlugin`, `doctor`-class — not the looser skill-resolution check `review`/`shape`/`polish`/`live` use. `concept-seed.mjs` is a bundled script that does not exist at every plugin version satisfying skill resolution (`../impeccable-plugin.md`'s "The pin is not pedantry"), so never glob the plugin cache directly, and never treat a resolved `/impeccable:impeccable*` skill as proof the script is present.

## Scope resolution

A short table, run before any procedure step below. Layer 0's `hasDesign` signal is read per `../impeccable-plugin.md`; when Layer 0 degraded, fall back to a direct existence check for `DESIGN.md` at the project root.

| Input | Resolution |
|---|---|
| No explicit `--scope`, `hasDesign` false | → `identity` — continue below |
| No explicit `--scope`, `hasDesign` true | → `layout`. Until that record lands: `{ "mode": "explore", "skipped": "layout scope not yet implemented — see #378" }` |
| `--scope identity`, `hasDesign` true, `DESIGN.md` **coherent** | `{ "mode": "explore", "skipped": "design identity already locked — route identity replacement through upstream new-work explicitly" }` |
| `--scope identity`, `hasDesign` false, or `DESIGN.md` not coherent | → `identity` — continue below |
| `--scope layout` | → `layout` (same stub skip as the auto-resolved row, until #378 lands) |

**Coherent** means the file declares an actual identity — at minimum a palette and a typography direction, the identity-bearing sections upstream's `document.md` writes. An empty or stub `DESIGN.md` is not coherent. **Ambiguity resolves toward coherent** — toward the locked-identity skip, never toward casually re-dealing an identity that might already be someone's real answer. This is the conservative mirror of the wrapper's own "ambiguity resolves to allow" posture, pointed the other way because re-dealing is the destructive-feeling action here.

**`PRODUCT.md` missing** is checked before the above (there is no genesis tournament with no product to build a scaffold from). Offer once:

**Call `AskUserQuestion`:** `question`: `"No PRODUCT.md found — run /impeccable:impeccable init to establish one before exploring identities?"`, `header`: `"Missing PRODUCT.md"`, `multiSelect`: `false`. Option 1 — `label`: `"Yes — run init (Recommended)"`, `description`: `"Invoke /impeccable:impeccable init."`. Option 2 — `label`: `"Skip"`, `description`: `"Do not explore — return without running."`

On decline (or any answer but option 1): `{ "mode": "explore", "skipped": "no PRODUCT.md — run /impeccable:impeccable init first" }`. Never fabricate project context to route around this.

---

## Procedure — identity scope

Each step below carries a **stable heading name** — a later record reuses these headings verbatim for the `layout` scope, never by step number.

### Deal and derive

Resolve `concept-seed.mjs` via `resolveImpeccablePlugin` (reuse Layer 0's `root` when already resolved this invocation), then run:

```bash
node "<root>/skills/impeccable/scripts/concept-seed.mjs" --scope direction --mode <mode>
```

`<mode>` is a real, optional parameter of the script — one of `persuade`, `operate`, `read`, `experience`. Map the primary surface's job: **persuade** for marketing/conversion surfaces, **operate** for tools/dashboards, **read** for content/reading surfaces, **experience** for immersive ones. When the job is unclear, **omit `--mode` entirely** — staging then rolls from the full approved pool rather than this mode guessing. Leave `--candidate-count` at the script's own default; sizing the deal is upstream's call, not this mode's.

Follow the returned instruction block exactly as upstream directs: derive grounded directions, fuse each dealt challenger, weigh them. **The render set is the *presented* directions only** — the assigned direction plus the one or two surviving fused challengers upstream's own presentation rule names — **never the full candidate list** `--candidate-count` sized. Record the deal's id ↔ display-name mapping (`--chosen` below takes the id, never the name). Carry the printed seed `key` and a reroll counter for the whole session — both cross every reroll and the final pick.

### Synthesize clean-room cards

`concept-seed.mjs`'s output is **one shared instruction block**, not per-world payloads — handing it raw to the builders in the next step would leak every sibling direction into every card and destroy the fan-out's independence. This step is what makes the clean room real: for each presented direction, compose one self-contained card carrying its display name, the complete graphic-system description (palette, type voice, material/component character, motion stance), and only the product facts that direction's builder needs. No sibling direction's content crosses into another card.

### One markup, N skins

Build one disposable semantic HTML scaffold of the primary surface, sourced from `PRODUCT.md` (plus a design doc or brief, when one exists), following `skills/specify/design-pre-steps.md` Step 2.5b-ii's conventions: realistic placeholder content, no real data wiring, no framework integration. Save it under `docs/plans/YYYY-MM-DD-{feature}-explore/`, with every token referenced through CSS custom properties only — never a literal color or font baked into the markup or a skin.

**This is load-bearing, not incidental:** one markup file, one CSS file per presented direction. Skins may **restyle**, never **restructure** — no builder adds, removes, or reorders elements. The constraint keeps the comparison strictly about identities (a variant that also changed structure would confound "which world" with "which layout"), and it is what makes a reroll cheap: a reroll re-deals and re-skins, and the markup is never touched.

**Scaffold content at genesis is partly invented.** `PRODUCT.md` describes the product, not this specific page's copy — the offer text presented before building the scaffold must say so, so the user compares identities against placeholder content knowingly rather than mistaking it for real copy.

### Parallel skin builders

One Task agent per presented direction, per `skills/_shared/subagent-output-contract.md`: **Standard** profile (fan-out — never Frontier), a status line as the first line of the reply, and clean-room input limited to the synthesized direction card plus the shared markup path (read-only). Builders never restructure markup to compensate for a direction that doesn't fit — see the previous step.

Templates A/B/C don't fit a file-producing builder, so the output format is defined explicitly here, inlined literally in every dispatch prompt:

```
Status line (required): first line of your reply is one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required):
SKIN: {path to the CSS file you wrote, relative to the explore directory}
DIRECTION: {display name of the direction you skinned}
CONCERNS: (up to 3 bullet lines; omit this line entirely if none)
- {concern}

Restyle the shared markup only — do not add, remove, or reorder elements. If this direction cannot be
faithfully expressed as a pure restyle of the shared markup, report DONE_WITH_CONCERNS and name what
could not be expressed rather than restructuring around it.
```

**Degraded variant slot:** a `BLOCKED`/failed builder, or one that reports `DONE_WITH_CONCERNS` because its direction cannot be faithfully expressed as a pure restyle, still gets a slot in the switcher — counted in the "1 / N" indicator, visibly naming the direction and the failure or concern — but that slot is **not pickable** as a winner in the Verdict step below.

### Compare

Serve the explore directory ephemerally per `skills/_shared/dev-url-detection.md`'s "Ephemeral server start" procedure, including its **Cleanup — Standalone** rule (this mode has no pipeline run dir of its own to defer teardown to; stop the server itself once the round concludes).

The switcher is a single, fully self-contained `index.html`: no CDN, no external fonts, no framework — a full-viewport render of the scaffold, a docked "1 / N — {direction}" indicator (including any degraded slots, per the previous step), and arrow-key/click cycling that swaps only the `<link>` to the skin stylesheet. The markup itself never changes between slots.

### Verdict

One `AskUserQuestion` call site, reused every round: **pick** / **reroll** / **steer** / the canon standing exit, listed last and never marked Recommended. Present the "1 / N — {direction}" set from Compare as the options; the standing exit is upstream's own — "it is the user's door, never yours."

**Restate-vs-pointer boundary**, stated once here: the semantics this mode acts on are restated below, and each restatement is pinned by a `tools/upstream-drift/manifest.yml` assertion against upstream's own text — everything else about dealing (the candidate catalog, weighting internals, canon mechanics beyond the bullets below) stays a pointer into `reference/new-work.md`, never re-derived here.

- **Reroll** re-runs Deal and derive with `--reroll <n> --from <key>` — `<n>` is the reroll counter, `<key>` is the carried seed key. Exclusion of every already-shown direction is upstream's own behavior, driven by those two arguments; this mode does not filter the deal itself.
- **Steer** is a reroll whose one-line steer text guides this mode's *next* fuse/weigh pass in Deal and derive — **there is no script flag for steer.** The reroll command is identical to a plain reroll; the steer text changes only how this mode interprets upstream's instruction block on the next pass.
- **After two consecutive rerolls**, ask upstream's own "what quality is missing" question as a distinct one-off follow-up before running the next deal.
- The **canon standing exit** ends the round with no pick — proceed to Lock-in's exit-without-pick branch.

### Lock-in

**On pick:** send `--chosen <id> --from <key>` — `<id>` is the recorded id from Deal and derive's mapping, never the display name — then invoke `/impeccable:impeccable document --seed` via the Skill tool with the chosen direction in context. Upstream writes `DESIGN.md`; **this wrapper writes nothing outside `docs/plans/`**, matching `doctor`'s never-`--fix` discipline.

- If `document --seed` completes and writes `DESIGN.md`: `design_md: "seeded"`.
- If the user backs out of that upstream step after already committing to a pick here: `design_md: "declined"` — the picked scaffold and winning skin are still kept as `visual_reference` either way, since the identity choice itself stands independent of whether upstream's own write completed.

Keep the scaffold plus the winning skin — the survivor becomes `visual_reference`, the path a caller may persist as a `Visual-reference:` body-metadata line. Delete every losing skin. `visual_reference` is `null` only when the pick itself succeeded but writing the kept artifact to disk failed — name that outcome rather than silently returning a path that doesn't exist.

**On exit-without-pick:** delete the whole explore directory, stop the ephemeral server, and return a skip — no partial artifact survives an abandoned round.

## Output to caller

**ok (identity scope):**

```json
{
  "mode": "explore",
  "result": "ok",
  "scope": "identity",
  "chosen_world": "<display name>",
  "visual_reference": "<path>",
  "design_md": "seeded"
}
```

`visual_reference` may be `null` (pick succeeded, artifact write failed — see Lock-in). `design_md` is `"seeded"` or `"declined"`, per Lock-in.

**skip shapes:**

- `{ "mode": "explore", "skipped": "design identity already locked — route identity replacement through upstream new-work explicitly" }`
- `{ "mode": "explore", "skipped": "native surface — explore is web-only", "surface_track": "<ios|android|adaptive>" }`
- `{ "mode": "explore", "skipped": "layout scope not yet implemented — see #378" }`
- `{ "mode": "explore", "skipped": "no PRODUCT.md — run /impeccable:impeccable init first" }`
- Plus the standard availability/kill-switch skips defined in `../SKILL.md` (`design integration disabled`, `Impeccable plugin not installed`, version-mismatch, etc.) — this mode does not redefine those, it dispatches into them exactly as every other mode does.

Both shapes carry the wrapper's standard top-level `platform` and `surface_track` fields — see `../SKILL.md`'s Output contract. This mode adds no field beyond what's shown above.
