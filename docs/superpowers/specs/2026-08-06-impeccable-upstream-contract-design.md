# Impeccable upstream contract — delegate or verify

Date: 2026-08-06
Status: approved design, not yet planned

## Problem

`/claude-tweaks:test`'s Impeccable design gate cannot fail. On the installed CLI it returns
`pass` when a file is clean and `skipped` when it finds something; the `fail` branch — the
entire point of the gate — is unreachable.

That is the sharpest instance of a general defect. An audit of every claude-tweaks file
referencing Impeccable found that **every** integration defect sits in a place where
claude-tweaks restated upstream behavior in its own prose. The one place that genuinely
delegated (`skills/design-wrapper/modes/live.md:27` — "this wrapper does not reimplement any
of live mode's mechanics; it only gates whether the mode is reachable") absorbed a
~7,000-line upstream rewrite, seven new framework adapters and a changed boot-JSON shape with
zero maintenance and zero drift.

## Thesis

For every point of contact with an upstream dependency, exactly one of two states —
never a third.

| State | Meaning |
|---|---|
| **Delegate** | Name the upstream procedure, hand off, restate nothing. |
| **Verify** | Hold a machine-checkable assertion against the **pinned installed artifact**, proven by **execution** wherever the contract is a runtime shape. |
| ~~Restate~~ | Paraphrase upstream behavior in prose with no assertion behind it. Forbidden. |

Two refinements the audit forced:

**A "verified against" stamp is a restatement wearing a timestamp.** `impeccable-cli.md:3`
reads *"Last verified against Impeccable CLI 3.2.1 (2026-07-20)"*. It was written in good
faith and survived two deliberate re-verification passes. It failed because nothing ever
compared it to what was installed. Same root cause as `[IL-89]`.

**Source diffing is not verification when the contract is a runtime shape.** The
gate-can-never-fail bug is absent from the 4.0.x source (which is correct), absent from every
changelog, and invisible to any two-tag diff. It exists only in the behavior of the binary on
the machine, and only surfaces when stdout and stderr are separated — merged terminal output
hides it, which is exactly how it survived being "verified directly against live output."

Applying this rule deletes more than it adds. Parts A and B are net-negative in lines; new
surface area is concentrated in Part C.

## Evidence

Measured 2026-08-06. Upstream refs are tags in `pbakaus/impeccable`.

### Installed versions

| Artifact | Installed | Doc claims | Latest upstream |
|---|---|---|---|
| Impeccable plugin | 4.0.2 | — | 4.0.4 |
| Impeccable CLI (`npx impeccable`) | **2.1.8** | 3.2.1 | 3.5.0 |

The plugin and the CLI are independent version lines. Conflating them is how a document
came to be written against CLI 3.2.1 on a machine running 2.1.8.

### Executed behavior of the installed CLI 2.1.8

| Case | Exit | stdout | stderr |
|---|---|---|---|
| Anti-pattern found | 2 | **0 bytes** | JSON array (455 bytes) |
| Clean file | 0 | `[]` (3 bytes) | 0 bytes |

- Findings carry **no `severity` field** at 2.1.8.
- `--fast` help reads *"Regex-only mode (skip jsdom, faster but misses linked stylesheets)"*
  and *"--fast Forces regex for all files"* — not the no-op `impeccable-cli.md:18` claims.

Consequence: `impeccable-cli.md:52` documents JSON on stdout, and parsing rule 6 expects a
non-empty array there on exit 2. Stdout is empty, so rule 7 fires and the wrapper returns
`{skipped: "Impeccable CLI returned malformed output"}`. Skips are explicitly not failures.

### Source behavior at CLI 3.5.0 (`cli/engine/cli/main.mjs`, tag `skill-v4.0.4`)

- Line 424: `if (jsonMode) process.stdout.write(formatFindings(allFindings, true) + '\n')`
  — the stream split is an upstream bug already fixed. claude-tweaks' documented *shape* is
  correct for 3.5.0.
- Line 432: `process.exit(primary.length > 0 ? 2 : 0)`
- Lines 434-435: `if (jsonMode) process.stdout.write('[]\n'); process.exit(0)`
- Source comment above line 421, verbatim:
  > The exit code and failure count reflect non-advisory findings only. An advisory-only scan
  > still prints its notes but exits 0 (a clean pass), so advisory rules never break CI or
  > block automation.

So at 3.x, **exit 0 with a non-empty array on stdout is a normal advisory-only result**.
`impeccable-cli.md:96` (rule 5) says *"Exit code 0 → treat as zero findings, regardless of
stdout content"*, which discards it — while line 140 of the same file promises *"advisory
findings appear in the findings list but never promote the result."* The two contradict each
other and rule 5 wins, making the advisory row of the severity table unreachable. `[IL-65]`.

### Rule registry drift (`cli/engine/registry/antipatterns.mjs`)

| Tag | Total rules | Advisory |
|---|---|---|
| `skill-v4.0.2` | 59 | 13 |
| `skill-v4.0.4` | 59 | 12 |

- Removed in 4.0.4: `single-font` (retired per CLI 3.5.0 notes), `repeated-section-kickers`
- Added in 4.0.4: `kicker-above-heading`, `radial-spotlight-glow`
- `impeccable-cli.md:75` lists **10** advisory ids — wrong at 4.0.2 (13) and at 4.0.4 (12).
  Undocumented even at the installed version: `blinking-cursor`,
  `shape-assembled-illustration`, `em-dash-overuse`. The doc's `numbered-section-markers` is
  not a real id; the registry calls it `numbered-section-labels`.

### Command surface

`skill/scripts/command-metadata.json` at 4.0.4 has **23** commands, and the installed
`plugin.json`'s own description says 23. `skills/design-wrapper/SKILL.md:203` (Reference
sub-files) says "all 24 Impeccable commands" (`[IL-40]`), and `command-map.md`'s own table
has 24 rows.

