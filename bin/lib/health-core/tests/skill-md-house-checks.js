'use strict';

// Shared, parameterized SKILL.md house-structure checks -- factored out
// because docs-health/tests/skill-md.test.js and code-health/tests/
// skill-md.test.js duplicated the majority of these assertion bodies
// verbatim (the "has the required house sections in order" ordering test,
// "carries the standard interaction-style directive", the
// "$PIPELINE_RUN_DIR" check, the "no emojis" check, and the required-token
// forEach loop), with nothing enforcing that the copies stay in sync when
// CLAUDE.md's own documented SKILL.md house-structure convention changes.
//
// Only docs-health/tests/skill-md.test.js has been migrated to this helper
// so far (2026-07-20 review-findings fix, Task 5) -- code-health/tests/
// skill-md.test.js predates it and still carries its own copy (out of that
// task's scope; fixed independently in Task 4 for its own idx() bug).
// harness-health/tests/skill-md.test.js and journey-health/tests/
// skill-md.test.js also still carry their own unmigrated copies (and their
// own version of the same idx() bug this module's sectionIndex fixes,
// unflagged as a separate finding). Migrating those three is follow-up, not
// done here -- this task's scope is docs-health's file only.

// Anchored heading lookup: matches a heading only when it occupies its own
// full line, not a bare substring anywhere in the file. SKILL.md's
// boilerplate "> **Interaction style:**" directive and Component-Skill
// Contract prose both mention headings like "## Next Actions" inline as
// backticked references; a plain body.indexOf() resolves to the first of
// those mentions instead of the real section heading further down.
function sectionIndex(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = body.match(new RegExp(`^${escaped}$`, 'm'));
  return m ? m.index : -1;
}

// Registers the standard "has the required house sections in order" test:
// When to Use / Anti-Patterns / Component-Skill Contract / Next Actions, each
// present and in the documented order (Next Actions -> Component-Skill
// Contract -> Anti-Patterns). Relationship to Other Skills was removed from
// every skill in v6.34.0; its edges live in docs/skill-graph.md.
function registerHouseSectionOrderTest(test, assert, read) {
  test('has the required house sections in order', () => {
    const body = read();
    const idx = (s) => sectionIndex(body, s);
    assert.ok(idx('## When to Use') > 0);
    assert.ok(idx('## Anti-Patterns') > 0);
    assert.ok(idx('## Component-Skill Contract') > 0);
    assert.ok(idx('## Next Actions') > 0);
    assert.ok(idx('## Next Actions') < idx('## Component-Skill Contract'));
    assert.ok(idx('## Component-Skill Contract') < idx('## Anti-Patterns'));
  });
}

function registerInteractionStyleTest(test, assert, read) {
  test('carries the standard interaction-style directive', () => {
    assert.ok(read().includes('> **Interaction style:**'));
  });
}

function registerPipelineRunDirTest(test, assert, read) {
  test('Component-Skill Contract is keyed on $PIPELINE_RUN_DIR', () => {
    assert.ok(read().includes('$PIPELINE_RUN_DIR'));
  });
}

function registerNoEmojiTest(test, assert, read) {
  test('no emojis (common emoji unicode sequences)', () => {
    const content = read();
    // Match common emoji ranges: U+1F300-U+1FAFF (Misc Symbols, Emoticons,
    // etc.) using the surrogate pair regex that matches in JS UTF-16 strings.
    const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
    assert.ok(!emojiRe.test(content), 'SKILL.md must not contain emojis');
  });
}

function registerRequiredTokenTests(test, assert, read, tokens) {
  tokens.forEach((token) => {
    test(`contains required token '${token}'`, () => {
      const content = read();
      assert.ok(content.includes(token), `missing required token: ${token}`);
    });
  });
}

module.exports = {
  sectionIndex,
  registerHouseSectionOrderTest,
  registerInteractionStyleTest,
  registerPipelineRunDirTest,
  registerNoEmojiTest,
  registerRequiredTokenTests,
};
