---
files:
  - .github/workflows/test.yml
---

# CI Test Gate on Push and Pull Request

**Persona:** claude-tweaks maintainer or Claude session pushing to `main` (~20 pushes/day measured) or opening a pull request.
**Goal:** Every push to `main` and every PR runs the full `npm test` suite automatically, so a red suite is visible on the commit/PR instead of depending on someone remembering to run it locally.
**Entry point:** `git push origin main`, or opening/updating a pull request.
**Success state:** A `test` check appears on the commit or PR and goes green; a failing suite shows the check red with the failing assertions in the run log.

## Steps

### 1. Push or open a PR — terminal
- **Action:** Push to `main` (directly or via a release), or open a pull request against it.
- **Expect:** The `test` workflow starts within seconds. A superseded run on the same ref is cancelled automatically (`concurrency` group) rather than queueing behind it.

### 2. Read the check — GitHub UI or `gh run list --workflow test`
- **Action:** Open the commit/PR checks panel (or `gh run watch`).
- **Expect:** One job, Node 20, no install step (the plugin ships zero npm dependencies — `node --test` is built in). Green in a few minutes; `timeout-minutes: 15` kills a hung run.

### 3. If it's red — read the log, don't rerun blindly
- **Action:** Open the failing step's log; the `node --test` TAP output names the failing assertion and file.
- **Expect:** A genuine failure reproduces locally with `npm test`. A failure that passes locally and only flaps under load is the #104 class — surface it on that issue rather than retrying until green, so the gate stays trustworthy.
