'use strict';

// Three faceted records — the same shape record-queue-fetch.md's fetch already
// produces (raw gh fields + labels + body, spread with a parsed .facets object).
// Deliberately covers: all three stage buckets; origin set vs. unset (human);
// bot in-progress vs. blocked vs. neither; risk/size set vs. unset; both
// grants vs. none; acceptance set vs. unset; type via label fallback vs. unset;
// and one Blocked-by edge (#20 -> #10, both open).
const FIXTURE_RECORDS = [
  {
    number: 10,
    title: 'Backlog record with no scoring',
    labels: [],
    issueType: null,
    body: '',
    facets: {
      origin: null, risk: null, size: null, ceremony: null, priority: null,
      stage: 'backlog',
      grants: { build: false, merge: false },
      bot: { inProgress: false, blocked: false, parked: false },
      acceptance: null,
    },
  },
  {
    number: 20,
    title: 'Ready record blocked by #10',
    labels: [
      { name: 'by:code-health' }, { name: 'risk:low' }, { name: 'size:medium' },
      { name: 'ready' }, { name: 'bot:in-progress' },
    ],
    issueType: null,
    body: 'Blocked by #10\n\nSome body text.',
    facets: {
      origin: 'code-health', risk: 'low', size: 'medium', ceremony: null, priority: null,
      stage: 'ready',
      grants: { build: false, merge: false },
      bot: { inProgress: true, blocked: false, parked: false },
      acceptance: null,
    },
  },
  {
    number: 30,
    title: 'Parked record with grants',
    labels: [
      { name: 'parked' }, { name: 'auto:build' }, { name: 'auto:merge' },
      { name: 'bot:blocked' }, { name: 'demo:pending' }, { name: 'type:bug' },
    ],
    issueType: null,
    body: '',
    facets: {
      origin: null, risk: null, size: null, ceremony: null, priority: null,
      stage: 'parked',
      grants: { build: true, merge: true },
      bot: { inProgress: false, blocked: true, parked: false },
      acceptance: 'pending',
    },
  },
];

module.exports = { FIXTURE_RECORDS };
