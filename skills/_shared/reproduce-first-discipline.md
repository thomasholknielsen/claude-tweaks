# Reproduce-First Discipline

Canonical statement of the "reproduce a behavioral bug before fixing it" discipline. Referenced from `/build` (Common Step 5, `failure-recovery.md`), `/test` (Step 3 Fix Mode), and `/review` (Important Notes) — anywhere a **behavioral bug** (code that runs but produces the wrong result, a failing test that reflects a real defect) surfaces and needs a fix, as opposed to a mechanical type/lint error.

Do not edit-and-pray:

1. **Reproduce first.** Invoke `/superpowers:systematic-debugging`. Build a deterministic, runnable pass/fail signal for the bug (a failing test, a one-line repro) *before* touching production code. A failing test or a reproduced QA story is already a reproduction — use it rather than building a new one. Spend disproportionate effort here — with a reliable repro the cause follows; without one, staring at code rarely does.
2. **Fix the confirmed cause**, then re-run the repro to confirm it's gone, and the suite (or the failed checks) to confirm no regression.
3. **Walk the causal chain.** Once the repro is green, apply `_shared/causal-depth.md`'s why-chain to the confirmed cause — ask "why was this possible?" up to 3 times, render the `CAUSAL: terminal | systemic` verdict, and route a `systemic` finding through `_shared/learning-routing.md`.
4. **If you cannot reproduce it, stop and escalate.** State what you tried and ask for what would unblock you (environment access, a captured artifact, permission for temporary instrumentation). Escalation is the correct move, not a failure — do not proceed to guess at a fix without a reproduction loop.

Never loosen an assertion or selector, or otherwise patch the symptom, to make a red check go green without confirming the underlying behavior is correct.
