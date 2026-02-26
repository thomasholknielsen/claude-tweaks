# Dev URL Detection

Shared procedure for auto-detecting a running development server. Referenced by `/claude-tweaks:stories`, `/claude-tweaks:test`, and `/claude-tweaks:flow`.

## When This Runs

- `/claude-tweaks:stories` is invoked without a URL argument
- `/claude-tweaks:test` runs QA story validation and needs a dev server
- `/claude-tweaks:flow` triggers automatic story generation after detecting UI changes

## Procedure

### Step 1: Probe Common Ports

> **Parallel execution:** Use parallel tool calls — all port checks are independent operations.

Check these ports for a running HTTP server:

| Port | Common framework |
|------|-----------------|
| 3000 | Next.js, Create React App, Express |
| 3001 | Next.js (alternate), Remix |
| 5173 | Vite |
| 8080 | Vue CLI, webpack-dev-server |
| 4200 | Angular CLI |
| 8000 | Django, FastAPI, custom |

For each port, run a lightweight HTTP check:

```bash
node -e "require('http').get('http://localhost:{PORT}', r => { console.log(r.statusCode); r.resume() }).on('error', () => { process.exit(1) })"
```

Collect all ports that respond with a 2xx or 3xx status code.

### Step 2: Check Project Configuration

If no ports responded (or to validate the best match), check project configuration:

1. **CLAUDE.md Commands section** — look for a dev server command (e.g., `npm run dev`, `yarn dev`, `pnpm dev`). Extract the port if specified.
2. **package.json scripts** — read `scripts.dev`, `scripts.start`, `scripts.serve` for port configuration.
3. **Framework config files** — check for port settings in:
   - `vite.config.*` (`server.port`)
   - `next.config.*` (port in dev script)
   - `angular.json` (`serve.options.port`)
   - `vue.config.*` (`devServer.port`)
   - `.env` or `.env.local` (`PORT=`)

### Step 3: Resolve

| Scenario | Action |
|----------|--------|
| **One port responding** | Use it. Set `APP_URL = http://localhost:{port}`. |
| **Multiple ports responding** | Prefer the port matching the project's framework config. If ambiguous, use the first responding port and note the alternatives. |
| **No port responding + dev command known** | Offer to start the server: "No dev server detected. Start with `{command}`?" Set `SERVER_STARTED = true` if the user agrees. Wait for the server to be reachable before proceeding. |
| **No port responding + no dev command** | Ask the user: "No running dev server detected. Enter the URL or start your dev server and re-run." |

### Output

This procedure sets two variables for the calling skill:

| Variable | Value |
|----------|-------|
| `APP_URL` | The detected or user-provided URL (e.g., `http://localhost:3000`) |
| `SERVER_STARTED` | `true` if this procedure started the server, `false` otherwise |

### Cleanup

If `SERVER_STARTED = true`, the calling skill is responsible for noting this — the server was started for automation purposes and the user may want to stop it after the pipeline completes.
