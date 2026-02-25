# Playwright CLI Reference

Sub-file loaded by `/claude-tweaks:browse`. Full command reference for the playwright-cli backend.

## Key Details

- **Headed by default** — pass `--headless` to `open` to hide the browser
- **Parallel sessions** — use `-s=<name>` to run multiple independent browser instances
- **Persistent profiles** — cookies and storage state preserved between calls by default
- **Token-efficient** — CLI-based, no accessibility trees or tool schemas in context
- **Vision mode** (opt-in) — set `PLAYWRIGHT_MCP_CAPS=vision` to receive screenshots as image responses in context instead of just saving to disk

## Sessions

**Always use a named session.** Derive a short, descriptive kebab-case name from the user's prompt. This gives each task a persistent browser profile (cookies, localStorage, history) that accumulates across calls.

```bash
# Derive session name from prompt context:
# "test the checkout flow on mystore.com" → -s=mystore-checkout
# "scrape pricing from competitor.com"    → -s=competitor-pricing
# "UI test the login page"               → -s=login-ui-test

playwright-cli -s=mystore-checkout open https://mystore.com
playwright-cli -s=mystore-checkout snapshot
playwright-cli -s=mystore-checkout click e12
```

Managing sessions:
```bash
playwright-cli list                                     # list all sessions
playwright-cli close-all                                # close all sessions
playwright-cli -s=<name> close                          # close specific session
playwright-cli -s=<name> delete-data                    # wipe session profile
```

## Quick Reference

```
Core:       open [url], goto <url>, click <ref>, fill <ref> <text>, type <text>, snapshot, screenshot [ref], close
Navigate:   go-back, go-forward, reload
Keyboard:   press <key>, keydown <key>, keyup <key>
Mouse:      mousemove <x> <y>, mousedown, mouseup, mousewheel <dx> <dy>
Tabs:       tab-list, tab-new [url], tab-close [index], tab-select <index>
Save:       screenshot [ref], pdf, screenshot --filename=f
Storage:    state-save, state-load, cookie-*, localstorage-*, sessionstorage-*
Network:    route <pattern>, route-list, unroute, network
DevTools:   console, run-code <code>, tracing-start/stop, video-start/stop
Sessions:   -s=<name> <cmd>, list, close-all, kill-all
Config:     open --headed, open --browser=chrome, resize <w> <h>
```

## Workflow

1. Derive a session name from the user's prompt and open. Always set the viewport via env var and pass `--headed` at launch:
```bash
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=<session-name> open <url> --headed
# or headless:
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=<session-name> open <url>
# or with vision (screenshots returned as image responses in context):
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 PLAYWRIGHT_MCP_CAPS=vision playwright-cli -s=<session-name> open <url>
```

> **Cross-platform note:** The `VAR=value command` syntax is bash/zsh. On Windows PowerShell use `$env:VAR='value'; command`, on CMD use `set VAR=value && command`. Adapt the env var prefix to the user's shell.

2. Get element references via snapshot:
```bash
playwright-cli snapshot
```

3. Interact using refs from snapshot:
```bash
playwright-cli click <ref>
playwright-cli fill <ref> "text"
playwright-cli type "text"
playwright-cli press Enter
```

4. Capture results:
```bash
playwright-cli screenshot
playwright-cli screenshot --filename=output.png
```

5. **Always close the session when done.** This is not optional — close the named session after finishing your task:
```bash
playwright-cli -s=<session-name> close
```

## Configuration

If a `playwright-cli.json` exists in the working directory, use it automatically. If the user provides a path to a config file, use `--config path/to/config.json`. Otherwise, skip configuration — the env var and CLI defaults are sufficient.

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "headless": true },
    "contextOptions": { "viewport": { "width": 1440, "height": 900 } }
  },
  "outputDir": "./screenshots"
}
```

## Full Help

Run `playwright-cli --help` or `playwright-cli --help <command>` for detailed command usage.

See the official repo for full documentation: https://github.com/microsoft/playwright-cli
