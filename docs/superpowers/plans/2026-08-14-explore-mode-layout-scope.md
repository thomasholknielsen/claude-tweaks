# design-wrapper explore mode — layout scope (established-world composition tournament) (#378)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-14T065616-spec-377-378-379/spec-378/work/378-spec.md` (record #378)

**Goal:** add the `layout` scope to `skills/design-wrapper/modes/explore.md` — one identity, N markups: rendered composition variants of a new surface inside a locked DESIGN.md identity — swap the scope-resolution stub route to the real section, extend the return-shapes block, and add one drift assertion. No new files.

**Verified current state (2026-08-14, this worktree, post-#377):**
- `skills/design-wrapper/modes/explore.md` (167 lines as committed, lightly trimmed by simplifier) has: scope-resolution table whose two `layout` rows return the literal stub skip `layout scope not yet implemented — see #378`; identity procedure under stable headings **Deal and derive / Synthesize clean-room cards / One markup, N skins / Parallel skin builders / Compare / Verdict / Lock-in**; return-shapes block (`## Output to caller`) with the identity ok shape + four skip literals.
- Upstream installed 4.0.2, verified this session:
  - `concept-seed.mjs` usage header line 40: `--scope surface --mode operate --from <key>`; `--scope` validates to `direction|surface`; `SEED_MODES` = `persuade|operate|read|experience`, `--mode` optional (omitted → staging rolls from the full approved pool); `--reroll` ≥0 int; `--chosen <id>` ping. `grep -c -- "--scope surface"` = 1 in the script.
  - **Seed-key location (the spec's one unverified fact — now verified):** `grep -rn "seed key" <plugin>/skills/impeccable/` returns exactly ONE hit — `reference/new-work.md:69`, the direction contract in the **built artifact's opening comment** (FORM block). `reference/document.md`'s DESIGN.md format (the official DESIGN.md spec, frontmatter = design tokens + eight sections) has **no seed-key field** — `document --seed` does NOT record the key in DESIGN.md.
  - `reference/visualize.md` frozen-identity list: "Keep DESIGN.md's palette, typography direction, material language, component character, imagery stance, and motion grammar fixed" (reference for markups-may-not-restyle).
- `skills/_shared/design-contract.md` is this repo's canonical procedure for locating a direction contract and extracting the FORM seed key (opaque token; consumers: design-wrapper `review` mode → writes the record's `Design-seed:` body-metadata line; `/demo`). It never discovers candidate files on its own — the caller supplies the list.
- `tools/upstream-drift/manifest.yml` `impeccable-plugin` entry now carries five explore assertions (#377's three + two); `contract-paths` includes `concept-seed.mjs` and `document.md`.

## Pinned semantics (implementers do not re-litigate)

- **`--from <key>` resolution rule to encode (from the verified facts above):** the committed direction's seed key is NOT in DESIGN.md — its durable homes are (a) a record's `Design-seed:` body-metadata line (written post-build by `/claude-tweaks:design-wrapper` review mode per `_shared/design-contract.md`), and (b) the direction contract's FORM block in a built artifact's opening comment, parsed per `_shared/design-contract.md` over a caller-supplied candidate list (this scope's candidates: the caller's record/`<surface-topic>` context when it names artifacts, else the project's changed/primary-surface artifacts the caller already resolved — the mode never globs on its own). Zero candidates, no seed label, or multiple candidates with differing keys → **deal without `--from`**, and the offer text states challengers are dealt without the committed direction's seed (degraded, never fatal).
- **Dealing:** `concept-seed.mjs --scope surface --mode <mode> --from <key>`; `<mode>` selection rule identical to the identity scope's (persuade/operate/read/experience by the surface's job; omit when unclear) — reference the Deal-and-derive heading's rule, don't restate.
- **Input contract:** `<surface-topic>` = free text naming the new surface + 1-3 sentences of content requirements (what the page must contain, who uses it, the primary action). On standalone invocation with no argument: ask once via `AskUserQuestion` before dealing.
- **Variant builders:** input = synthesized staging card + `DESIGN.md` read-only + the content requirements; output = ONE markup file each, composing the surface differently. **Markups may not restyle** (no new palette, type voice, or motif — upstream `visualize.md`'s frozen list named as the reference), stated side-by-side with skins-may-not-restructure.
- **Machinery reuse by heading:** "run Synthesize clean-room cards through Lock-in with these substitutions" — substitutions enumerated in one list: builder input (staging card + DESIGN.md + content requirements), builder output (one markup file), switcher unit (**whole documents cycled** — e.g. iframe `src` swap — not stylesheets), lock-in (return `visual_reference`, no `document --seed`). Reroll/steer semantics unchanged; seed `key` carried across rounds.
- **Lock-in:** DESIGN.md untouched; keep winning markup (its path = `visual_reference` for the CALLER to write as a `Visual-reference:` line per `spec-template.md` — the mode only returns the path); delete losers. Decline: delete explore dir, stop server — identical to identity.
- **Bright-line functionality limit** (with the example pair): allowed — the same save action framed as a modal vs an inline form (same behavior, different framing); forbidden — one variant autosaves while another requires explicit save (different behavior). Behavior variation is spec territory.
- **Return shape:** `{mode: "explore", result: "ok", scope: "layout", chosen_world: "<staging/challenger display name>", visual_reference: "<path>" | "declined"}` — `chosen_world` deliberately scope-invariant (callers branch on `scope`, not field names); state that in the block.
- **Scope-route swap:** the two stub-skip rows now route into the layout section; the `#378` stub literal disappears from the file.
- AC 2 constraint: identity-procedure step bodies untouched — this record's diff touches only the scope-resolution table, the new layout section, the return-shapes block (and the mode-contract table's `<surface-topic>` cell if its "future record" phrasing needs the update).

## Task 1: Layout section in `modes/explore.md`

**Files:** `skills/design-wrapper/modes/explore.md`

Add the layout-scope section (after the identity procedure, before `## Output to caller`), swap the scope-resolution routes, update the `<surface-topic>` contract-table cell (it currently says the layout scope is a future record), extend the return-shapes block. All pinned semantics above. AC 5: every `DESIGN.md` mention in the layout section is read-only/"untouched" phrasing.

**Verify:** `grep -c -- "--scope surface" skills/design-wrapper/modes/explore.md` ≥ 1; `grep -c "layout scope not yet implemented" skills/design-wrapper/modes/explore.md` = 0; `grep -in "design-contract" skills/design-wrapper/modes/explore.md` ≥ 1 (the `--from` resolution names the canonical parse); grep the layout section for numeric step references (`[Ss]tep [0-9]`) = 0.

## Task 2: Manifest assertion

**Files:** `tools/upstream-drift/manifest.yml`

Append one assertion under `impeccable-plugin` (after the canon-exit row, before `fixtures: []`): `file: "skills/design-wrapper/modes/explore.md"`, `claims: "the surface-scope invocation exists"`, `upstream-path: "skills/impeccable/scripts/concept-seed.mjs"`, `must-match: "--scope surface"`.

**Verify:** `node --test tools/upstream-drift/tests/` green; `node tools/upstream-drift/run.js findings --dep impeccable-plugin --offline` returns `[]`.

## Final Verification (central)

1. `npm test` — zero failures.
2. AC 2: `git diff bfeacfca..HEAD -- skills/design-wrapper/modes/explore.md` — confirm no hunks inside the identity procedure's step bodies.
3. AC walk 1/3/4/5 by reading the layout section.
