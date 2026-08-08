# Label Bootstrap — Shared Check-Then-Create Snippet

The canonical check-then-create loop every label-filing skill in this codebase uses.
Referenced by the work-record consumers (`_shared/work-record.md` is the taxonomy home —
health skills, `/capture`, `/specify`, `/backlog`, `/dispatch`, `/tidy`,
`wrap-up/cleanup-procedures.md` Section E and `flow/multispec-review-console.md` for the
shared `parked` restoration step). Consumers reference this file; do not restate the loop
inline.

Given a `LABELS` array of `[name, description]` pairs:

```bash
node -e "
  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');
  const labels = ${LABELS_JSON};
  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));
" > /tmp/label-bootstrap-payloads.json
node -e "const ls=require('/tmp/label-bootstrap-payloads.json'); ls.forEach(l => console.log(l.name + '\t' + l.description))" | while IFS=$'\t' read -r NAME DESCRIPTION; do
  gh label list --search "$NAME" --json name -q '.[].name' | grep -qx "$NAME" || \
    gh label create "$NAME" --description "$DESCRIPTION"
done
```

`ensureLabelPayload` throws at construction if a description exceeds GitHub's 100-char cap
(`bin/lib/issues/labels.js`) — a too-long description fails loudly here, not as a silent 422 on
`gh label create`. `${LABELS_JSON}` is a literal JS array-of-pairs, substituted inline by each
consumer with its own label list — for a single label, use a one-element array
(`[['bot:blocked', '...']]`) rather than reaching for a separate single-label variant.

## Canonical LABELS_JSON — the full work-record taxonomy

The complete label set from `_shared/work-record.md`'s Label taxonomy table (the core label
families plus the optional `priority:*` family — see that table for the current per-family
and total counts, rather than a count restated here), with descriptions pre-checked against
GitHub's 100-character cap. **Consumers bootstrap only the labels they are about to apply** —
copy the relevant pairs, don't create the full array below speculatively (except `/init`'s
one-time provision-now offer, which uses this list whole):

```js
[
  ["by:code-health",    "Origin: filed by the code-health skill"],
  ["by:harness-health", "Origin: filed by the harness-health skill"],
  ["by:journey-health", "Origin: filed by the journey-health skill"],
  ["by:docs-health",    "Origin: filed by the docs-health skill"],
  ["by:capture",        "Origin: filed via /capture"],
  ["by:dispatch",       "Origin: self-filed by /claude-tweaks:dispatch on a headless Preflight failure"],
  ["risk:low",          "Scoring: low blast radius — safe for autonomous build"],
  ["risk:medium",       "Scoring: moderate blast radius — review before merge recommended"],
  ["risk:high",         "Scoring: high blast radius — human review required"],
  ["size:low",          "Scoring: small, agent-sized change"],
  ["size:medium",       "Scoring: moderate change, may span several files"],
  ["size:high",         "Scoring: large change — consider decomposition before building"],
  ["ceremony:fast-lane", "Ceremony: small/clean record — proportionately fewer review & wrap-up steps"],
  ["ceremony:standard",  "Ceremony: default depth — full review & wrap-up ceremony applies"],
  ["parked",            "Stage: deliberately on hold until its trigger fires (milestone due or watched path change)"],
  ["ready",             "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
  ["auto:build",        "Grant: agents may build this record autonomously (human-granted; machinery only removes)"],
  ["auto:merge",        "Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)"],
  ["bot:in-progress",   "Bot state: an agent currently holds the claim on this record"],
  ["bot:blocked",       "Bot state: retry ceiling reached — needs human re-triage before autonomous retry"],
  ["demo:pending",           "Acceptance: built and verified — awaiting human sign-off via /claude-tweaks:demo"],
  ["demo:approved",          "Acceptance: a human verified this record does what was asked"],
  ["demo:changes-requested", "Acceptance: a human found a gap during sign-off — see the linked follow-up record"],
  ["wontfix",           "Closed as not-planned; health skills will not re-file findings with this fingerprint"],
  ["upstream-candidate", "A headless health-sweep finding about claude-tweaks — forward via /claude-tweaks:feedback"],
  ["family:parent",     "Structure: decomposition parent — carries the family's acceptance gate"],
  ["framing:baked",     "Framing: this record names a solution that was never traded off"],
  ["priority:high",     "Priority: dispatch picks this band first"],
  ["priority:medium",   "Priority: dispatch picks after priority:high"],
  ["priority:low",      "Priority: dispatch picks last among prioritized records"]
]
```
