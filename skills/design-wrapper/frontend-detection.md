# Frontend Detection — Sniff Rules + Body-Metadata Spec

Reference for the wrapper's 3-layer detection logic. Layer 3 (file-extension sniff) is detailed here. Layer 2 reads the record's `Surface:` body-metadata line (lifted into the materialized header — spec 20), which `/specify` writes on every new leaf record today; pre-v4.5 specs predate the field, so an absent value is normal and falls through to Layer 3.

## Layer 3 — File-extension sniff (fallback)

When neither the CLAUDE.md kill-switch nor the record's `Surface:` body-metadata line resolves the question, fall back to inspecting the changed files directly. Any file matching either a trigger extension or a trigger path pattern marks the diff as "frontend."

### Trigger extensions

Files with these extensions are unambiguously frontend:

| Extension | Notes |
|-----------|-------|
| `.tsx` | React/Preact TypeScript components |
| `.jsx` | React/Preact JavaScript components |
| `.vue` | Vue single-file components |
| `.svelte` | Svelte components |
| `.html` | Static markup, server templates |
| `.css` | Stylesheets |
| `.scss` | Sass stylesheets |
| `.sass` | Sass stylesheets (indented syntax) |
| `.less` | Less stylesheets |
| `.astro` | Astro components |
| `.mdx` | Markdown with embedded JSX |

### Trigger path patterns

Files whose path contains any of these segments are treated as frontend regardless of extension (catches `index.ts` route files, server-rendered template `.js`, etc.):

| Path segment | Typical use |
|--------------|-------------|
| `/components/` | Component libraries |
| `/pages/` | Next.js / Nuxt page routes |
| `/app/` | Next.js app-router, SvelteKit `$app` |
| `/routes/` | SvelteKit / Remix / SolidStart routes |
| `/views/` | Vue / Rails view templates |
| `/ui/` | Generic UI directory |

### Match rule

A file matches the frontend predicate if **any** of the following is true:

1. Its extension (lowercase) is in the trigger-extension table above.
2. Its path (forward-slash normalized) contains any segment from the trigger-path table above as a directory boundary (i.e., surrounded by `/` or at start/end with `/`).

If at least one file in the target list matches, the diff is frontend → proceed. If zero match, return `{skipped: "non-frontend (sniff)"}`.

### Negative cases (must not match)

- `.ts` and `.js` files outside any trigger path — these are typically server, lib, or utility code
- `.md` files (documentation) — no UI rendering
- `.json`, `.yaml`, `.toml` — config files, not UI
- `.py`, `.rb`, `.go`, `.rs`, `.java`, etc. — server-side languages
- `.sql` — database schema/migrations
- `Dockerfile`, `Makefile`, etc. — infrastructure

A backend project that touches only `.ts`/`.js` files outside `/components/`, `/pages/`, etc. correctly returns the skip — this is the dominant case for false-positive avoidance.

### Edge cases

- **Storybook files** (`.stories.tsx`, `.stories.ts`) — the `.tsx` matches; `.ts` only matches if path contains a trigger segment. Both are correct treatment (frontend if component-adjacent).
- **Test files** (`.test.tsx`, `.spec.tsx`) — match via `.tsx` extension. This is correct — test files describe UI behavior.
- **Type-only files** (`.d.ts`) — do not match. Correct — they don't render.
- **CSS-in-JS via `.ts`** — do not match unless the path contains a trigger segment. This is a known false-negative; the record's `Surface:` body-metadata line is the explicit override.

## Layer 2 — Body-metadata lines (read by wrapper via the materialized header — spec 20; written by `/specify`)

Every leaf record may declare two design-related body-metadata lines: `Surface:` and `Design-intent:`. `/specify` writes both on every new leaf record. The wrapper reads `Surface:` for Layer 2 detection and `Design-intent:` for `polish` mode's intent-driven dispatch — both lifted into the materialized header at build time (spec 20's contract).

**The canonical definition of these fields lives in the spec template** at `skills/specify/spec-template.md` (see the body-metadata block description near the top of the fenced template). Both the wrapper (which reads the fields) and `/specify` (which writes them) reference that single source of truth — do not duplicate the value enumerations across multiple files.

For Layer 2 detection, see `Surface:` values in `skills/specify/spec-template.md` (canonical source). Wrapper behavior: `web`, `mobile`, or `desktop` → pass Layer 2 (Layer 3 sniff still runs to filter the file list; legacy `frontend` reads as `web`); `backend` or `infra` → skip with `{skipped: "non-frontend spec (surface declared)"}`; missing → fall through to Layer 3 sniff.

`Design-intent:` is not read in Layer 2 — it gates intent-driven command dispatch in `polish` mode. See the spec template's body-metadata block description for its enumeration.

## Detection precedence summary

```
CLAUDE.md design-integration flag (Layer 1)
    │
    ├─ disabled  → skip (universal)
    ├─ missing   → skip (treat as disabled)
    └─ enabled / plugin-only → continue
                                   │
                                   ▼
            Surface: body-metadata line (Layer 2, only if spec input)
                                   │
                                   ├─ backend / infra        → skip
                                   ├─ web / mobile / desktop → continue
                                   └─ missing                → continue (fall through)
                                                          │
                                                          ▼
                                File-extension sniff (Layer 3)
                                                          │
                                                          ├─ no matches → skip
                                                          └─ matches    → proceed to dispatch
```

The earlier a layer can decide, the cheaper the skip. Kill-switch is a single CLAUDE.md read; sniff requires walking the file list.
