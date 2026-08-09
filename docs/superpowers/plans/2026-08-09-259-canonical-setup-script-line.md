# Record #259 — Canonical cloud-setup Setup-script line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canonical environment Setup-script field line with a cwd-robust, logging, still-non-blocking form at every site that states it, and teach the Ensure-setup-script procedure to upgrade the old form.

**Architecture:** Pure prose/string edits across four files. The new canonical line lives verbatim at three places (Create step 5, Ensure-setup-script step 4, and the script header in both its template and generated forms); prose sites reference it instead of restating the old bare paste phrase. No behavioral change to `scripts/claude-cloud-setup.sh`.

**Tech Stack:** Markdown skill files + one bash script header comment. Verification via `bash -n`, `grep`, `npm test`.

## Global Constraints

- The new canonical line, byte-exact everywhere it appears in full:
  ```
  { bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
  ```
  (verified `bash -n` clean before this plan was written)
- The old literal `bash scripts/claude-cloud-setup.sh 2>/dev/null || true` must not survive anywhere outside `docs/` (frozen history) and `.claude-tweaks/` (this run's materialized spec quotes it).
- The bare paste phrase `` paste `bash scripts/claude-cloud-setup.sh` `` must not survive as stated field content anywhere.
- The Ensure-setup-script upgrade decision keys on presence/absence of the substring `claude-cloud-setup.log` in the invocation line — exact rule, not resemblance.
- `scripts/claude-cloud-setup.sh`'s header must stay byte-identical to the embedded template in `step-14-cloud-routine-parity.md` (lines 44–53 of that file mirror script lines 1–10).
- Commit messages: `{Verb} {what} — refs #259` (never `closes`/`fixes` — the flow wrap-up owns closure).

---

### Task 1: guided-environment-creation.md — Create step 5 line swap

**Files:**
- Modify: `skills/routine/guided-environment-creation.md:91-97`

**Interfaces:**
- Produces: Create step 5 states the new canonical line in its fenced block; Task 2's step-4 rewrite restates the same string (deliberate duplication, per the file's own deliberate-restatement note).

- [ ] **Step 1: Replace the fenced field line and its parenthetical**

Current text (lines 90–97):

```
   leave Network access at its default (`Trusted`), leave Environment variables empty, and set
   Setup script to exactly:
   ```
   bash scripts/claude-cloud-setup.sh 2>/dev/null || true
   ```
   (repo-agnostic by construction — a safe no-op on any repo that hasn't run `/claude-tweaks:init`
   yet). Click "Create environment". This returns to the new-routine form with the new environment
   now selected in the Environment combobox.
```

New text:

