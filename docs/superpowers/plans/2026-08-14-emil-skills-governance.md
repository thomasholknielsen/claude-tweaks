# Emil skills governance (#387) — execution plan

For agentic workers: executed inline under `/claude-tweaks:flow` (run dir `2026-08-14T104804-spec-383-384-385-387/spec-387`).

Facts verified at plan time:
- Upstream `emilkowalski/skills`: default branch `main`, HEAD `78761e1b57f97dce65b983d640c70a68f39e8163` (2026-08-10); layout `skills/{name}/SKILL.md`, ten skills, matching the contract's set.
- Merged #383 relevance map wired set: `emil-design-eng`, `animate`, `animation-vocabulary`, `apple-design` → the consumed list (AC 6).
- Fixtures fetched fresh at the pinned SHA via `gh api …/contents/…?ref=<sha>` (raw), committed under `tools/upstream-drift/fixtures/emilkowalski-skills/skills/{name}/SKILL.md`; sha256 computed from those bytes.
- Live init bootstrap steps run 01–18 (not the spec's 11–14 snapshot) → new step is **step-19**, appended, no renumbering. Step index rows live in `skills/init/bootstrap-steps.md`; prose sections in `skills/init/SKILL.md` (Step 18 at line ~163).
- `manifest.js` requires probe-class keys per entry → a `versioning: none` branch is needed in `validateManifest` (detected via `pin.versioning === 'none'`), forbidding probe-machinery keys (`installed-probe`, `pinned`, `contract-paths`, `assertions`, `fixtures`) on the class.
- `manifest.test.js` pins the real manifest's exact name list (line ~398) → must gain `emilkowalski-skills`.
- `run.test.js`'s real-manifest end-to-end test stubs only the three probe-class checks → the content-pinned branch will run the real `checkContentPins` against the committed fixtures, which is the deliberate offline discrimination.

## Task 1 — manifest entry + fixtures
`tools/upstream-drift/manifest.yml`: append the `emilkowalski-skills` dependency (kind `skill-repo`, `pin: { commit: "…", versioning: none }`, `upstream.repo` only — no tag-prefix, no installed-probe, YAML-comment scope statement, four consumed rows path+sha256). Fixtures already fetched (above), committed with this task.

## Task 2 — manifest.js validation branch
Content-pinned class: require `name`, `kind`, `upstream.repo`, `pin.commit` (40-hex), non-empty `consumed` list of `{path, sha256(64-hex)}`; error on any probe-machinery key. Probe-class validation unchanged.

## Task 3 — checks.js
`isContentPinned(entry)` + `checkContentPins(entry, options)` (injectable `fixtureRoot`, default `tools/upstream-drift/fixtures/{name}`): per consumed file — missing-fixture / mismatch (observed hash in result) / ok; entry status ok|mismatch. Export both; extend the header comment.

## Task 4 — run.js
`evaluate()` branches on `isContentPinned` → `{contentPins, pinned: pin.commit, due: status!=='ok'}`; `isDue`/`hasUpgrade` guard on `evaluation.contentPins`; `buildFindings` emits `content-pin-breach` (cls drift, severity high, subject = consumed path, versions from observed sha256 / to pinned sha256) and returns early; `TITLES` gains the kind; `cmdDue`'s reasons branch for the class.

## Task 5 — tests
- `manifest.test.js`: name-list gains `emilkowalski-skills`; new tests — valid content-pinned entry validates clean; missing `pin.commit`, malformed sha256, and a present `installed-probe` each error; real-manifest conformance asserts the emil entry parses as the content-pinned shape with its own pin block (parser rejects YAML anchors by construction — `&` is a reserved bare leader).
- `checks.test.js`: `checkContentPins` — ok on matching temp fixture, mismatch on corrupted hash, missing-fixture on absent file; real-manifest + real-fixtures all-ok (offline discrimination).
- `run.test.js`: content-pinned `evaluate` shape; mismatch → one `content-pin-breach` finding that passes `validateFinding`; due flips with status.

## Task 6 — init step + index + #357 comment
`skills/init/bootstrap/step-19-emil-skills.md` mirroring step-11's offer/decline/record structure (frontend-gated, `npx skills@latest add emilkowalski/skills`, optional + graceful-degradation wording, no CLAUDE.md flag — presence-based resolution per the contract); row in `bootstrap-steps.md`; `### Step 19` section in `skills/init/SKILL.md`. Post the spec's exact `gh issue comment 357` body.

## Verification
AC1 `node --test tools/upstream-drift/tests/` + manual corrupt-then-restore of one manifest hash; AC2 three design entries with own pin blocks (test); AC3 step files unrenumbered (`git diff` name-status); AC4 `gh issue view 357 --comments`; AC5 hashes recomputed from the fresh-fetch bytes; AC6 consumed list = wired set.
