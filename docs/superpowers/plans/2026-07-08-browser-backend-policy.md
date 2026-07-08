# Browser Automation Backend Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document that `agent-browser` is claude-tweaks' sole browser automation backend, and add a narrow, human-invoked-only Chrome escape hatch, so future work doesn't silently reintroduce a `mcp__claude-in-chrome__*` dependency that would break on hosted Routine execution.

**Architecture:** Two independent documentation edits — a short guardrail bullet in the root `CLAUDE.md` `Don'ts` section, and a new `backend=chrome` input pattern (plus a scope note and an anti-pattern row) in `skills/browse/SKILL.md`. No runtime code changes; both files are plugin content consumed by Claude Code's skill system, not executed by `node --test`.

**Tech Stack:** Markdown (SKILL.md / CLAUDE.md conventions). `node --test` is run after each task purely as a regression safety net, not because these files are covered by any test.

## Global Constraints

- CLAUDE.md additions must be short — rule + why + exception, not an incident narrative (explicit user feedback during brainstorming: "too much... reduce the bloat").
- The Chrome escape hatch must never be reachable from `/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, or a Routine — human-invoked via `/browse backend=chrome` only.
- No changes to `bin/lib/` or any tested code path — this plan touches documentation only.
- Baseline test state going in: 630/631 passing, one pre-existing unrelated flaky timing failure in `tests/statusline.test.js` ("render under 500ms"). That failure is expected before and after this plan's changes — do not attempt to fix it as part of this work.

---

### Task 1: CLAUDE.md Don'ts guardrail

**Files:**
- Modify: `CLAUDE.md` (root of the repo, end of the `## Don'ts` section)

**Interfaces:** None — documentation-only change, no code interfaces produced or consumed.

- [ ] **Step 1: Read the file and confirm the current final line of the `Don'ts` section**

Run: `tail -5 CLAUDE.md`

Expected: the last line of output is this exact bullet (the current final entry in `Don'ts`):

```
- Don't let a phase's version bump depend on remembering to add it — write an explicit "bump version" step into every phase plan whose scope is a feature addition, the same way Task lists spell out every other step. In that same 5-phase design, only Phase 1's plan included a version-bump step; Phases 2-5 didn't, and a concurrent session's unrelated feature bump (5.13.0→5.14.0) landed mid-stream and silently absorbed all four unbumped phases with no dedicated version, changelog entry, or marketplace mirror for any of them. Discovered only during a later `/wrap-up`.
```

If the file has changed and this is no longer the final line, stop and re-anchor on whatever the actual final `Don'ts` bullet is — do not guess at a different insertion point.

- [ ] **Step 2: Append the new bullet**

Use the Edit tool with this exact `old_string` / `new_string` pair:

`old_string`:
```
- Don't let a phase's version bump depend on remembering to add it — write an explicit "bump version" step into every phase plan whose scope is a feature addition, the same way Task lists spell out every other step. In that same 5-phase design, only Phase 1's plan included a version-bump step; Phases 2-5 didn't, and a concurrent session's unrelated feature bump (5.13.0→5.14.0) landed mid-stream and silently absorbed all four unbumped phases with no dedicated version, changelog entry, or marketplace mirror for any of them. Discovered only during a later `/wrap-up`.
```

`new_string`:
```
- Don't let a phase's version bump depend on remembering to add it — write an explicit "bump version" step into every phase plan whose scope is a feature addition, the same way Task lists spell out every other step. In that same 5-phase design, only Phase 1's plan included a version-bump step; Phases 2-5 didn't, and a concurrent session's unrelated feature bump (5.13.0→5.14.0) landed mid-stream and silently absorbed all four unbumped phases with no dedicated version, changelog entry, or marketplace mirror for any of them. Discovered only during a later `/wrap-up`.
- Don't call `mcp__claude-in-chrome__*` tools directly in plugin skills — `/browse` and its consumers (`/stories`, `/visual-review`, `qa-agent`, `/flow`) use `agent-browser` exclusively, since it's the only backend that works in both interactive sessions and hosted Routines (claude-in-chrome has no headless/cloud mode). Exception: `/browse backend=chrome`, human-invoked only, never from auto mode or a Routine.
```

- [ ] **Step 3: Verify the change**

Run: `tail -3 CLAUDE.md`

Expected: the new bullet is the last line of the file, and `git diff CLAUDE.md` shows exactly one added line (no other lines touched).

Run: `grep -c "claude-in-chrome" CLAUDE.md`

Expected: `1`

- [ ] **Step 4: Run tests (regression safety net)**

Run: `npm test 2>&1 | tail -15`

Expected: `# pass 630`, `# fail 1` (the pre-existing `statusline.test.js` timing failure) — same counts as the pre-task baseline. This file isn't exercised by any test, so this step exists purely to confirm the edit didn't break anything unrelated (e.g. no stray syntax that some other tool parses).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Add CLAUDE.md guardrail against direct claude-in-chrome use

