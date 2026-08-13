---
record: 354
origin: harness-health
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: infra
---
# 354: policy.yml has 1 unrecognized key(s) / invalid value(s)

**Check:** policy schema audit | **Category:** drift | **Classification:** additive | **Confidence:** high

## Current State

`.claude-tweaks/policy.yml` line 2 sets `execution-strategy: subagent-only`, which is not a valid value for that key. `bin/lib/policy-schema.js`'s `auditPolicy` reports it as an invalid value against the schema's declared enum.

## Deliverables

**Current:**
```
execution-strategy: subagent-only
```

**Invalid value details:**
- `key`: `execution-strategy`
- `value` (actual, in policy.yml): `subagent-only`
- `expected`: enum, one of `["subagent", "batched"]` (schema default: `subagent`)

**Proposed:** set `execution-strategy` to one of the valid enum values (`subagent` or `batched`) — whichever matches the intended behavior. Run `/claude-tweaks:init --update`, whose Config Home Drift check performs the move behind a shown diff, rather than hand-editing.

## Acceptance Criteria

`node -e "const {auditPolicy}=require('bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd())))"` reports `invalidValues: []`.

_Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._
