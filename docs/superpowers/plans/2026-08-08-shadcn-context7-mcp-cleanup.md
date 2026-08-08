# shadcn/context7 MCP Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two dead-weight user-level MCP entries (broken shadcn.io, retired context7) and excise the plugin's one functional context7 citation, leaving all shadcn support intact.

**Architecture:** Three independent surfaces: (1) user-scope MCP config in `~/.claude.json` (CLI removal, no repo change), (2) one prose edit in `/research`'s source registry plus the test regex that pins it, (3) the standard two-repo patch release. Spec: `docs/superpowers/specs/2026-08-08-shadcn-context7-mcp-cleanup-design.md`.

**Tech Stack:** Claude CLI (`claude mcp`), Node built-in test runner (`node --test`), git.

## Global Constraints

- Work happens in the worktree at `.claude/worktrees/shadcn-context7-mcp-cleanup` (branch `worktree-shadcn-context7-mcp-cleanup`). Every task anchors there: run `pwd` and `git rev-parse --show-toplevel` before any commit; both must show the worktree path, not the main checkout.
- This session refuses compound Bash after EnterWorktree: one plain command per call — no `&&` chains, no heredocs. The command blocks below are written one command per step accordingly.
- Before each commit, run `git diff --cached --name-only` and confirm it lists exactly the files the step stages (`[IL-42]`).
- Do NOT touch: `skills/init/bootstrap/step-13-shadcn-bootstrap.md` or any other shadcn content; historical plan/spec/pipeline files mentioning context7; `docs/superpowers/plans/2026-08-07-research-source-registry.md` (historical record, quotes the old regex).
- No version literal is fixed in this plan — the release task derives the next patch number at execution time (versions are claimed at ship, never reserved).

---

### Task 1: Drop context7 from the `/research` deps fallback and tighten its pinned regex

**Files:**
- Modify: `skills/research/source-registry.md:48`
- Modify: `tests/research/skill-md.test.js:281`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: prose naming WebFetch as the deps-fallback mechanism; a test regex with no dead alternation branch. Task 3's release commit ships both.

- [ ] **Step 1: Edit the prose**

In `skills/research/source-registry.md`, replace the single line:

```
needs the installed source, fall back to context7 or the dependency's public documentation and
```

with:

```
needs the installed source, fall back to the dependency's public documentation (via WebFetch) and
```

(The surrounding sentence continues "record the verdict at **medium** confidence…" on the next line — unchanged.)

- [ ] **Step 2: Tighten the test regex**

In `tests/research/skill-md.test.js`, replace:

```js
    /node_modules[\s\S]{0,400}(?:context7|public\s+documentation)/i,
```

with:

```js
    /node_modules[\s\S]{0,400}public\s+documentation/i,
```

The assertion message on the next line stays as-is.

- [ ] **Step 3: Run the research suite — expect green**

Run: `node --test tests/research/`
Expected: all tests pass. (The regex tightening cannot be seen red-first: the prose satisfies both the old and new regex. Discrimination is proven by inversion in the next step instead.)

- [ ] **Step 4: Inversion check (`[IL-105]`) — negate the prose, expect red**

In `skills/research/source-registry.md`, temporarily change `public documentation (via WebFetch)` to `vendor manual (via WebFetch)` on the edited line.

Run: `node --test tests/research/skill-md.test.js`
Expected: FAIL — "the reduced-confidence fallback must sit with the deps denial, not merely appear somewhere".

- [ ] **Step 5: Restore the prose, re-run, expect green**

Revert the temporary change so the line again reads `…fall back to the dependency's public documentation (via WebFetch) and…`.

Run: `node --test tests/research/skill-md.test.js`
Expected: PASS.

- [ ] **Step 6: Verify no other functional context7 reference remains**

Run: `grep -rn "context7" skills/ bin/ tests/ agents/ hooks/`
Expected output: zero hits. (Historical `docs/superpowers/` files and pipeline run dirs are out of audit scope and keep their mentions; they are not under the globs above.)

- [ ] **Step 7: Commit**

```bash
git add skills/research/source-registry.md tests/research/skill-md.test.js
```

```bash
git diff --cached --name-only
```

Expected: exactly those two files.

```bash
git commit -m "Drop context7 from the deps fallback — WebFetch of public docs is the named mechanism now"
```

---

### Task 2: Remove the two global MCP entries

**Files:** none in this repo — user-scope config in `~/.claude.json` only.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `claude mcp list` with no `shadcn` and no `context7` rows. Nothing downstream consumes this; independently verifiable.

- [ ] **Step 1: Remove the broken shadcn entry**

