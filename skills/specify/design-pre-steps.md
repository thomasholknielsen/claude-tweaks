# Specify — Design Pre-Steps (Step 2.5)

Loaded by `/claude-tweaks:specify` Step 2.5 when the design doc (decomposition mode) or the record's own content (shaping mode) covers a frontend surface. Skip this file entirely when the input is backend / infra-only — the frontend-detection sniff below determines whether to load this file at all. Step 2.5a and Step 2.5c run in both modes (Shaping mode calls them directly against the record's own body — see `SKILL.md`'s Shaping mode section); Step 2.5b is decomposition-mode only, since there's no design doc to plan UX/UI for ahead of a shaping-mode record that already exists.

These pre-steps capture design context (`shape`), an optional accepted visual direction (`Visual-reference:`), and creative direction (`Design-intent:`) so the resulting records carry all three forward to `/build` and `/flow`'s polish phase as body-metadata lines.

## Step 2.5a: Frontend detection

Sniff the input for frontend signals using the same rules as `/claude-tweaks:design-wrapper`'s Layer 3 — the design doc's contents in decomposition mode, the record's own title/body in shaping mode:

- File-extension references (e.g., `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`)
- Path references containing `/components/`, `/pages/`, `/app/`, `/routes/`, `/views/`, `/ui/`
- Explicit "UI", "frontend", "component", "page", "screen" terminology

For the canonical sniff rules, read `frontend-detection.md` in the `/claude-tweaks:design-wrapper` skill's directory.

If no frontend signals are detected, stop reading this file — return to SKILL.md and skip Steps 2.5b and 2.5c entirely. Write `Surface: backend` (or `infra` when the input clearly targets infra) as a body-metadata line on the affected record(s); omit `Design-intent:` entirely for non-frontend records — there is no "none" sentinel for the non-frontend case, absence is the signal.

## Step 2.5b: Shape pre-step (frontend only)

**Auto mode:** auto-run the shape pre-step for a frontend design doc (detection is deterministic from Step 2.5a). Log entry:
```
AUTO {time} — Step 2.5b: auto-ran /claude-tweaks:design-wrapper shape for the frontend design doc. Output appended to design doc. Reversibility: high.
```
On `{skipped}` (Impeccable not installed, design integration disabled): note the skip in the log and proceed to Step 2.5c.

**Interactive mode:** offer the shape pre-step:

**Call `AskUserQuestion`:**

- `question`: `"Frontend design detected. Run /impeccable:impeccable shape to plan UX/UI before decomposition?"`, `header`: `"Shape pre-step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — run shape (Recommended)"`, `description`: `"Run /impeccable:impeccable shape and append output to the design doc."`
- Option 2 — `label`: `"Skip"`, `description`: `"Proceed directly to decomposition."`

On option 1: invoke `/claude-tweaks:design-wrapper shape <topic>` via the Skill tool. The wrapper runs `/impeccable:impeccable shape <topic>` and returns `{result: "ok", output: "..."}`. Append the returned output verbatim to the design doc under a `## Shape (Impeccable)` section. This enriches the design doc with UX/UI planning that the decomposed leaf records and downstream `/build` can reference.

On `{skipped}` (Impeccable not installed, design integration disabled): note the skip and proceed to Step 2.5c.

## Step 2.5b-ii: Variant exploration (interactive only, shape confirmed)

Runs only when Step 2.5b's shape pre-step actually produced a confirmed brief (option 1 was taken and Impeccable's own brief-confirmation exchange completed) — skip entirely if Step 2.5b was skipped, auto-ran, or returned `{skipped}`. **No auto-mode branch** — this step requires a human in a browser by construction (same reason `/impeccable:impeccable live` itself has no non-interactive mode); auto-mode design docs proceed straight from the text brief.

Offer once, as its own message:

**Call `AskUserQuestion`:**

- `question`: `"Want to compare a few real variants of {primary surface, from the brief's \"Primary User Action\"} before I build it for real? I'll put together a quick throwaway version and let you pick a direction in the browser."`, `header`: `"Variant exploration"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — build a scaffold (Recommended)"`, `description`: `"Build a disposable scaffold and open live mode to pick a direction."`
- Option 2 — `label`: `"Skip"`, `description`: `"Proceed to decomposition from the text brief only."`

On option 2, or if the user doesn't respond affirmatively: proceed to Step 2.5c with no further action.

On option 1:

