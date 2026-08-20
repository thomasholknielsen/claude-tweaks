---
record: 488
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
fingerprint: feedback-e6715f97
surface: backend
---
# 488: guided-environment-creation.md: Create step 6 synthetic-typing a large prompt into the routine Instructions textarea can freeze the tab

Surface: backend

## Current State

`skills/routine/guided-environment-creation.md`'s Create procedure step 6 fills a new routine's
Instructions textarea by driving synthetic per-character keystrokes (`computer` `type`) with no
chunking or size guard. 6 of 7 shipped routine templates embed a multi-KB cloud self-heal preamble
ahead of their `Then: /claude-tweaks:<skill>` kickoff line, so a large prompt is the common case,
not the exception. Observed failure: instantiating `code-health`'s template (~5000 characters) via
`/claude-tweaks:init` Step 15 → `create-and-update.md` Step 8 → `guided-environment-creation.md`'s
Create procedure step 6 froze the tab's renderer — `screenshot`/`read_page` timed out (`Script
injection timed out`, then `Page still loading (executeScript waited 45000ms for document_idle)`)
for over a minute before partial recovery, requiring a manual fallback to smaller chunks.

## Deliverables

- Replace or supplement step 6's single-shot synthetic `type` call with a robust fill strategy —
  either (a) a direct DOM/JS value write to the Instructions textarea (dispatching the
  input/change events the form's framework listens for), or (b) explicit chunking of the `type`
  call into bounded-size pieces with waits between chunks.
- Document the chosen approach directly in step 6 of `guided-environment-creation.md`, including
  the size threshold (if chunking) or the exact DOM-write mechanism and browser-tool call shape (if
  direct write).
- Preserve existing behavior for small prompts — no regression to the common small-instructions
  path already covered elsewhere in the file.

## Acceptance Criteria

- [ ] Step 6 of `guided-environment-creation.md` no longer issues one unbounded synthetic `type`
      call for the full resolved prompt.
- [ ] The documented procedure has been exercised (or its browser-tool call shape verified) against
      a multi-KB prompt (e.g. `code-health`'s routine-template.yml prompt) without a renderer
      freeze / stalled `screenshot`/`read_page` timeout.
- [ ] Small prompts still fill correctly with the updated procedure.
- [ ] No other caller of `guided-environment-creation.md` (`/claude-tweaks:routine create`,
      `/claude-tweaks:init` Step 15) needs its own update beyond step 6 itself.

## Technical Approach

Prefer a direct DOM/JS value write via the browser automation tool's script-injection capability
(setting `element.value` and dispatching `input`/`change` events) over chunked synthetic typing —
it avoids the renderer-blocking cost entirely rather than just bounding it, and sidesteps picking a
safe chunk size / wait interval empirically. Fall back to chunking with waits only if the target
form requires realistic keystroke events (unlikely for a plain textarea) or a DOM write proves
incompatible with the routine-creation form's framework (e.g., a controlled React input that
ignores non-event-dispatched value changes).

## Gotchas

- The self-heal preamble that makes prompts large is a deliberate, necessary design (a cloud
  Routine sandbox may have no plugin installed when it fires) — this record is scoped to the
  *input mechanism*, not to shrinking the prompt.
- A controlled-input framework (e.g. React) may reset a raw DOM `.value` write unless the
  corresponding native input-event setter is used and an `input` event is dispatched — verify
  against the actual routine-creation form before committing to the DOM-write approach.
- This is a browser-automation procedure fix; there's no code path to unit test — verification is
  manual/agent-driven against the live routine-creation form (or a close proxy) with a real
  multi-KB prompt.

## Original request

guided-environment-creation.md: Create step 6 synthetic-typing a large prompt into the routine Instructions textarea can freeze the tab

**Summary:** `guided-environment-creation.md`'s Create procedure (step 6) fills a new routine's Instructions field by typing the resolved prompt into the browser textarea via synthetic per-character keystrokes, with no chunking or size guard — a large prompt (the common case, since 6 of 7 shipped routine templates embed a multi-KB cloud self-heal preamble before their `Then: /claude-tweaks:<skill>` kickoff line) can freeze the tab's renderer mid-type.

**Kind:** Gap

**Affected component:** `skills/routine/guided-environment-creation.md` — the Create procedure's step 6 (filling the routine-creation form's Instructions textarea), reached from `/claude-tweaks:routine create` and from `/claude-tweaks:init`'s Step 15 (Routine Installation).

**Use case:** Running `/claude-tweaks:init`'s Step 15 to instantiate the `code-health` routine template for a project with no existing dedicated environment. Step 8 of `create-and-update.md` invoked `guided-environment-creation.md`'s Create procedure, which reached step 6 and typed the fully-resolved `RESOLVED_PROMPT` (code-health's routine-template.yml prompt, ~5000 characters including its cloud self-heal/plugin-diagnostic preamble) into the Instructions textarea in one `computer` `type` action. The tab became unresponsive — repeated `screenshot` and `read_page` calls timed out for over a minute (`Script injection timed out`, then `Page still loading (executeScript waited 45000ms for document_idle)`) — before recovering enough to continue manually in smaller chunks.

The self-heal preamble itself is a deliberate, well-justified design (a cloud Routine sandbox may have no plugin installed at all when it fires, so the routine's own prompt has to carry the diagnostic/self-heal logic — nothing else runs first to delegate it to), and it's necessarily duplicated per-template rather than factored out, since a fired routine's `instructions` field is a flat string with no runtime include mechanism. The gap is specifically in how the guided browser flow *inputs* that large, legitimate prompt — not in the prompt's content or size being wrong.

Feature request: document a more robust way to fill a large Instructions field in step 6 — e.g. setting the textarea's value via a JS/DOM write instead of synthetic per-character typing, or explicitly chunking the `type` calls with waits between chunks — so instantiating a routine from any of the 6 templates carrying this preamble doesn't risk freezing the tab.

**Plugin version:** 6.81.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-e6715f97 -->
