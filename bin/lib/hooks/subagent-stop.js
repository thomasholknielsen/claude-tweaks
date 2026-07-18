// bin/lib/hooks/subagent-stop.js — E3: Subagent Contract status-line check (warn tier).
// Best-effort by design: SubagentStop fires unreliably for Task dispatches
// (claude-code#27755) and transcript field names may drift. Never blocks.
'use strict';
const fs = require('fs');
const ctxLib = require('./context');

const STATUS_RE = /^(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\b/;

function lastAssistantText(transcriptPath) {
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const lines = raw.split('\n');
  // Scan from the tail and stop at the first match — the last assistant
  // message is almost always near the end of a long-running transcript, so
  // this avoids JSON.parse-ing every earlier line just to confirm none of
  // them is the true last one.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry && entry.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const texts = msg.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (texts.length) return texts[texts.length - 1].text;
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
