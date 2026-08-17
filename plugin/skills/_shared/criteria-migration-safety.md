# Criteria: Data / Migration Safety

Shared, criteria-only fragment — what to flag in database-backed areas for migration correctness and rollback safety. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s migration-safety judgment lens (data areas). Confidence floor: `high` — data defects can be irreversible; only file concrete findings.

## What to flag

- **Non-idempotent migrations:** a migration that will fail or corrupt data when re-run (no `IF NOT EXISTS`, `IF EXISTS`, or equivalent guard on DDL statements).
- **Lock-heavy operations on large tables:** `ALTER TABLE` adding a `NOT NULL` column without a default on a table estimated to be large, or a `CREATE INDEX` without `CONCURRENTLY` on a live table — these lock the table and cause downtime.
- **No rollback path:** a destructive migration (DROP COLUMN, DROP TABLE, rename) with no corresponding down-migration and no data backup strategy documented.
- **Raw SQL with user-supplied values:** a query built by string concatenation or template literal with values from application input, not parameterized via the ORM or query builder.
- **Missing foreign-key constraints on newly added columns:** a column that references another table but has no FK constraint, allowing orphaned rows to accumulate silently.
- **Data backfill in the migration itself without batching:** a migration that updates all rows in a large table in a single transaction (risk of lock timeout and a multi-minute downtime on the migration apply).

## What NOT to flag

- Schema changes on tables that are empty or trivially small in production.
- Missing indexes that are already covered by `_shared/criteria-scalability.md` (the scalability criterion).
- Stylistic SQL formatting issues.

## Severity calibration

- **high** — a migration that can corrupt existing data or cause irreversible loss (e.g., `DROP COLUMN` without confirming the column is no longer read by live code), that will cause downtime on a large table, or that is non-idempotent and will fail on a retry.
- **medium** — a missing rollback path or a missing FK constraint.
- **low** — a minor best-practice gap (inline comment missing, non-standard migration filename).
