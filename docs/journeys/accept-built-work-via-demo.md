---
files:
  - skills/demo/SKILL.md
  - skills/demo/legacy-brief-compatibility.md
  - skills/wrap-up/verification-brief.md
  - skills/_shared/observation-plan.md
---

# Accept Built Work Show-First via /demo

**Persona:** claude-tweaks user (or a maintainer of a project using the plugin) returning days after a build shipped, who owes the record a human verdict and does not want to re-derive "how do I test this" from the diff.
**Goal:** Reach an Approve / Request changes / Skip decision on one record after being *shown* the work — the observation plan executed in front of them — rather than being asked to choose how to verify it first.
**Entry point:** A terminal in a session with the plugin loaded, holding a record number from `/claude-tweaks:help`'s outstanding list (Stage 4.7) or a `demo:pending` notification.
**Success state:** The record carries `demo:approved` (or `demo:changes-requested` plus a linked follow-up record), and the human never had to answer a how-do-you-want-to-check-this question.

## Steps

### 1. Resolve the one item — `/claude-tweaks:demo #N`
- **URL:** `/claude-tweaks:demo #N` (or bare `/claude-tweaks:demo` for this session's own unrecorded work)
- **Action:** Invoke against a record whose wrap-up posted a Verification Brief.
- **Should feel:** Zero re-derivation — the brief `/claude-tweaks:wrap-up` wrote at build time renders immediately, `### The ask` through `### Observation plan`.
- **Should understand:** The `### Observation plan` section is builder-authored at wrap-up time (kinds: `rendered-page | app-route | cli | flow | diff` — schema in `skills/_shared/observation-plan.md`); demo executes it mechanically rather than classifying paths itself.
- **Red flags:** A backlog sweep (demo resolves exactly one item); a "See it yourself"/"Verify it yourself" option in the verdict question (that flow is retired — only briefs posted before the schema shipped walk it, via `legacy-brief-compatibility.md`).

### 2. Watch the plan execute — Prepare → Validate → Show
- **URL:** *(no command — demo drives)*
- **Action:** Nothing. Demo runs Prepare commands (`none` → skipped), silently validates URL surfaces with agent-browser when available (session closed afterward), then Shows: opens the deep link in your browser (`open`/`xdg-open`), runs the `cli` command, walks `flow` Inspect pointers in order (regenerating missing artifacts, stating-and-continuing on failures), or renders the `diff`.
- **Should feel:** Show-first — the work appears in front of you before any question is asked.
- **Should understand:** A Prepare or Validate failure is *evidence for Request changes*, not a debugging detour — demo never fixes the application. A Family-Gate parent brief (no plan section, walkthrough inline in `### Confirmed`) and a no-path-list session-recall entry legitimately skip straight to the verdict.
- **Red flags:** Demo asking which way you'd like to verify before showing anything; a browser validation session left open; a stale `flow` pointer blocking the walk instead of being stated and passed over.

### 3. Give the verdict — one question
- **URL:** *(AskUserQuestion rendered by demo)*
- **Action:** Pick Approve, Request changes (a one-line reason files a linked follow-up record), or Skip for now.
- **Should feel:** One decision, fully informed — the only question the walkthrough asks.
- **Should understand:** Approve swaps `demo:pending` → `demo:approved` (and closes a family parent); Request changes ends this record's walkthrough — a later re-demo is a fresh invocation with fresh preparation.
- **Red flags:** More than one question per record on the happy path; a verdict written for a session-recall entry (nothing is persisted for those except a Request-changes follow-up).
