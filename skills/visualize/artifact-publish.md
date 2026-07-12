# Artifact Publish Adapter

Used by `/claude-tweaks:visualize` Step 6 when the user accepts the "publish as a shareable Artifact link" offer.

## Step 1: Derive the Artifact fragment

Reuse the exact core fragment from `SKILL.md` Step 3 (or `d2-enhanced-path.md` Step 3/4 for the enhanced path) — do not regenerate. Wrap it per `visual-html-output.md` Step 4's Artifact row: `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags.

## Step 2: Write to the stable sidecar path

Write the fragment to `{same-directory-as-main-file}/{slug}.artifact.html` — e.g. if the main diagram is `docs/journeys/checkout-flow-swimlane.html`, the sidecar is `docs/journeys/checkout-flow-swimlane.artifact.html`. This path must stay stable across regenerations of the same diagram, since the `Artifact` tool only republishes to the same URL when called again with the same `file_path`.

## Step 3: Pick the favicon

| Type | Favicon | Type | Favicon |
|---|---|---|---|
| `architecture` | 🏛️ | `state` | 🔁 |
| `flowchart` | 🔀 | `er` | 🗄️ |
| `sequence` | ↔️ | `timeline` | ⏱️ |
| `swimlane` | 🏊 | `quadrant` | 📐 |
| `tree` | 🌳 | `layers` | 🧱 |
| `org-chart` | 🏢 | `nested` | 🎯 |
| `venn` | ⭕ | `pyramid` | 🔺 |

This lookup is fixed — the `Artifact` tool requires the favicon to stay stable across redeploys of the same artifact, so never pick a new one on a re-publish of the same diagram.

## Step 4: Call the Artifact tool

```
Artifact({
  file_path: "{sidecar path from Step 2}",
  description: "{Diagram type} diagram: {topic}",
  favicon: "{favicon from Step 3}"
})
```

## Step 5: Log if inside a pipeline

When `$PIPELINE_RUN_DIR` is set, append to `$PIPELINE_RUN_DIR/decisions.md`:

```
STAGED {HH:MM:SS} — artifact-publish: published {slug} as a shareable Artifact. Reversibility: high.
```

This is `STAGED`, not `AUTO` — the user explicitly accepted the offer in `SKILL.md` Step 6; this line documents that an already-user-approved action happened, it isn't logging a silent auto-decision.
