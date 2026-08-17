---
name: gh-api-module-pattern
description: Use when writing or reviewing a bin/lib/ module or CLI in this repo that shells to `gh` — the injectable-runner seam, the three gh api value mechanisms (-f/-F/path placeholders), per-call fail-safe batching, and the CLI deps contract. Keywords - gh api, runner, execFileSync, GraphQL variables, -f, -F, placeholder, injectable, fake runner.
---

# gh-api module pattern

How this repo writes Node modules that shell to `gh`. Two shipped instances define the pattern: `bin/lib/issues/capabilities-probe.js` (reads) and `bin/lib/issues/link.js` (writes). Two shipped bugs in one session (#626, #610) came from getting the flag rules wrong — read that table before writing any `gh api` call.

## The injectable runner

- The module takes `runner(args)`, invoked as if `gh ${args.join(' ')}`, returning stdout; a throw is a failed call. Export `defaultRunner` = `execFileSync('gh', args, { encoding: 'utf8' })` — always an argv array, never a shell string (no injection surface, no quoting bugs).
- Tests never touch real `gh`: fake runners branch on the `args` shape (`isGraphQL`, `isPost`-style lazy helpers) and `throw new Error('unexpected ' + args.join(' '))` on anything unhandled — a wrong endpoint fails loudly instead of passing silently. Record values inside the runner, assert after it returns (an `AssertionError` thrown *inside* a runner can be swallowed by the module's own try/catch).
- **A module may carry two runner seams, and they have opposite failure contracts.** `bin/lib/claim-targets/claim-targets.js` takes both: `deps.ghApi` — the `bin/lib/issues/claim-store.js` contract, which *never throws* and returns `{stdout, failure, status}` so a 404/409/422 arrives as data — for contents-API reads and writes, and `deps.gh` — the throwing runner above — for everything else (`repo view`, `label list/create`, `issue edit`, `issue comment`). Decide which seam a call belongs to before writing it: a never-throwing runner wrapped in `try/catch` reads as success on every rejection, and a throwing one used bare escapes uncaught.

## The three `gh api` value mechanisms (the bug source)

| You are passing… | Flag | Why |
|---|---|---|
| gh's literal `{owner}`/`{repo}`/`{branch}` placeholder in a **field value** | `-F` | Only `-F` substitutes; `-f` sends the braces as a static string (#626) |
| An **already-resolved** string bound to a GraphQL `String!` variable | `-f` | `-F` type-coerces an all-numeric name (`2048`) to an Int and GraphQL rejects it (#610) |
| A numeric **REST body** field (`sub_issue_id`, `issue_id`) | `-F` | So it lands as an integer, not a string |

URL *path* placeholders (`repos/{owner}/{repo}/…`) are a fourth thing: always substituted, no flag involved. Never collapse these into "always -F for owner/repo" — that generalization is exactly what shipped #610's bug, with a plan-authored test pinning the wrong flag.

## Batching and failure posture

- Resolve everything up front in one call where the API allows it (aliased GraphQL: one `i{N}: issue(number:{N}){ databaseId }` per distinct number); throw on a partial result rather than returning a partial map.
- Per-write calls are each independently try/caught into `{ok: [...], failed: [{…, error}]}` — one failed edge never aborts the batch. An "already exists" 422 is a re-run, not a failure: it lands in `ok` with `already: true` (live-confirmed wording: GitHub answers `Validation failed: Target issue has already been taken`).
- Error text: join `err.message`/`err.stderr`/`err.stdout`, with a `String(err)` fallback so a non-Error throw never yields an empty `failed[].error`.
- **Enumerate an operation's full documented error-status set in one sitting.** Adding one status per bug report ships the same misclassification serially: `bin/lib/issues/claim-store.js`'s Contents-API PUT got its 422 create-race branch in `75c8b3b6`, then the symmetric 409 sha-mismatch branch in `4ee0fbcc` — one defect class, found twice, the second time by a review lens. Read the endpoint's documented statuses first (Contents PUT: 404 read-miss, 409 sha-mismatch, 422 create-race) and branch on all of them in the same commit.
- **Rate-limit recognition and burst pacing.** Classify a `gh api` rate-limit failure per `_shared/github-rate-limit.md`'s taxonomy before deciding whether to retry — a plain 403 under that file's rules is not transient and must not be retried. When a module issues a scripted sequence of mutative calls, follow that file's burst-shape rules.

## The CLI wrapper contract

- Logic lives in an exported `run(argv, deps)`; every side effect (`runner`, `ghAvailable`, `remoteUrl`, `stdout`, `stderr`) goes through `deps` so tests inject fakes. **Every** `deps` call that can throw (e.g. `remoteUrl` outside a git repo) is try/caught into the documented exit-code contract — an un-wrapped deps call is where #610's one post-review high landed.
- `require.main === module` guard sets `process.exitCode = run(...)` (never `process.exit`, which can truncate piped stdout). `--help` short-circuits before any availability probe.
- Exit codes are a documented contract (0 success/partial-with-`failed`, 1 upstream resolution failure, 2 malformed invocation or missing dependency) and every malformed-input class must actually reach exit 2 — `Number('') === 0` passes `Number.isInteger`, so validate positivity and pair-structure explicitly.
- **0/1/2 is the base vocabulary, not the whole of it.** A CLI whose callers must branch on an outcome class adds codes above 2 and spells them out in its own `USAGE` string: `bin/claim-targets.js` ships 3 (contested — holder JSON on stdout) and 4 (transient `gh` failure), and `skills/flow/claim-targets.md` Step 2.8 branches on exactly those. Keep 2 reserved for malformed invocation or a missing dependency, and never reuse a base code for a domain outcome.
- When an endpoint has no GitHub MCP equivalent, say so and name the real fallback; never invent an MCP row in `_shared/github-write-transport.md`.
