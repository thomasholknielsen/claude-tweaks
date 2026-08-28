# Tidy — Digest Sweep

The digest sweep's procedures, extracted into their own lazy-load unit so `SKILL.md` keeps only a
short trigger paragraph pointing here (`SKILL.md`'s 40,960-byte ceiling has ~3.6KB of headroom —
this sweep's prose does not fit inline).

The dispatcher reads this file **whole** and inlines it into the relevant agent's prompt when this
sweep is in scope (an unscoped run, or `--scope=backlog`/`--scope=github` per the driver the
digest container lives on); subagents cannot read sibling files, so everything the sweep needs is
here or in the `_shared/` fragments this file names for the dispatcher to inline alongside it.

---

## Digest sweep (Step 5.6)

No-ops silently when no open `digest`-labeled issue exists (`work-backend: github-issues`) or
`specs/digest.md` doesn't exist (`work-backend: local-files`) — nothing has routed yet (#1262 has
not landed, or no below-floor finding has fired since it did). Three procedures run in order
against whatever container exists, per `_shared/materiality-floor.md`'s Container section:

### Bootstrap-race repair

When more than one open `digest`-labeled issue exists (a creation race in
`_shared/materiality-floor.md`'s lazy bootstrap), merge the newer issue's comments into the older
(in creation order) and close the newer with a comment pointing at the surviving issue. Runs
before promotion/expiry below, since both need a single container to operate against. No analogous
race exists on `work-backend: local-files` (single-writer backend) — skip this procedure there.

### Cluster promotion

Read every un-promoted entry line (no trailing `→ {id}` marker) across the container's comments
(`github-issues`) or body (`local-files`), per `_shared/materiality-floor.md`'s entry format. Group
by `{area}` (the entry format's first field). When **3 or more** un-promoted entry lines share the
same `{area}`, propose one spec-shaped issue absorbing them — each entry becomes one Deliverables
bullet, the cluster's shared `{area}` becomes the proposal's title subject. Present the proposal
per this project's standard staged-item flow (`{run-dir}/staged/digest-promotion-{n}.md`).

On approval: file the proposed record, then append `→ #{n}` to each promoted entry **line** in the
container — markers and counting are strictly per-line, never per-comment, since one comment can
hold many entries from one run.

Individual entries — including solitary ones that never cluster — remain manually promotable or
re-filable at any time; the ≥3 threshold gates only this sweep's own automatic *proposals*, never a
human's ability to act on a single entry directly.

A re-encountered finding never produces a second line to begin with (`_shared/materiality-floor.md`'s
Dedup fold, applied by every adopter at routing time) — this count therefore never double-counts one
real-world finding toward the ≥3 threshold.

### Expiry

Un-promoted entry lines older than 90 days (parsed from each entry's `{provenance}` — a run-id's
ISO timestamp, or the comment/edit timestamp when provenance names a skill instead of a run) roll
into one closing summary comment naming every expired entry; those lines then move out of the
active set. On `github-issues`, the summary comment is the durable record (the entries themselves
stay in the closed comment's history — nothing is deleted). On `local-files`, the entry lines
physically move to an `## Archived {YYYY-MM-DD}` section at the bottom of `specs/digest.md`.

When the digest issue reaches 100 comments (`github-issues` only — a file has no analogous limit),
close it with a summary comment, then bootstrap a fresh digest issue: the `digest` label and the
pinned-issue role move to the new issue (unpin the old, pin the new), and the closed issue's
comment history remains the archive for everything it held.
