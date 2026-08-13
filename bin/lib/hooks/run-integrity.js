// bin/lib/hooks/run-integrity.js — run-integrity detection (inform tier, read-only).
// Distinguishes a run genuinely in progress from one whose work already shipped
// while bookkeeping stayed open (#364's failure mode). Pure read side: no writes,
// no event appends, no git mutations, no fetch (SessionStart must be offline-safe).
//
// Fail-open is per-field: every evidence field that cannot be determined is null,
// and any null forces 'in-progress'. A wrong verdict here costs one misleading
// advisory line, so every ambiguity resolves toward NOT alarming.
//
// Measured boundaries inherited from #371's ledger (see that spec's
// work/task0-findings.md): skill_invoked events exist only for MODEL-INITIATED
// Skill tool calls — a human typing /claude-tweaks:wrap-up leaves no event, and
// runs predating the ledger have none at all. Both are why the verdict requires
// at least one skill_invoked of any kind (pre-ledger precondition) and treats a
// present wrap-up event as proof the procedure ran; absence of a wrap-up event
// alone is never a verdict. Subagent Skill calls ARE visible (parent-session
// hooks, agent-tagged in the payload), so dispatch-driven wrap-ups do register.
'use strict';
const fs = require('fs');
const path = require('path');
const { runGit } = require('./git-exec');
const { parseWorktreeList, resolveIntegrationBranch } = require('./worktree-reap');

const NON_TERMINAL = new Set(['active', 'interrupted']);
const RUN_STATE_STATUSES = new Set(['active', 'interrupted', 'clean']);
const WRAP_UP_SKILL = 'claude-tweaks:wrap-up';

// run dirs live at {root}/.claude-tweaks/pipelines/{run-id} by anchoring
// (_shared/pipeline-run-dir.md), so the repo root is three levels up.
function repoRootOf(runDir) {
  return path.resolve(runDir, '..', '..', '..');
}

// Field contract per [IL-123]: validate fields, not typeof object.
function readValidatedRunState(runDir) {
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8')); } catch { return null; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  if (!RUN_STATE_STATUSES.has(state.status)) return null;
  if ('worktree' in state && (typeof state.worktree !== 'string' || state.worktree === '')) return null;
  return state;
}

// Branch from the recorded worktree PATH (run-state.json stores no branch).
// Prefer asking the worktree directly; fall back to matching the porcelain
// list on path. Detached HEAD, missing path, or any git failure -> null.
function deriveBranch(root, worktreePath) {
  if (!worktreePath) return null;
  const direct = runGit(['branch', '--show-current'], worktreePath);
  if (!direct.failure && direct.stdout) return direct.stdout;
  const list = runGit(['worktree', 'list', '--porcelain'], root);
  if (list.failure || list.stdout === null) return null;
  let target = worktreePath;
  try { target = fs.realpathSync(worktreePath); } catch { /* keep recorded form */ }
  const entry = parseWorktreeList(list.stdout).find((e) => e.path === worktreePath || e.path === target);
  return entry && entry.branch ? entry.branch : null;
}

// 'ancestor' | 'cherry' | false (definitively unmerged) | null (indeterminate).
// merge-base --is-ancestor answers via exit code: 0 = ancestor (success), 1 =
// not an ancestor (classified 'git-error' by runGit — the one failure kind that
// is a real answer). Indeterminate kinds (timeout/spawn/no-git) -> null.
function mergedEvidence(root, branch, integration) {
  const anc = runGit(['merge-base', '--is-ancestor', branch, integration], root);
  if (!anc.failure) return 'ancestor';
  if (anc.failure !== 'git-error') return null;
  const cherry = runGit(['cherry', integration, branch], root);
  if (cherry.failure || cherry.stdout === null) return null;
  const lines = cherry.stdout.split('\n').filter(Boolean);
  if (lines.length === 0) return false; // no commits to compare — never evidence
  return lines.every((l) => l.startsWith('-')) ? 'cherry' : false;
}

// events.jsonl scan; missing file or unreadable -> null (indeterminate).
function scanSkillEvents(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'); } catch { return null; }
  let any = false;
  let wrapup = false;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.type !== 'skill_invoked') continue;
    any = true;
    if (ev.skill === WRAP_UP_SKILL) wrapup = true;
  }
  return { any, wrapup };
}

function checkRunIntegrity(runDir) {
  const evidence = { branch: null, merged: null, ledgerActive: null, wrapupInvoked: null };
  const inProgress = { state: 'in-progress', evidence };
  try {
    const state = readValidatedRunState(runDir);
    if (!state || !NON_TERMINAL.has(state.status)) return inProgress;
    const root = repoRootOf(runDir);
    evidence.branch = deriveBranch(root, state.worktree || null);
    if (!evidence.branch) return inProgress;
    const integration = resolveIntegrationBranch(root);
    if (!integration) return inProgress;
    evidence.merged = mergedEvidence(root, evidence.branch, integration);
    if (evidence.merged !== 'ancestor' && evidence.merged !== 'cherry') return inProgress;
    const events = scanSkillEvents(runDir);
    if (!events) return inProgress;
    evidence.ledgerActive = events.any;
    evidence.wrapupInvoked = events.wrapup;
    if (!events.any) return inProgress;   // pre-ledger run — a log the ledger never wrote to proves nothing
    if (events.wrapup) return inProgress; // wrap-up ran; close-run lag is not drift worth alarming on
    return { state: 'shipped-unclosed', evidence };
  } catch {
    return inProgress;
  }
}

module.exports = { checkRunIntegrity };
