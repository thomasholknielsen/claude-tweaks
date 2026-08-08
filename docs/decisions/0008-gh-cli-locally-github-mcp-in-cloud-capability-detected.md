# 0008. `gh` CLI locally, GitHub MCP in cloud Routines — capability-detected, not shipped as a manual setup step

- **Status:** accepted
- **Date:** 2026-07-29
- **Context:** gh-CLI/MCP-fallback branch (`docs/superpowers/specs/2026-07-28-gh-cli-mcp-fallback-design.md`), closing GitHub issues #60 (tidy's `--scope=github` digest/triage), #61 (dispatch's claim lock), #63 (health-engine durable-state cursor writes)

> **Premise note (6.70.0).** The alternatives below reject setup scripts as the fix mechanism partly
> because they are "account-level manual configuration the plugin cannot ship, enforce, or verify."
> The middle term has weakened: `/init` Step 14 now offers to *attach* a setup script to a cloud
> environment via `guided-environment-creation.md`'s `Ensure-setup-script`, and the script it writes
> verifies its own installs. The plugin still cannot **enforce** it — a user who declines, or who
> later switches environments, lands in exactly the silent-fallback failure this ADR describes, which
> is why the decision below is unchanged and the MCP fallback stays the mechanism. `[IL-113]` is that
> failure observed for plugin loading rather than for `gh`. Left unedited below, per `[ADR-0013]`.

## Context

Three plugin skills — `/claude-tweaks:tidy`'s GitHub digest, `/claude-tweaks:dispatch`'s claim
lock, and the four health skills' durable-state cursor writer — shelled out to the `gh` CLI
unconditionally for every GitHub write. That fails outright in a Claude Code cloud Routine
sandbox, which has no `gh` CLI on PATH — only GitHub MCP tools, plus a GitHub proxy that can also
authenticate a manually-installed `gh` CLI via `GH_TOKEN=proxy-injected`. Interactive/local
sessions, by contrast, always have `gh` available and — per direct user preference — should keep
using it: MCP tool calls cost meaningfully more context/token than an equivalent `gh api` call for
the same operation.

Two paths could close this gap: (a) ship account-level environment setup scripts that install
`gh` CLI into the cloud sandbox itself, so every write path stays unchanged, or (b) build a real
MCP-based fallback into the plugin's own code and skill prose for every write path that currently
assumes `gh`.

## Decision

Detect transport by capability (`gh --version` succeeds), never by environment classification, and
support both: `gh` CLI on the local/interactive path, GitHub MCP tools on the cloud/remote path
where `gh` is absent. Every write site (`durable-state.js`'s cursor/retry-queue writer,
`claims.js`'s issue-claim lock, `/tidy`'s digest CRUD) gets an explicit MCP-path procedure
alongside its existing `gh`-CLI path, rather than the `gh`-CLI path being the only one that exists.

## Alternatives considered

- **Ship cloud-sandbox setup scripts that install `gh` CLI** — rejected as the fix mechanism. It's
  real and documented (Claude Code cloud environments do support setup scripts), but it's
  account-level manual configuration the plugin cannot ship, enforce, or verify — a user who
  doesn't run the setup script silently falls back to the exact failure this branch exists to fix,
  with no signal that anything is missing. Building the fallback into the plugin's own code means
  every user gets working behavior by default, with no manual step required.
- **Environment-variable-based transport selection** (e.g. branch on `$CLAUDE_CODE_REMOTE` or
  similar) — rejected in favor of a `gh --version` capability probe. A future environment where
  `gh` happens to be installed (even a cloud sandbox running a custom setup script) must
  transparently keep using it; classifying by environment name would silently ignore that and
  force the more expensive MCP path even when the cheaper `gh` path is actually available.
- **Relax health-state's cursor CAS to last-write-wins under MCP** — considered and rejected
  explicitly: correctness must hold on both transports, not just the one exercised locally. The
  shipped design instead uses `create_or_update_file`'s sha-gated conditional-write semantics as a
  file-level substitute for git's ref-level compare-and-set, preserving the same CAS guarantee one
  level down.

## Consequences

Every GitHub-write call site in this plugin now carries two documented procedures instead of one,
and any future write site added to `tidy`, `dispatch`, or the health skills inherits the same
dual-transport obligation (`_shared/github-write-transport.md`'s detection check + CRUD mapping is
the canonical reference going forward). MCP tools can only be invoked from the calling agent's own
turn, never from a spawned subprocess — modules that shell out for their own I/O (like
`durable-state.js`) cannot attempt the MCP call themselves; they signal what needs writing and the
calling skill's own prose drives the write, which is a real architectural constraint the codebase
now has to design around everywhere a `gh`-CLI-only write path gets an MCP fallback.

This branch shipped a narrower slice than the full surface implied by this decision: dispatch's
fuller read path (queue pull, dependency checks, contested-claim resolution) and `/tidy`'s Step
4.8 repo-wide sweep remained `gh`-only, parked as explicit follow-up scope rather than bridged
here. Dispatch's read path was bridged in v6.24.0 (closes #61) — a live diagnostic Routine fired
against a real cloud sandbox confirmed every needed MCP primitive, including the
`create_branch` bootstrap step this section originally logged as an unverified open risk, before
any bridge documentation was written and before Preflight's `gh`-CLI hard gate was flipped. See
`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` and `CHANGELOG.md`'s v6.24.0 entry.
`/tidy`'s Step 4.8 sweep remains unbridged, still parked as follow-up (Slice 2 of the same
design doc, `docs/superpowers/specs/2026-08-02-dispatch-tidy-mcp-bridge-design.md`).
