---
name: transcript-payload-verification
description: Use when implementing against a tool, hook, or API payload whose shape is only known from a type declaration, SDK doc, or third-party spec — never an observed live payload — and getting it wrong would be expensive to discover later. Verifies the real shape by reading this session's own locally-stored transcript. Keywords - payload verification, hook contract, SDK types, live capture, ground truth, transcript.
---

# Transcript Payload Verification — Ground Truth Over Documented Contracts

A documented type declaration or SDK contract describes what a payload is *supposed* to look
like. The live boundary — a hook, a tool call, an API response — can differ from that
documentation without warning. This skill is the fix: before writing code that parses or
branches on a payload shape, check what the payload actually looked like the last time it
crossed that boundary in this very session.

**Lifecycle:** utility, no fixed position. Reach for it whenever a plan or task depends on the
exact shape of a tool/hook/API payload and the only evidence available is a type declaration or
documentation, not an observed instance.

## Why this matters

A type declaration is a claim about the documented contract, not a guarantee about what a
specific integration point actually sends. This project shipped an example of the gap: an
`AskUserQuestion` `PostToolUse` hook handler was implemented against the `@anthropic-ai/claude-agent-sdk`'s
documented `AskUserQuestionOutput` shape (`{questions, answers}`) — a reasonable, well-cited
assumption. The real `tool_response` at that hook boundary is always a plain string. Every
parsed `answer` field would have logged `null` forever in production. The mismatch was only
caught by reading a real captured transcript during a final review, by chance, rather than as a
standard step in implementing the handler.

## Procedure

1. **Locate the current session's transcript file.** Session transcripts are stored locally at
   `~/.claude/projects/<project-slug>/<session-id>.jsonl` (one line per turn/event, JSON-encoded).
   The project-slug is derived from the working directory path; the session-id is this session's
   own UUID.
   **Resolve the config root; do not assume `~/.claude`.** When `$CLAUDE_CONFIG_DIR` is set the
   store is `$CLAUDE_CONFIG_DIR/projects/`. On this machine that is
   `~/.claude-accounts/{account}/projects/`, which `~/.claude/projects/` happens to resolve to
   (same inode) — but the sibling `plugins/` directory does *not* coincide, and reading the
   `~/.claude` spelling of it is what made a probe in #418 report a registered marketplace as
   absent. Never generalize one child's coincidence to the rest of the tree.
2. **Grep for the target tool's `tool_use`/`tool_result` pairs.** Each `tool_use` block names the
   tool and its input; the matching `tool_result` (or a later `tool_use` referencing the same
   `tool_use_id`) carries what actually came back. Read several real examples, not just one — a
   single sample can't distinguish "always this shape" from "this shape, this one time."
3. **Treat the transcript's real payloads as the reference shape** — not the type declaration —
   when writing the parsing/handling code. If the two disagree, the transcript wins for what to
   implement against; the type declaration is worth noting as the documented-but-inaccurate
   contract, so a future reader isn't tempted to "fix" the code back toward it.
4. **Still write defensively.** Verifying against one session's transcript only confirms the
   current harness/SDK version's behavior — it doesn't guarantee future stability. Parse
   defensively (never throw on an unexpected shape) regardless of what the transcript showed; see
   `plugin/bin/lib/hooks/post-tool-use.js`'s `extractToolResponseText` for the pattern this project
   already uses for exactly this reason.

## When to use

- Implementing a hook handler, integration, or any code that parses a tool's input/output payload
- The only available shape description is a type declaration, SDK doc, or third-party spec — not
  an observed live payload
- Getting the shape wrong would fail silently (a parsed field quietly resolving to `null`/`undefined`
  forever) rather than loudly (a thrown error caught in testing)

## When not to use

- The payload's shape is already directly testable (a real API you can call, a fixture already
  checked into the repo) — call it or read the fixture instead of hunting through a transcript
- No relevant transcript exists yet (the tool/hook has never fired in any session available to
  you) — there is nothing to verify against; note the gap and proceed defensively, or trigger the
  tool once deliberately to generate a sample first

## Origin

Surfaced during #452 (Add a Friction reflect lens fed by hook-denial and AskUserQuestion events) —
see that record's final review and `evals/NOTES.md`'s "AskUserQuestion input/output shapes"
section's Correction for the concrete incident this skill generalizes from.
