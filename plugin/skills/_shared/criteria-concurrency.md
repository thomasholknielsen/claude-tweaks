# Criteria: Concurrency Safety

Shared, criteria-only fragment — what to flag for concurrency defects in async code and shared-state areas. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s concurrency judgment lens (backend, cli, and data areas with shared mutable state or async operations).

## What to flag

- **Race on shared mutable state:** multiple async operations or event handlers mutating the same object or variable without synchronization, where the order of mutation affects correctness (e.g., incrementing a counter with `+=` across concurrent requests, mutating a module-level cache without a lock).
- **Promise/async correctness defects:** `await` inside a `.forEach()` or `.map()` without wrapping in `Promise.all`, causing sequential execution when concurrent is required — or vice versa, unbounded `Promise.all` over a large array that overwhelms a downstream service.
- **Missing transaction isolation:** multiple database writes that must be atomic, issued outside a transaction, where a partial failure leaves the database in an inconsistent state.
- **Lock acquisition without release on error path:** a mutex, semaphore, or database advisory lock acquired in a try block but released only in the happy path — an exception bypasses the release, causing a deadlock for the next caller.
- **Double-check locking done wrong:** a pattern that checks a condition, then re-checks inside a lock, but the first check reads shared state without holding the lock, making the pattern racy in async runtimes.
- **Unbounded concurrency with a shared resource cap:** spawning a new database connection, thread, or worker per incoming request without a pool or concurrency limit.

## What NOT to flag

- Concurrency concerns in purely sequential, single-threaded code paths (Node.js synchronous event-loop code with no async boundaries).
- Race conditions in tests that are explicitly designed to be run sequentially.
- Theoretical races that cannot manifest given the language's memory model (e.g., in single-threaded event-loop languages, non-async mutations are already serialized).

## Severity calibration

- **high** — a race on financial data, authentication state, or access-control decisions; or a race that can cause data loss or silent corruption in a high-traffic path.
- **medium** — an async-correctness defect (missing `await`, unbounded Promise.all) that causes incorrect behavior under realistic load.
- **low** — a pattern that is technically racy but harmless at current scale (e.g., a counter that can drift by one under concurrent load with no downstream consequence).
