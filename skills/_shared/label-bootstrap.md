# Label Bootstrap — Shared Check-Then-Create Snippet

The canonical check-then-create loop every label-filing skill in this codebase uses. Referenced
by `triage/SKILL.md` (tier labels, `status:in-progress`, `status:blocked`), `code-health/SKILL.md`,
`harness-health/SKILL.md`, `tidy/SKILL.md` (`parked`/`backlog` bootstrap), and
`wrap-up/cleanup-procedures.md` Section E / `flow/multispec-review-console.md` (the shared
`parked` restoration step). Consumers reference this file; do not restate the loop inline.

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
(`[['status:blocked', '...']]`) rather than reaching for a separate single-label variant.
