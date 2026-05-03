# Frontend Detection — Sniff Rules + Frontmatter Spec

Reference for the wrapper's 3-layer detection logic. Layer 3 (file-extension sniff) is detailed here. Layer 2 reads the `surface:` frontmatter field, which Phase 1 does not write but does read for forward-compat (Phase 2 will write it).

## Layer 3 — File-extension sniff (fallback)

When neither the CLAUDE.md kill-switch nor spec frontmatter resolves the question, fall back to inspecting the changed files directly. Any file matching either a trigger extension or a trigger path pattern marks the diff as "frontend."

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
- **CSS-in-JS via `.ts`** — do not match unless the path contains a trigger segment. This is a known false-negative, accepted in Phase 1 — Phase 2's `surface:` frontmatter is the explicit override.

## Layer 2 — Frontmatter spec (read by wrapper, written by `/specify`)

Spec files in `specs/*.md` may declare two design-related frontmatter fields: `surface:` and `design-intent:`. `/specify` writes both on every new spec. The wrapper reads `surface:` for Layer 2 detection and `design-intent:` for `polish` mode's intent-driven dispatch (active in v4.5.0).

**The canonical definition of these fields lives in the spec template** at `skills/specify/spec-template.md` (see the "Frontmatter reference (canonical spec)" section). Both the wrapper (which reads the fields) and `/specify` (which writes them) reference that single source of truth — do not duplicate the value enumerations across multiple files.

For Layer 2 detection:

| `surface:` value | Wrapper behavior |
|------------------|------------------|
| `frontend` or `mixed` | Detection passes Layer 2 — proceed (Layer 3 sniff still runs to filter file list) |
| `backend` or `infra` | Skip — return `{skipped: "non-frontend spec (surface declared)"}` |
| *(missing)* | Fall through to Layer 3 sniff — pre-Phase-2 specs lack this field |

`design-intent:` is not read in Layer 2 — it gates intent-driven command dispatch in `polish` mode (active in v4.5.0). The full enumeration lives in the spec template's frontmatter reference section.

## Detection precedence summary

```
CLAUDE.md design-integration flag (Layer 1)
    │
    ├─ disabled  → skip (universal)
    ├─ missing   → skip (treat as disabled)
    └─ enabled / plugin-only → continue
                                   │
                                   ▼
            Spec frontmatter surface: (Layer 2, only if spec input)
                                   │
                                   ├─ backend / infra  → skip
                                   ├─ frontend / mixed → continue
                                   └─ missing          → continue (fall through)
                                                          │
                                                          ▼
                                File-extension sniff (Layer 3)
                                                          │
                                                          ├─ no matches → skip
                                                          └─ matches    → proceed to dispatch
```

The earlier a layer can decide, the cheaper the skip. Kill-switch is a single CLAUDE.md read; sniff requires walking the file list.