`craft`'s upstream description is now: *"Deprecated compatibility alias for an ordinary
Impeccable new-work request. It adds no behavior."* — `command-map.md:40` (its Full command
map row) and `:147` ("Why this categorization exists") still present it as usable.

Line numbers in this section were re-measured 2026-08-06 after Phase 1 shipped; Phase 1's own
edits to both files shifted every one of them (`[IL-86]`). Cite the section name alongside
the number when acting on these.

### Unused upstream capability

New at 4.0.x, absent from every claude-tweaks reference: `context-signals.mjs`, `doctor.mjs` +
`reference/doctor.md`, `new-work.md`, `routing.md`, `operate.md`, `craft-floor.md`,
`live-setup.md`, and a native track (`ios.md`, `android.md`, `adapt.native.md`,
`audit.native.md`). `skill/agents/` holds four subagent definitions at 4.0.4; the installed
4.0.2 exposes three (`impeccable-documenter` arrives with the upgrade).

`reference/routing.md`, verbatim:
> **`live` and the bundled `detect.mjs` are web-only.** If `setup.platform` is `ios`,
> `android`, or `adaptive`, don't lead with either; the browser overlay and the HTML rule
> engine don't apply to native app code.

`design-wrapper/SKILL.md:97` accepts `Surface: web|mobile|desktop` and proceeds identically
for all three, so a native record runs an HTML rule engine over native code. The likely
outcome is zero findings — a false pass.

### Executed behavior of `context-signals.mjs` (added 2026-08-06, during Phase 3 planning)

Run against this repo — a markdown-and-Node plugin with no UI whatsoever — from the installed
4.0.2 at `~/.claude/plugins/cache/impeccable/impeccable/4.0.2/skills/impeccable/scripts/`.
Exit 0, empty stderr, JSON on stdout. Its full output shape:

```
setup:     {hasProduct, productPath, hasDesign, designPath, hasCode, platform}
critique:  {latest: {slug, score, p0, p1, timestamp, file} | null}
git:       {isRepo, branch, base, changedFiles[], changedCount}
devServer: {running, ports[]}
scan:      {targets[], via: 'git-changes'|'source-dir'|'html'|'root'|null}
```

Confirmed identical at tag `skill-v4.0.4` (path moved to `plugin/skills/impeccable/scripts/`;
`scanTargets` gains a vendored-path exclusion). Three results contradict this document's
first draft of A4 and B2, and each is the reason the corresponding section below was rewritten:

1. **No field distinguishes frontend from backend.** The nearest analogue, `scan.targets`,
   filters changed files through a `SCANNABLE_EXT` set that includes bare `.js` and `.ts` —
   exactly the extensions `frontend-detection.md`'s negative-cases table excludes on purpose.
   On this repo it returned four targets, including `tests/impeccable-cli-contract.test.js`.
   A wrapper that took `scan.targets` as its frontend predicate would dispatch design
   commands at a Node test file in a repo with no UI.
2. **`setup.platform` was `null`** despite `PRODUCT.md` being present and found.
   `extractPlatform` (`context.mjs:943`) reads a literal `Platform` section and accepts only
   `web` / `ios` / `android` / `adaptive`; everything else, including absence, returns null.
   Null is therefore the common case, not the exception.
3. **`devServer.running` was `true`, on port 8080, with no dev server for this project.**
   Upstream says so itself in `scanTargets`' docblock: *"a probed dev-server port may not
   even belong to this project."* The probe is a bare TCP connect against seven common ports.

The plugin is also the CLI's situation one layer up: **installed 4.0.2, audited 4.0.4.**
Phases 3 and 4 consume plugin-side contracts, so they need a plugin-side pin and an
availability check that compares it — the same seam Phase 1 built for the CLI. Phase 2's
manifest already provides for two Impeccable entries; this is the second one.

## Phase 1 — the CLI contract seam (SHIPPED 2026-08-06)

Delivered by `docs/superpowers/plans/2026-08-06-impeccable-cli-contract.md`. Do not
decompose this section; it is kept as the record of what was built and why.

One correction the build forced, recorded here because the rest of the design was written
against the wrong assumption: the gate must classify on the `advisory` boolean the CLI
stamps on each finding, **not** on `severity`. The two are near-inverted — a finding can
carry `severity: "warning"` with `advisory: true` (upstream exits 0, non-blocking) or
`severity: "advisory"` with no flag (upstream exits 2, blocking). Any later phase reasoning
about finding severity must use the flag.

### A1 · CLI: upgrade, pin, verify by execution

Upgrade the global CLI 2.1.8 → 3.5.0. Rewrite `impeccable-cli.md` against **executed**
behavior, not source.

**Drop `--fast`.** Its 3.x semantics are unverified and its 2.1.8 semantics actively degrade
the scan. If it is a no-op, removal costs nothing; if it is not, removal fixes a silent
degradation of exactly the kind CLI 3.5.0 shipped a fix for. Passing a flag whose semantics
cannot be stated is the weaker position either way.

**Commit an executed fixture pair** — one file carrying a known anti-pattern, one clean —
with recorded exit code, carrying stream, and field set. This is the artifact Part C replays.
Recording it converts the contract from prose into something checkable.

### A2 · Parse contract as assertions

**Stop reading the exit code as a findings signal.** Parse stdout unconditionally: `[]` is
clean, non-empty is findings, severity decides pass/fail. Exit code only separates ran from
crashed (1 is a usage error at `main.mjs:236/250/261`). This deletes the rule 5 / line 140
contradiction rather than patching it, and leaves one source that cannot desync.

**Keep the severity→result table, delete the rule list.** Which severity blocks the pipeline
is claude-tweaks policy. Which rule ids carry which severity is upstream data, and restating
it is what drifted 10 → 13 → 12 with a wrong id along the way.

**Flip the unknown-severity default.** `impeccable-cli.md`'s rule 4 currently sends unknown →
`warning` → fail. Under a pin, an unknown severity value is not a finding about the project's
code, it is proof the pin was violated: treat it as advisory for the run and let Part C raise
it as a contract breach.

**The kicker gate needs no wrapper logic.** `kicker-above-heading` and `radial-spotlight-glow`
become live warnings that can fail the gate — the gate working for the first time. The escape
hatch is upstream's own `.impeccable/config.json` `detector.ignoreRules`, plus `--no-advisory`
and scope filters. Delegating the escape hatch instead of building a parallel one is the
thesis applied.

## Phase 3 — dispatch and detection

Depends on Phase 2: both items below add a new upstream coupling point, and each must be
registered in the drift auditor's manifest as it is created rather than retrofitted.

### A3 · Dispatch: assert the job only where you own the signal