Run: `claude mcp remove shadcn -s user`
Expected: confirmation it was removed. If it reports "not found at user scope", run `claude mcp list` and remove it from the scope that actually holds it — do not guess.

- [ ] **Step 2: Remove the retired context7 entry**

Run: `claude mcp remove context7 -s user`
Expected: confirmation. Same not-found fallback as Step 1. Note: this discards the stored context7 API key; it is re-obtainable from the context7 dashboard if ever needed.

- [ ] **Step 3: Verify**

Run: `claude mcp list`
Expected: no `shadcn` row, no `context7` row; `playwright` and the claude.ai connectors still report Connected.

---

### Task 3: Patch release (both repos)

**Files:**
- Modify: `.claude-plugin/plugin.json` (version bump)
- Modify: `CHANGELOG.md` (entry under `# Changelog`, above the current top entry)
- Modify: `docs/shipped-versions.tsv` (append row)
- Modify: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace/.claude-plugin/marketplace.json` (`plugins[].version` mirror only; `metadata.version` and description unchanged — no catalog change)

**Interfaces:**
- Consumes: Task 1's commit (must already be on this branch).
- Produces: the release on `origin/main` and the marketplace mirror.

- [ ] **Step 1: Full suite centrally**

Run: `npm test > /tmp/release-suite.log 2>&1` then `echo "exit=$?"` (separate calls; read the log tail on failure).
Expected: exit=0. On failure, stop and report — do not bump on red.

- [ ] **Step 2: Version pre-check (all five sources)**

Run each, one call apiece:

```bash
git fetch origin main
```

```bash
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

```bash
git show main:.claude-plugin/plugin.json
```

```bash
git worktree list
```

For each sibling worktree branch found (currently `worktree-wrap-up-residue-sweep`):

```bash
git log --oneline main..worktree-wrap-up-residue-sweep -- .claude-plugin/plugin.json
```

```bash
grep -rn "6\.6[89]\.\|6\.7[0-9]\." docs/superpowers/plans/ --include="*.md" -l
```

Determine the next free patch number above whatever the *highest* of origin/main, local main, and any sibling-branch bump shows (must be ahead of the tip, not merely unclaimed). Call it `$NEXT` below.

- [ ] **Step 3: Bump the manifest**

In `.claude-plugin/plugin.json`, set `"version": "$NEXT"`.

- [ ] **Step 4: Changelog entry**

Insert directly under the `# Changelog` header block, above the current top `## v…` entry:

```markdown
## v$NEXT — the /research deps fallback stops naming context7

context7 is retired from this user's toolchain, and the deps-fallback sentence in
`skills/research/source-registry.md` was its one functional citation in the plugin: it now
names WebFetch of the dependency's public documentation as the mechanism. The pinned test
regex in `tests/research/skill-md.test.js` is tightened in step — its alternation would
otherwise keep passing on a term the prose no longer contains. All shadcn support is
untouched: the dead MCP the cleanup started from was a user-level `shadcn.io` entry,
unrelated to `/init` Step 13's official `npx shadcn@latest mcp` wiring.
```

- [ ] **Step 5: Shipped-versions row**

Append to `docs/shipped-versions.tsv` (tab-separated):

```
$NEXT	2026-08-08	release
```

- [ ] **Step 6: Re-verify the coverage gate**

Run: `node --test tests/changelog-coverage.test.js`
Expected: PASS (manifest, changelog, and tsv agree).

- [ ] **Step 7: Commit the release triple**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
```

```bash
git diff --cached --name-only
```

Expected: exactly those three files.

```bash
git commit -m "Release $NEXT — the /research deps fallback stops naming context7"
```

- [ ] **Step 8: Re-fetch, then push to origin/main**

```bash
git fetch origin main
```

If `git rev-parse origin/main` no longer matches this branch's merge base (another session shipped during Step 1's suite run), redo Step 2's number derivation before pushing — renumber if claimed.

```bash
git push origin HEAD:main
```

Expected: fast-forward `…→ main`. A non-fast-forward rejection means origin moved — fetch, `git merge origin/main`, re-run the pre-check, then push again.

- [ ] **Step 9: Marketplace mirror (same action, not a separate decision — `[IL-59]`)**

In `/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace/.claude-plugin/marketplace.json`, set `plugins[0].version` to `$NEXT`. Leave `metadata.version` (2.33.27) and the description untouched — this is a version mirror, not a catalog change.

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace" add .claude-plugin/marketplace.json
```

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace" diff --cached --name-only
```

Expected: exactly that one file.

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace" commit -m "Mirror claude-tweaks $NEXT"
```

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace" push origin main
```

Expected: pushed. Both pushes together complete the release.
