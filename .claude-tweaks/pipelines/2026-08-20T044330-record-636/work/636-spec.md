---
record: 636
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
fingerprint: wrap-up-580:help-policy-shape-b-default
surface: backend
---
# 636: help policy mode: render a Shape-B derived default (housekeeping-auto-merge) as computed, not the literal false

Surface: backend

## Current State

`skills/help/policy.md:47`'s "Derived-default keys special case" names only `integration-model`
and `merge-verification` — the two Shape A derived-default keys (no static schema default; see
`_shared/policy-schema.md`'s Shape A/Shape B distinction, lines 32-34). Since #580,
`housekeeping-auto-merge` is a **Shape B** derived default: its schema envelope keeps a static
`default: false` (the `supervised` base), while `bin/lib/policy-schema.js`'s `resolvePolicyKeys`
(around line 430) overwrites the resolved `value` via `deriveHousekeepingAutoMerge()` for any entry
that resolves `source: 'default'` — unset, or set-but-invalid — while deliberately leaving `source`
at `'default'` (the derived-vs-explicit attribution field its own consumers read, per
`_shared/policy-schema.md` line 34). `bin/resolve-policy.js`'s `--all` snapshot construction (lines
182-192) always takes the `default` field verbatim from the static `POLICY_KEYS` entry, never the
derived value — so on a `trusted`/`unattended` project with the key unset, the held snapshot entry
looks like `{value: true, source: 'default', default: false, tier: 'core', ...}`. That
`value`-vs-`default` divergence, while `source` stays `'default'`, is the detectable Shape-B signal
— confirmed directly in code, not assumed.

**Verified against the live render contract (this is a correction to the originating issue's stated
symptom — see Gotchas):** the literal claim "`/claude-tweaks:help policy` renders `default: false`
for it even on a trusted/unattended project" does not reproduce for the *unset* case as stated.
Tracing `skills/help/policy.md`'s four render sections against the snapshot shape above:

- **Section 1 main list** ("Set levers") only renders keys with `source ≠ default` — an unset
  `housekeeping-auto-merge` never appears there, regardless of its derived value (this exclusion is
  correct and already documented as expected behavior — `docs/journeys/review-project-policy.md`
  line 31's own red-flag: "an unset `housekeeping-auto-merge` promoted into Set levers... the
  derivation changes the value, never the `source` that decides which section a key belongs to").
- **Section 1's "Zero set keys" fallback** (line 49) is the *only* place that renders a literal
  static `{default}` for an unset core-tier key — but it only fires when **every** lever in the
  snapshot is on `source: default`, including `autonomy` itself. Since `autonomy`'s own schema
  default is `supervised` (`bin/lib/policy-schema.js` line 90), reaching that fallback with
  `housekeeping-auto-merge` unset means `autonomy` is *also* unset/`supervised` — in which case
  `deriveHousekeepingAutoMerge()` returns `false` too, so the fallback's literal `{default}` happens
  to already be correct every time it's reachable. It cannot produce the described bug.
- **Section 3** ("Notable defaults") only fires when one of the three existing external probes
  (forge presence, standing `auto:*` grants, recent pipeline activity) argues for a key — none of
  the three targets `housekeeping-auto-merge` or `autonomy`-driven defaults at all.
- **Section 4** ("Advanced tier") is out of scope — `housekeeping-auto-merge` is `tier: 'core'`
  (`bin/lib/policy-schema.js` line 60), and Section 4 only ever covers advanced-tier keys.

Net effect: on the issue's own described fixture (`autonomy: unattended`, `housekeeping-auto-merge`
unset), the current render contract shows **no row at all** for `housekeeping-auto-merge` — not the
literal `false`. The one case that genuinely *does* render a misleading `default: false` today is
the **explicitly-set** case: a policy.yml line like `housekeeping-auto-merge: true` on a
`trusted`/`unattended` project makes `source: 'policy'`, which *does* land in Section 1's main list,
rendered with `default: false` verbatim (the un-extended literal-default template) — misleading,
because removing that line would not restore `false`, it would restore the *derived* value.