Deleted from `command-map.md`: the auto-fit table, the issue-driven keyword table, and the
`craft` row. Separately, `design-wrapper/SKILL.md:203`'s "all 24 Impeccable commands" literal
is replaced by a by-reference description per `[IL-40]` — upstream says 23 and the local
table has 24 rows, so the literal is both stale and unnecessary.

Kept: intent-driven mapping (`Design-intent:` is creative direction — an orthogonal axis
upstream does not own) and the survey "would help" criteria (claude-tweaks' own heuristics,
not a restatement).

Generalized: issue-driven dispatch reads `suggestion` from **every** audit finding.
`command-map.md:91` (the "Anti-Pattern dispatch — suggestion-driven, not fixed" section)
already does this for anti-pattern findings and explains why; the four fixed rows re-derive
by keyword what upstream already computed. Note that section's manual-only filter — a
`suggestion` naming a manual-only command is staged, not dispatched — is the part that must
survive generalization, not be dropped with the keyword table.

**Blast radius, measured 2026-08-06.** "Auto-fit" and "issue-driven" are not local names —
they are claude-tweaks' own published vocabulary for how the polish phase works, and A3
retires both. Every file below states the retiring behavior in its own words, so none is
reachable by editing `command-map.md` alone, and a keyword grep run *after* the rename finds
nothing wrong with any of them (`[IL-93]`):

| File | What it asserts |
|---|---|
| `design-wrapper/SKILL.md` (Input table; availability table; `polish` mode section; Reference sub-files) | Names all three categories and the `polish`/`clarify`/`harden` triple twice |
| `design-wrapper/modes/polish.md` | Step 1/2/3 structure is the three categories; carries a worked example that counts them |
| `design-wrapper/modes/review.md` | Writes the audit cache the issue-driven step consumes |
| `flow/SKILL.md`, `flow/steps-and-gates.md`, `flow/polish-execution.md` | Restate the triple and the category split in the pipeline's own voice |
| `_shared/auto-mode-contract.md` | Its polish-phase row explains the auto-decision rationale per category |
| `ledger/SKILL.md` | `fixed` vs `observation` status keys off "auto-fit successes" |
| `README.md`, `docs/skill-graph.md`, `docs/getting-started.md`, `docs/plugin-structure.md` | User-facing descriptions of the polish phase |

The A4 correction above shrinks this considerably by comparison: because L3 survives, the
seven files citing the Layer 3 sniff (`init/bootstrap/step-11`, `step-13`, `init/SKILL.md`,
`specify/design-pre-steps.md`, `specify/SKILL.md`, `flow/SKILL.md`, `frontend-detection.md`)
need no sweep at all. Deleting L3 as first drafted would have put all of them in scope too.

**Deliberate limit on job-type inference.** The tempting move is to classify every record as
blank-slate / new-page / addition / redesign / refinement. That would invent a new
restatement while removing the old ones. claude-tweaks asserts job type **only where its own
pipeline is the authority**: the polish phase is definitionally a scoped refinement, because
it runs after review passes on already-built code. Asserting that is honest, and it is what
retires the unconditional `polish`+`clarify`+`harden` restyling sweep — the sweep upstream's
addition-inherits-its-surroundings rule now exists to prevent. For `shape` and `pre-build`,
hand over the record description and let `new-work.md` classify.

### A4 · Detection

**Corrected 2026-08-06 by execution.** The first draft of this section deleted L3 and named
`context-signals.mjs` its replacement. The script has no frontend predicate to replace it
with — see Evidence finding 1. Deleting L3 on that basis would have removed the wrapper's
only guard against dispatching design commands at backend code, and the replacement would
have reported this very repo as frontend. L3 stays. What changes is that claude-tweaks stops
resolving *targets* itself once L3 has answered the one question upstream doesn't answer.

| Layer | Fate |
|---|---|
| L0 — `context-signals.mjs` | **New.** Enrichment, gathered first, consumed by the layers below and by Phase 4. Never decides frontend-ness. |
| L1 — CLAUDE.md `design-integration` kill-switch | Stays. claude-tweaks policy; upstream cannot know it. |
| L2 — `Surface:` / `Design-intent:` | Stays as detection, and additionally feeds job description. `Design-intent:` was never a detection input and is untouched. |
| L3 — file-extension sniff | **Stays.** It is the frontend predicate, and nothing upstream computes one. |