```
   leave Network access at its default (`Trusted`), leave Environment variables empty, and set
   Setup script to exactly:
   ```
   { bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
   ```
   (repo-agnostic and non-blocking by construction — the fallback path covers the field's
   workspace-root cwd, and on a repo that hasn't run `/claude-tweaks:init` the log records bash's
   no-such-file error while session start proceeds). Click "Create environment". This returns to
   the new-routine form with the new environment now selected in the Environment combobox.
```

- [ ] **Step 2: Verify the swap**

Run: `grep -c -F '{ bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true' skills/routine/guided-environment-creation.md`
Expected: `1` (Task 2 raises it to 2)

- [ ] **Step 3: Commit**

```bash
git add skills/routine/guided-environment-creation.md
git commit -m "Swap Create step 5 to the canonical logging Setup-script line — refs #259"
```

### Task 2: guided-environment-creation.md — Ensure-setup-script step 4 four-branch rewrite

**Files:**
- Modify: `skills/routine/guided-environment-creation.md:158-169`

**Interfaces:**
- Consumes: Task 1's canonical line (restated verbatim here — deliberate).
- Produces: four mutually exclusive branches with the `claude-cloud-setup.log`-substring match rule, which #261's prose and the record's AC 3 read.

- [ ] **Step 1: Replace step 4's three branches with four**

Current text (lines 158–169):

```
4. Read the Setup script field. Record whether it was non-empty as `had_script`.
   - Already contains a `claude-cloud-setup.sh` invocation: click `Cancel` (never `Save changes` —
     same read-only discipline as the Audit procedure) and report success without editing.
   - Empty: click into the field and type exactly `bash scripts/claude-cloud-setup.sh 2>/dev/null || true`
     — the same repo-agnostic line Create step 5 uses, safe on a repo that has never run
     `/claude-tweaks:init`. Restating it here rather than citing Create's step 5 is deliberate: the
     two are the same string today but reach different environment classes, and a future change to
     one is not automatically correct for the other.
   - Non-empty with unrelated content (e.g. `npm install`): **do not overwrite it.** Append the
     invocation on its own new line after the existing content. An environment shared with other
     work can carry a setup script this plugin knows nothing about, and replacing it silently
     breaks that work.
```

New text:

```
4. Read the Setup script field. Record whether it was non-empty as `had_script`. Classify it into
   exactly one of the four branches below. The canonical line, restated here rather than cited
   from Create's step 5 deliberately (the two are the same string today but reach different
   environment classes, and a future change to one is not automatically correct for the other):

   ```
   { bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
   ```

   The upgrade decision keys on one exact, checkable rule: does the field's
   `claude-cloud-setup.sh` invocation line contain the substring `claude-cloud-setup.log`?
   - **Canonical/current** — the field contains a `claude-cloud-setup.sh` invocation that
     redirects into a `claude-cloud-setup.log` file: click `Cancel` (never `Save changes` — same
     read-only discipline as the Audit procedure) and report success without editing.
   - **Old form** — the field contains a `claude-cloud-setup.sh` invocation with **no**
     `claude-cloud-setup.log` redirect (with or without `2>/dev/null`): replace that line with the
     canonical line above, leaving any other field content untouched.
   - **Empty**: click into the field and type exactly the canonical line above — repo-agnostic,
     safe on a repo that has never run `/claude-tweaks:init`.
   - **Unrelated content** — no `claude-cloud-setup.sh` invocation at all: **do not overwrite
     it.** Append the canonical line on its own new line after the existing content. An
     environment shared with other work can carry a setup script this plugin knows nothing about,
     and replacing it silently breaks that work.
```

- [ ] **Step 2: Verify both the rule and the line count**

Run: `grep -c -F '{ bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true' skills/routine/guided-environment-creation.md`
Expected: `2`

Run: `grep -c 'claude-cloud-setup.log' skills/routine/guided-environment-creation.md`
Expected: `>= 4` (canonical line ×2, match-rule sentence, canonical-branch description)

Run: `grep -c -F 'bash scripts/claude-cloud-setup.sh 2>/dev/null || true' skills/routine/guided-environment-creation.md`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add skills/routine/guided-environment-creation.md
git commit -m "Rewrite Ensure-setup-script step 4 as four branches keyed on the log-redirect substring — refs #259"
```

### Task 3: step-14 embedded templates + regenerated script header

**Files:**
- Modify: `skills/init/bootstrap/step-14-cloud-routine-parity.md:50-52` (embedded script-template header) and `:240-241` (generated CLAUDE.md-section bullet)
- Modify: `scripts/claude-cloud-setup.sh:7-9` (header — must end byte-identical to the template)

**Interfaces:**
- Produces: the script header becomes the referenceable single statement of the canonical line ("see `scripts/claude-cloud-setup.sh`'s header") that Task 4 and #261 cite.

- [ ] **Step 1: Edit the embedded template header in step-14**

Current text (step-14 lines 50–52, inside the fenced script template):

```
# Paste `bash scripts/claude-cloud-setup.sh` into this project's claude.ai/code environment
# Setup script field (environment settings, web UI only — no API sets this remotely) so
# cloud sessions and scheduled Routines get the same plugins available locally.
```

New text:

```
# Paste this canonical line into this project's claude.ai/code environment Setup script
# field (environment settings, web UI only — no API sets this remotely) so cloud sessions
# and scheduled Routines get the same plugins available locally:
#   { bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
```

- [ ] **Step 2: Apply the identical edit to `scripts/claude-cloud-setup.sh` lines 7–9**

Same old text, same new text (the checked-in script's header must match the template — step-14's own regeneration rule).

- [ ] **Step 3: Edit the generated CLAUDE.md-section bullet in step-14**

Current text (step-14 lines 240–241):

```
- **Setup script (required, not optional):** paste `bash scripts/claude-cloud-setup.sh`
  into this project's cloud environment's Setup script field (claude.ai/code environment
```

New text:

```
- **Setup script (required, not optional):** paste the canonical Setup-script line (see
  `scripts/claude-cloud-setup.sh`'s header) into this project's cloud environment's Setup
  script field (claude.ai/code environment
```

- [ ] **Step 4: Verify template/script byte-parity and phrase retirement**

Run: `diff <(sed -n '44,60p' skills/init/bootstrap/step-14-cloud-routine-parity.md) <(sed -n '1,17p' scripts/claude-cloud-setup.sh)`
Expected: no output (byte-identical header region; line offsets shift by the inserted canonical-line comment — re-derive the ranges by content if the sed windows drift: the template's fence starts at `#!/usr/bin/env bash`)

Run: `grep -rn 'paste `bash scripts/claude-cloud-setup.sh`' skills/ scripts/`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add skills/init/bootstrap/step-14-cloud-routine-parity.md scripts/claude-cloud-setup.sh
git commit -m "State the canonical Setup-script line in the step-14 templates and regenerated script header — refs #259"
```

### Task 4: CLAUDE.md Cloud parity bullet — string swap only

**Files:**
- Modify: `CLAUDE.md:125` (the Setup-script bullet)

**Interfaces:**
- Consumes: Task 3's script-header statement of the canonical line (this bullet now points at it).
- Produces: nothing downstream in this record; #261 attaches its limitation prose around whatever this lands.

- [ ] **Step 1: Swap the paste phrase**

Current text (CLAUDE.md line 125, opening only — the rest of the bullet is untouched):

```
- **Setup script (required, not optional):** paste `bash scripts/claude-cloud-setup.sh` into this project's cloud environment's Setup script field
```

New text:

```
- **Setup script (required, not optional):** paste the canonical Setup-script line (see `scripts/claude-cloud-setup.sh`'s header) into this project's cloud environment's Setup script field
```

Everything after "Setup script field" on that line stays exactly as it is — #261 owns the surrounding limitation prose.

- [ ] **Step 2: Verify**

Run: `grep -c 'paste the canonical Setup-script line' CLAUDE.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Point CLAUDE.md's Setup-script bullet at the canonical line — refs #259"
```

### Task 5: Acceptance sweep

**Files:**
- Test: repo-wide greps + `bash -n` (no file changes expected; fix-and-recommit under the owning task's message style if a stray occurrence surfaces)

**Interfaces:**
- Consumes: all four prior tasks' edits.

- [ ] **Step 1: Negative sweep — old literal gone**

Run (under `bash -c`, per IL-22):
```bash
grep -rn -F 'bash scripts/claude-cloud-setup.sh 2>/dev/null || true' . --include='*.md' --include='*.sh' --exclude-dir=node_modules --exclude-dir=.git | grep -v '^./docs/' | grep -v '^./.claude-tweaks/'
```
Expected: no output. (`docs/` is frozen history per the record's AC 2; `.claude-tweaks/` holds this run's materialized spec, which quotes the old line — IL-28.)

- [ ] **Step 2: Negative sweep — bare paste phrase gone as field content**

```bash
grep -rn 'paste `bash scripts/claude-cloud-setup.sh`' . --include='*.md' --include='*.sh' --exclude-dir=node_modules --exclude-dir=.git | grep -v '^./docs/' | grep -v '^./.claude-tweaks/'
```
Expected: no output.

- [ ] **Step 3: Positive sweep — canonical line where it belongs**

```bash
grep -rln -F '{ bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true' . --include='*.md' --include='*.sh' --exclude-dir=node_modules --exclude-dir=.git | grep -v '^./docs/' | grep -v '^./.claude-tweaks/'
```
Expected exactly these files (order aside):
```
./skills/routine/guided-environment-creation.md
./skills/init/bootstrap/step-14-cloud-routine-parity.md
./scripts/claude-cloud-setup.sh
```

- [ ] **Step 4: `bash -n` the canonical line and the regenerated script**

```bash
bash -n scripts/claude-cloud-setup.sh && sed -n '/{ bash scripts/p' scripts/claude-cloud-setup.sh | sed 's/^#[[:space:]]*//' | bash -n && echo PARSE-OK
```
Expected: `PARSE-OK`

- [ ] **Step 5: Run the suite**

Run: `npm test` (redirect to a file and tail it)
Expected: green — no test pins these strings (verified at decomposition time), so any failure is a finding to surface, not to silently fix.
