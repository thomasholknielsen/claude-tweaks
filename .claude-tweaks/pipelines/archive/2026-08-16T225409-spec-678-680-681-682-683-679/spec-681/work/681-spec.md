---
record: 681
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 681: feedback Step 8 / Step 4: filing recipe passes model-authored titles through a shell and documents `createFingerprint` as a string→marker function — three titles were command-substituted and eight fingerprints published as `[object Object]`

Surface: backend

## Current State

- `skills/feedback/SKILL.md` Step 8 files with a shell recipe: body via `--body-file`, but the title interpolated inline as `--title '<title>'` inside the `gh issue create` command. A model-authored title containing backticks was command-substituted by `/bin/sh` (a `` `node -e` `` segment executed as a command and vanished from the title). Measured: 3 of 8 titles corrupted at publish.
- Step 4 says "Reuse `bin/lib/health-core/fingerprint.js` (`createFingerprint`, `normalizeText`) for the fingerprint marker". `createFingerprint(skillName, fields)` is a **factory** returning `{ fingerprint, normalizeDescription }`; calling it with a string basis and embedding the result yields `[object Object]`. Measured: 8 of 8 bodies published with `<!-- fingerprint: [object Object] -->`. The correct primitives are `fingerprintFromBasis(prefix, basis)` (returns `${prefix}-${sha1[0:8]}`) or `createFingerprint('feedback', fields).fingerprint(obj)`.
- No read-back after filing: the corruption reached the public repo and was caught only by an optional spot-check. 8 issues re-edited; 4 error-and-recover sequences across 68 tool calls (5.9%). The dedup query's false `(none)` came from a jq expression inside `node -e`.
- Repo convention for shelling to `gh` from Node: the `gh-api-module-pattern` skill — injectable runner, `execFileSync` with an argv array, no string interpolation. `bin/file-feedback.js` does not exist yet.
- The `gh`-absent transport (`_shared/github-write-transport.md`, MCP path for cloud sandboxes) is a second filing branch in the same step.

## Deliverables

