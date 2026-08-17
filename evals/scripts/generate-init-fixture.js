// One-time fixture generator: runs the real /claude-tweaks:init skill
// against a minimal seeded repo via the Agent SDK, and copies the resulting
// CLAUDE.md (+ any .claude/rules/*.md files) into evals/fixtures/
// init-baseline/ — a static, checked-in fixture every scenario reuses.
//
// Never invoked by node --test, runner.js, or any automated path — this is
// a manual, real-cost maintenance tool. Run it directly (node
// scripts/generate-init-fixture.js from evals/) only when init-baseline
// needs to be regenerated (e.g. /init's own template changes enough to
// matter). See evals/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { createActor } from '../actor.js';
import { buildPluginSnapshot } from '../runner.js';
import { freshRepo, seedFiles, walkFiles } from '../fixtures/git-fixtures.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = path.resolve(SCRIPT_DIR, '..');
const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');
const OUTPUT_DIR = path.join(FIXTURES_DIR, 'init-baseline');

// Matches plugin/skills/init/bootstrap/step-17-work-record-backend.md's AskUserQuestion verbatim
// (the "gate fails / no GitHub remote" branch — always true here, since
// freshRepo() never configures a remote). If /init's own question text
// changes, this match string needs updating — Task 2's real run will
// surface a mismatch immediately (the generated CLAUDE.md would carry
// work-backend: github-issues instead, or a different value depending on
// the actor's own default pickRecommended fallback).
const WORK_BACKEND_ANSWER_OVERRIDE = {
  match: 'how should claude-tweaks store work records',
  answer: 'Local record files',
};

// opts: { queryFn = realQuery, fixturesDir = FIXTURES_DIR, outputDir = OUTPUT_DIR }
export async function generateInitFixture(opts = {}) {
  const { queryFn = realQuery, fixturesDir = FIXTURES_DIR, outputDir = OUTPUT_DIR } = opts;

  const repoDir = freshRepo();
  const baseFiles = walkFiles(path.join(fixturesDir, 'minimal-node-repo'));
  // minimal-node-repo now carries its own CLAUDE.md (copied from this
  // script's own prior output, so other scenarios get a realistic fixture
  // too) — strip it before seeding so /init runs against a genuinely
  // CLAUDE.md-less repo. Without this, /init would run in Update-Mode
  // against its own already-realistic prior output instead of a fresh
  // bootstrap, and the "did /init actually produce a CLAUDE.md" guard below
  // would never be able to fire, since one would already exist from the seed.
  delete baseFiles['CLAUDE.md'];
  seedFiles(repoDir, baseFiles, 'seed minimal-node-repo');

  const pluginSnapshotDir = buildPluginSnapshot();
  const actor = createActor({ answerOverrides: [WORK_BACKEND_ANSWER_OVERRIDE], repoDir });

  let toolCallCount = 0;
  let costUsd = null;
  let resultText = '';
  let resultSubtype = null;

  const stream = queryFn({
    prompt: '/claude-tweaks:init',
    options: {
      cwd: repoDir,
      // A prior real run of this script left /init's own terminal "## Next
      // Actions" question unanswered by WORK_BACKEND_ANSWER_OVERRIDE — the
      // actor's default pickRecommended auto-accepted /init's recommended
      // follow-up skill, which itself recommended another, cascading for
      // real through /tidy -> /specify -> /build -> /review -> /reflect ->
      // /wrap-up -> a second /specify inside the disposable sandboxed
      // fixture (>=$25, one crashed attempt's cost unknown on top of that).
      // maxBudgetUsd hard-stops the query regardless of what the model
      // tries next, rather than trying to out-guess every possible
      // cascading Next-Actions answer (a chosen "safe" answer can itself
      // lead into another skill's own under-specified routing prompt). Set
      // comfortably above a real single /init run's observed cost ($4.27)
      // but well below what an unbounded cascade reaches.
      maxBudgetUsd: 10,
      plugins: [{ type: 'local', path: pluginSnapshotDir }],
      managedSettings: {
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          allowUnsandboxedCommands: false,
          network: { allowedDomains: [] },
          filesystem: { allowRead: [path.join(repoDir, '.git')] },
        },
      },
      canUseTool: async (toolName, input, options) => {
        toolCallCount += 1;
        return actor(toolName, input, options);
      },
    },
  });

  for await (const message of stream) {
    if (message.type === 'assistant' && message.message && message.message.content) {
      const textParts = message.message.content.filter((c) => c.type === 'text').map((c) => c.text);
      if (textParts.length > 0) resultText += (resultText ? '\n' : '') + textParts.join('\n');
    }
    if (message.type === 'result') {
      costUsd = message.total_cost_usd != null ? message.total_cost_usd : null;
      resultSubtype = message.subtype != null ? message.subtype : null;
    }
  }

  const claudeMdPath = path.join(repoDir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    throw new Error(`/init did not produce a CLAUDE.md at ${claudeMdPath} — inspect the fixture repo before retrying.`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(claudeMdPath, path.join(outputDir, 'CLAUDE.md'));

  const rulesDir = path.join(repoDir, '.claude', 'rules');
  let rulesCopied = 0;
  if (fs.existsSync(rulesDir)) {
    const outputRulesDir = path.join(outputDir, '.claude', 'rules');
    fs.mkdirSync(outputRulesDir, { recursive: true });
    for (const entry of fs.readdirSync(rulesDir)) {
      fs.copyFileSync(path.join(rulesDir, entry), path.join(outputRulesDir, entry));
      rulesCopied += 1;
    }
  }

  return { repoDir, outputDir, rulesCopied, costUsd, toolCallCount, resultText, resultSubtype };
}

async function main() {
  const result = await generateInitFixture();
  console.log(`Wrote ${result.outputDir}/CLAUDE.md (+ ${result.rulesCopied} rules file(s))`);
  console.log(`cost=$${result.costUsd}, tools=${result.toolCallCount}`);
  if (result.resultSubtype && result.resultSubtype !== 'success') {
    console.error(`WARNING: query ended with subtype "${result.resultSubtype}", not "success" — ` +
      `if this is "error_max_budget_usd", the maxBudgetUsd cap stopped a cascade past /init's own ` +
      `terminal Next Actions question (this is expected protective behavior, not a bug). The ` +
      `CLAUDE.md check below still runs — if /init's own bootstrap already completed before the ` +
      `cascade began, the fixture is still correct.`);
  }

  const claudeMd = fs.readFileSync(path.join(result.outputDir, 'CLAUDE.md'), 'utf8');
  if (!/^work-backend:\s*local-files/m.test(claudeMd)) {
    console.error('WARNING: generated CLAUDE.md does not contain "work-backend: local-files" — the answer_override in this script may need updating to match what /init actually asked. Transcript:');
    console.error(result.resultText);
  }
}

// Compares via pathToFileURL (not a hand-built file://${path} string)
// because this repo's own path contains a space ("Code Workspaces") — a
// manually-constructed URL string wouldn't percent-encode it the way
// import.meta.url does, so the two would silently never match. Mirrors
// runner.js's own direct-execution guard.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
