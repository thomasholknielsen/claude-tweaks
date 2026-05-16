# `/claude-tweaks:research` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new standalone utility skill `/claude-tweaks:research` for claude-tweaks v4.7.0 that vendors 199-biotechnologies/claude-deep-research-skill, adapts it to claude-tweaks conventions, and integrates bidirectional cross-references with `/capture`, `/challenge`, `/specify`, `/browse`.

**Architecture:** Vendor the upstream skill wholesale at pinned commit `f2f2c0f` into `skills/research/`. Run the upstream pipeline (8-phase research, validators, citation manager, HTML/PDF generation) as-is. Adapt three surfaces: `SKILL.md` (claude-tweaks conventions), output paths (project-local under `.claude-tweaks/research/`), and kickoff (single `AskUserQuestion` for mode). Add Node tests for the adapted markdown layer; manual smoke for the vendored Python.

**Tech Stack:** Markdown (SKILL.md), Python 3 (upstream pipeline, untouched), Node 18+ `node:test` (for Node-side tests), git CLI, `curl`/`tar` (vendoring).

**Spec:** `docs/superpowers/specs/2026-05-16-claude-tweaks-research-skill-integration-design.md`

**Pinned upstream:** `https://github.com/199-biotechnologies/claude-deep-research-skill` @ commit `f2f2c0fa4e7617ca84c86b63f4bb40f77a746933` (2026-04-11)

---

## Task 1: License gate

**Files:**
- No files modified yet — this is a gate task.

**Context:** Upstream README declares "MIT - modify as needed for your workflow" but ships no `LICENSE` file. The GitHub License API returns 404 for this repo. We will vendor under the assumption that the README declaration is binding (MIT permits this), and ship our own `LICENSE-UPSTREAM` capturing the declaration + pinned SHA + retrieval date. If you discover during vendoring that the README declaration has changed or been removed, STOP and ask the user before proceeding — the design's fallback is "reference-only integration."

- [ ] **Step 1: Fetch the upstream README at the pinned commit and confirm the MIT declaration is present**

```bash
curl -sL "https://raw.githubusercontent.com/199-biotechnologies/claude-deep-research-skill/f2f2c0fa4e7617ca84c86b63f4bb40f77a746933/README.md" \
  | grep -i -A 2 "## License"
```

Expected: output contains `MIT - modify as needed for your workflow.` (or substantively equivalent MIT declaration). If absent or substantially different, STOP and surface to user.

- [ ] **Step 2: Commit this gate as a no-op marker**

No file changes — just confirm verbally to the user that the gate passed. Move on to Task 2.

---

## Task 2: Vendor upstream into `skills/research/`