Claude in Chrome went GA in Claude Code and ships a bundled skill
that nudges toward mcp__claude-in-chrome__* tools directly. Nothing
in this plugin calls them today, but nothing documented why it
should stay that way — agent-browser is the only backend that works
identically in interactive sessions and hosted Routines.
EOF
)"
```

---

### Task 2: `/browse` Chrome escape hatch

**Files:**
- Modify: `skills/browse/SKILL.md:35-45` (Input table + note beneath it)
- Modify: `skills/browse/SKILL.md:162-172` (Anti-Patterns table)

**Interfaces:**
- Consumes: the `CLAUDE.md` guardrail bullet from Task 1 (this task's new paragraph cross-references it by name — "see `CLAUDE.md` Don'ts").
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add the `backend=chrome` row to the Input table**

Use the Edit tool with this exact `old_string` / `new_string` pair:

`old_string`:
```
| `set viewport <wxh>` | `set viewport 1280x800` | Adjust viewport for the active session |
| `set device "<name>"` | `set device "iPhone 14"` | Emulate a device profile |

See `agent-browser-reference.md` in this skill's directory for the full operation vocabulary (snapshot, find, fill, type, vitals, trace, batch, react, auth vault, viewport/device flags).
```

`new_string`:
```
| `set viewport <wxh>` | `set viewport 1280x800` | Adjust viewport for the active session |
| `set device "<name>"` | `set device "iPhone 14"` | Emulate a device profile |
| `backend=chrome <URL or task>` | `backend=chrome https://app.example.com/settings` | Routes through the native `mcp__claude-in-chrome__*` tools (user's live authenticated Chrome session) instead of `agent-browser`. Human-invoked only. |

See `agent-browser-reference.md` in this skill's directory for the full operation vocabulary (snapshot, find, fill, type, vitals, trace, batch, react, auth vault, viewport/device flags).

`backend=chrome` is a narrow escape hatch, not a second backend: it covers navigate, read page, click, type/fill, and screenshot only — no vitals, trace, react introspection, or auth vault (the session is already authenticated, so the vault has no job). It is never auto-selected and must never be used by `/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, or a Routine — those stay `agent-browser`-only, per `CLAUDE.md`'s `Don'ts`.
```

- [ ] **Step 2: Add the anti-pattern row**

Use the Edit tool with this exact `old_string` / `new_string` pair:

`old_string`:
```
| Skipping the trace on failure | Failure reports without a trace path are not actionable — capture before closing |

## Relationship to Other Skills
```

`new_string`:
```
| Skipping the trace on failure | Failure reports without a trace path are not actionable — capture before closing |
| A consumer skill routes through `backend=chrome` | Breaks portability to hosted Routines — `agent-browser` is the only backend that works headless; this flag is human-invoked only |

## Relationship to Other Skills
```

- [ ] **Step 3: Verify the change**

Run: `grep -n "backend=chrome" skills/browse/SKILL.md`

Expected: three matches — the Input table row, the scope paragraph, and the Anti-Patterns row.

Run: `git diff skills/browse/SKILL.md`

Expected: exactly the two hunks above, no other lines touched. Confirm both markdown tables still render as valid tables (every row has the same number of `|`-delimited columns as the header).

- [ ] **Step 4: Run tests (regression safety net)**

Run: `npm test 2>&1 | tail -15`

Expected: `# pass 630`, `# fail 1` (same pre-existing `statusline.test.js` failure) — unchanged from baseline.

- [ ] **Step 5: Commit**

```bash
git add skills/browse/SKILL.md
git commit -m "$(cat <<'EOF'
Add narrow claude-in-chrome escape hatch to /browse

backend=chrome routes navigate/read/click/type/screenshot through
the native Chrome extension for human-invoked, live-authenticated-
session tasks. Never auto-selected, never used by any pipeline
skill or Routine — agent-browser stays the only backend those use,
since it's the only one portable to hosted execution.
EOF
)"
```

---

## Plan Self-Review

**Spec coverage:** Both `Solution` subsections from `docs/superpowers/specs/2026-07-08-browser-backend-policy-design.md` map directly to a task — CLAUDE.md guardrail → Task 1; `/browse` escape hatch (Input table row + scope note + Anti-Patterns row) → Task 2. The spec's "Out of scope" items (resolution-table rebuild, Claude Code settings changes, full operation-mapping parity, playwright MCP integration) have no corresponding task, correctly.

**Placeholder scan:** No TBD/TODO; every step shows the literal text being written, not a description of it.

**Type consistency:** N/A (no code, no function signatures) — checked instead for exact-wording consistency: the `CLAUDE.md` bullet text in Task 1 matches verbatim what Task 2's cross-reference ("see `CLAUDE.md`'s `Don'ts`") points at, and both match the design doc's quoted text.
