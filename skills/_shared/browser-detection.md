# Browser Detection — Shared

Detection + install procedure for `agent-browser`, used by /browse, /init, /visual-review. `agent-browser` is the only backend this procedure detects, installs, or auto-selects; do not prompt the user for a backend choice. (The narrow, human-invoked `/browse backend=chrome` escape hatch is a separate, manual path — see CLAUDE.md's `Don'ts` — and out of scope for this file.)

## Detect

Run via the Bash tool:

```bash
which agent-browser >/dev/null 2>&1 && agent-browser --version
```

If the command succeeds, confirm the version and return OK. If it fails (binary missing) or returns a version below a skill-declared minimum, treat `agent-browser` as not available.

## Install (interactive mode)

Call `AskUserQuestion`:

- `question`: `"agent-browser is not installed."`, `header`: `"Browser tool"`, `multiSelect`: `false`
- Option 1 — `label`: `"Install (Recommended)"`, `description`: `"Install agent-browser globally — npm install -g agent-browser"`
- Option 2 — `label`: `"Skip"`, `description`: `"visual review, story generation, and QA validation will be unavailable"`

- **Choice 1:** run `npm install -g agent-browser`, then verify (see "Verify after install" below). Return OK.
- **Choice 2:** return SKIPPED — the caller surfaces a "browser unavailable" line in its report and degrades gracefully (never silently skip without telling the user).

Never block the calling skill on a missing browser. Browser features are optional — all other skills work without them.

## Install (auto mode)

Auto mode does NOT install `agent-browser` autonomously (installation is a global side effect outside the worktree, and not always reversible). Instead, log to the auto-decision log:

```
STAGED {HH:MM:SS} — browser detection: agent-browser not installed. Recommend install. Surface at Review Console.
```

The caller continues without browser-dependent features. The Wrap-Up Review Console surfaces the install hint for user approval.

## Verify after install

Run `agent-browser session list` — should return without error (an empty list is fine). If the command fails, surface the failure to the user with a hint to check the install (`agent-browser doctor`).

## Daemon lifecycle

The daemon auto-starts on the first `agent-browser` command (port 4848). Skills do not manage daemon lifecycle. Recovery on crash: `agent-browser doctor`.

## See also

- `/claude-tweaks:browse` — operation vocabulary and concrete command reference (`agent-browser-reference.md`)
- `_shared/auto-mode-contract.md` — full auto-mode semantics and the "What `auto` does NOT silence" list
- `_shared/auto-decision-log.md` — log entry format and location