**Files:**
- Create: `skills/research/` (entire subtree from upstream, except top-level `SKILL.md` which we'll overwrite in Task 5)

- [ ] **Step 1: Fetch the upstream tarball at the pinned commit**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p /tmp/research-vendor
curl -sL "https://github.com/199-biotechnologies/claude-deep-research-skill/archive/f2f2c0fa4e7617ca84c86b63f4bb40f77a746933.tar.gz" \
  -o /tmp/research-vendor/upstream.tar.gz
tar -tzf /tmp/research-vendor/upstream.tar.gz | head -20
```

Expected: tarball lists directories matching `claude-deep-research-skill-f2f2c0f.../{SKILL.md,reference/,scripts/,templates/,tests/,requirements.txt,README.md,.gitignore}`. If structure differs from the design's File Layout (Section 3 of the spec), STOP and surface — the patch points may need recalculation.

- [ ] **Step 2: Extract into `skills/research/` (stripping the top dir)**

```bash
mkdir -p skills/research
tar -xzf /tmp/research-vendor/upstream.tar.gz \
  -C skills/research \
  --strip-components=1
ls skills/research/
```

Expected: `skills/research/` now contains `SKILL.md`, `reference/`, `scripts/`, `templates/`, `tests/`, `requirements.txt`, `README.md`, `.gitignore`.

- [ ] **Step 3: Remove the upstream's `.gitignore` and `README.md` (we have our own conventions)**

```bash
rm skills/research/.gitignore skills/research/README.md
```

- [ ] **Step 4: Stage and commit the raw vendored snapshot before any modifications**

```bash
git add skills/research/
git commit -m "Vendor 199-biotechnologies/claude-deep-research-skill @ f2f2c0f"
```

Expected: a single commit with the unmodified upstream tree (minus their `.gitignore`/`README.md`). This makes future re-vendoring diffs clean — modifications will appear as separate commits on top.

---

## Task 3: Add attribution files

**Files:**
- Create: `skills/research/UPSTREAM.md`
- Create: `skills/research/LICENSE-UPSTREAM`

- [ ] **Step 1: Write `skills/research/LICENSE-UPSTREAM`**

Since upstream ships no `LICENSE` file, we capture their README declaration verbatim as our binding reference, alongside the standard MIT text. Path: `skills/research/LICENSE-UPSTREAM`.

```
Upstream: https://github.com/199-biotechnologies/claude-deep-research-skill
Pinned commit: f2f2c0fa4e7617ca84c86b63f4bb40f77a746933 (2026-04-11)
Retrieved: 2026-05-16

The upstream README at this commit declares:

    ## License
    MIT - modify as needed for your workflow.

The upstream repository does not ship a separate LICENSE file. This file
captures the README declaration as our binding reference, together with
the standard MIT License text below.

---

MIT License

Copyright (c) 2026 199-biotechnologies (per README declaration at pinned commit)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `skills/research/UPSTREAM.md`**

Path: `skills/research/UPSTREAM.md`. Content:

```markdown
# Upstream — claude-deep-research-skill

This skill is vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill).

| Field | Value |
|-------|-------|
| Source | https://github.com/199-biotechnologies/claude-deep-research-skill |
| Pinned commit | `f2f2c0fa4e7617ca84c86b63f4bb40f77a746933` |
| Commit date | 2026-04-11 |
| Retrieved | 2026-05-16 |
| License | MIT (per README declaration — see `LICENSE-UPSTREAM`) |

## Modifications from upstream

Three surfaces are adapted. All other files run verbatim.

### 1. `SKILL.md` rewritten for claude-tweaks conventions

The upstream `SKILL.md` is replaced wholesale with a claude-tweaks-style skill file (frontmatter, interaction style directive, Anti-Patterns table, Relationship table, Next Actions block). The upstream methodology lives in `reference/methodology.md` (untouched); our SKILL.md delegates to it.

### 2. Output path patched from `~/Documents/` to `.claude-tweaks/research/`

Patched files and the exact diffs are captured below. Re-apply mechanically when pulling a new upstream commit.

**`scripts/research_engine.py`** — [diff to be filled in during Task 4 by the implementing engineer; capture exact line numbers and before/after snippets]

**`reference/report-assembly.md`** — every occurrence of `~/Documents` → `.claude-tweaks/research`.

**`reference/continuation.md`** — every occurrence of `~/Documents` → `.claude-tweaks/research`.

### 3. Mode picker via `AskUserQuestion`

Upstream infers mode from natural-language phrasing ("deep research in ultradeep mode: X"). Our `SKILL.md` instead asks one structured question with 4 options (`standard` recommended).

## Auto-mode posture

`/research` is a single-skill utility, not a multi-phase pipeline. The v4.6 bookend architecture (Manifesto + Review Console) does NOT apply. The auto-mode contract applies trivially — no decision-worthy mid-flow stops, nothing to log. Do not retrofit Manifesto integration.

## Updating from upstream

1. Fetch the new upstream tarball:
   ```bash
   curl -sL "https://github.com/199-biotechnologies/claude-deep-research-skill/archive/<NEW-SHA>.tar.gz" \
     -o /tmp/upstream.tar.gz
   ```
2. Extract to a scratch dir and `diff -r` against `skills/research/` to see what changed upstream.
3. Re-apply the three modifications above:
   - Keep our `SKILL.md`, `UPSTREAM.md`, `LICENSE-UPSTREAM` (do not let them be overwritten).
   - Re-apply the `research_engine.py` output-path patch using the diff captured in this file.
   - Re-run `grep -r "~/Documents\|Documents/" skills/research/` to catch any new straggler references and patch them.
4. Update the pinned commit + date in the table above.
5. Run the first-run checklist below.

## First-run checklist (manual)

After vendoring or updating:

- [ ] `python3 -m py_compile skills/research/scripts/*.py` — no syntax errors.
- [ ] `grep -r "~/Documents\|Documents/" skills/research/` — empty output.
- [ ] Invoke `/claude-tweaks:research quick test` in a scratch repo with no API keys → produces a markdown report under `.claude-tweaks/research/`.
- [ ] (If `search-cli` is installed) Invoke `/claude-tweaks:research quick test` → confirms parallel multi-provider retrieval is active.
```

- [ ] **Step 3: Commit attribution files**

```bash
git add skills/research/UPSTREAM.md skills/research/LICENSE-UPSTREAM
git commit -m "Add UPSTREAM.md and LICENSE-UPSTREAM for skills/research/"
```

---

## Task 4: Patch output paths

**Files:**
- Modify: `skills/research/scripts/research_engine.py`
- Modify: `skills/research/reference/report-assembly.md`
- Modify: `skills/research/reference/continuation.md`
- Modify: `skills/research/UPSTREAM.md` (fill in the `research_engine.py` diff section)

- [ ] **Step 1: Identify the output-root constant in `research_engine.py`**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n "Documents" skills/research/scripts/research_engine.py
```

Expected: 1-3 hits referencing `~/Documents` or `os.path.expanduser("~/Documents/...")` — typically a constant near the top or a function building the output dir. Note the line numbers.

- [ ] **Step 2: Patch `research_engine.py`**

Replace the upstream output root with `.claude-tweaks/research`. Use a path relative to `$(pwd)` (the user's current working directory when invoking the skill), NOT the user home dir. Exact code depends on what's there; the canonical edit is:

```python
# Before (example — actual line will be in the file):
OUTPUT_ROOT = os.path.expanduser("~/Documents")

# After:
OUTPUT_ROOT = os.path.join(os.getcwd(), ".claude-tweaks", "research")
```

If the directory layout differs (e.g., `~/Documents/[Topic]_Research_[Date]/` is built by concatenation elsewhere), preserve the date+slug subdir naming but rebase the root to `.claude-tweaks/research/`. Target end state: reports land at `{cwd}/.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/`.

- [ ] **Step 3: Patch the two reference docs**

```bash
sed -i.bak 's|~/Documents|.claude-tweaks/research|g' skills/research/reference/report-assembly.md
sed -i.bak 's|~/Documents|.claude-tweaks/research|g' skills/research/reference/continuation.md
rm skills/research/reference/*.bak
```

- [ ] **Step 4: Sweep for stragglers**

```bash
grep -r "~/Documents\|/Documents/" skills/research/
```

Expected: empty output. If any hits remain, patch them with the same substitution.

- [ ] **Step 5: Record the exact `research_engine.py` diff in `UPSTREAM.md`**

Replace the `[diff to be filled in...]` placeholder in `skills/research/UPSTREAM.md` (created in Task 3) with the actual before/after lines and line numbers from Step 2. Example:

```markdown
**`scripts/research_engine.py`** — line 23:

```diff
-OUTPUT_ROOT = os.path.expanduser("~/Documents")
+OUTPUT_ROOT = os.path.join(os.getcwd(), ".claude-tweaks", "research")
```
```

- [ ] **Step 6: Verify Python still parses**

```bash
python3 -m py_compile skills/research/scripts/*.py
```

Expected: no output (success). If `python3` is not on PATH, document the skip and move on — verification is required only when implementer has Python available.

- [ ] **Step 7: Commit the patches**

```bash
git add skills/research/scripts/research_engine.py \
        skills/research/reference/report-assembly.md \
        skills/research/reference/continuation.md \
        skills/research/UPSTREAM.md
git commit -m "Patch output paths in vendored research skill to .claude-tweaks/research/"
```

---

## Task 5: Write the failing test for SKILL.md structure

**Files:**
- Create: `tests/research/skill-md.test.js`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p tests/research
```

- [ ] **Step 2: Write the test file**

Path: `tests/research/skill-md.test.js`.

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'research', 'SKILL.md');

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z-]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

test('SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `Expected ${SKILL_PATH} to exist`);
});

test('SKILL.md frontmatter has required fields', () => {
  const fm = parseFrontmatter(readSkill());
  assert.ok(fm, 'frontmatter block missing');
  assert.strictEqual(fm.name, 'claude-tweaks:research');
  assert.ok(fm.description && fm.description.length > 20, 'description must be present and substantive');
  assert.match(fm.description, /research/i, 'description must mention research');
});

test('SKILL.md contains interaction style directive', () => {
  const body = readSkill();
  assert.match(body, /Interaction style:\*\* Present decisions as numbered options/);
});

test('SKILL.md has the four required sections', () => {
  const body = readSkill();
  assert.match(body, /## When to Use/);
  assert.match(body, /## Anti-Patterns/);
  assert.match(body, /## Relationship to Other Skills/);
  assert.match(body, /### Next Actions/);
});

test('SKILL.md mode picker mentions all four modes with standard recommended', () => {
  const body = readSkill();
  assert.match(body, /quick/i);
  assert.match(body, /standard/i);
  assert.match(body, /deep/i);
  assert.match(body, /ultradeep/i);
  assert.match(body, /standard.*recommended|recommended.*standard/i);
});

test('SKILL.md output path is project-local under .claude-tweaks/research/', () => {
  const body = readSkill();
  assert.match(body, /\.claude-tweaks\/research\//);
  assert.doesNotMatch(body, /~\/Documents/, 'should not reference upstream ~/Documents path');
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
node --test tests/research/skill-md.test.js
```

Expected: FAIL — at minimum, "SKILL.md exists" passes (because we vendored upstream's SKILL.md), but frontmatter assertions fail because upstream's `name` is not `claude-tweaks:research` and the Anti-Patterns / Relationship / Next Actions sections don't exist.

---

## Task 6: Write `skills/research/SKILL.md`

**Files:**
- Modify (overwrite): `skills/research/SKILL.md`

- [ ] **Step 1: Replace the vendored SKILL.md with the claude-tweaks-conventions version**

Path: `skills/research/SKILL.md`. Full content:

````markdown
---
name: claude-tweaks:research
description: Use when conducting in-depth web research — multi-source synthesis, citation-audited reports with 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Keywords - research, deep research, web research, sources, citations, literature review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Research — Deep Web Research with Citation-Audited Reports

ChatGPT-Deep-Research-style multi-source web research. An 8-phase pipeline decomposes the topic, dispatches parallel searchers, validates citations, and synthesizes a structured report. Vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `UPSTREAM.md`.

```
                             [ /claude-tweaks:research ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:capture (research INBOX items),
            /claude-tweaks:challenge (back debiasing lenses),
            /claude-tweaks:specify (prior-art lookup),
            ad-hoc research tasks
```

## When to Use

- Research a topic in depth before committing to a design direction.
- Audit prior art / state-of-the-art before authoring a spec.
- Debias an INBOX item with evidence from multiple sources.
- Gather citations for a user journey, RFC, or technical decision.
- Generate a structured report (markdown + HTML + PDF) with audited citations.

## Input Resolution

- `$ARGUMENTS` is the research topic. If empty, ask the user for it before proceeding.
- Mode is selected via a single `AskUserQuestion` with 4 options. **`standard` is the recommended default** — it balances depth and runtime.
- Power-user flags (parsed from `$ARGUMENTS`):
  - `--mode=<quick|standard|deep|ultradeep>` — skip the mode prompt.
  - `--output=<path>` — override the default output root (defaults to `.claude-tweaks/research/`).

## Mode Picker

If no `--mode=` flag is present, ask exactly this question:

```
? Mode for "<topic>":
  1. quick      (~2-5 min,    5+ sources)
  2. standard   (~5-10 min,  10+ sources)   ← recommended
  3. deep       (~10-20 min, 15+ sources)
  4. ultradeep  (~20-45 min, red-team pass + multi-persona critique)
```

Reply with the user's selection. Then proceed.

## Workflow

1. **Read the methodology.** Open `reference/methodology.md` in this skill's directory for the canonical 8-phase pipeline (decompose → parallel search → citation registry → evidence-mapped outline → section drafting → counter-review → validation → report assembly).
2. **Construct the output directory.** Path is `{cwd}/.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/` unless `--output=` overrides. Create it before invoking the engine.
3. **Invoke the engine.** Run `scripts/research_engine.py` with the topic, mode, and output dir. The engine handles phase orchestration, parallel search dispatch, citation tracking via `sources.json`, validate-fix-retry (max 3 cycles) using `scripts/validate_report.py` + `scripts/verify_citations.py`, and HTML/PDF assembly via `scripts/md_to_html.py`.
4. **Surface progress.** As each phase completes, echo a single status line ("Phase N/8: <name> — <status>").
5. **On finish, write the Next Actions block** with the produced report path.

## Dependency posture

- **Zero-config baseline.** Built-in `WebSearch` is the fallback retrieval provider. The skill runs end-to-end without any external installs.
- **Enhanced.** Install `search-cli` (Homebrew: `brew tap 199-biotechnologies/tap && brew install search-cli`) for parallel multi-provider retrieval across Brave / Serper / Exa / Jina / Firecrawl. Configure provider API keys via `search config set keys.<provider> <KEY>`.
- **Optional.** Python 3 + `requirements.txt` for the upstream validators, citation manager, and HTML/PDF generation. Install with `pip install -r skills/research/requirements.txt`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Invoking `deep` or `ultradeep` on a fuzzy single-word topic | Burns 20+ minutes on under-scoped queries. Add 1 clarifying sentence to the topic, or use `quick`/`standard` first to refine the scope before going deep. |
| Treating the `WebSearch` fallback as failure | The skill is designed to run zero-config. Install `search-cli` only when source breadth is genuinely insufficient — not by default. |
| Editing reports in place after generation | Reports are dated immutable artifacts. Re-run the skill with the updated topic; the new report gets a fresh dated directory. |
| Skipping the mode prompt by guessing | The 4 modes differ in runtime by ~10×. Always ask unless `--mode=` is passed; this is the one decision that genuinely matters. |
| Retrofitting Manifesto / Review Console wrapping | `/research` is a single-skill utility, not a pipeline. The v4.6 bookend architecture does not apply. See `UPSTREAM.md`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|--------------|
| `/claude-tweaks:capture` | Research findings can be promoted into INBOX items via the Next Actions block; `/capture` references `/research` as a way to enrich a captured idea before specifying. |
| `/claude-tweaks:challenge` | `/challenge` invokes `/research` to back debiasing lenses with evidence; this skill's reports can be cited as challenge sources. |
| `/claude-tweaks:specify` | `/specify` uses `/research` outputs for prior-art sections; this skill's Next Actions block offers a direct "cite findings in a new spec" path. |
| `/claude-tweaks:browse` | Both are utility skills (no fixed lifecycle position). `/browse` covers interactive browser automation; `/research` covers autonomous multi-source research. |
| `UPSTREAM.md` (in this skill's directory) | Captures the vendoring contract — pinned commit, modifications, update runbook, auto-mode posture rationale. |

### Next Actions

After the report completes, present these options:

1. **Promote findings into INBOX** — `/claude-tweaks:capture <findings-summary>` **(Recommended when topic was exploratory)**.
2. **Use findings to debias a problem** — `/claude-tweaks:challenge <inbox-item>`.
3. **Cite findings in a new spec** — `/claude-tweaks:specify <spec-name>`.
4. **Re-run in deeper mode** — `/claude-tweaks:research --mode=deep <topic>` (only if current mode left obvious gaps).
````

- [ ] **Step 2: Run the Node tests and verify they pass**

```bash
node --test tests/research/skill-md.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add skills/research/SKILL.md tests/research/skill-md.test.js
git commit -m "Author skills/research/SKILL.md per claude-tweaks conventions"
```

---

## Task 7: Write the failing test for bidirectional cross-references

**Files:**
- Create: `tests/research/cross-refs.test.js`

- [ ] **Step 1: Write the cross-references test**

Path: `tests/research/cross-refs.test.js`. Content:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSkill(name) {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
}

function relationshipTable(content) {
  const idx = content.indexOf('## Relationship to Other Skills');
  if (idx < 0) return '';
  const next = content.indexOf('\n## ', idx + 1);
  return content.substring(idx, next < 0 ? content.length : next);
}

const SKILLS_THAT_MUST_REFERENCE_RESEARCH = ['capture', 'challenge', 'specify', 'browse'];

for (const skillName of SKILLS_THAT_MUST_REFERENCE_RESEARCH) {
  test(`/${skillName} Relationship table references /research`, () => {
    const content = readSkill(skillName);
    const table = relationshipTable(content);
    assert.ok(
      table.includes('/claude-tweaks:research') || table.includes('`research`'),
      `Expected skills/${skillName}/SKILL.md Relationship to Other Skills table to reference /claude-tweaks:research`
    );
  });
}

test('/research Relationship table references all four related skills', () => {
  const table = relationshipTable(readSkill('research'));
  assert.match(table, /\/claude-tweaks:capture/);
  assert.match(table, /\/claude-tweaks:challenge/);
  assert.match(table, /\/claude-tweaks:specify/);
  assert.match(table, /\/claude-tweaks:browse/);
});

test('/help reference card lists /research', () => {
  const ref = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'help', 'reference-card.md'), 'utf8');
  assert.match(ref, /\/claude-tweaks:research|`research`/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/research/cross-refs.test.js
```

Expected: all 6 tests FAIL (no skill yet references `/research`). The `/research` self-test PASSES because we wrote those references in Task 6.

---

## Task 8: Add bidirectional cross-references

**Files:**
- Modify: `skills/capture/SKILL.md` (Relationship to Other Skills table)
- Modify: `skills/challenge/SKILL.md` (Relationship to Other Skills table)
- Modify: `skills/specify/SKILL.md` (Relationship to Other Skills table)
- Modify: `skills/browse/SKILL.md` (Relationship to Other Skills table)

- [ ] **Step 1: Inspect existing Relationship tables**

```bash
for skill in capture challenge specify browse; do
  echo "=== skills/$skill/SKILL.md ==="
  grep -A 20 "^## Relationship to Other Skills" "skills/$skill/SKILL.md"
done
```

Expected: each shows a markdown table with `| Skill | Relationship |` header. Note the exact column widths so the new row aligns.

- [ ] **Step 2: Add a row to `skills/capture/SKILL.md` Relationship table**

Append (above the next `## ` heading) a new row in the Relationship to Other Skills table:

```markdown
| `/claude-tweaks:research` | Research findings can be captured as INBOX items; invoke `/research` when an INBOX idea needs evidence before specifying. |
```

- [ ] **Step 3: Add a row to `skills/challenge/SKILL.md` Relationship table**

```markdown
| `/claude-tweaks:research` | Back debiasing lenses with evidence — `/research` produces citation-audited reports that can ground a challenge. |
```

- [ ] **Step 4: Add a row to `skills/specify/SKILL.md` Relationship table**

```markdown
| `/claude-tweaks:research` | Prior-art lookup before authoring a spec — `/research` reports can be cited directly in spec "Background" / "Prior art" sections. |
```

- [ ] **Step 5: Add a row to `skills/browse/SKILL.md` Relationship table**

```markdown
| `/claude-tweaks:research` | Both utility skills (no fixed lifecycle position). `/browse` is interactive browser automation; `/research` is autonomous multi-source web research. |
```

- [ ] **Step 6: Run the cross-references test and verify failures shrink**

```bash
node --test tests/research/cross-refs.test.js
```

Expected: 5 of 6 tests now PASS. The `/help reference card lists /research` test still fails (handled in Task 9).

- [ ] **Step 7: Commit**

```bash
git add skills/capture/SKILL.md skills/challenge/SKILL.md skills/specify/SKILL.md skills/browse/SKILL.md tests/research/cross-refs.test.js
git commit -m "Add bidirectional cross-references to /research from capture, challenge, specify, browse"
```

---

## Task 9: Update `/help` reference card and workflow diagram

**Files:**
- Modify: `skills/help/reference-card.md`
- Modify: `skills/help/context-flow.md`
- Modify: `skills/help/SKILL.md` (if it contains an inline skill list — verify first)

- [ ] **Step 1: Inspect the reference-card structure**

```bash
cat skills/help/reference-card.md | head -80
```

Find the section listing **Utility skills** (alongside `/browse`, `/visual-review`, `/version`, `/help`, `/tidy`, `/flow`, `/ledger`). Note the formatting pattern.

- [ ] **Step 2: Add `/research` to the Utility skills section in `reference-card.md`**

Insert a new bullet (matching the existing format) listing `/claude-tweaks:research` with a one-line description: `Deep web research with citation-audited reports — 4 runtime modes from quick to ultradeep.`

- [ ] **Step 3: Inspect `context-flow.md` for any workflow diagram listing utility skills**

```bash
cat skills/help/context-flow.md | head -100
```

If a diagram or section enumerates the utility skills, add `/research` there in the same style.

- [ ] **Step 4: Check `skills/help/SKILL.md` for an inline skill list**

```bash
grep -n "browse\|visual-review\|tidy" skills/help/SKILL.md
```

If any inline list of skills exists, add `/research` to it.

- [ ] **Step 5: Run cross-references test**

```bash
node --test tests/research/cross-refs.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/help/
git commit -m "List /research in /help reference card and context flow"
```

---

## Task 10: Update README.md and add `.gitignore` entry

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Find the skills list in README.md**

```bash
grep -n "## Skills\|## Commands\|/claude-tweaks:browse\|/claude-tweaks:visual-review" README.md
```

Identify the section that enumerates available skills (likely a table or bulleted list).

- [ ] **Step 2: Add a `/research` entry to the README skills list**

Match the existing style (table row, bullet, etc.). Use this one-liner:

```markdown
| `/claude-tweaks:research` | Deep web research with citation-audited reports — 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Built on [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `skills/research/UPSTREAM.md`. |
```

If README uses bullets instead of a table, adapt accordingly. The key fields: one-line description AND upstream credit AND link to `UPSTREAM.md`.

- [ ] **Step 3: Append `.claude-tweaks/research/` to `.gitignore`**

```bash
echo ".claude-tweaks/research/" >> .gitignore
```

Verify the file is now:

```
.worktrees/
.DS_Store
.claude-tweaks/research/
```

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore
git commit -m "Document /research in README and gitignore generated reports"
```

---

## Task 11: Bump version to 4.7.0

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Read the current plugin.json**

```bash
cat .claude-plugin/plugin.json
```

Confirm current version is `4.6.4`.

- [ ] **Step 2: Update the version field**

Change `"version": "4.6.4"` to `"version": "4.7.0"`. Leave all other fields untouched.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 4.7.0 — /claude-tweaks:research deep web research skill"
```

---

## Task 12: Final verification

**Files:**
- No file changes — verification only.

- [ ] **Step 1: Run all Node tests**

```bash
node --test tests/
```

Expected: all tests PASS, including the new `tests/research/` files and all pre-existing tests (filter-bash-output, lib, statusline).

- [ ] **Step 2: Confirm output-path sweep is clean**

```bash
grep -r "~/Documents\|/Documents/" skills/research/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Python syntax check (if Python is available)**

```bash
command -v python3 >/dev/null && python3 -m py_compile skills/research/scripts/*.py && echo "python OK" || echo "skipped (no python3)"
```

Expected: `python OK` or `skipped (no python3)`.

- [ ] **Step 4: Manual smoke test — flag for user**

The following manual checks are NOT automated; document them in the commit message or PR description as items requiring the user's attention before release:

- Invoke `/claude-tweaks:research quick "test topic"` in a scratch directory with no API keys configured. Verify a markdown report lands in `<cwd>/.claude-tweaks/research/[YYYY-MM-DD]-test-topic/`.
- (If `search-cli` is installed) Invoke the same with `quick` mode and confirm the search engine reports use multiple providers.

- [ ] **Step 5: Final commit confirming review**

```bash
git log --oneline -10
```

Expected: 10 commits roughly:
1. Vendor 199-biotechnologies/claude-deep-research-skill @ f2f2c0f
2. Add UPSTREAM.md and LICENSE-UPSTREAM for skills/research/
3. Patch output paths in vendored research skill to .claude-tweaks/research/
4. Author skills/research/SKILL.md per claude-tweaks conventions
5. Add bidirectional cross-references to /research from capture, challenge, specify, browse
6. List /research in /help reference card and context flow
7. Document /research in README and gitignore generated reports
8. Bump version to 4.7.0 — /claude-tweaks:research deep web research skill

(Plus the earlier design + plan commits already on this branch.)

---

## Spec coverage check (self-review)

| Spec section | Implementing task(s) |
|--------------|----------------------|
| Vendoring strategy | Task 2 |
| File layout | Tasks 2, 3 |
| `SKILL.md` shape | Tasks 5, 6 |
| Patch points | Task 4 |
| Bidirectional cross-references | Tasks 7, 8 |
| `/help` updates | Task 9 |
| `README.md` updates | Task 10 |
| Auto-mode posture (documented) | Task 3 (in UPSTREAM.md) |
| Attribution & licensing | Task 3 |
| Version bump | Task 11 |
| Automated tests | Tasks 5, 7 |
| Manual verification | Task 12 + UPSTREAM.md first-run checklist |
| `.gitignore` for outputs | Task 10 |
| Risks (open questions, deferred items) | None implemented — explicitly deferred per spec |

All spec sections have a corresponding task. Deferred items (global research INDEX, `/wrap-up` and `/tidy` integration) are correctly out of scope per the spec.
