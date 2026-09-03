# Init — Anti-Patterns

Extracted from `SKILL.md` so this skill's main file stays under its own budget.

| Pattern | Why It Fails |
|---------|-------------|
| Modifying existing backlog work records | Phase 0 is additive — never overwrite user content |
| Skipping CLAUDE.md generation | /claude-tweaks:review can't find verification commands |
| Running init in a non-git directory without warning | /claude-tweaks:review and /claude-tweaks:wrap-up need git — surface the degradation |
| Installing browser tools without asking | Optional — surface the install command, never run `npm install` |
| Prompting for a browser backend choice | Only one backend exists (`agent-browser`) |
| Generating generic skills (e.g., `auth.md`, `api-routes.md`) | Feature names, not conventions — skills encode rules, anti-patterns, or "why this way" insights observed in the codebase. No WebSockets, no realtime skill; no tests, testing is a backlog item, not a SKILL.md file. |
| Generating generic skills not grounded in the codebase | Generic advice adds noise, not value |
| Rewriting CLAUDE.md in Update Mode | Update Mode patches — existing config embeds hard-won lessons |
| Over-generating skills (15 mediocre > 5 excellent) | Each skill must encode knowledge otherwise lost |
| Skipping team input | Code archaeology misses social conventions — PR process, deploy cadence, naming |
| Aspirational Don'ts for things that don't exist | Don'ts guard existing patterns — "No CI" is a backlog item |
| Putting improvement ideas in CLAUDE.md | It describes the codebase as it is — improvements go to the backlog with Phase 2 context |
| Generating skills for patterns that don't exist yet | Aspirational skills (testing with no tests) become backlog records with Phase 2 evidence, not SKILL.md files |
| Hardcoding greenfield philosophy for all projects | Philosophy adapts to detected maturity — greenfield advice is dangerous on an established project |
| Creating doc files with only TODO placeholders | Phase 2 recon has the data — generate real content; under 20 lines of it belongs in README |
| Skipping journey discovery for user-facing features | `/review` tests against journeys — without them visual QA has no anchor |
| Writing journey "should feel" without using the app | Codebase-only skeletons have a weaker "should feel" — mark them as skeletons |
| Auto-copying local MCP server configs (`~/.claude.json`) into the committed `.mcp.json` | They can carry credentials — committing leaks secrets. Step 14's MCP-parity check is report-only; the user adds any that matter, manually. |
| Hand-editing `scripts/claude-cloud-setup.sh` | Regenerated on every `/init` run from `.claude/settings.json` — edits are silently overwritten. Customize via `enabledPlugins`/`extraKnownMarketplaces`, then re-run. |
| Assuming `/init` can set the cloud environment's Setup-script field | No API or CLI sets it remotely (`RemoteTrigger`'s schema covers only `/v1/code/triggers`) — always a manual one-time paste per environment in the claude.ai/code settings UI |
| Assuming Step 9 can authenticate `gh` non-interactively | `gh auth login --web` is device-flow — it always requires the user's own browser; no headless path exists |
