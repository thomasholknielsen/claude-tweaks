# Step 7 — Browser / agent-browser (detailed procedure)

*Core Bootstrap step (Steps 1-8). Order-dependent — later steps may assume earlier ones completed. Runs unconditionally and idempotently: only acts on missing state. Gated by the Core Bootstrap Version Check (`version-check.md` in this directory).*

Browser integration lets Claude Code interact with web pages — useful for testing UIs, running QA stories, scraping docs, and verifying deployments. The single supported backend is `agent-browser`.

See `_shared/browser-detection.md` for the detect / install / verify procedure (the detection command, the exact install-note text to print, and the auto-mode no-install rule).

Init-specific contract:

- Run detection on every `/init` invocation.
- If `agent-browser` is missing, surface the install hint and **continue** — never block init on a missing browser. Browser features are optional; all other skills work without them and degrade gracefully.
- Do not prompt for backend choice — there is only one backend.