What each signal is actually good for:

| Signal | Consumer | Rule |
|---|---|---|
| `scan.targets` / `scan.via` | Target resolution, all modes | Replaces the wrapper's own `git diff --name-only` fallback — **after** L3 has ruled the diff frontend. This is the real delegation win: upstream already picks the files its own detector wants. |
| `setup.platform` | B2 native routing | Authoritative **when non-null**; null falls back to `Surface:` (Evidence finding 2). |
| `setup.hasProduct` / `hasDesign` | `pre-build`, and B1's `doctor` | Whether Impeccable's own project context exists at all. |
| `critique.latest` | `review` mode | A cached score with P0/P1 counts, free. |
| `devServer.running` / `ports` | `live` mode | **Necessary, not sufficient** (Evidence finding 3). `running: false` is a reliable skip; `running: true` does not establish that the port is this project's, so `live`'s human-present requirement stays. |

The asymmetry in that last row is the shape of the whole section: a signal can be trusted to
veto and not to authorize. Reading `running: true` as an authorization is how "delegate,
don't restate" turns into "delegate, don't check."

Resolution: glob `~/.claude/plugins/cache/*/impeccable/*/`, read each candidate's
`.claude-plugin/plugin.json`, and select the directory whose `version` equals the pin.
That resolves the path and enforces the pin in one step, mirroring Phase 1's CLI check, and
per `[IL-89]` it reads the artifact rather than install metadata. No match — plugin absent, or
present at an unpinned version — degrades to a clean skip naming both versions, and L3
continues to work exactly as it does today. The path, the pin and the output shape all
register in Phase 2's manifest. Consuming a new upstream contract on trust would manufacture
tomorrow's drift while fixing today's.

## Phase 4 — capability integration

Depends on Phase 3 for B2 specifically: native routing is driven by `setup.platform`, which
Phase 3's A4 introduces. B1, B3 and B4 have no Phase 3 dependency.

### B1 · `doctor` into the hygiene path

Home is `/claude-tweaks:tidy`, not `harness-health`: `doctor` reports drift in *Impeccable's
project artifacts* (PRODUCT.md, DESIGN.md, `.impeccable/*.json`), which is project state,
while harness-health owns claude-tweaks' own harness docs.

A thin `doctor` mode on design-wrapper delegates wholesale; `/tidy` calls it as one scan step.
It **stages** rather than repairs — `doctor` can auto-fix schema drift, but that edits project
files, so findings land in `/tidy`'s batch table under the existing apply-all/override
pattern. Auto-repairing on upstream's judgment would violate the auto-mode contract's staging
model.

### B2 · Native track routing

`setup.platform` is authoritative **when non-null**. Null is the common case, not the
exception — it requires a literal `Platform` section in `PRODUCT.md` naming exactly `web`,
`ios`, `android` or `adaptive`, and this repo's own `PRODUCT.md` yields null (Evidence
finding 2). So `Surface:` is not a hint that a present authority overrides; it is the
fallback that carries almost every real record.

| `setup.platform` | `Surface:` | Path |
|---|---|---|
| `web` | any | Current path — CLI detect, live, critique/audit |
| `ios` / `android` / `adaptive` | any | Native path — no CLI detect, no live; dispatch names the platform and lets upstream route to `adapt.native` / `audit.native` / `ios` / `android` |
| `null` | `web` / `desktop` / missing | Current path (`desktop` maps to no upstream platform value; treat as `web`) |
| `null` | `mobile` | Native path, platform unnamed — dispatch says "mobile" and lets upstream ask. `Surface: mobile` is the one existing value that already asserts native, and today it silently takes the web path. |

That last row is the false pass the Evidence section identifies, and it is reachable **today
without any Impeccable context file at all** — which is precisely why `setup.platform` cannot
be the sole gate. A design whose only native trigger is a signal that is usually null closes
the reported hole in the case that already had the answer, and leaves it open everywhere else.

`test` mode on a native surface returns
`{skipped: "native surface — CLI detector is web-only"}` instead of a false pass.

### B3 · Seed key and the five-block contract

Impeccable writes a ≤150-word contract into the built artifact's opening comment — thesis,
own world, story, first viewport, form with seed key. claude-tweaks reads it and never
restates its format:

