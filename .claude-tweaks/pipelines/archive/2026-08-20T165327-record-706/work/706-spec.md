---
record: 706
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 706: specify shaping-mode: defers to spec-template.md for a short Surface:/Design-intent: value list — a blanket read costs ~12 KB of decomposition scaffolding the mode itself declares irrelevant

Surface: backend

## Current State

`shaping-mode.md`'s Metadata block section resolves a record's `Surface:`/`Design-intent:` body-metadata values by pointing at `spec-template.md` as "the canonical field and value reference" — with no heading name or line range, so the natural (and observed) response is to load the whole file. `spec-template.md` is written for decomposition mode: it documents the fuller section list (Overview, Non-Goals, Prerequisites, and so on) that shaping mode's own procedure text says a single shaped record doesn't need.

Measured over one `/specify` run in shaping mode: total tool-result volume 90,333 chars across 16 calls; the single largest result was 23,930 chars, of which 11,932 chars (13.2% of the run's tool-result bytes, roughly 3K tokens) came from a `head -150` read of `spec-template.md`. All six record bodies composed in that run used exactly the five shaping sections (`## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, `## Gotchas`) plus `## Original request` and a `Surface: backend` line — nothing from the template's fuller section list. No duplicate reads of the file were found in the run, so this is one avoidable read per run, not a caching bug.

## Deliverables

- In `shaping-mode.md`'s Metadata block section (currently line 53's closing sentence, "the canonical field and value reference lives in `spec-template.md`"), replace the blanket file pointer with the exact slice shaping mode needs: the `Surface:`/`Design-intent:` enum values and their one-line semantics.
- Preserve `spec-template.md` as the canonical, fuller reference (used by decomposition mode, which does need the rest of the template) — the shaping-mode text should cite it as canonical without requiring shaping mode to read it.

## Acceptance Criteria

- `shaping-mode.md`'s Metadata block section resolves `Surface:`/`Design-intent:` values without requiring a full read of `spec-template.md` — either by inlining the short value list directly into `shaping-mode.md`, or by naming the exact heading/anchor in `spec-template.md` so a targeted `sed -n` range read replaces the current `head -150`/whole-file read.
- The `Surface:`/`Design-intent:` value list stays consistent between `shaping-mode.md` and `spec-template.md` after the change — if inlined, `shaping-mode.md` still cites `spec-template.md` as the canonical source (per the existing convention that `Design-seed:`/`Parent:` documentation lives only in the template); if anchor-based, no duplication is introduced at all.
- Existing `Surface:` values in shaping mode's own text (`web`, `mobile`, `desktop`, `backend`, `infra`, `terminal`) and `Design-intent:` values (`bold`, `quiet`, `minimal`, `delightful`, `onboarding`, `none`) remain accurate to `spec-template.md`'s definitions — no value drift introduced by the edit.
- A fresh shaping-mode run's tool-result volume no longer includes a full/partial `spec-template.md` read for this purpose (verify via a repeat of the measurement above, or by inspection that the new text needs no such read).

## Technical Approach

Two mechanisms satisfy the acceptance criteria; either is acceptable, but they carry different maintenance tradeoffs — pick one on entering `/claude-tweaks:build`:

1. **Inline the value list.** Copy the ~10-line `Surface:`/`Design-intent:` enum-and-semantics table directly into `shaping-mode.md`'s Metadata block section, replacing the current sentence. Cite `spec-template.md` as canonical in the same breath (e.g. "values below; `spec-template.md` is canonical for the full field set including `Design-seed:`/`Visual-reference:`/`Parent:`, which shaping mode never writes"). Simpler to read at the point of use; costs a second copy of the value list that must be kept in sync if `spec-template.md`'s enum ever changes (e.g. a new `Surface:` value).
2. **Named-heading anchor.** Add or confirm a heading in `spec-template.md` that brackets exactly the `Surface:`/`Design-intent:` value block, and have `shaping-mode.md` instruct a `sed -n '/^### Surface.*Design-intent/,/^###/p'`-style range read (or equivalent) instead of `head -150`. No duplication, but couples `shaping-mode.md`'s read instruction to `spec-template.md`'s heading text staying stable — a future template rewrite that renames or reorders the heading silently breaks the range without the failure being visible until read.

Either way, this touches only `skills/specify/shaping-mode.md` (and, for option 2, adds a heading anchor to `skills/specify/spec-template.md` without changing its content). No code changes — pure skill-prose editing.

## Gotchas

- Duplication-drift risk (option 1 only): if the inline copy and `spec-template.md`'s definitions diverge after a future edit to one side, shaping mode could stamp a stale or incorrect `Surface:` value. Whichever option is picked, leave a clear signpost in the edited file pointing back to the other for anyone changing the enum later.
- Anchor-fragility risk (option 2 only): a `sed -n` range keyed to heading text breaks silently (returns empty or the wrong slice) if `spec-template.md`'s headings are ever renumbered or reworded — there is no test today that would catch this at edit time, only a shaping-mode run producing an unresolved/blank value.
- `skills/specify/spec-template.md` is read by other flows too (decomposition mode's Step 3, per `record-creation.md`) — confirm the fix touches only the sentence/slice shaping mode consumes and doesn't remove content decomposition mode still needs from the file.
- This repo's markdown conformance suite (`node --test`) pins prose across `skills/**/*.md` — run the full suite, not just a file-matched subset, before considering this shaped record done (per this project's own "Full suite before merging markdown PRs" convention).

## Original request

specify shaping-mode: defers to spec-template.md for a short Surface:/Design-intent: value list — a blanket read costs ~12 KB of decomposition scaffolding the mode itself declares irrelevant

**Summary:** `shaping-mode.md` says the template's fuller section list "is decomposition-mode scaffolding … a single shaped record doesn't need it" and names the five needed sections inline, yet points at `spec-template.md` for the `Surface:`/`Design-intent:` value reference — so the natural load is the whole file, and ~12 KB of decomposition scaffolding enters context unused.

**Kind:** Gap

**Affected component:** `skills/specify/shaping-mode.md` (Metadata block section); `skills/specify/spec-template.md`

**Objective:** Context overhead

**Measurement:** specify-run tool-result volume 90,333 chars across 16 calls; largest single result 23,930 chars, of which 11,932 (13.2% of the run's tool-result bytes, ~3K tokens) is `spec-template.md` head -150. All six composed bodies used exactly the five shaping sections plus `## Original request` and `Surface: backend` — nothing from the template's fuller list. No duplicate file reads found.

**Use case:** Shaping mode is the primary `/specify` path (`#N` references); every shaping run pays for the template read while needing only the value table.

**Proposed fix:** Replace shaping mode's blanket template pointer with the exact slice it needs — either name the heading so the load is a `sed -n` range, or inline the ~10-line `Surface:`/`Design-intent:` value list into `shaping-mode.md` (citing `spec-template.md` as canonical without requiring the read) and drop the cross-file read from the shaping path.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-88067075 -->

