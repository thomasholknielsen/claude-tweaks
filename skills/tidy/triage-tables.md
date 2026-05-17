# Tidy — Triage Tables

Loaded by `/claude-tweaks:tidy` when classifying design docs and briefs (Step 3). Each table describes the classification signal → action mapping. Tidy collects findings silently using these mappings, then surfaces everything in the Step 6 batch report.

---

## Design doc classification (Step 3)

Scan `docs/superpowers/specs/*-design.md`. For each design doc, classify by status and matching specs:

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

Collect each as: `[doc] {filename} — {recommendation}`.

---

## Brief classification (Step 3)

Scan `docs/plans/*-brief.md`. For each brief, classify by matching design doc and specs:

| Status | Recommendation |
|--------|---------------|
| Matching design doc exists | Keep |
| No matching design doc, specs exist | Delete |
| No matching design doc, no specs | Delete |
| Very old (4+ weeks), no design doc | Delete |

Collect each as: `[doc] {filename} — {recommendation}`.