- The seed key lifts onto the work record as `Design-seed:` body-metadata, beside `Surface:`
  and `Design-intent:` — reproducibility for a system now deliberately non-deterministic by
  dice.
- The five blocks feed `/claude-tweaks:demo`'s verification brief.

`/demo` is the human acceptance gate and today has nothing design-specific to check against.
The five-block contract is upstream's own statement of intent, authored **before** the build —
what an acceptance gate needs, and what a reviewer cannot reconstruct afterward.

Division of labor with B4: `impeccable-finish-reviewer` audits the render against the contract
(machine); `/demo` surfaces the contract to the human. Neither duplicates the other.

Parsing a code comment is a contract surface, so it registers in Part C's manifest.

### B4 · Subagents, and a convention change

`/review`'s design pass dispatches `impeccable:impeccable-finish-reviewer` when a five-block
contract exists, rather than a generic critique call.

`_shared/subagent-output-contract.md` mandates a four-value status line and Templates A/B/C;
Impeccable's agents return "an ordered list of material fixes." **Resolution per the thesis:
do not restate their contract.** That file governs agents claude-tweaks *authors*; a
third-party agent is a delegation, and the wrapper adapts at the boundary rather than
demanding conformance. This needs an explicit exemption paragraph, since the file currently
reads as universal.

## Phase 2 — the local drift auditor

**Phase 2: Specified** — decomposed into parent #140 with leaves #141 (manifest + deterministic
checks), #142 (capability-triage skill), #143 (runner, triggers, issue filing). Build order
#141 → #142 → #143.

Sections below are numbered by execution order, not file order — Phase 2 appears last in
this document because it was designed as Part C. Phase 2 ships before Phases 3 and 4 so
each new coupling point those add is registered in the manifest as it is created.

**Not shipped.** Maintainer-only tooling living in this repo.

| Piece | Location | Rationale |
|---|---|---|
| Skill | `.claude/skills/upstream-drift/SKILL.md` | Project-local skills load only when working in this repo, never for plugin consumers. `.gitignore` scopes to `.claude/worktrees/` and `.claude/settings.local.json`, so this path is committable (`[IL-06]`). |
| Module | `tools/upstream-drift/` | Not `bin/` — that is shipped payload. Precedent is `evals/`. Its test glob must be added to `package.json` (`[IL-84]`). |

Dependency direction is one-way: the local tool may import `bin/lib/health-core/` for cache,
fingerprint, dedup and issue filing; shipped code never imports from `tools/`.

`harness-health` audits `.claude/skills/*.md`, so this skill will be audited by claude-tweaks'
own sweep.

### Manifest

`tools/upstream-drift/manifest.yml`, per dependency:

| Field | Purpose |
|---|---|
| `installed-probe` | How to resolve the installed version **from the artifact itself** — never install metadata or `gitCommitSha` (`[IL-89]`) |
| `pinned` | The verified-against version |
| `upstream` | Repo and how to enumerate releases/tags |
| `contract-paths` | Upstream files constituting the contract, for capability diffing |
| `assertions` | Literals claude-tweaks cites that must still resolve |
| `fixtures` | Executed invocations with recorded exit code, carrying stream, and field shape |

Impeccable needs **two entries** — plugin and CLI are independent version lines.

### Triggers — version-driven, no rotation cursor

| Condition | Finding |
|---|---|
| `installed ≠ pinned` | Contract breach, highest severity — the 2.1.8 case, catchable in one line |
| `latest ≠ installed` | Upgrade available; diff `contract-paths` across tags → capability report |
| Assertion fails to resolve | Drift |
| Fixture replay mismatch | Runtime contract breach — the only check that would have caught the stream split |

The deterministic half runs version compare, assertion resolution and fixture replay. The LLM
half triages new and changed upstream files into opportunity findings — that half is what
found `context-signals.mjs`, `doctor` and the native track, none of which any assertion could
have caught, because there was nothing to assert against.

Findings file as `by:upstream-drift` GitHub issues, matching the four existing sweeps.

Initial coverage: Impeccable plugin, Impeccable CLI, superpowers. The manifest is the
extension point.

## Phasing

