# Tidy — Step 6 Interactive Mode

Step 6's interactive branch; `step-6-auto.md` is its twin. `SKILL.md` resolves `--dry-run` before
reading either — under it, "Apply all" logs would-be entries instead of executing Step 7.

Present all collected findings as a single report. Every item has a pre-filled recommendation from the scanning steps.

```markdown
## Tidy Report — {date}

**Applied automatically**
- {what was done}: #{N} "{title}" — {one-line outcome} ({reversibility: commit {hash} | reconcile-converged})
- …

**Approve ({N})**
1. [{tag}] #{N} "{title}" — {recommended action, one line}. Apply-all executes:
   `{the exact command or mutation}`
2. …

**Yours ({N})**
- #{N} "{title}" — {why it needs the human}
  `{paste-ready command}`
- …

**Clean:** {comma list of scans with nothing to report, each with its count}
```

Section semantics follow `step-6-auto.md`'s Bucket mapping and are bound by its "Report rules" section (stated once there — not restated here): in interactive mode, **Applied automatically** carries only what already executed without a decision (reconcile-converged outcomes only); every active recommendation from the scans (delete, defer, absorb, promote, sync, fix, close, resolve, capture, open parent gate — every mutating entry in `SKILL.md`'s Action Vocabulary table) renders as a numbered row (1..N) in **Approve ({N})**, which is the set "Apply all" applies; findings that only a human can act on (needs-scoring, re-triage, acceptance gaps, trigger-met parked records, unsettled runs, ungranted PRs, cross-spec patterns, design-record drift) render in **Yours ({N})** with their paste-ready command; Keep rows and clean scans are counted in **Clean:** — kept visible as counts, never itemized rows.

Immediately after presenting the report above, call `AskUserQuestion`:

- `question`: `"How do you want to handle these tidy actions?"`, `header`: `"Tidy actions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply every item in the Approve ({N}) section above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which Approve #s to change"`

**Hard gate.** Check the response you are about to send: does it already contain the `## Tidy Report` block above as literal rendered markdown, with every non-empty section — **Applied automatically**, **Approve ({N})**, **Yours ({N})** — and the **Clean:** line? If not, this is not "the report was presented earlier" or "the user can infer the items from the summary" — render it now, in this response, before the tool call. `AskUserQuestion` cannot carry the report itself (`docs/skill-authoring.md`'s Multi-item decisions convention), so a response with the tool call but no report above it has shown the user "Apply all" with nothing to apply it to.

If "Override specific items" is chosen, the follow-up (#s and target values) is ordinary free-text conversation in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's built-in `Other` field.

Only items in **Approve ({N})** are executed — every mutating entry in `SKILL.md`'s Action Vocabulary table, not a fixed subset of it. **Yours ({N})** and **Clean:** items require no mutation and are never touched by "Apply all".

