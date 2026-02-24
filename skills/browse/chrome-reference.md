# Chrome MCP Reference

Sub-file loaded by `/claude-tweaks:browse`. Full tool reference for the Chrome MCP backend.

## Pre-flight Check

**Before doing anything**, verify Chrome MCP tools are available. Look for tools matching `mcp__claude_in_chrome__*`.

- If available: proceed with the workflow.
- If NOT available: stop and reply to the user: _"Chrome tools are not available. Please restart Claude Code with the `--chrome` flag: `claude --chrome`"_

## Available Tools

```
Navigation:    mcp__claude_in_chrome__navigate(url)
               mcp__claude_in_chrome__go_back()
               mcp__claude_in_chrome__go_forward()

Reading:       mcp__claude_in_chrome__read_page(tabId)         # accessibility tree
               mcp__claude_in_chrome__get_page_text(tabId)     # full page text
               mcp__claude_in_chrome__find(query)              # natural language element finding

Interaction:   mcp__claude_in_chrome__left_click(ref)
               mcp__claude_in_chrome__type(text)
               mcp__claude_in_chrome__form_input(ref, value)

Capture:       mcp__claude_in_chrome__screenshot()
               mcp__claude_in_chrome__gif_creator()

JavaScript:    mcp__claude_in_chrome__javascript_exec(code)

Tabs:          mcp__claude_in_chrome__tab_list()
               mcp__claude_in_chrome__tab_create(url)
               mcp__claude_in_chrome__tab_close(tabId)
               mcp__claude_in_chrome__tab_select(tabId)

Debug:         mcp__claude_in_chrome__read_console_messages(tabId)
               mcp__claude_in_chrome__read_network_requests(tabId)
```

## Workflow

1. Resize the browser window to 1440x900
2. Navigate to the target URL
3. Read the page to get element references: `mcp__claude_in_chrome__read_page(tabId)`
4. Interact using refs from the accessibility tree: `left_click`, `type`, `form_input`
5. Capture results: `mcp__claude_in_chrome__screenshot()`
6. Report results back to the user

## Example

```
# Navigate
mcp__claude_in_chrome__navigate("https://example.com")

# Read the page structure
mcp__claude_in_chrome__read_page(tabId)

# Click an element by ref
mcp__claude_in_chrome__left_click(ref)

# Type into a focused field
mcp__claude_in_chrome__type("search query")

# Take a screenshot
mcp__claude_in_chrome__screenshot()
```

## Limitations

- **No parallel instances.** All Chrome MCP connections share a single Chrome extension controller. Only one task at a time.
- **Observable only.** This uses your real Chrome — there is no headless mode.
- **Requires `--chrome` flag.** Claude Code must be started with `claude --chrome`.
- **No `--filename` on screenshots.** Screenshots are returned inline but cannot be saved to a specific file path.
