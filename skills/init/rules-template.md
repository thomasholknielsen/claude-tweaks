# Phase 7: Rules — Template, Candidates, Update Hint

Loaded by `/init` Phase 7 (Generate / Update Rules). Only create rules for conventions that are **path-specific**. Project-wide conventions belong in CLAUDE.md.

## Rule template

If certain conventions are path-scoped (e.g., "all files in `src/api/` must use the error handler"), generate `.claude/rules/` files:

```markdown
---
paths:
  - src/api/**
---

{Rule content — concise, imperative}
```

## Common rule candidates

- API routes with specific middleware/auth requirements
- Test directories with specific mocking conventions
- Migration directories with specific naming/ordering rules
- Component directories with specific prop/style patterns
- Generated code directories that should not be manually edited

## Update Mode

Check existing rules for stale `paths` globs (directories renamed or restructured). Patch or delete as needed.
