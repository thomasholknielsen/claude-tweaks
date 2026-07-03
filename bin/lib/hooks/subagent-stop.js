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
  let last = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry && entry.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const texts = msg.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (texts.length) last = texts[texts.length - 1].text;
  }
  return last;
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
