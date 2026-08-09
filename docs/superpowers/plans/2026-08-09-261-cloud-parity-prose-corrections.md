# Record #261 — Cloud-parity prose corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualify every claim that pasting the Setup script covers scheduled Routines (interactive: confirmed; Routines: measured not reached), record the 2026-08-09 incident durably (IL-117 entry + one compressed Don't), and assert #260's self-heal fallback as the actual guarantee.

**Architecture:** Correction, not deletion — each site keeps its paste instruction and gains the limitation. The canonical corrected sentence is the single wording source; adapt tone per site but keep all three factual clauses: (1) interactive cloud sessions — confirmed effective; (2) scheduled Routine sandboxes — measured not reached, 2026-08-09, reproduced across three fresh containers, scope of affected sandbox types unknown (further incidents are appends, not replacements); (3) the routine preamble's self-heal-to-execution fallback — not the field — guarantees a scheduled firing executes its skill.

**Tech Stack:** Markdown prose only. No tests pin these texts (verified at decomposition and re-verified by #260's consumer sweep).

## Global Constraints

- **Canonical corrected sentence** (adapt per site, keep the three factual clauses): *"The Setup script field is confirmed effective for interactive cloud sessions; it was measured not reaching scheduled Routine sandboxes (2026-08-09, reproduced across three fresh containers, scope of affected sandbox types unknown — treat further incidents as appends, not replacements); the routine preamble's self-heal-to-execution fallback (#260) — not this field — is what guarantees a routine firing executes its skill."*
- Issue references (`#260`, `#259`, `#258`) are fine in this repo's own files (step-14 prose, incident log, CLAUDE.md) but NOT inside step-14's generated CLAUDE.md-section template (it renders into consuming projects where those numbers mean nothing) — there, say "the routine prompt preamble's self-heal fallback" without a number.
- Incident-log entry is written before the Don't is compressed from it (Task 3 before Task 4 — never reordered).
- IL number: **117** (verified free in the tree; re-check against `origin/main` immediately before push at end of run — renumber ours if taken).
- Keep every addition tight — CLAUDE.md is paid for per dispatched agent. The Don't: one rule sentence + one why clause + `[IL-117]`.
- The paste instruction survives at every site — this record deletes nothing.
- Commit messages: `{Verb} {what} — refs #261` (never `closes`/`fixes`).
- AC 1's check is read-the-sections-whole, never keyword-grep (IL-17/IL-93): after editing, read the full Cloud-parity sections in both files plus step-14's Setup-script paragraph and confirm no remaining **unqualified** claim that the Setup script makes Routine sandboxes work.

---

### Task 1: step-14 — Setup-script paragraph + generated template correction

**Files:**
- Modify: `skills/init/bootstrap/step-14-cloud-routine-parity.md` — (a) the `**The declaration is not the installer — the Setup script is.**` paragraph (~line 7); (b) the generated `## Cloud parity` template's intro paragraph (~lines 234-238, inside the fenced markdown block: "…and the Setup script below is what actually installs it.")

**Interfaces:**
- Produces: the adapted corrected sentence at both step-14 sites; Task 2 mirrors the template's compact form into the repo's own CLAUDE.md.

- [ ] **Step 1: Extend the Setup-script paragraph (site a)**

After the paragraph's closing sentence `…which is the same outcome as declaring nothing (\`[IL-113]\`).`, append (one adapted rendering of the canonical sentence — issue refs allowed here):

> That measurement covers interactive cloud sessions, where the field is confirmed effective. Scheduled Routine sandboxes were measured **not** receiving the field's effects (2026-08-09, reproduced across three fresh containers — populated field, zero plugin effects; the scope of affected sandbox types is unknown, so treat further incidents as appends, not replacements). The routine preamble's self-heal-to-execution fallback (#260) — not this field — is what guarantees a scheduled firing executes its skill (`[IL-117]`).

- [ ] **Step 2: Correct the generated template's intro paragraph (site b)**

Inside the fenced `## Cloud parity` template, after `…and the Setup script below is what actually installs it.`, append (compact, no issue numbers):

> The field is confirmed effective for interactive cloud sessions; it was measured not reaching scheduled Routine sandboxes (scope of affected sandbox types unknown) — the routine prompt preamble's self-heal fallback, not this field, is what guarantees a scheduled firing executes its skill.

Rewrap the fenced block's lines to its existing width. Then read the whole rendered template section (intro + all four bullets) and confirm no remaining unqualified Routine-coverage claim (AC 1 discipline — adjust bullet wording only if a bullet itself makes an unqualified Routine claim; do not add the sentence twice).

- [ ] **Step 3: Verify + commit**

Read the full edited paragraph and template section rendered (whole-section read, not grep). Then:

```bash
git add skills/init/bootstrap/step-14-cloud-routine-parity.md
git commit -m "Qualify step-14's Setup-script claims: interactive confirmed, Routines measured not reached — refs #261"
```

### Task 2: This repo's CLAUDE.md — Cloud parity paragraph + bullet

**Files:**
- Modify: `CLAUDE.md` — the `## Cloud parity` intro paragraph (ends "…and the Setup script below is what actually installs it.") and the `**Setup script (required, not optional):**` bullet

**Interfaces:**
- Consumes: Task 1's template wording (the repo's section mirrors the template's compact form, plus repo-specific tags).

- [ ] **Step 1: Extend the intro paragraph**

After `…and the Setup script below is what actually installs it.`, append the same compact correction as Task 1 Step 2's text, with the repo-appropriate refs re-added: replace "the routine prompt preamble's self-heal fallback" with "the routine prompt preamble's self-heal fallback (#260)" and append ` \`[IL-117]\`` at the end.

- [ ] **Step 2: Qualify the Setup-script bullet**

In the bullet, after `Without it, a declared plugin is simply absent.`, insert: `Confirmed for interactive cloud sessions; measured not reaching scheduled Routine sandboxes — see the paragraph above.` (Keeps the bullet short; the paragraph carries the full scope statement.)

- [ ] **Step 3: Verify + commit**

Read the entire `## Cloud parity` section rendered and confirm no remaining unqualified claim (AC 1). Then:

```bash
git add CLAUDE.md
git commit -m "Qualify CLAUDE.md's Cloud parity claims for scheduled Routines — refs #261"
```

### Task 3: Incident-log entry IL-117

**Files:**
- Modify: `docs/incident-log.md` — append a new `## IL-117 — {title}` entry after IL-116

**Interfaces:**
- Produces: the narrative Task 4 compresses into the Don't. Task 4 MUST NOT start before this lands.

- [ ] **Step 1: Write the entry**

Shape: `## IL-117 — {one-line title}` + 3-4 narrative paragraphs + a closing generalizable-rule paragraph, matching neighboring entries' register. Required content:

- The measurement chain: on 2026-08-09, three separate fresh Routine containers (the 07:08 scheduled firing, a 07:57 re-fire, and a 09:46 manual run) all started with the environment's Setup-script field populated and zero plugin effects — `~/.claude/plugins/` absent, every plugin command `Unknown command` — while the same script run in-session from the repo checkout worked; the interactive-session measurement behind `[IL-113]` remains valid.
- The **two-cause structure, explicitly**: (cause 1, delivery) the field's effects were absent from the Routine containers while the field was populated — the root failure, addressed by #259's evidence-leaving canonical line (`$HOME/claude-cloud-setup.log`); (cause 2, invocability) the session's Skill catalog freezes at start, so even a successful mid-run install cannot make the skill invocable through the Skill tool — an independent barrier, addressed by #260's manual-execution fallback (dispatch and tidy excluded). Each cause is independently sufficient to make a firing a no-op; the corrected prose's "guarantee" rests on #260 closing cause 2 regardless of cause 1's state.
- Scope statement: the affected-sandbox-type scope is unknown — further incidents are appends to this entry, not replacements.
- Generalizable closing rule (what the Don't compresses).

- [ ] **Step 2: Commit**

```bash
git add docs/incident-log.md
git commit -m "Record IL-117: the Setup-script field measured not reaching scheduled Routine sandboxes — refs #261"
```

### Task 4: CLAUDE.md Don't (compressed from IL-117)

**Files:**
- Modify: `CLAUDE.md` — append one bullet at the end of the `## Don'ts` list (after the IL-116 rule)

**Interfaces:**
- Consumes: Task 3's landed entry (read it first; compress from it — never write the rule from memory).

- [ ] **Step 1: Append the Don't**

One rule + one why clause + tag, in the list's established shape. Compress from the landed IL-117 entry; target form (adjust only to match the entry's final wording):

> - Don't treat pasting the environment Setup script as covering scheduled Routines — it is confirmed for interactive cloud sessions only and was measured not reaching three fresh Routine containers, and the routine preamble's self-heal-to-execution fallback is what actually guarantees a firing executes its skill `[IL-117]`

- [ ] **Step 2: Verify shape + commit**

Confirm: exactly one sentence-rule with one why-clause and the `[IL-117]` tag; the entry exists above it in `docs/incident-log.md`. Then:

```bash
git add CLAUDE.md
git commit -m "Add the IL-117 Don't: the Setup-script field does not cover scheduled Routines — refs #261"
```
