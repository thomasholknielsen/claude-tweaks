# Core Bootstrap Version Check (detailed procedure)

Runs before Step 1, on every `/init` invocation regardless of scope — **except** when
`$ARGUMENTS` explicitly names the `bootstrap` Phase scope, which always runs Steps 1-8 fully
regardless of the marker (see the Exception in `SKILL.md`'s "Core Bootstrap Version Check").

**Read the marker and extract its version:**

```bash
MARKER_RAW=$(cat .claude-tweaks/init-state.yml 2>/dev/null)
if [ -z "$MARKER_RAW" ]; then
  MARKER_VERSION=""
else
  MARKER_VERSION=$(echo "$MARKER_RAW" | grep -E '^[[:space:]]*plugin-version:' | sed -E 's/.*plugin-version:[[:space:]]*//; s/"//g')
fi
```

`init-state.yml` only ever has one top-level key (`core-bootstrap`) with two flat children
(`plugin-version`, `verified`), each written double-quoted (see "Write the marker" below) — the
`sed` above strips those quotes, since `compareVersions` rejects a quoted string as invalid
semver. Treat an empty `$MARKER_VERSION` (file missing, or present but malformed enough that
the grep finds no `plugin-version:` line) identically: as if the marker were absent.

**Read the installed version:**

```bash
INSTALLED_VERSION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/.claude-plugin/plugin.json').version)")
```

**Compare (only when `$MARKER_VERSION` is non-empty):**

```bash
node -e "
  const { compareVersions } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  console.log(compareVersions(process.argv[1], process.argv[2]));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Prints `-1` (marker older than installed), `0` (match), or `1` (marker newer — shouldn't happen
in practice, treat identically to a match). If `compareVersions` throws (e.g. `$MARKER_VERSION`
extracted to something that still isn't valid semver), treat it the same as marker-missing —
run Steps 1-8 fully, skip the changelog notice.

- `$MARKER_VERSION` empty (missing or malformed) → run Steps 1-8 fully, skip the changelog notice.
- Result `0` or `1` → skip Steps 1-8 (except under the `bootstrap`-scope Exception above, which always runs them); print `"Core bootstrap already verified at v$MARKER_VERSION on {verified date from the marker} — skipping Steps 1-8. Delete .claude-tweaks/init-state.yml to force a full re-check."`
- Result `-1` → run Steps 1-8 fully, then run the changelog notice below.

**Changelog notice:**

```bash
node -e "
  const fs = require('fs');
  const { extractChangelogRange } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  const changelog = fs.readFileSync(process.env.CLAUDE_PLUGIN_ROOT + '/CHANGELOG.md', 'utf8');
  console.log(JSON.stringify(extractChangelogRange(changelog, process.argv[1], process.argv[2])));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Read the returned `{version, title, body}` entries — in the same newest-first order they
appear in `CHANGELOG.md` — and synthesize the filtered summary described in `SKILL.md`'s "Core
Bootstrap Version Check" section.

**Write the marker:**

```bash
mkdir -p .claude-tweaks
cat > .claude-tweaks/init-state.yml <<EOF
core-bootstrap:
  plugin-version: "$INSTALLED_VERSION"
  verified: "$(date -u +%Y-%m-%d)"
EOF
```

Write this only after Steps 1-8 have actually run (or been skipped) above — not before.
`init-state.yml` only ever has this one key today — a full overwrite is safe. If a future
change adds other top-level keys to this file, switch to a merge instead of an overwrite.
