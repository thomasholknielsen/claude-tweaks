# Context Flow Between Skills

How data and context pass between skills in the workflow lifecycle.

## The Mechanism: Durable Artifacts

Skills communicate through **files on disk** — not through session state, environment variables, or in-memory data. Each skill reads artifacts produced by upstream skills and writes artifacts consumed by downstream skills.

This design means:
- **Context survives across sessions** — you can run `/capture` today and `/challenge` tomorrow
- **Context is inspectable** — artifacts are markdown files you can read and edit
- **Context is explicit** — if a skill needs input, it reads a specific file

## Artifact Flow

```
INBOX item          ──→ Brief               ──→ Design Doc          ──→ Spec              ──→ Code + Journey
specs/INBOX.md         docs/plans/*-brief.md   docs/plans/*-design.md  specs/NN-*.md         src/ + docs/journeys/
  /capture               /challenge              brainstorming          /specify              /build
                                                                         ↓                     ↓
                                                                   (deletes brief           Deferred items
                                                                    + design doc)           specs/DEFERRED.md
```

```
Code         ──→ Review Summary    ──→ Learnings Routed    ──→ Clean Slate
src/             (in commit/output)     CLAUDE.md updates       (spec + plans deleted)
  /build           /review                /wrap-up
                    ↕
              Visual findings
              (browser review)
```

## What Each Skill Reads and Writes

| Skill | Reads | Writes | Deletes |
|-------|-------|--------|---------|
| `/capture` | — | `specs/INBOX.md` (append) | — |
| `/challenge` | `specs/INBOX.md` | `docs/plans/*-brief.md` | — |
| `brainstorming` | `docs/plans/*-brief.md` | `docs/plans/*-design.md` | — |
| `/specify` | `*-design.md`, `*-brief.md`, `specs/INDEX.md` | `specs/NN-*.md`, `specs/INDEX.md` | `*-design.md`, `*-brief.md`, INBOX entry |
| `/build` | `specs/NN-*.md`, `docs/plans/*.md` | Code, `docs/journeys/*.md`, plan files | — |
| `/review` | Code (via git diff), `specs/NN-*.md`, `docs/journeys/*.md` | Review summary | — |
| `/wrap-up` | `specs/NN-*.md`, review output, plan files | CLAUDE.md updates, skill updates, `DEFERRED.md` | Spec file, plan files |
| `/tidy` | All artifacts | Cleanup actions | Stale artifacts |

## Within-Session Context

When skills run in sequence within the same session (via `/flow` or manual chaining), conversation context supplements the artifact flow:

- `/flow` explicitly passes build output to review and review output to wrap-up
- Manual chaining (running `/review` after `/build` in the same session) inherits conversation context naturally

## Cross-Session Context

When skills run in separate sessions, only the durable artifacts carry context:

- Start `/build 42` today — artifacts are written to disk
- Start `/review 42` tomorrow — reads spec and git diff, no session dependency

This is why every skill writes its output to files, not just to the conversation.

## The No-Drop Rule

Every artifact that a skill produces must be consumed by a downstream skill or explicitly resolved:

- Specs are deleted by `/wrap-up` after completion
- Design docs and briefs are deleted by `/specify` after absorption into specs
- Plans are deleted by `/wrap-up` after the work is done
- INBOX items are promoted, merged, or explicitly kept by `/tidy`
- Deferred items have triggers that re-activate them when conditions are met

Nothing silently accumulates. If an artifact exists, a skill is responsible for it.
