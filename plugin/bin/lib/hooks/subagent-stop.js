// bin/lib/hooks/subagent-stop.js — E3: Subagent Contract status-line check (warn tier).
// Best-effort by design: SubagentStop fires unreliably for Task dispatches
// (claude-code#27755) and transcript field names may drift. Never blocks.
// Known false-positive source: a dispatch whose own template specifies a
// different first-line contract (e.g. superpowers:subagent-driven-development's
// task-reviewer, which begins with a spec-compliance verdict) is logged here
// even though nothing was actually violated — STATUS_RE has no way to know a
// dispatch declared a different contract.
'use strict';
const fs = require('fs');
const ctxLib = require('./context');

const STATUS_RE = /^(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\b/;

function lastAssistantText(transcriptPath) {
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const lines = raw.split('\n');
  // Scan from the tail and stop at the first assistant message found — the
  // last assistant message is almost always near the end of a long-running
  // transcript, so this avoids JSON.parse-ing every earlier line just to
  // confirm none of them is the true last one.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry && entry.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    // This IS the transcript's true last assistant turn (first match found
    // scanning backward) — decide based on IT alone and stop here. Falling
    // through to an EARLIER assistant message when this one has no text
    // blocks (e.g. a tool-call-only final turn) would silently grade stale,
    // unrelated content instead of correctly recognizing "the real last
    // turn had nothing to grade" — matching this file's own best-effort
    // posture (unreadable/ungradable -> no-op, not a violation).
    //
    // A message that ALSO carries a tool_use block is not a completed reply
    // either, even when it carries narration text alongside the tool call
    // (e.g. "Waiting for the other task to finish." immediately before
    // calling Monitor/SendMessage) — the turn continues after the tool
    // result comes back, so this narration precedes the eventual final
    // reply rather than being it. Grading it here is the same category of
    // misfire as the tool-call-only case above: nothing to grade yet (#1329).
    if (msg.content.some((c) => c && c.type === 'tool_use')) return null;
    const texts = msg.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string');
    return texts.length ? texts[texts.length - 1].text : null;
  }
  return null;
}

function run(ctx) {
  if (!ctx.runDir) return {};
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return {};
  const text = lastAssistantText(transcriptPath);
  if (typeof text !== 'string') return {}; // unreadable -> best-effort no-op
  if (STATUS_RE.test(text.trim())) return {};
  ctxLib.appendEvent(ctx.runDir, 'contract-violation', { firstLine: text.trim().split('\n')[0].slice(0, 120) });
  return { json: { systemMessage: 'claude-tweaks: a subagent reply is missing the Subagent Contract status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Logged to events.jsonl.' } };
}

module.exports = { run };
