# Work Record — Config Keys

Canonical home of the work-record system's config keys. The table below is the single source
of truth for every key's name, accepted values, and default; `_shared/work-record.md` — the
record taxonomy's home — keeps a `## Config keys` stub pointing here rather than a second copy.
This file exists as its own lazy-load unit because most citations of that contract need one
key, not the taxonomy around it.

Referenced by every skill in `_shared/work-record.md`'s Consumers table, plus the `_shared/`
fragments those skills inline (`record-queue-fetch.md`, `local-files-preflight-stop.md`,
`health-finding-shapes.md`, `policy-schema.md`, `harness-health-analysis.md`).

Written by `/init` (probe + policy), read by every filing/shaping/dispatching skill **by
these literal names** — per-skill aliases and env-var renames are forbidden:

| Key | Values / default | Meaning |
|---|---|---|
| `work-backend` | `github-issues` \| `local-files` | Which driver stores work records |
| `work-types` | `native` \| `labels` | How Type is expressed (native Issue Types vs `type:*` labels) |
| `work-links` | `native` \| `body-text` | How parent/dependency links are expressed (sub-issue + blocked-by APIs vs `Blocked by #N` body lines) |
| `dispatch-retry-ceiling` | `3` | Failed autonomous attempts before `auto:*` removal + `bot:blocked` |
| `automerge-max-lines` | `40` | Auto-merge blast-radius guideline: implementation diff lines `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode weighs, not a hard cutoff |
| `automerge-max-files` | `2` | Auto-merge blast-radius guideline: implementation files touched, same weighted-not-cutoff treatment |
| `dispatch-pick-max-concurrent` | `3` | Max concurrent groups a bare `/dispatch` multi-pick may run |
| `merge-sensitive-paths` | `[]` | Path globs `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode treats as a hard `needs-human` floor, regardless of diff size or content judgment. Empty by default — project-agnostic, each project populates its own list. |
| `backlog-fetch-limit` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer (`/help`, `/tidy`, `/backlog`) — `gh` auto-paginates internally regardless of size; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |
| `record-staleness-weeks` | `4` | Staleness threshold (in weeks) `_shared/record-queue-fetch.md`'s Threshold resolution section reads for `/help`'s backlog-stale sub-count and `/tidy`'s Shape 1/Shape 2 backlog/parked staleness classification — converted to ms and passed to `bin/lib/issues/record-buckets.js`'s `classifyStaleness` |
| `promise-register-min-leaves` | `4` | Minimum leaf count in one `/specify` decomposition before a `## Cross-Spec Promises` section is seeded on the parent record |

**No aliases.** Every key above has exactly one name. A key read under two names drifts into
being half-supported — the state where most consumers silently fall back to a default while a
few honor the alias, which reads as a configuration bug rather than an error (`[IL-85]`).

See `_shared/work-record.md` for the taxonomy these keys govern — the lifecycle spine, the
axes, the label contract, the permission matrix, and the Consumers table naming every skill
that reads this file. `_shared/policy-schema.md` indexes every *other* project-config lever
claude-tweaks skills read; where its defaults overlap with the table above, this file wins —
it is the work-record contract's own table, and the most-cited source for these keys.
