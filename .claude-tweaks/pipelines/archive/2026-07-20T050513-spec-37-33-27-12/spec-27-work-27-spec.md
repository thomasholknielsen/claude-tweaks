---
record: 27
origin: capture
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: backend
---
# 27: Dead specs/INBOX path in claude-tweaks-statusline.js

Surface: backend

## Current State

`bin/claude-tweaks-statusline.js:117`'s `findActiveSpec(cwd)` function builds a two-entry candidate list:

```js
function findActiveSpec(cwd) {
  const candidates = [path.join(cwd, 'specs', 'INBOX'), path.join(cwd, 'specs')];
  for (const dir of candidates) {
    try {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => {
          const fullPath = path.join(dir, e.name);
          const stat = fs.statSync(fullPath);
          return { name: e.name, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      if (entries.length > 0) {
        const match = entries[0].name.match(/^(\d{3,})/);
        if (match) return `spec: ${match[1]}`;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}
```

The `specs/INBOX` candidate is left over from the pre-unified-work-record model. That directory does not exist in any current claude-tweaks-managed project — backlog now lives on GitHub issues (`work-backend: github-issues`) or `specs/{id}-{slug}.md` files (`work-backend: local-files`), never `specs/INBOX/`. Every call to `readdirSync` against it throws `ENOENT`, which the surrounding `try/catch` silently swallows — the candidate is a permanent no-op probe, never a hit. The second candidate (`specs/`, matching `local-files`-driver record filenames with a 3+ digit numeric prefix) remains live and correct — this record's scope is the `INBOX` entry only.

## Deliverables

- [ ] Remove the `path.join(cwd, 'specs', 'INBOX')` entry from the `candidates` array, leaving only `path.join(cwd, 'specs')`.

## Acceptance Criteria

1. `bin/claude-tweaks-statusline.js`'s `candidates` array in `findActiveSpec` contains exactly one entry: `path.join(cwd, 'specs')`.
2. `grep -n "INBOX" bin/claude-tweaks-statusline.js` returns zero matches.
3. `findActiveSpec`'s behavior for the surviving `specs` candidate is unchanged — existing/new tests in `tests/statusline.test.js` covering `findActiveSpec` (add one if none currently exercise it directly) pass: a `specs/` directory containing a `NNN-slug.md` file (3+ digit prefix) still returns `spec: NNN`; an empty or missing `specs/` directory still returns `null`.
4. `node --test tests/statusline.test.js` passes.

## Technical Approach

Single-line array-literal edit; no other logic in `findActiveSpec` changes. The loop structure, the regex match, and the `specs/` fallback candidate stay exactly as they are today.

### Key Files

- `bin/claude-tweaks-statusline.js` — `findActiveSpec`'s `candidates` array (line 117): drop the `specs/INBOX` entry

## Gotchas

- Don't also "fix" the `specs/` candidate's regex (`/^(\d{3,})/`) even though it wouldn't match this repo's own current 2-digit-prefixed legacy spec files (e.g. `13-work-record-shared-contracts.md`) — that's a separate, unrelated concern from removing the confirmed-dead `INBOX` path, and this record's scope is explicitly the dead-path removal only.
- If `tests/statusline.test.js` has no existing case for `findActiveSpec`, add a minimal one rather than skipping verification — the function currently has zero direct test coverage.

## Original request

Dead specs/INBOX path in claude-tweaks-statusline.js

**Related:** none

Context: bin/claude-tweaks-statusline.js:97 references a specs/INBOX path left over from the pre-unified-work-record model; backlog now lives on GitHub issues (or specs/{id}-{slug}.md), not specs/INBOX.

Scope: Remove the dead path/logic.
