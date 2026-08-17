# Terminal UX — plugin-authored craft principles

A **principles** source in the sense of `skills/_shared/design-craft.md`'s source classes: generic craft governing wherever project decisions are silent — and a terminal track reads no `DESIGN.md`, so here they govern outright. Unlike the other principles sources, this file is plugin-authored and always present at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md` — no install step, no two-path lookup, no availability branch. It is written to be inlined whole into a dispatch prompt: as writing context for a build touching a CLI surface (`pre-build`, polish's craft assembly), and as the terminal critic judging a CLI diff (`critics.md`).

## Help and usage

**A synopsis line comes first.** Before prose, before flags, print the invocation shape — command, required operands, optional ones — so a reader who knows the tool can leave after one line. `rg` and `gh` open this way; a description paragraph first makes the frequent reader pay for the first-timer.

**Group flags by the task they serve, not by the alphabet.** Headed groups (`Output`, `Filtering`, `Auth`) let a reader skip four-fifths of the list; a flat sorted list forces them to read all of it to know what exists.

**Show examples before the exhaustive list.** Two or three real invocations teach the mental model faster than complete flag documentation, and belong above it. `-h` is a summary of intent — the most-used flags, one line each; `--help` may run longer. Neither is a dump of every generated option.

```
Before: usage: sync [--all] [--color] [--dry-run] [--json] ...
After:  Usage: sync [<remote>] [flags]   # mirror the local index to a remote
        Examples:
          sync origin --dry-run          # preview, change nothing
```

## Output formatting

**Align columns so the eye can scan one.** Pad to a common width and the reader compares values without re-finding the field each row; ragged output makes every row a fresh parse.

**One record per line, and keep the parseable channel clean.** A line is the unit `grep`, `awk` and `xargs` operate on, so a record that wraps or spans lines breaks the pipe. Progress, warnings, counts go to **stderr**; stdout carries data only — a "Fetching…" line on stdout corrupts every downstream consumer.

**Offer `--json` when output feeds tools.** Stable keys, no ANSI, no padding — a shape callers can depend on across versions. The pretty renderer is then a view over that struct, not a second serializer that drifts.

**Quiet by default; `--verbose` opts in.** Success prints what was asked for and nothing else; narrated steps, timing, and resolved config are debugging aids the user should have to request.

## TTY detection and colour

**Branch on `isatty`, not on a flag default.** Colour, spinners, progress bars, and cursor movement are for an interactive terminal; when stdout is a pipe or file, emit plain sequential lines — no repaints, no carriage returns.

**Respect `NO_COLOR` and `FORCE_COLOR`.** Any value of `NO_COLOR` disables colour even on a TTY; `FORCE_COLOR` enables it even when piped (how CI keeps colour in logs). `--color=auto|always|never` overrides both, and is the last word.

**Never emit raw ANSI into redirected output.** Escape codes in a log file or captured variable are corruption; a `.replace(/\x1b\[[0-9;]*m/g, '')` on the consumer side is the smell that detection is missing upstream.

```
Before: console.log(`\x1b[32m✓\x1b[0m ${name}`);
After:  const ok = useColor ? '\x1b[32m✓\x1b[0m' : 'OK';   // useColor = isatty && !NO_COLOR
        console.log(`${ok} ${name}`);
```

## Progress and long-running feedback

**Under a second: say nothing.** A status line that appears and vanishes is flicker; the result is the report.

**Seconds: one status line, updated in place on a TTY.** Name the operation in the user's vocabulary — "Resolving 42 dependencies", not "Phase 2". Where the total is knowable, show position against it (`14/42`) — the question is always *how much is left*.

**Longer or non-interactive: stream line logs, not a spinner.** A spinner in CI writes thousands of repaint frames into an unreadable log. Piped or non-TTY, emit one appended line per completed unit, timestamped when pacing matters. And never leave the user staring at nothing: silence past a few seconds reads as a hang, so if a step is slow and unmeasurable, say what it waits on.

## Error messages

**Three parts, in order: what happened, why, what to do next.** *What* names the failed operation in the user's terms. *Why* quotes the offending value: the path, the field, the exit status, the response code — a category without the instance cannot be acted on. *What next* is a runnable command where one exists.

**Errors go to stderr and set a non-zero exit code.** A failure on stdout pollutes the data channel and is invisible to a caller redirecting only stderr.

**A stack trace is never the primary message.** Traces belong behind `--verbose` or in a log file; the top line the user reads is a sentence about their situation. Nor hide the cause: an unexplained "Something went wrong" is the same defect inverted.

```
Before: Error: ENOENT
After:  error: cannot read config file
          path: ./cfg/app.toml (no such file)
          create one with: sync init --config ./cfg/app.toml
```

## Exit codes

**0 means the whole operation succeeded.** Not "ran to completion" — succeeded. A partial failure (three of five uploads worked) exits non-zero; a warning-then-0 lies to every caller branching on `$?`, and `&&` chains and CI gates believe it.

**Distinct codes for distinct failure classes a caller could branch on.** Usage error, not-found, auth failure, network failure deserve separate numbers so a wrapper can retry one and abort on another. Do not invent a code per message — invent one per decision the caller might make.

**Document the codes in `--help` and honor them thereafter.** An undocumented code is one nobody can depend on; one whose meaning shifts between releases silently breaks the scripts that trusted it. Keep 1 as the catch-all; reserve the specific numbers.