- [ ] `bin/file-feedback.js` + module `bin/lib/feedback/file-feedback.js`: reads a drafts JSON file (array of `{ title, body, labels, fingerprintBasis }`), computes each fingerprint via `fingerprintFromBasis('feedback', basis)`, embeds `<!-- fingerprint: feedback-xxxxxxxx -->`, runs the dedup search (`gh issue list --repo <r> --search "<marker>" --state all --json number,title`), files via `execFileSync('gh', ['issue','create','--repo',r,'--title',t,'--body-file',f, ...labelArgs])`, then **reads back** each created issue (`gh issue view <n> --repo <r> --json title,body`) and compares title + fingerprint line to the draft. Prints a per-draft result table (`filed #N` | `dedup-hit #M` | `filing-failure: <mismatch>`); non-zero exit on any mismatch or failure, other drafts still processed. `--dry-run` computes fingerprints + dedup and creates nothing. Injectable runner for tests.
- [ ] `skills/feedback/SKILL.md` Step 8 replaced: the model writes the drafts file with the Write tool, invokes the CLI, and reports its table; the `--title '<title>'` shell recipe is gone. Step 4 names `fingerprintFromBasis` (or the factory's `.fingerprint(obj)`), never bare `createFingerprint` as a string→marker function. `--pre-confirmed` staged-file cleanup and Step 7's `--dry-run` branch keep their semantics (dry-run maps to the CLI's `--dry-run`). The MCP transport branch gets the same read-back rule.
- [ ] Tests under `tests/bin-lib/feedback/`: backtick / `$(…)` / quote titles round-trip verbatim through the fake runner's argv; fingerprint matches `feedback-[0-9a-f]{8}`; read-back mismatch → non-zero + reported; dedup hit → no create; `--dry-run` → zero create calls.
- [ ] `docs/plugin-structure.md` CLI list entry.

## Acceptance Criteria

1. Filing a draft titled `` foo `node -e` bar $(id) `` results in `gh` receiving that exact string as one argv element (asserted on the fake runner) — no shell involved.
2. Every composed body contains `<!-- fingerprint: feedback-[0-9a-f]{8} -->`; a test asserts `[object Object]` never appears.
3. Read-back compares `title` and the fingerprint line; a mismatch reports `filing-failure` for that draft and the process exits non-zero after processing the remaining drafts.
4. `grep -n "createFingerprint" skills/feedback/SKILL.md` returns nothing that presents it as a string→marker function; `grep -n "\-\-title '" skills/feedback/SKILL.md` returns nothing.
5. `--dry-run` records zero `create` calls on the fake runner and prints computed fingerprints + dedup results.
6. `npm test` passes.

## Technical Approach

- Invoke the `gh-api-module-pattern` skill before writing the module: runner seam `({ runner = defaultRunner } = {})`, per-draft fail-safe, `gh` deps check.
- Drafts file is JSON (no new dependency), authored via the Write tool — never `echo` (zsh mangles `\n`, project memory).
- Keep Step 4's existing fingerprint basis (component + normalized summary); only fix the call.

### Key Files
- `bin/file-feedback.js` (new), `bin/lib/feedback/file-feedback.js` (new)
- `skills/feedback/SKILL.md` Steps 4, 7 (dry-run branch), 8
- `tests/bin-lib/feedback/`, `docs/plugin-structure.md`

## Gotchas

- `gh` has no `--title-file`; the argv array is the only safe channel for the title. Body still goes via `--body-file`.
- Step 8's label rule is unchanged: never apply `by:*`/`type:*`/`risk:*`/`ready`/`size:*` to upstream issues (`needs:definition` the one exception); the CLI passes only labels the drafts file names.
- A `gh api` 404 prints JSON to stdout — key on exit code, not output shape (project memory).
- Bootstrap nothing: this CLI files against *another* repo; label existence is that repo's concern (Step 8's existing confirm-labels check stays).

## Original request

feedback Step 8 / Step 4: filing recipe passes model-authored titles through a shell and documents `createFingerprint` as a string→marker function — three titles were command-substituted and eight fingerprints published as `[object Object]`

**Summary:** Step 8's recipe (`--title '<title>'` inside a shell command) invites string-interpolating draft text into `/bin/sh`; titles containing backticks were command-substituted away (`node -e` in a title executed as a command), and Step 4's "reuse `createFingerprint`" — actually a factory returning `{fingerprint, normalizeDescription}` — produced `[object Object]` as the dedup marker in all eight bodies. Both reached the public repo and were caught only by a spot-check the model chose to run.

**Kind:** Defect

**Affected component:** `skills/feedback/SKILL.md` Steps 4 and 8; `bin/lib/health-core/fingerprint.js` (its documented use)

**Objective:** Friction

**Measurement:** 3 of 8 titles corrupted at publish; 8 of 8 fingerprints published as `[object Object]`; 8 issues republished via `gh issue edit`; 8 dedup queries returned a false `(none)` from a jq expression inside `node -e`; 4 error-and-recover sequences across 68 tool calls (5.9%).

**Repro steps:**
1. Draft an issue whose title contains a backticked identifier (e.g. `` `node -e` ``); file it via a shell command that interpolates the title.
2. Call `createFingerprint(basis)` with one string and embed the result in the body.

**Expected vs. actual:**
Expected: title published verbatim; body carries `<!-- fingerprint: feedback-xxxxxxxx -->`.
Actual: backticked segment executed and removed from the title; marker reads `[object Object]`.

**Proposed fix:** Replace Step 8's shell recipe with `bin/file-feedback.js --drafts <path> [--repo <r>]` that parses the drafts file, computes fingerprints via `fingerprintFromBasis`, and invokes `gh` through `execFileSync` with an argv array — no draft text ever reaches a shell. Fix Step 4 to name `fingerprintFromBasis(prefix, basis)` (or `createFingerprint(skill, fields).fingerprint(obj)`). End Step 8 with a mandatory read-back (`gh issue view <n> --json title,body`) compared against the draft's title and fingerprint line, reporting any mismatch as a filing failure.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-c846d1c6 -->

