'use strict';

// Pins the mechanical-vs-prose authoring guidance (#316) for a `Blocked by #N:
// {assumption}` line: record-creation.md's Linking pass must state the
// distinction with one example of each category, and red-team.md's Skeptical
// Reviewer lens question must apply the same check during Step 5 red-team.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RECORD_CREATION = path.join(__dirname, '..', 'plugin', 'skills', 'specify', 'record-creation.md');
const RED_TEAM = path.join(__dirname, '..', 'plugin', 'skills', 'specify', 'red-team.md');

test('record-creation.md states the mechanical-vs-prose assumption distinction', () => {
  const text = fs.readFileSync(RECORD_CREATION, 'utf8');
  assert.match(text, /Mechanical vs\. prose-shape assumptions/, 'must name the distinction explicitly');
  assert.match(text, /structural fact/, 'must require a structural-fact assertion');
  assert.match(text, /Safe \(mechanical\):/, 'must include a safe/mechanical example');
  assert.match(text, /Unsafe \(prose-shape\):/, 'must include an unsafe/prose-shape example');
});

test('red-team.md extends the Skeptical Reviewer lens to check Blocked-by assumption shape', () => {
  const text = fs.readFileSync(RED_TEAM, 'utf8');
  assert.match(text, /Blocked by #N: \{assumption\}` line/, 'lens question must reference the Blocked-by extended form');
  assert.match(text, /prose\/documentation shape/, 'must check for prose/documentation shape');
  assert.match(text, /structural fact/, 'must contrast against a structural fact');
});
