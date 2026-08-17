# Criteria: Scalability

Shared, criteria-only fragment — structural patterns that will constrain scale before performance bottlenecks become visible. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s scalability judgment lens. Confidence floor: `high` — flag only clear, structural scale-limiting patterns backed by a concrete growth model, not speculative "this could be slow" concerns.

## What to flag

- **Unbounded queries:** a database query with no LIMIT clause on a table that grows with user data, or a pagination scheme that fetches all rows and slices in memory.
- **Synchronous fan-out in a hot path:** a request handler that makes N sequential external calls where N is proportional to input size or data size (N+1 query pattern, sequential API calls in a loop).
- **Global in-process state used for coordination:** a module-level cache, counter, or lock that works correctly with one instance but breaks under horizontal scaling.
- **Polling where push/stream is available:** a tight polling loop on an external resource when the provider offers webhooks or streaming.
- **Missing index signals:** a query filter on a column with no index, called on a table expected to reach millions of rows (flag only when the missing index is evident from the schema and the query, not speculatively).

## What NOT to flag

- Speculative scale concerns without a growth model ("this could be slow at 10M rows" with no evidence the table will reach that size).
- Micro-optimizations (avoid `Array.concat` in a loop) that do not change the algorithmic complexity class.
- Performance issues already bounded by a fixed dataset that cannot grow.

## Severity calibration

- **high** — an unbounded query or N+1 on a path that is already serving significant load, or will as soon as the feature ships.
- **medium** — a structural pattern (global state, polling) that will require an architectural change to fix once load increases; better to address now.
- **low** — a missing index on a table currently small; flag when the schema suggests it will grow.
