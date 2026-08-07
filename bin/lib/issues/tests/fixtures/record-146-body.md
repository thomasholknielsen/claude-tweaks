Surface: backend
Parent: #145

## Overview

Add a plugin-side contract seam to `/claude-tweaks:design-wrapper`, mirroring the CLI seam Phase 1 built: resolve the installed Impeccable **plugin**, compare it to a recorded pin, execute `context-signals.mjs`, and consume its signals as an enrichment layer beneath the existing detection layers.

This is the A4 half of Phase 3. It creates the second Impeccable coupling point the drift manifest tracks (the first being the CLI), and it is the foundation Phase 4's B1 and B2 build on.

**Complexity:** Medium
**Estimated tasks:** 6-8

## Non-Goals

- **Do not delete or weaken Layer 3.** The design's first draft did; it was wrong, and the reason is in Acceptance Criterion 1. Layer 3 is the frontend predicate and nothing upstream computes one.
- Native routing behavior (Phase 4 B2). This leaf plumbs `setup.platform` through and records it; acting on `ios`/`android`/`adaptive` is B2's job.
- `doctor` integration (Phase 4 B1), which consumes `setup.hasProduct`/`hasDesign` from this leaf.
- Upgrading the installed plugin. Pin to 4.0.2 — see Current State.

## Current State

- `skills/design-wrapper/impeccable-cli.md` — Phase 1's CLI contract doc. It carries `<!-- upstream-pin: impeccable-cli@3.5.0 -->` and an "Advisory-to-result mapping" derived from executed behavior. **This file is the template for the one this leaf creates**, including the pin-comment convention.
- `tests/impeccable-cli-contract.test.js` — Phase 1's contract probe. Skips when the CLI is absent, **fails** when it is present at a version other than the pin. That asymmetry is deliberate and must be copied: a probe that silently declines to run reads exactly like one that passed.
- `skills/design-wrapper/SKILL.md` — "Universal preconditions" Step 1 holds the three detection layers; Step 2 holds the availability check, which already implements version-vs-pin comparison for the CLI and returns a skip naming both versions.
- `skills/design-wrapper/frontend-detection.md` — Layer 3's rules, its negative-cases table, and the detection-precedence diagram.
- `skills/design-wrapper/modes/live.md`, `modes/review.md` — the two modes whose preconditions this leaf changes.
- Installed Impeccable plugin: **4.0.2**, at `~/.claude/plugins/cache/impeccable/impeccable/4.0.2/`. Upstream latest is 4.0.4. 3.0.6 is also present in the cache — the resolver must handle several installed versions side by side.

## Deliverables

- [ ] `skills/design-wrapper/impeccable-plugin.md` — new contract doc: pin comment, resolution procedure, `context-signals.mjs`'s executed output shape, per-signal trust rules
- [ ] `skills/design-wrapper/SKILL.md` — Layer 0 in Universal preconditions; plugin row in the availability table; target-resolution rule
- [ ] `skills/design-wrapper/frontend-detection.md` — Layer 0 added to the precedence diagram, with Layer 3 explicitly retained
- [ ] `skills/design-wrapper/modes/live.md` — `devServer.running` as a veto-only gate
- [ ] `skills/design-wrapper/modes/review.md` — `critique.latest` consumed when present
- [ ] `tests/impeccable-plugin-contract.test.js` — executed probe, same skip/fail asymmetry as the CLI test

## Acceptance Criteria

1. **Layer 3 survives unchanged as the frontend predicate.** `tests/impeccable-plugin-contract.test.js` carries a **permanent assertion** that `scan.targets` is not equivalent to Layer 3, run against a **frozen fixture** — a committed sample `gatherSignals()` output plus a changed-file list — never against live `git diff` state. A documented note does not satisfy this criterion. Two reasons the fixture must be frozen: a test asserting "this repo currently produces four targets" is a scheduled failure timed to the next commit (`[IL-80]`), and this very leaf's own diff changes that number. The 2026-08-06 observation (four targets here, including `tests/impeccable-cli-contract.test.js`, in a repo with no UI) is the fixture's *source*, not its assertion.
2. `impeccable-plugin.md` carries `<!-- upstream-pin: impeccable-plugin@4.0.2 -->` and documents the full output shape of `gatherSignals()`: `setup{hasProduct,productPath,hasDesign,designPath,hasCode,platform}`, `critique{latest}`, `git{isRepo,branch,base,changedFiles,changedCount}`, `devServer{running,ports}`, `scan{targets,via}`.
3. `impeccable-plugin.md` also carries the **invocation contract**, mirroring `impeccable-cli.md`'s "Invocation" / "Working directory" / "Arguments resolution" sections: the resolved script path (`<plugin-root>/skills/impeccable/scripts/context-signals.mjs` at 4.0.2), the exported `gatherSignals(cwd = process.cwd())`, and the fact that **the CLI entrypoint accepts no flags**. `git.changedFiles` is read live from the working tree via `execFileSync`; there is no way to inject a synthetic changed-file list. AC8 depends on this being written down.
4. Resolution globs `~/.claude/plugins/cache/*/impeccable/*/.claude-plugin/plugin.json`, reads each candidate's own `version`, and selects the one equal to the pin. It must not use `${CLAUDE_PLUGIN_ROOT}` — that is claude-tweaks' own root, and reading it would report this plugin's version under Impeccable's name (`[IL-89]` names the rule; this is the wrong-artifact way to violate it). The resolver takes an **injectable search root**, defaulting to the real cache path — without one, AC10's test can only be written by mutating or hiding the user's actual install.
5. Three distinct conditions all degrade to a skip, and the skip reason distinguishes them:
   - **Absent** — no candidate directory at all.
   - **Version mismatch** — candidates found, none at the pin. The reason names the pin *and every version found*, plural. Both `4.0.2` and `3.0.6` coexist in the cache on this machine, so "what was found" is a list, not a value.
   - **Execution failure** — the pinned script resolves but exits non-zero, writes to stderr, or emits unparseable stdout. Exit 0 / empty stderr / JSON on stdout is an *observation* from one run, not a guarantee; a version-matched script that fails must not propagate an exception into every `/tidy` and `/flow` run.

   Every mode continues to work in all three cases, with Layers 1-3 unchanged. Degradation is never a failure.
