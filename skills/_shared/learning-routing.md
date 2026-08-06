# Learning Routing — the destination contract

Canonical home for the decision "where does this learning go?". Read by
`/claude-tweaks:reflect` (all three modes), `/claude-tweaks:wrap-up` (Steps 6, 7,
7.10, 7.11), `/claude-tweaks:review` (lens 3a), `/claude-tweaks:build`
(Common Step 4.5), and the four health-sweep skills. Consumers cite this file;
they do not restate its tables.

## Destinations

Routing resolves on an **audience x durability** axis.

| | Destination | Audience | Context cost | Writer |
|---|---|---|---|---|
| **D1** | `CLAUDE.md` Don'ts / `.claude/rules/` | this project | highest — every dispatched agent | `wrap-up` Step 6.1 |
| **D2** | Project skill / doc / ADR / journey | this project | medium — lazy-loaded | `wrap-up` Steps 6.2, 7, 7.7, 7.8 |
| **D3** | Backlog work record | this project, deferred | none until claimed | `_shared/work-record.md` |
| **D4** | Memory file | this user, **all** projects | high — every session | this file, "Memory write procedure (D4)" |
| **D5** | Upstream issue to `claude-tweaks` | everyone using the plugin | none locally | `/claude-tweaks:feedback` |

## The classifier

An ordered decision procedure. **First match wins and routing stops.**

1. **Names a `/claude-tweaks:*` skill, a `skills/_shared/*` contract, or a
   `bin/*.js` behavior, and would hold in any project using the plugin**
   → **D5 defect report**
2. **About the user** — a preference, a working style, how they want decisions
   made or work presented → **D4 memory** (`type: user` or `feedback`)
3. **An environment or tooling fact with no owning artifact** in this project or
   the plugin — shell behavior, a harness quirk, a third-party tool's contract
   → **D4 memory** (`type: reference`)
4. **A rule about this codebase that must always be loaded** → **D1**
5. **Procedure knowledge for a bounded domain** → **D2**
6. **Work to do, not knowledge to keep** → **D3**
7. **Generic craft knowledge that rules 4-6 found no home for, and that no
   claude-tweaks artifact currently covers** → **D5 gap report**
8. Otherwise → do not capture, with a stated reason.

**Rules 2 and 3 are the whole of memory.** Everything else has an owner, and the
classifier's job is to find it.

**Rule 7 is what makes rule 2 affordable.** Without it, a strict memory rule
leaves useful craft knowledge homeless and the pressure to widen rule 2 returns
immediately. A lesson whose natural owner is a dependency outside D5's scope
(for example `superpowers:writing-plans`) is caught by rule 4 in a project that
already carries that convention, and by rule 7 everywhere else — surfacing as
"claude-tweaks should carry guidance on X".

A rule-7 gap report always asks claude-tweaks to carry guidance of its own. It
never asks claude-tweaks to fix a dependency, and it never forwards a complaint
about one. Filing against the dependency's own repository is a separate act,
forbidden below.

**Ordering is load-bearing.** D5 is evaluated before D4. When memory is the only
cross-project store available, every transferable lesson defaults into it; that
is the failure this ordering exists to prevent.

**One lesson, one destination.** A lesson that genuinely serves two audiences is
two lessons, stated separately, each routed on its own. Do not route a single
insight to two stores.

**Self-reference.** Before returning a D5 verdict, check:

```bash
git remote get-url origin
```

When the remote resolves to the claude-tweaks repository itself, D5 collapses —
re-run the classifier from rule 4, so the lesson becomes an ordinary D1/D2/D3
outcome. The plugin never files issues against itself through this path.

**Non-claude-tweaks upstream.** Filing an issue *against* a third-party
dependency's own repository (superpowers, an MCP server, another plugin) is
**not** a D5 filing and is out of this contract's scope. Report it to the user,
name the owner, and stop.

This does not conflict with rule 7. The two describe different targets for the
same lesson: rule 7 files against **claude-tweaks**, asking it to carry guidance
it currently lacks — including guidance about using a dependency it already
wraps. This rule forbids filing against the **dependency itself**. The first is
in scope; the second never is.

## Dedup

Check before every write. Each tier uses an artifact that already exists; this
contract introduces no index.

| Store | Mechanism |
|---|---|
| **D1** | `CLAUDE.md` is loaded into every session as project instructions — its `Don't` bullets are already resident. Compare against them directly; no read needed. |
| **D2** | Not resident. Dedup against a read the routing step is already doing: `wrap-up` Step 7.2's domain-overlap skill scan, Step 7.7's doc scan, and Step 7.8's journey-frontmatter overlap each open the candidate target before writing. Compare there — never write a D2 learning without having read the file it lands in. |
| **D4** | Read `MEMORY.md` in the supplied memory directory — the harness maintains it as a one-line-per-memory index. |
| **D5** | Content fingerprint plus `gh issue list --search`. See `/claude-tweaks:feedback`. |

`docs/incident-log.md` (or any project's equivalent narrative store) is **not**
read wholesale. Grep it only when the resident-CLAUDE.md check is ambiguous.
This is sound because a live `Don't` carries its incident tag: an incident entry
with no surviving rule is exactly the case where re-proposing the rule may be
correct.

When dedup finds an existing record that the new learning **improves** rather
than duplicates — a sharper condition, an additional trigger, a recurrence count
— route it as an update to that record, not as a new one. An improvement filed
as a duplicate leaves the shipped copy the less accurate of the two.

## Memory write procedure (D4)

**Path.** The memory directory comes from the invoking assistant's own system
prompt, exactly as stated there for this project. **Never derive, compute, or
guess it.** Same rule `skills/harness-health/SKILL.md` applies to `--memory-dir`.
If the invoking assistant has no memory directory in its system prompt, D4 is
unavailable: report that and re-run the classifier from rule 4.

**File.** One fact per file, at `<memory-dir>/<name>.md`:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
---

<the fact. For feedback, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

**Index.** Append one line to `MEMORY.md` in the same directory:

```
- [Title](<name>.md) — <hook>
```

The line must stay within **150 characters** — the budget
`_shared/harness-health-memory-checks.md` already enforces when auditing.

**Never auto.** A memory write is cross-project and always-loaded; a wrong one
silently degrades every future session in every project. Stage it and surface it
for explicit approval. See `_shared/auto-mode-contract.md`.

## Subject check (health sweeps)

Before filing a finding as a project issue, a health sweep asks whose code the
finding is actually about.

When the subject is a claude-tweaks skill, contract, or CLI rather than this
project's own code, the finding is a **D5** learning, not a project issue —
route it to `/claude-tweaks:feedback` instead of filing locally. Classify via
the classifier above.

This applies only where claude-tweaks is a dependency. When this project *is*
claude-tweaks, the self-reference check above collapses D5 and the finding files
locally as usual.

## Consumers

| Consumer | How it uses this file |
|---|---|
| `/claude-tweaks:reflect` | Routes each insight through the classifier instead of its own destination table |
| `/claude-tweaks:wrap-up` | Step 6 classifies each candidate before collecting it (`config-updates.md` 6.1); Step 7 classifies each ledger-entry seed before seeding it (`skill-curation.md` 7.1); Steps 7.10/7.11 own the D4/D5 stage-and-surface |
| `/claude-tweaks:review` lens 3a | Records a `review/skill` ledger entry; does not classify itself — `/claude-tweaks:wrap-up` Step 7 classifies it afterward |
| `/claude-tweaks:build` Common Step 4.5 | Classifies architecture-alignment learnings |
| health sweeps | A finding whose subject is a claude-tweaks skill routes to D5 rather than a project issue |
