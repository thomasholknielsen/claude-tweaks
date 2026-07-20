# Stories — Migration Procedures

Loaded by `/claude-tweaks:stories` when it detects legacy v1 stories OR a legacy `auth.yml` file. Detection logic stays in `SKILL.md`; the procedural detail lives here so it only loads when needed.

## v1 → v2 migration

Triggered when `/stories` reads a YAML file lacking `schema_version: 2` at the top.

**Auto mode:** auto-skip migration. Stage as a Review Console item — never regenerate stories autonomously (a migration changes test assertions, which is high-stakes). Log:

```
STAGED {time} — Step 1: legacy v1 stories detected ({N} files). Stage path: staged/stories-legacy-migration.md.
```

The staged file lists the v1 stories with the proposed migration command: `/claude-tweaks:stories migrate`. Surface at Review Console. Stories continue to run as-is for the rest of the pipeline (best-effort; v1 selectors may fail in QA).

**Interactive mode:** present:

> v1 stories detected (N stories, CSS selectors). claude-tweaks now uses semantic locators (role/text/testid). Regenerate?
>
> 1. Regenerate all (preserves story names, descriptions, intent — re-derives locators from live DOM) **(Recommended)**
> 2. Show me the changes first
> 3. Cancel

- **Choice 1:** invoke the standard `/stories <url>` flow with each existing story's `id`, `name`/`description`, `journey`, `priority`, `tags`, and `source_files` passed as scaffolding so the AI preserves intent and only replaces locators. The browse-exploration step (Step 2) and source analysis (Step 1.5) run normally; locator selection in Step 3 reads the new accessibility-tree snapshot via `agent-browser snapshot -i -c` instead of capturing CSS selectors.
- **Choice 2:** dump a per-story diff for review (one row per step):
  ```
  Story 'checkout-flow' — 3 step(s) need migration
  | Step | Old (v1 CSS)              | Inferred semantic locator (v2)         |
  |------|---------------------------|----------------------------------------|
  | 1    | button#add-to-cart        | { role: button, name: "Add to cart" } |
  | 2    | input[name=email]         | { testid: "email-input" }              |
  | 3    | .confirmation-message     | { text: "Order confirmed" }            |
  ```
  After review, prompt: "Proceed with regeneration? 1. Yes (Recommended)  2. Cancel". Inference uses the live DOM snapshot; if the old selector cannot be confidently mapped, the row shows `(needs manual review)` and that story is tagged `needs-review` after regeneration.
- **Choice 3:** stop. Stories stay in v1 and are not used by the rest of the workflow.

After regeneration, write `schema_version: 2` at the top of every regenerated YAML file.

## Legacy `auth.yml` → split (auth.yml credentials + servers.yml URLs)

Triggered when `{OUTPUT_DIR}/auth.yml` exists from a v3 install during Step 2's Auth Resolution.

Present:

> Legacy `{OUTPUT_DIR}/auth.yml` detected ({N} profile(s)). claude-tweaks now stores credentials in the Auth Vault. Migrate?
>
> 1. Print the `agent-browser auth set` commands for me to run, one per profile **(Recommended)**
> 2. Keep `auth.yml` for now (stories will continue using profile references — supported but deprecated)
> 3. Delete `auth.yml` (only safe after vault entries exist)

On choice 1, print commands like:

```
agent-browser auth set default <username-from-default-profile> <password-from-default-profile>
agent-browser auth set admin <username-from-admin-profile> <password-from-admin-profile>
```

The LLM does not run these — the user runs them in their own shell so credentials never traverse the conversation. After the user confirms, generated stories use `auth: { vault: "<name>" }` instead of `setup.auth: <profile>`.

The `dev-url-detection.md` procedure in `skills/_shared/` still tracks server config (url, detected date, start_command). When a dev URL is resolved, persist it under `{OUTPUT_DIR}/servers.yml` (servers-only file, no credentials) — this file is safe to commit and shared between runs.