`skills/init/policy-review.md` was checked and does **not** render defaults independently — its
"Show details" branch explicitly reads `skills/help/policy.md` and reproduces that file's Render
contract sections directly ("produce its Render contract's four sections in order... from that
file's own Gather commands"). Fixing `policy.md`'s contract therefore automatically fixes what
`policy-review.md` shows; no separate edit is needed there.

## Deliverables

- [ ] Extend `skills/help/policy.md`'s "Derived-default keys special case" (line 47) to also cover
      `housekeeping-auto-merge` for the **explicitly-set** case (`source: policy`) — render its
      default cell as computed rather than the literal schema `false`, phrased for a Shape B key
      (e.g. `computed (derived from autonomy)`, distinct wording from Shape A's `computed (forge
      detection)`/`computed (derivation ladder)`). Word the rule so it generalizes to any future
      Shape-B key via the schema-metadata signal (a key whose snapshot `value` can diverge from its
      static `default` while `source` stays `default`) rather than adding another literal name to a
      hardcoded list.
- [ ] Add a new finding to `skills/help/policy.md` Section 3 ("Notable defaults") — or an adjacent
      dedicated bullet if Section 3's own "probe signal" framing doesn't fit a snapshot-intrinsic
      check — for the **unset** case: any core-tier key on `source: default` whose snapshot `value`
      differs from its snapshot `default` is itself a finding, independent of the three existing
      external probes (forge presence / standing grants / pipeline activity). This is what actually
      satisfies the acceptance criterion below, since the unset case renders nowhere today. Do not
      promote the key into Section 1 — `docs/journeys/review-project-policy.md` line 31's red-flag
      rule (source, not derived value, decides section membership) must remain true after this
      change.
- [ ] No edit needed in `skills/init/policy-review.md` (confirmed it delegates to `policy.md`'s
      Render contract rather than rendering defaults independently) — note this explicitly in the
      commit/PR rather than silently leaving the file untouched, so a reviewer isn't left wondering.
- [ ] Update `docs/journeys/review-project-policy.md` step 2 (line 30) to describe the corrected
      behavior: `housekeeping-auto-merge`'s derived default, when it diverges from the static
      schema default, now surfaces via the new Section 3 finding — replacing the current "surfaces
      in Notable defaults (if a probe argues for it) or in no row at all" language, which will no
      longer be accurate once the new finding always fires for a genuine divergence.

## Acceptance Criteria

1. On a fixture with `autonomy: unattended` and `housekeeping-auto-merge` unset, `/claude-tweaks:help policy`'s rendered report surfaces a computed/derived value for `housekeeping-auto-merge` (via the new Section 3 finding) — never the literal `false`, and never silent omission.
2. On a fixture where `housekeeping-auto-merge` is explicitly set in `policy.yml` on a `trusted`/`unattended` project, Section 1's row for it renders `default: computed (derived from autonomy)` rather than the literal `false`.
3. `npm test` green — including the help skill's prose-conformance suite(s); a byte-count check on `skills/help/policy.md` after the edit (`wc -c`) confirms the file stays under its skill-authoring ceiling, since this file was already fairly dense before this addition.

## Technical Approach

Read before editing:

- `skills/help/policy.md` — Section 1 (lines 31-49, including the line-47 special case and the
  line-49 zero-set-keys fallback) and Section 3 (lines 62-73) are the two edit sites.
- `skills/_shared/policy-schema.md` lines 7-34 (Canonical read path; Shape A vs Shape B
  definitions — Shape B's own paragraph already forward-references this issue by number) and line
  180 (`housekeeping-auto-merge`'s POLICY_KEYS coverage row).
- `bin/lib/policy-schema.js` — `POLICY_KEYS` entry for `housekeeping-auto-merge` (`tier: 'core'`,
  `default: false`) and `deriveHousekeepingAutoMerge`/`resolvePolicyKeys` (~lines 329-431) for the
  exact derivation and `source` semantics.
- `bin/resolve-policy.js` lines 110-192 for how the `--all` snapshot's `default` field is always the
  static schema value, confirming the detectable signal is legitimate and stable.
- `docs/journeys/review-project-policy.md` lines 17-31 (Step 2's `Should understand`/`Red flags`
  bullets) — both need to stay internally consistent with whatever exact wording the Section 3 fix
  lands on.

This is a prose/skill-markdown change only — no code in `bin/` changes, since the derivation and
snapshot shape are already correct; only the render contract that reads the snapshot needs
extending. Verify the fix by hand-tracing both fixtures in Acceptance Criteria against the edited
prose before running the suite, then run the full `npm test`.

## Gotchas

- **Premise correction (verified against live code and prose, not assumed):** the originating
  issue's literal symptom — "`/claude-tweaks:help policy` renders `default: false` for
  `housekeeping-auto-merge` even on a trusted/unattended project" — does not reproduce for the
  *unset* case it describes. Tracing the render contract's four sections against
  `bin/resolve-policy.js`'s actual `--all` snapshot shape shows the unset case currently renders
  **nothing at all** for that key, not the literal `false` (see Current State above for the
  section-by-section trace). The one case that genuinely does render a misleading `default: false`
  today is the key being **explicitly set** in `policy.yml` on a trusted/unattended project. Both
  Deliverables above are kept — the explicitly-set fix because it's real and matches the issue's
  literal Deliverable 1 text; the unset-case fix (a new Section 3 finding) because it's what the
  issue's own Acceptance Criterion #1 fixture actually requires, and because the "detectable
  signal" language in the original issue (`value` with `source: default` differing from metadata
  `default`) only ever fires for the unset (or set-but-invalid) case in the first place — it can
  never be the signal behind the explicitly-set fix, which is a different, simpler literal-template
  gap.
- `docs/journeys/review-project-policy.md` line 30 already describes today's gap-as-expected
  behavior in some detail ("A derived `true` therefore surfaces in Notable defaults (if a probe
  argues for it) or in no row at all") — this was accurate before this fix and must be edited to
  match whatever the new Section 3 finding actually does, not left stale.
- `skills/help/policy.md` is a dense file close to the skill-authoring line/byte ceiling in this
  repo's convention (per `CLAUDE.md`'s "Hard-ceiling headroom check before adding" convention) —
  check `wc -c` headroom before drafting the new Section 3 finding's prose, and keep both additions
  as tight as the existing special-case rule's own wording.
- The new Section 3 rule must not special-case `housekeeping-auto-merge` by name (the issue is
  explicit: "never a hardcoded key list") — phrase it generically off the schema-metadata shape (a
  core-tier key on `source: default` whose `value` differs from its `default`) so it automatically
  covers any future Shape-B key without another prose edit.
- No `bin/`-level code changes are needed or in scope — the derivation and the `--all` snapshot
  shape were already verified correct in code; this record is scoped to the prose render contract
  only. Resist the temptation to "fix" `bin/resolve-policy.js` or `bin/lib/policy-schema.js` as part
  of this record.

## Original request

help policy mode: render a Shape-B derived default (housekeeping-auto-merge) as computed, not the literal false

Origin: wrap-up Review Console (#580 run 2026-08-16T114842-spec-580), Skills curation row — "Related, not patched here" note in staged/wrap-up-skill-1.md

## Current State

`skills/help/policy.md:47`'s "Derived-default keys special case" names only `integration-model` and `merge-verification` (Shape A — no static default). After #580, `housekeeping-auto-merge` is a Shape-B derived default (`_shared/policy-schema.md`'s Canonical read path paragraph): its metadata `default` stays the literal `false` while its effective unset value derives from `autonomy`. `/claude-tweaks:help policy` therefore renders `default: false` for it even on a `trusted`/`unattended` project where the effective default is `true`. `docs/journeys/review-project-policy.md` step 2 (updated in #580) already tells the reader this is expected today.

## Deliverables

- [ ] Extend the special-case rule in `skills/help/policy.md` so a Shape-B key renders `default: computed (derived from autonomy)` — sourced from `--all`'s snapshot (`value` with `source: default` differing from metadata `default` is the detectable signal), never a hardcoded key list
- [ ] Mirror the rule in `skills/init/policy-review.md` if it renders defaults independently
- [ ] Update `docs/journeys/review-project-policy.md` step 2's expectation accordingly

## Acceptance Criteria

1. On a fixture with `autonomy: unattended` and `housekeeping-auto-merge` unset, the rendered policy report shows the computed default, not `false`
2. `npm test` green (help conformance suites)


<!-- work-fingerprint: wrap-up-580:help-policy-shape-b-default -->

