'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const createAndUpdate = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', 'routine', 'create-and-update.md'),
  'utf8'
);

test('create-and-update.md #68: Step 6 body template sets notifications unconditionally', () => {
  // Sibling of cron_expression, top-level, not nested under job_config.
  assert.ok(
    /"cron_expression":[^\n]*\n\s*"notifications":\s*\{"email":\s*true,\s*"push":\s*false\}/.test(
      createAndUpdate
    ),
    'notifications field must sit directly below cron_expression, before job_config'
  );
});

test('create-and-update.md #1301: notifications body is flat (no channel wrapper, no slack key) — confirmed live', () => {
  assert.ok(
    !/"channel":\s*\{"email"/.test(createAndUpdate),
    'a channel-wrapped notifications body does not match the tool\'s accepted shape (confirmed live, #1301)'
  );
  assert.ok(
    !/"slack":\s*(true|false)/.test(createAndUpdate),
    'the tool\'s notifications shape has no slack key (confirmed live, #1301)'
  );
});

test('create-and-update.md #68: at least two references to notifications (AC5)', () => {
  const matches = createAndUpdate.match(/notifications/g) || [];
  assert.ok(matches.length >= 2, `expected >= 2 matches, got ${matches.length}`);
});

test('create-and-update.md #68: doc sentence next to Step 6 body explains the field', () => {
  assert.ok(
    /`notifications` is set unconditionally on every routine this skill creates/.test(createAndUpdate)
  );
});

test('create-and-update.md #68: Step 7 preview states an email fires on every firing', () => {
  assert.ok(
    /Render one further line stating the routine will send an email notification on every firing/.test(
      createAndUpdate
    )
  );
});

test('create-and-update.md #68/#1301: Step 8 guided-creation path issues a follow-up RemoteTrigger update pairing notifications with name', () => {
  assert.ok(
    createAndUpdate.includes(
      'RemoteTrigger {action: "update", trigger_id, body: {"name": PREFIXED_NAME, "notifications": {"email": true, "push": false}}}'
    )
  );
  assert.ok(/immediately after receiving `trigger_id` back/.test(createAndUpdate));
});

test('create-and-update.md #1301: doc explains a notifications-only update body is rejected, confirmed live', () => {
  assert.ok(
    /notifications-only follow-up call \*\*always fails\*\*/.test(createAndUpdate),
    'the notifications-only-update-rejected finding (#1301) must be documented'
  );
});
