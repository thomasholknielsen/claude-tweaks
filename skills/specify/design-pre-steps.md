# Specify — Design Pre-Steps (Step 2.5)

Loaded by `/claude-tweaks:specify` Step 2.5 when the design doc covers a frontend surface. Skip this file entirely for backend / infra-only design docs — the frontend-detection sniff below determines whether to load this file at all.

These pre-steps capture design context (`shape`) and creative direction (`design-intent:`) so the resulting specs carry both forward to `/build` and `/flow`'s polish phase.

## Step 2.5a: Frontend detection

Sniff the design doc contents for frontend signals using the same rules as `/claude-tweaks:design`'s Layer 3:

- File-extension references (e.g., `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`)
- Path references containing `/components/`, `/pages/`, `/app/`, `/routes/`, `/views/`, `/ui/`
- Explicit "UI", "frontend", "component", "page", "screen" terminology

For the canonical sniff rules, read `frontend-detection.md` in the `/claude-tweaks:design` skill's directory.

If no frontend signals are detected, stop reading this file — return to SKILL.md and skip Steps 2.5b and 2.5c entirely. Set `surface: backend` (or `infra` when the design clearly targets infra) on each generated spec; do not write `design-intent:` for non-frontend specs (or write `design-intent: none`).

## Step 2.5b: Shape pre-step (frontend only)

**Auto mode:** auto-run the shape pre-step for frontend specs (detection is deterministic from Step 2.5a). Log entry:
```
AUTO {time} — Step 2.5b: auto-ran /claude-tweaks:design shape for frontend spec. Output appended to design doc. Reversibility: high.
```
On `{skipped}` (Impeccable not installed, design integration disabled): note the skip in the log and proceed to Step 2.5c.

**Interactive mode:** offer the shape pre-step:

```
Frontend design detected. Run /impeccable:impeccable shape to plan UX/UI before decomposition?

1. Yes — run /impeccable:impeccable shape and append output to design doc **(Recommended)**
2. Skip — proceed directly to decomposition
```

On option 1: invoke `/claude-tweaks:design shape <topic>` via the Skill tool. The wrapper runs `/impeccable:impeccable shape <topic>` and returns `{result: "ok", output: "..."}`. Append the returned output verbatim to the design doc under a `## Shape (Impeccable)` section. This enriches the design doc with UX/UI planning that the decomposed specs and downstream `/build` can reference.

On `{skipped}` (Impeccable not installed, design integration disabled): note the skip and proceed to Step 2.5c.

## Step 2.5c: Design-intent question (frontend only)

Sets the `design-intent:` frontmatter field that Phase 3's `polish` mode will read for intent-driven dispatch.

**Auto mode:** read `design-intent` from `config.yml`. Apply per the Manifesto value:

- Value is one of `bold` / `quiet` / `minimal` / `delightful` / `onboarding` → write to `design-intent:` frontmatter directly. Log:
  ```
  AUTO {time} — Step 2.5c: applied design-intent={value} from pipeline config. Reversibility: high.
  ```
- Value is `none` → write `design-intent: none` and skip the question. Log:
  ```
  AUTO {time} — Step 2.5c: design-intent=none per pipeline config (no creative direction). Reversibility: high.
  ```
- Value is unset (no pipeline run dir or no `design-intent` key) → fall back to KEPT-PROMPT (ask the user inline). This is in the "not silenced" list when explicitly left open. Log:
  ```
  KEPT-PROMPT {time} — Step 2.5c: design-intent not set in policy; surfaced inline.
  ```

**Interactive mode (or KEPT-PROMPT fallback):** ask the user:

```
Design vibe for this spec? (sets design-intent frontmatter)

1. Bold — eye-catching, confident
2. Quiet — restrained, refined
3. Minimal — strip to essence
4. Delightful — personality, micro-interactions
5. Onboarding — first-run flows, empty states
6. None — no specific creative direction
```

The user can answer with multiple numbers (e.g., `1,4` for bold + delightful). Map the answers:

| User answer | `design-intent:` value |
|-------------|------------------------|
| `1` | `bold` |
| `2` | `quiet` |
| `3` | `minimal` |
| `4` | `delightful` |
| `5` | `onboarding` |
| `6` (or no answer) | `none` |
| `1,4` (multiple) | `bold, delightful` (comma-separated) |

Record the chosen value(s); Step 3 writes them into each generated spec's frontmatter.

**For multi-spec decompositions:** ask the question once per design doc and apply the same intent across all generated specs. If the user wants different intents per spec, they can edit individual spec files after Step 3.

For the canonical enumeration of `design-intent:` values, read the "Frontmatter reference (canonical spec)" section of `spec-template.md` in this skill's directory.
