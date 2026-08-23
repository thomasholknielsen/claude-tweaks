# Open Items — compare-shell: tweak levers for token-level adjustment without a full reroll

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/skill | `tests/compare-shell-tweak-lever.test.js` extends `skill-prose-conformance-tests`' byte-pin pattern (normally scoped to `plugin/skills/**/*.md` prose) to `template.html`'s browser JS — same repo, same "markdown/code is the shipped payload" reasoning, no DOM harness to run it in instead. Worth folding into that skill's Reference list as a non-markdown instance if a future pass touches it. | observation | — |
| 2 | review/error-handling | `seed-compare.mjs`'s `manifest.tweaks` entry-shape validation (`validateManifest`) crashed with a raw `TypeError` instead of `SeedError` on a `null`/non-object entry — lens 3c finding, confirmed via direct-verification override. | fixed | Guarded the loop check with `typeof tweak !== 'object' \|\| tweak === null` before the field-shape checks; added a regression test for a `null` entry. Commit `9010be65`. |
