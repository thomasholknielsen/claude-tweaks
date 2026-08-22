# Artifact-overwrite completion check (#786)

`journeys/SKILL.md` and `stories/SKILL.md` namespace their generated filenames by spec id
(`docs/journeys/{journey-name}-{N}.md`, `{OUTPUT_DIR}/{site-name}-{persona-or-area}-{N}.yaml`)
when running inside a multi-spec shared worktree — see each skill's own "Multi-spec shared
worktree" note. This check verifies the *outcome* directly from git history rather than trusting
that every present-and-future write path in the shared worktree actually implements the
namespacing rule:

Before the Consolidated Review Console renders, run (once, over the whole run's commit range):

```bash
git -C "$WORKTREE" log --name-status --diff-filter=AM "{EXPECTED_BASE}..HEAD" -- docs/journeys/ stories/
```

`{EXPECTED_BASE}` is the same value `worktree-setup.md`'s Step 0 captured when the shared
worktree was created (the commit before spec 1's materialize commit) — the run's own commit
range, never the whole repo history. Walk the output: if any path under `docs/journeys/` or
`stories/` shows status `A` (added) in one commit and status `M` (modified) in a **later** commit
within this same range, a spec's journey/story artifact was silently overwritten by a later
spec's write — the exact failure #786 exists to catch. HARD-GATE: stop before rendering the
console and report the offending path plus both commits' spec ids (each commit's own `refs #{N}`
trailer names its spec). A clean run — every touched path shows exactly one `A` and no `M` in
this range — passes with no output and the console renders normally.

This is independent of whether the namespacing rule was actually followed by the write that
produced each commit: it verifies "no overwrite happened," not "namespacing was applied," so a
future skill that reintroduces an unnamespaced write path is still caught here even if its own
prose omits the naming rule.
