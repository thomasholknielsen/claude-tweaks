'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = path.join(__dirname, '..', 'plugin', 'skills', 'design-wrapper', 'compare-shell', 'template.html');

function readTemplate() {
  return fs.readFileSync(TEMPLATE, 'utf8');
}

test('AC1 (#1207): the tweak panel declares hue/spacing-scale/corner-radius levers with data-token attributes', () => {
  const text = readTemplate();
  for (const token of ['hue', 'spacing-scale', 'corner-radius']) {
    assert.match(text, new RegExp(`data-token="${token}"`), `expected a lever with data-token="${token}"`);
  }
});

test('AC1 (#1207): the tweak panel lives inside #focus, so it renders only in the focus view', () => {
  const text = readTemplate();
  const focusMatch = text.match(/<div id="focus">([\s\S]*?)<\/div>\s*<div id="verdict-error"/);
  assert.ok(focusMatch, 'expected #focus to be the element immediately before #verdict-error');
  assert.match(focusMatch[1], /<div id="tweaks">/);
});

test('AC1 (#1207): tweak handlers attach only inside the MODE === \'live\' branch, alongside attachVerdictHandlers', () => {
  const text = readTemplate();
  assert.ok(
    text.includes("attachVerdictHandlers();\n    connectStream();\n    attachTweakHandlers();"),
    "expected attachTweakHandlers() wired directly after attachVerdictHandlers()/connectStream() inside the MODE === 'live' branch",
  );
});

test('AC1 (#1207): durable mode disables every tweak lever, matching the existing verdict-bar disable pattern', () => {
  const text = readTemplate();
  assert.ok(
    text.includes("steerInput.disabled = true;\n    tweakInputs.forEach(function (input) { input.disabled = true; });"),
    'expected the durable-mode branch to disable every tweak lever right after steerInput, matching the existing verdict-bar disable pattern',
  );
});

test('AC2 (#1207): a tweak lever applies a --tweak-{token} CSS custom property and posts a tweak event, without a full reroll', () => {
  const text = readTemplate();
  assert.match(text, /function applyTweak\(token, value\) \{/);
  assert.match(text, /document\.documentElement\.style\.setProperty\('--tweak-' \+ token, value\)/);
  assert.match(text, /applyTweak\(token, value\);\s*\n\s*postEvent\(serializeEvent\('tweak', \{ token: token, value: value \}\)\)/);
});
