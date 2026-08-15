---
record: 459
origin: docs-health
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: docshealth-847ea26a
---
# 459: Doc staleness: decisions/0008-gh-cli-locally-github-mcp-in-cloud-capability-detected — Consequences

**Doc:** decisions/0008-gh-cli-locally-github-mcp-in-cloud-capability-detected | **Section:** Consequences | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` does not exist on disk. `git log --all --diff-filter=D -- docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` shows it was removed by commit d83f072 ("Tidy: remove 69 stale execution-plan files and 2 completed design docs") — a bulk archive prune of the kind ADR-0007 documents. ADR-0007's own Consequences section requires future prunes to include "a cross-reference check ... before deleting," but this ADR-0008 citation was left pointing at the now-removed file. A reader following the citation, or an agent attempting to read the path for context, finds nothing. The sibling citation in the same sentence (`docs/superpowers/specs/2026-08-02-dispatch-tidy-mcp-bridge-design.md`) and the CHANGELOG.md v6.24.0 entry both still exist and remain accurate.

## Deliverables

**Current:**
```
See
`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` and `CHANGELOG.md`'s v6.24.0 entry.
```

**Proposed:**
```
See
`CHANGELOG.md`'s v6.24.0 entry (the plan doc itself was pruned per ADR-0007's periodic archive sweep; git history retains it).
```

## Acceptance Criteria

The Consequences section's citation of `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` must be corrected to note the file was pruned, since that path no longer exists in the repository.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._

<!-- work-fingerprint: docshealth-847ea26a -->