1. **A1 + A2** — CLI upgrade and parse fix. The gate is broken today; the only part with live urgency.
2. **Part C core** — manifest, version compare, fixture replay.
3. **A3 + A4** — dispatch rework and context-signals.
4. **Part B** — doctor, native routing, seed key/demo, subagents.

**Why C comes second rather than last:** phases 3 and 4 each *add* upstream coupling —
`context-signals.mjs`'s path and output shape, the five-block comment format, the native
reference set, three agent interfaces. Building the auditor before the coupling means each new
contract is registered as it is created. Retrofitting it afterward is how the current
situation arose.

## Open items to resolve during planning

Settled by execution while planning Phase 1, against a sandboxed `impeccable@3.5.0`:

- **CLI 3.5.0's executed contract.** A warning finding exits 2 with the JSON array on
  **stdout** and an empty stderr; a clean scan exits 0 with `[]` on stdout. The stream split
  is a 2.1.8 defect, already fixed upstream.
- **A finding carries a `category` field** (e.g. `"slop"`) that `impeccable-cli.md`'s schema
  table does not document. Harmless under the existing unknown-field rule, and a better
  dispatch key than keyword-matching `description`.
- **`--fast` at 3.5.0 is deprecated and ignored**, and writes
  `Note: --fast is deprecated and ignored. The full scan is fast now and runs every rule.` to
  stderr on every call. So `impeccable-cli.md:18`'s no-op claim is correct for 3.x — the
  design's recommendation to drop it stands, now for the stronger reason that keeping it
  injects noise into a parsed stream.

Still open, to settle before the phase that depends on each:

- **An advisory-only fixture.** Four attempts failed to provoke one at 3.5.0 (short and long
  em-dash-saturated HTML, a CSS blink keyframe, an em-dash-saturated `.tsx`), including one
  satisfying `em-dash-overuse`'s documented "8+ em-dashes at ~1 per 500 characters of body
  text." The advisory-only exit-0 path therefore rests on upstream source, not on a replayable
  fixture. Phase 1 Task 6 owns this; the parse is written so that being wrong about it is safe.
- Whether `kicker-above-heading` and `radial-spotlight-glow` are `warning`. Derived from their
  absence in the 4.0.4 advisory partition, not read directly.
- superpowers' contract surface. Not audited; only Impeccable was.

Settled by execution while planning Phase 3:

- **`context-signals.mjs`'s exact output JSON** — recorded in Evidence, executed at the
  installed 4.0.2 and cross-checked against 4.0.4 source. It carries no frontend predicate,
  which is what forced the A4 and B2 rewrites above.
- **Resolving the Impeccable plugin root across installs** — glob the plugin cache and select
  by the `version` field in each candidate's own `.claude-plugin/plugin.json`. See A4.

- **The plugin pin is 4.0.2 — the installed version — and no phase here needs 4.0.4.**
  Phase 1's answer to the same question was upgrade-then-verify, so this one was checked
  rather than assumed. Every upstream artifact Phases 3 and 4 consume is present at the
  installed 4.0.2: `context-signals.mjs`, `reference/routing.md`, `new-work.md`, `doctor.md`,
  `operate.md`, `craft-floor.md`, the native set (`ios.md`, `android.md`, `adapt.native.md`,
  `audit.native.md`), and `agents/impeccable-finish-reviewer.md`. The single 4.0.4-only
  addition is a fourth subagent, `impeccable-documenter`, which nothing in this design uses.
  Pin to what was executed; Phase 2's `latest ≠ installed` trigger is the mechanism that
  surfaces 4.0.4 as an upgrade with a capability diff, which is exactly the job it was
  designed for. Upgrading first would re-open every 4.0.x reading here against a fresh
  artifact to buy a subagent no phase calls.

## Non-goals

- Auditing superpowers' integration surface in this pass. Part C's manifest makes it possible;
  doing it is separate work.
- Reconciling `/claude-tweaks:visualize` with Impeccable's `visualize` reference. Same word,
  unrelated jobs (project diagrams vs. direction comps); no conflict found.
- Bulk pruning of `docs/superpowers/` artifacts (ADR-0007, `[IL-36]`).

## Version

Claimed at ship time with the full pre-check — `git fetch origin`, sibling worktree branches,
and a grep of unexecuted plans for version literals. Not reserved here.
