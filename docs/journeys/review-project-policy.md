---
files:
  - skills/help/policy.md
  - skills/help/SKILL.md
  - bin/resolve-policy.js
  - bin/lib/policy-schema.js
  - skills/init/policy-review.md
---

# Review a Project's Policy Configuration

**Persona:** Project owner who wants to know how the project is configured and what to change — without hand-reading `.claude-tweaks/policy.yml` line by line or re-deriving `POLICY_KEYS`' schema defaults from memory.
**Goal:** See every set lever, every config issue, and up to three evidence-backed recommended edits in one pass, then apply the ones that fit — with a safety net that reverts any edit that breaks the audit.
**Entry point:** A terminal at a project checkout root, talking to the agent — `/claude-tweaks:help policy`.
**Success state:** The four render-contract sections rendered from one held snapshot, zero or more approved edits written to `.claude-tweaks/policy.yml`, and a clean re-audit confirming no new issue was introduced (or a named revert if one was).

## Steps

### 1. Ask for the policy review — `/claude-tweaks:help policy`
- **URL:** `/claude-tweaks:help policy`
- **Action:** Invoke `/claude-tweaks:help` with the `policy` argument.
- **Should feel:** A dedicated mode, not the usual dashboard — no command-reference cheat sheet, no workflow status scan.
- **Should understand:** `policy` mode skips `SKILL.md`'s own Section 1 (cheat sheet) and Section 2 (status scan) entirely — `skills/help/policy.md` owns the whole run from Gather through its own `## Next Actions`, which replaces `SKILL.md`'s default Next Actions block.
- **Red flags:** The dashboard's workflow status or command reference rendering alongside the policy sections; a second Gather call re-running `resolve-policy.js --all` mid-mode instead of reusing the one held snapshot.

### 2. Read the four sections — chat
- **URL:** no command — the agent's rendered response
- **Action:** Read Set levers (grouped by category, each row `` `{key}` — {value} ({source}) · default: {default} — {summary} ``), Issues (each non-empty list, or the literal `Policy config issues: none` line), Notable defaults (core-tier keys still on default where a project signal argues otherwise, or one of the two zero-finding lines), and Advanced tier (one collapsed `{N} advanced levers on defaults` line).
- **Should feel:** Complete in one read — every set lever's value, source, and meaning, without a second lookup.
- **Should understand:** All four sections render from the single `--all` snapshot taken at Gather time; a `null` default renders as `default: no default`, not literal `null`, except the two derived-default keys' own special case — `integration-model` renders `computed (forge detection)`, `merge-verification` renders `computed (derivation ladder)`.
- **Red flags:** A section silently skipped instead of rendering its own zero-finding line; a hand-typed default value instead of one read from the snapshot.

### 3. Expand the advanced tier — chat
- **URL:** no command — say "show advanced" in chat
- **Action:** Ask to see the advanced-tier levers still on default.
- **Should feel:** A free follow-up, not a new decision — no confirmation, no new question.
- **Should understand:** This expands in-conversation from the same held snapshot; it never triggers a new `AskUserQuestion` — the mode has exactly one, reserved for the apply step below.
- **Red flags:** A second `AskUserQuestion` call firing here.

### 4. Answer the one apply question — `AskUserQuestion`
- **URL:** no page — the mode's single `AskUserQuestion` call (`multiSelect: true`)
- **Action:** Review up to three recommended edits (ranked core-tier-severity first) plus a "No changes" option, and check the ones to approve.
- **Should feel:** Concrete, not abstract — each option's description names the exact `key: value` line that would be written, and for an enum key, every legal value read live from `POLICY_KEYS`.
- **Should understand:** Checking "No changes" wins outright over any other checked option in the same batch — nothing is written. Recommendations beyond the cap of 3 are never dropped; they stay visible in section 3's list, tagged for a later ask.
- **Red flags:** An option whose enum values look hardcoded rather than schema-sourced; more than one `AskUserQuestion` call across the whole mode.

### 5. Apply and confirm the re-audit — `.claude-tweaks/policy.yml`
- **URL:** no command — the agent writes `.claude-tweaks/policy.yml` directly
- **Action:** Wait for the agent to validate each approved key (`resolveValue`), write its line, then re-run `auditPolicy()` once against the whole batch.
- **Should feel:** Safe to approve multiple edits at once — a batch that introduces a new issue gets caught and named, not silently left broken.
- **Should understand:** A rejected value is reported and its line is never written; a new issue found by the single post-apply re-audit reverts that key specifically — deleting the line if it didn't exist before this apply, restoring the prior Gather-snapshot value if it did — and no edit is confirmed to the user until that re-audit comes back clean. In a main checkout under `worktree.always: true`, this whole step never runs: the #537 pre-check catches it before the `AskUserQuestion` in Step 4 is even offered, and the agent instead renders each recommendation as a paste-ready `printf` command for the user to run themselves, outside the session.
- **Red flags:** A confirmed edit whose re-audit was skipped; a main-checkout write attempted instead of falling back to paste-ready commands.

Reviewing configuration this way is read-only-safe up through Step 3 — `/claude-tweaks:init`'s own Update Mode Policy Configuration Review offers the same rendered content (via `skills/help/policy.md`'s Render contract, one renderer, two entrances) as a read-only second entrance, pointing back at `/claude-tweaks:help policy` for the actual edits — `/init` never writes `.claude-tweaks/policy.yml` itself through this path.
