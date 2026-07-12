# Artifact Publish Adapter

Used by `/claude-tweaks:visualize` Step 6 when the user accepts the "publish as a shareable Artifact link" offer.

## Step 1: Derive the Artifact fragment

Reuse the exact core fragment from `SKILL.md` Step 4 (or `d2-enhanced-path.md` Step 3/4 for the enhanced path) — do not regenerate. Wrap it per `visual-html-output.md` Step 4's Artifact row: `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags.

## Step 2: Recover any prior URL, then write to the stable sidecar path

The sidecar path is `{same-directory-as-main-file}/{slug}.artifact.html` — e.g. if the main diagram is `docs/journeys/checkout-flow-swimlane.html`, the sidecar is `docs/journeys/checkout-flow-swimlane.artifact.html`. This path must stay stable across regenerations of the same diagram.

Stable `file_path` alone is not enough to update an existing Artifact across sessions: the `Artifact` tool only treats a call as an update to a prior publish when that prior publish happened in the *same* conversation. A future session (e.g. the user regenerating this diagram next week) has no memory of the URL, so **before writing anything**, check whether the sidecar file already exists from a prior publish:

- If it exists, read its first line. If that line is an HTML comment of the form `<!-- artifact-url: {url} -->`, extract `{url}` — this is the URL returned by the last successful publish, possibly in an earlier session.
- If the file doesn't exist yet, or its first line isn't that comment, there is no prior URL to recover — this is effectively a first publish.

Carry whatever URL (or absence of one) forward into Step 4.

Only now, after that check, write the Step 1 fragment to the sidecar path above — this is where the file actually gets written or overwritten, safely after any prior URL has already been read.

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

## Step 4: Call the Artifact tool, then write the returned URL back

- If Step 2 recovered a prior URL, pass it as `url` so the tool updates that existing artifact instead of minting a new one:

```
Artifact({
  file_path: "{sidecar path from Step 2}",
  description: "{Diagram type} diagram: {topic}",
  favicon: "{favicon from Step 3}",
  url: "{prior URL from Step 2}"
})
```

- If Step 2 found no prior URL (first publish for this diagram), omit `url` entirely from the call, same as before:

```
Artifact({
  file_path: "{sidecar path from Step 2}",
  description: "{Diagram type} diagram: {topic}",
  favicon: "{favicon from Step 3}"
})
```

After the call succeeds, it returns the artifact's URL. Write (or overwrite) a `<!-- artifact-url: {returned URL} -->` comment as the very first line of the sidecar file — whether this was the first publish or an update — so the next publish of this diagram, in this session or a future one, can find it in Step 2.

## Step 5: Log if inside a pipeline

When `$PIPELINE_RUN_DIR` is set, append to `$PIPELINE_RUN_DIR/decisions.md`:

```
STAGED {HH:MM:SS} — artifact-publish: published {slug} as a shareable Artifact. Reversibility: high.
```

This is `STAGED`, not `AUTO` — the user explicitly accepted the offer in `SKILL.md` Step 6; this line documents that an already-user-approved action happened, it isn't logging a silent auto-decision.