1. **Generate the scaffold.** Write a minimal, disposable static HTML file implementing the brief's primary surface — realistic placeholder content per the brief's "Key States" and "Content Requirements" sections, no real data wiring, no routing, no framework integration, no test coverage. Save it to `docs/plans/YYYY-MM-DD-{feature}-shape-scaffold.html` (same co-location convention as the audit/recommendations/declined caches).
2. **Serve it.** Follow `_shared/dev-url-detection.md`'s "Ephemeral server start" procedure to serve the scaffold's containing directory on a free port. Set `SCAFFOLD_URL = http://localhost:{free-port}/{scaffold-filename}`.
3. **Hand off to live mode.** Invoke `/claude-tweaks:design-wrapper live <SCAFFOLD_URL>` via the Skill tool. The human explores variants, tunes parameters, and accepts a direction — or exits without accepting, which is treated as a skip: proceed to Step 2.5c with no `Visual-reference:` line.
4. **Stop the ephemeral server** per `_shared/dev-url-detection.md`'s "Cleanup" — Standalone rule (no pipeline run dir exists yet at this point in `/specify`'s flow).
5. **Record the reference.** If a variant was accepted, note the scaffold's path for Step 3 (decomposition mode's own compose-then-write-once step) to write as a new `Visual-reference: docs/plans/YYYY-MM-DD-{feature}-shape-scaffold.html` body-metadata line, alongside `Surface:` and `Design-intent:`, on every generated leaf record covering this surface. Step 2.5b-ii never runs in Shaping mode — Step 2.5b itself is decomposition-mode only, per this file's opening note — so there is no Shaping-mode counterpart to wire up here.

## Step 2.5c: Design-intent question (frontend only)

Sets the `Design-intent:` body-metadata line that Phase 3's `polish` mode will read for intent-driven dispatch.

**Auto mode:** read `design-intent` from `config.yml`. Apply per the Manifesto value:

- Value is one of `bold` / `quiet` / `minimal` / `delightful` / `onboarding` → write the `Design-intent:` body-metadata line directly. Log:
  ```
  AUTO {time} — Step 2.5c: applied design-intent={value} from pipeline config. Reversibility: high.
  ```
- Value is `none` → write `Design-intent: none` and skip the question. Log:
  ```
  AUTO {time} — Step 2.5c: design-intent=none per pipeline config (no creative direction). Reversibility: high.
  ```
- Value is unset (no pipeline run dir or no `design-intent` key) → fall back to KEPT-PROMPT (ask the user inline). This is in the "not silenced" list when explicitly left open. Log:
  ```
  KEPT-PROMPT {time} — Step 2.5c: design-intent not set in policy; surfaced inline.
  ```

**Interactive mode (or KEPT-PROMPT fallback):** ask the user:

**Call `AskUserQuestion`:**

- `question`: `"Design vibe for this record? (sets the Design-intent body-metadata line — select one or more)"`, `header`: `"Design intent"`, `multiSelect`: `true`
- Option 1 — `label`: `"Bold"`, `description`: `"Eye-catching, confident."`
- Option 2 — `label`: `"Quiet"`, `description`: `"Restrained, refined."`
- Option 3 — `label`: `"Minimal"`, `description`: `"Strip to essence."`
- Option 4 — `label`: `"Delightful"`, `description`: `"Personality, micro-interactions."`
- Option 5 — `label`: `"Onboarding"`, `description`: `"First-run flows, empty states."`
- Option 6 — `label`: `"None"`, `description`: `"No specific creative direction."`

The user can select multiple options (e.g., Bold + Delightful). Map the answers:

| User answer | `Design-intent:` value |
|-------------|------------------------|
| `1` | `bold` |
| `2` | `quiet` |
| `3` | `minimal` |
| `4` | `delightful` |
| `5` | `onboarding` |
| `6` (or no answer) | `none` |
| `1,4` (multiple) | `bold, delightful` (comma-separated) |

Record the chosen value(s) — the calling mode's compose-then-write-once step (decomposition mode's Step 3; Shaping mode's own Metadata block / Compose-then-write-once subsections) writes them into the record's body-metadata block.

**For multi-record decompositions:** ask the question once per design doc and apply the same intent across all generated leaf records. If the user wants different intents per leaf, they can edit individual records after Step 3 (`gh issue edit` / `writeRecord`).

For the canonical enumeration of `Design-intent:` values, read the body-metadata block description near the top of `spec-template.md` in this skill's directory.