6. **Layer 0 gates nothing.** It enriches; it has no veto and no skip power of its own. Say so where the precedence diagram is drawn, or the diagram will imply a gate that does not exist — Layers 1-3 remain the only things that can stop a dispatch.
7. `devServer.running: false` is sufficient to skip `live`. `devServer.running: true` is **not** sufficient to enter it — `live`'s existing human-present requirement stays. State the asymmetry in `modes/live.md` in one sentence, with the reason: the probe is a bare TCP connect against seven common ports and cannot tell whose server answered. Verified 2026-08-06: it reported `running: true, ports: [8080]` on a machine with no dev server for this project.
8. `setup.platform` appears as a **real field in the wrapper's returned JSON**, not only as a row in a contract table — #151 is its consumer and needs a value to read. Update `SKILL.md`'s `## Output contract` accordingly. `null` is documented as the expected common case rather than an error: it requires a literal `Platform` section in `PRODUCT.md` naming exactly `web`/`ios`/`android`/`adaptive`. Verified `null` on this repo despite `PRODUCT.md` being present. **This leaf documents the "null falls back to `Surface:`" rule and surfaces the field; #151 is what acts on it.**
9. `scan.targets` replaces the **fallback** target resolution — the `git diff --name-only` path taken when a caller passed no explicit file list — and only after Layer 3 has ruled the change frontend. It does **not** override an explicit caller-supplied target list, and cannot: per AC3, `scan.targets` is computed from the live working tree with no injection point, so it would silently widen a scoped invocation. Name every mode the substitution covers; if one shared edit in `SKILL.md`'s target-resolution paragraph covers all of them, say that rather than leaving it per-mode ambiguous. A resolved plugin whose `scan.targets` is empty takes the git-diff fallback too — "does not resolve" and "resolved but returned nothing" reach the same place.
10. `tests/impeccable-plugin-contract.test.js` skips when no Impeccable plugin is installed and **fails** when one is installed at a non-pinned version. Exercise the fail branch through AC4's injectable search root pointed at a `tests/fixtures/` cache tree — never by mutating, hiding, or pointing at the developer's real `~/.claude/plugins/cache`. Confirm it goes red by actually running it, not by reading (`[IL-62]`).

## Technical Approach

### Data / API Surface

Executed 2026-08-06 against the installed 4.0.2; cross-checked against source at tag `skill-v4.0.4`, which is identical in shape (the path moves to `plugin/skills/impeccable/scripts/` and `scanTargets` gains a vendored-path exclusion). Exit 0, empty stderr, JSON on stdout.

```
setup:     {hasProduct, productPath, hasDesign, designPath, hasCode, platform}
critique:  {latest: {slug, score, p0, p1, timestamp, file} | null}
git:       {isRepo, branch, base, changedFiles[], changedCount}
devServer: {running, ports[]}
scan:      {targets[], via: 'git-changes'|'source-dir'|'html'|'root'|null}
```

Per-signal trust rules — the table `impeccable-plugin.md` must carry:

| Signal | Consumer | Rule |
|---|---|---|
| `scan.targets` / `scan.via` | target resolution, all modes | Replaces the wrapper's `git diff --name-only` fallback, **after** Layer 3 rules the change frontend |
| `setup.platform` | Phase 4 B2 | Authoritative when non-null; null falls back to `Surface:` |
| `setup.hasProduct` / `hasDesign` | `pre-build`, Phase 4 B1 | Whether Impeccable's own project context exists |
| `critique.latest` | `review` | A cached score with P0/P1 counts, free |
| `devServer.running` / `ports` | `live` | Veto only — `false` skips, `true` does not authorize |

### Key Files

- `skills/design-wrapper/impeccable-plugin.md` (create)
- `skills/design-wrapper/SKILL.md` (modify — Universal preconditions Step 1 and Step 2, Reference sub-files list)
- `skills/design-wrapper/frontend-detection.md` (modify — precedence diagram)
- `skills/design-wrapper/modes/live.md` (modify)
- `skills/design-wrapper/modes/review.md` (modify)
- `tests/impeccable-plugin-contract.test.js` (create)

### Gotchas

- `skills/design-wrapper/SKILL.md` is 23 KB against a 40 KB soft ceiling. The new contract belongs in `impeccable-plugin.md`, referenced from `SKILL.md` in one hop — not inlined (`[IL-72]`).
- The design doc's own A4 section was wrong on this point until it was corrected by execution. If its text and this record's Acceptance Criteria ever disagree, this record governs — but the doc has been rewritten to match, so a disagreement means someone reverted one of them.
- Do not restate `context-signals.mjs`'s output shape in more than one file. `impeccable-plugin.md` owns it; `SKILL.md` and the mode files reference it. Three copies of the CLI contract is what let Phase 1's bug survive two verification passes.
