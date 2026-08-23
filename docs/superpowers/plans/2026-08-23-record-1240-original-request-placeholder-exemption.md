# Exempt the verbatim `## Original request` section from the materialization placeholder gate (#1240)

> **For agentic workers:** execution strategy is controlled by the invoking `/claude-tweaks:build` — ignore any execution-choice boilerplate.

## Context

`shapeGate(body)` (`plugin/bin/lib/issues/materialize-format.js`) tests `PLACEHOLDER_RE = /\bTBD\b|\bTODO\b|<!--\s*ambiguity:/` against the **entire** composed body. `plugin/skills/specify/shaping-mode.md`'s preservation rule ("Preserve the original request") mandates appending the record's original title/body **verbatim** as a terminal `## Original request` section. A placeholder marker inherited inside that verbatim copy — the original capture's own text, not an unresolved authored placeholder — falsely fails `/flow`'s materialization hard gate. Reproduced live on #1207 and again on #1240 itself (this run's own materialization had to override the gate).

**Chosen remedy (record's remedy 1):** scope the gate. Everything from the `## Original request` heading to **end of body** is excluded from the placeholder test. To-EOF, not to-next-heading, because the verbatim copy routinely contains the original body's own nested `## ` headings (`## Current State`, `## Deliverables`, …) — #1240's markers sit after such nested headings, so a next-heading scope would not fix the reproduction. Shaping-mode's template makes `## Original request` the terminal section, so to-EOF matches the authoring convention. The required-sections check is unchanged (whole body).

Remedy 2 (a neutralization annotation) was rejected: it either hand-edits the verbatim copy (contradicting the "rule, not a suggestion" preservation clause) or teaches every gate a new wrapping syntax — more moving parts for the same outcome.

## Tasks

### Task 1: Gate fix + regression tests (TDD — tests first, confirm red, then fix)

**Files:**
- `tests/bin-lib/issues/materialize-format.test.js` — add regression tests
- `plugin/bin/lib/issues/materialize-format.js` — scope the gate

New tests (write first; each MUST fail against the unmodified module — run the suite once before implementing and quote the failures):

1. **AC1 mirror of #1240's exact shape:** SHAPED_BODY + `\n\n## Original request\n\nOld title\n\n## Current State\n\nregex is /\bTBD\b/ etc.\n\n## Deliverables\n\n- [ ] exact set TBD at build time\n\nTODO: revisit\n\n<!-- ambiguity: which? -->` → `shapeGate(...)` returns `{ ok: true, missing: [] }`. The markers sit AFTER nested `## ` headings inside the verbatim copy — pins the to-EOF scope, not a to-next-heading scope.
2. **AC2 guard:** SHAPED_BODY with `TBD` injected into the authored Deliverables section, plus a clean `## Original request` section appended → fails with `missing` including `'unresolved-placeholder'`.
3. **CLI-level regression:** `materialize CLI` test using `ghJson({ body: SHAPED_BODY + <Original request section carrying markers> })` → exit 0, file written.

Fix in `materialize-format.js`:
- Add a line-anchored locator for the terminal section: first match of `/^## Original request[ \t]*$/m`; the placeholder test runs against `text.slice(0, matchIndex)` (whole text when no match).
- Update the module's `shapeGate` doc comment: "no TBD/TODO/`<!-- ambiguity:` marker anywhere outside the verbatim-preserved `## Original request` section (that heading to end of body — shaping-mode.md's preservation rule makes it the terminal, verbatim section, which may contain the original body's own nested `## ` headings)".
- Required-sections loop untouched.

**Verify:** `node --test tests/bin-lib/issues/materialize-format.test.js` — all pass. Then AC1 live evidence: run the fixed `shapeGate` against the actual fetched #1240 body (saved at the run scratchpad) and confirm `{ ok: true }`.

### Task 2: Documentation sweep — every restatement of the whole-body rule

Update each site to carry the exemption, keeping each file's surrounding style. Grep-derived restatement list (complete as of this plan; re-run `grep -rn "anywhere in the body\|placeholder marker\|appears anywhere" plugin/` before finalizing):

- `plugin/skills/_shared/work-record.md` (~line 256, canonical definition): extend the third bullet — markers are checked everywhere **outside** the verbatim-preserved `## Original request` section (that heading to end of body); inherited markers there are the original capture's own text (#1240).
- `plugin/skills/flow/materialize.md` (~line 36, Materialization hard gate): mirror the exemption, citing work-record.md's definition.
- `plugin/skills/backlog/refine-mode.md` (~line 207, Step 3.5 check): same mirror edit.
- `plugin/skills/capture/SKILL.md` (~line 250, shaped-body detection): "appears anywhere" → "appears anywhere outside a verbatim-preserved `## Original request` section".
- `plugin/skills/backlog/grant-mode.md` (~line 304): extend the parenthetical.
- `plugin/skills/specify/shaping-mode.md`, three touches:
  1. Authoring constraint (~line 70): still bans the literals in **composed prose**; add that a marker *inherited inside the preserved `## Original request` copy* is sanctioned — the spec-shaped-body checks exempt that section (#1240) — and must never be hand-edited out of the verbatim copy.
  2. "Preserve the original request" (~line 86): one sentence — the preserved copy is exempt from the placeholder gate, so preservation stays byte-exact even when the original text carries `TBD`/`TODO`/ambiguity markers.
  3. Read-back assertion (~line 229): scope to "survived into the written body outside the preserved `## Original request` section". **Pinned-prose constraint:** `tests/specify-range-form-readback.test.js` requires the literal token `No unresolved placeholder marker` in shaping-mode.md — keep that exact prefix.

**Verify:** `node --test tests/specify-range-form-readback.test.js` passes; `grep -rn "anywhere in the body" plugin/` returns no un-exempted restatement of the placeholder rule (the required-sections prose may legitimately remain).

### Task 3: Central verification

- `npm test` (full suite, output to a file, grep the tail) — zero failures attributable to this change; re-run any flaky file in isolation before concluding.
- Discrimination proof: `git stash`-free revert check — `git show HEAD:plugin/bin/lib/issues/materialize-format.js` into a temp file, point a one-off require at it, confirm new test bodies fail against it (or simply rely on Task 1's recorded red run).

## Acceptance criteria mapping

- AC1 → Task 1 tests 1 and 3 + live #1240 body check.
- AC2 → Task 1 test 2 + existing whole-suite placeholder tests (markers appended without an Original request section still fail — existing test at line 57 keeps covering this).
- AC3 → Task 3 full suite.

## Scope keywords

Not declared (fast-lane; file list above is exhaustive).
