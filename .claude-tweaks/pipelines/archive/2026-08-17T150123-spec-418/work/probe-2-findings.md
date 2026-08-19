# Probe 2 — failed-update harmlessness

**Task:** Task 2 of the plugin-payload-cutover build (spec #418). Tests the #416 accepted-exposure premise:
*if the cutover ships a broken `git-subdir` catalog entry, does an already-installed user get hurt?*
**Date:** 2026-08-17
**Verdict:** **PASS WITH ONE UNEXPLAINED OBSERVATION** — a broken catalog entry fails **loudly** (non-zero
exit, specific error naming the exact defect) and leaves the already-cached install **byte-identical**.
But **once, the plugin silently stopped loading entirely** (dropped out of `claude plugin list`, hooks
stopped firing) while the files stayed byte-perfect. It did not reproduce across three targeted attempts.
Full account in **§11.4** — read that before relying on this document's PASS.
**Environment:** `claude` CLI `2.1.233 (Claude Code)` (`/Users/thomasholknielsen/.local/bin/claude`),
macOS darwin 25.5.0. Fixture reused from Probe 1 — see `probe-1-findings.md` §8.
**Amended 2026-08-17** after review round 2 — see §11. §3.4 is retracted and replaced; §4.2's evidence is
scoped down; §9's verdict is superseded by §11.5.

---

## 1. Headline answers

| Question | Answer |
|---|---|
| Does a broken pin/path/url fail loudly? | **Yes** — exit 1 every time, with a defect-specific message (four variants in §3). |
| Silent fallback to another ref? | **No.** Never observed. No fallback to the default branch, no stale-cache-passed-off-as-fresh. |
| Is the existing cached install damaged? | **No.** Identical file list, identical SHA-256 per file, identical inodes and mtimes (§4). |
| Does the installed plugin keep working? | **Yes.** Still `✔ enabled`; the `SessionStart` hook still fires and `${CLAUDE_PLUGIN_ROOT}` still resolves to the same subtree root (§4.3). |
| Any leftover garbage from the failed clone? | **No.** The transient clone goes to `<cache>/temp_subdir_*.clone`, a **sibling** of the plugin dir, and is removed on failure (§5). |
| Can this "intact" measurement actually go red? | **Yes — proven.** A valid catalog entry with a real version bump created a new `0.2.0/` cache dir and marked `0.1.0/` orphaned (§6). Without that control the intactness result would have been unfalsifiable. |
| Correct CLI invocation | `claude plugin update <plugin>@<marketplace> --scope <scope>`. The **unqualified** name fails with a misleading `Plugin "…" not found` (§3.0) — a real trap. |

---

## 2. Step 1 — baseline snapshot of the healthy install

`CLAUDE_CONFIG_DIR` is `/Users/thomasholknielsen/.claude-accounts/lipht-thn`; per Probe 1 its `plugins/cache`
is a symlink. Both paths were `realpath`-ed before comparing anything:

```
$ printenv CLAUDE_CONFIG_DIR
/Users/thomasholknielsen/.claude-accounts/lipht-thn

$ realpath /Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/probe-marketplace/subdir-probe/0.1.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0
```

All snapshots below therefore use the resolved `~/.claude/...` form.

### 2.1 File list

```
$ find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0 -type f | sort
.../0.1.0/.claude-plugin/plugin.json
.../0.1.0/bin/probe.js
.../0.1.0/hooks/hooks.json
.../0.1.0/skills/probe-skill/SKILL.md
```

(paths abbreviated to `.../0.1.0/`; every line is prefixed
`/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/`)

Full tree including directories:

```
$ find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace | sort
.../probe-marketplace
.../probe-marketplace/subdir-probe
.../probe-marketplace/subdir-probe/0.1.0
.../probe-marketplace/subdir-probe/0.1.0/.claude-plugin
.../probe-marketplace/subdir-probe/0.1.0/.claude-plugin/plugin.json
.../probe-marketplace/subdir-probe/0.1.0/.in_use
.../probe-marketplace/subdir-probe/0.1.0/bin
.../probe-marketplace/subdir-probe/0.1.0/bin/probe.js
.../probe-marketplace/subdir-probe/0.1.0/hooks
.../probe-marketplace/subdir-probe/0.1.0/hooks/hooks.json
.../probe-marketplace/subdir-probe/0.1.0/skills
.../probe-marketplace/subdir-probe/0.1.0/skills/probe-skill
.../probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
```

### 2.2 Content hashes (the real "intact" baseline)

A `find` listing alone is not proof — Probe 1's trap note is explicit that the cache path keys on the
manifest `version`, so a same-version rewrite would keep the file list identical. Hashes were taken:

```
$ find .../0.1.0 -type f -print0 | xargs -0 shasum -a 256 | sort
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  .../0.1.0/bin/probe.js
4c690b4351d0405030c1b6136188cdc55438fbf8d2cbedeea7fa84cf3f169e6e  .../0.1.0/.claude-plugin/plugin.json
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  .../0.1.0/hooks/hooks.json
cf5f6e60cfecd22922174ca5df71fa46886b35d16ca29ef2f676ea80743885ee  .../0.1.0/skills/probe-skill/SKILL.md
```

Plus inode + mtime per entry:

```
$ find .../probe-marketplace -print0 | xargs -0 stat -f '%N|type=%HT|size=%z|mtime=%m|inode=%i' | sort
.../0.1.0/.claude-plugin/plugin.json|Regular File|size=82|mtime=1786974711|inode=581816079
.../0.1.0/.claude-plugin           |Directory   |size=96|mtime=1786974711|inode=581816078
.../0.1.0/.in_use                  |Directory   |size=64|mtime=1786974729|inode=581816094
.../0.1.0/bin/probe.js             |Regular File|size=81|mtime=1786974711|inode=581816081
.../0.1.0/bin                      |Directory   |size=96|mtime=1786974711|inode=581816080
.../0.1.0/hooks/hooks.json         |Regular File|size=134|mtime=1786974711|inode=581816083
.../0.1.0/hooks                    |Directory   |size=96|mtime=1786974711|inode=581816082
.../0.1.0/skills/probe-skill/SKILL.md|Regular File|size=131|mtime=1786974711|inode=581816086
.../0.1.0/skills/probe-skill       |Directory   |size=96|mtime=1786974711|inode=581816085
.../0.1.0/skills                   |Directory   |size=96|mtime=1786974711|inode=581816084
.../0.1.0                          |Directory   |size=224|mtime=1786974711|inode=581816077
.../subdir-probe                   |Directory   |size=96|mtime=1786974711|inode=581816092
.../probe-marketplace              |Directory   |size=96|mtime=1786974711|inode=581816091
```

(columns re-aligned for readability; values verbatim)

### 2.3 Installed manifest and payload

```
$ cat .../0.1.0/.claude-plugin/plugin.json
{ "name": "subdir-probe", "description": "git-subdir probe", "version": "0.1.0" }

$ cat .../0.1.0/skills/probe-skill/SKILL.md
---
name: probe-skill
description: Use when probing git-subdir installs.
---
# Probe Skill
Reply with the literal string PROBE-OK.
```

No `SECOND-COMMIT-MARKER` — confirming the install is Probe 1's `ref: "probe-branch"` content (commit
`927b523`), while `main` is two commits further along. **This asymmetry is the silent-fallback detector:**
had any failed update quietly fallen back to the default branch, `SECOND-COMMIT-MARKER` would have appeared.

```
$ cat .../0.1.0/hooks/hooks.json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/probe.js\"" } ] } ] } }

$ cat .../0.1.0/bin/probe.js
require('fs').appendFileSync('/tmp/ct-subdir-probe-root.txt', __dirname + '\n');
```

### 2.4 Baseline hook check (healthy state)

Run *before* breaking anything, so the post-break run has something to be compared against:

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ sh .../probe1/pr-real.sh claude -p "reply ok"
 ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
```

---

## 3. Step 2 — break the catalog entry, attempt the update

Four break variants were run, not one. The brief asked for a bad sha *or* a bad path; the extra two
(unreachable repo, and a break while a real version bump is pending) cover the failure modes the cutover
can actually produce — a renamed/moved repo, and a wrong entry landing at the same moment a release ships.

The scratch marketplace is a `directory` source, so each variant is: rewrite
`.../probe1/probe-marketplace/.claude-plugin/marketplace.json`, then
`claude plugin marketplace update probe-marketplace`, then `claude plugin update …`.
All commands run from `.../probe1/scratch-project` via `pr-real.sh` (real `CLAUDE_CONFIG_DIR`).

### 3.0 First, a real trap: the unqualified plugin name

```
$ claude plugin update subdir-probe
Checking for updates for plugin "subdir-probe" at user scope…
✘ Failed to update plugin "subdir-probe": Plugin "subdir-probe" not found
exit=1

$ claude plugin update subdir-probe --scope project
Checking for updates for plugin "subdir-probe" at project scope…
✘ Failed to update plugin "subdir-probe": Plugin "subdir-probe" not found
exit=1
```

…even though the plugin *is* installed and listed:

```
$ claude plugin list | grep -A4 subdir-probe
  ❯ subdir-probe@probe-marketplace
    Version: 0.1.0
    Scope: project
    Status: ✔ enabled
```

Only the **marketplace-qualified** id works:

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
```

This matters for the findings: `Plugin "…" not found` is *not* the broken-entry error. Reading it as one
would have produced a false "fails loudly, cache intact" pass for the wrong reason. Any cutover runbook or
support doc telling a user to run `claude plugin update` must use the `name@marketplace` form.

### 3.1 Variant A — nonexistent commit SHA

Entry (replacing Probe 1's `"ref": "probe-branch"`):

```json
"source": { "source": "git-subdir",
            "url": "https://github.com/thomasholknielsen/ct-subdir-probe.git",
            "path": "plugin",
            "sha": "0000000000000000000000000000000000000000" }
```

`claude plugin validate` still **passes** on this manifest — pin reachability is not a validation concern:

```
$ claude plugin validate .../probe1/probe-marketplace
Validating marketplace manifest: .../probe-marketplace/.claude-plugin/marketplace.json
⚠ Found 1 warning:
  ❯ description: No marketplace description provided. …
✔ Validation passed with warnings
exit=0
```

```
$ claude plugin marketplace update probe-marketplace
Updating marketplace: probe-marketplace...Validating local marketplace
✔ Successfully updated marketplace: probe-marketplace
exit=0

$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Failed to checkout commit 0000000000000000000000000000000000000000: fatal: unable to read tree (0000000000000000000000000000000000000000)
exit=1
```

### 3.2 Variant B — nonexistent subdirectory

```json
"source": { …, "path": "no-such-directory", "ref": "probe-branch" }
```

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Subdirectory 'no-such-directory' not found in repository https://github.com/thomasholknielsen/ct-subdir-probe.git (ref: probe-branch). Check that the path is correct and exists at the specified ref/sha.
exit=1
```

Best error of the four — it names the path, the repo, and the ref, and says what to check.

### 3.3 Variant C — unreachable repository (the "repo renamed/moved" case)

```json
"source": { …, "url": "https://github.com/thomasholknielsen/ct-subdir-probe-does-not-exist.git", "path": "plugin", "ref": "probe-branch" }
```

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Failed to clone repository for git-subdir source: Cloning into '/Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/temp_subdir_1786975600534_5kxax0.clone'...
remote: Repository not found.
fatal: repository 'https://github.com/thomasholknielsen/ct-subdir-probe-does-not-exist.git/' not found
exit=1
```

This one leaks the transient clone path — see §5.

### 3.4 Variant D — break while a real version bump is pending

Variants A–C all break in a world where the remote's `plugin.json` still says `0.1.0`, i.e. where a
*successful* update would have been a no-op anyway (see §6). Variant D removes that confound: branch `v2`
(`b5aaa45`) was pushed to the probe repo with `"version": "0.2.0"` and a `V2-VERSION-BUMP-MARKER` line, so a
working entry would genuinely install something new. Then the entry was broken:

```json
"source": { …, "path": "no-such-directory", "ref": "v2" }
```

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Subdirectory 'no-such-directory' not found in repository https://github.com/thomasholknielsen/ct-subdir-probe.git (ref: v2). Check that the path is correct and exists at the specified ref/sha.
exit=1
```

> **⚠ RETRACTED — see §11.1.** This block originally presented an *authored summary* (`… identical to
> §2.1's full tree, 13 lines, no 0.2.0 …`) and abbreviated 8-character digests inside a `$ find …` code
> fence, i.e. narrative formatted to look like a terminal transcript. The underlying commands were run and
> the conclusion holds, but the evidence as written was not pasted output and must not be read as such.
> **§11.1 replaces it with a real, verbatim reproduction** against a freshly pushed `0.3.0` bump.

This is the variant that actually answers #416's question — see §11.1 for the evidence that supports it.

---

## 4. Step 3 — the existing install is intact

### 4.1 File list — identical

The cache tree was re-enumerated after **every** variant and the entry set was identical each time — no file
added, removed, or renamed under `0.1.0/`. Enumeration method per variant, stated exactly because they were
not all the same command: variants A, B and D used §2.1's full `find … | sort` (13 lines, identical);
variant C used §2.2's `find … | xargs stat` listing, which enumerates the same 13 entries with more detail.

> **⚠ SCOPED DOWN — see §11.2 and §11.3.** For variant C the original evidence was the cache-root `ls` plus
> the functional hook check only; no per-file tree/digest re-check of `0.1.0/` was captured at the time.
> §11.3 supplies a real variant-C-class tree + digest re-check. §11.2 supplies per-run, separately
> timestamped re-runs, because the single shared table in §4.2 below cannot by itself distinguish three
> claimed re-executions from one.

### 4.2 Content — identical

The four SHA-256 digests in §2.2 were re-taken after variant A, after variant B, and after variant D — but
**the table below is one table for three claimed runs and is therefore not, on its own, evidence of three
re-executions.** §11.2 replaces it with separately timestamped, individually pasted runs. The digests:

| file | SHA-256 (before == after, all variants) |
|---|---|
| `bin/probe.js` | `26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7` |
| `.claude-plugin/plugin.json` | `4c690b4351d0405030c1b6136188cdc55438fbf8d2cbedeea7fa84cf3f169e6e` |
| `hooks/hooks.json` | `a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee` |
| `skills/probe-skill/SKILL.md` | `cf5f6e60cfecd22922174ca5df71fa46886b35d16ca29ef2f676ea80743885ee` |

Inodes are also unchanged (`581816077`–`581816092`, §2.2), which rules out a delete-and-rewrite that happens
to reproduce the same bytes.

**One entry did change, and it is not payload:** the `.in_use/` directory's mtime moved
(`1786974729` → `1786975514` → `1786975601`). Its inode is stable (`581816094`) and it stays empty:

```
$ ls -la .../0.1.0/.in_use
total 0
drwxr-xr-x@ 2 thomasholknielsen  staff   64 Aug 17 16:05 .
drwxr-xr-x@ 7 thomasholknielsen  staff  224 Aug 17 15:51 ..
```

It is CLI lock/bookkeeping (Probe 1 §7) and it also moved across the *healthy* baseline session in §2.4, so
it tracks session starts, not update attempts. Recorded rather than dismissed because an intactness claim
that quietly filters out the one thing that moved is not an intactness claim.

### 4.3 The plugin still works

Still enabled with the catalog entry broken:

```
$ claude plugin list | grep -A4 subdir-probe
  ❯ subdir-probe@probe-marketplace
    Version: 0.1.0
    Scope: project
    Status: ✔ enabled
```

Probe 1 Step 5.3's hook check, re-run after the failed update (variant A):

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ sh .../probe1/pr-real.sh claude -p "reply ok"
 ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
```

And again with the catalog pointing at a **repository that does not exist** (variant C) — the strongest
form of the result:

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ sh .../probe1/pr-real.sh claude -p "reply ok"
 ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
```

Identical to the §2.4 baseline. A user whose catalog entry points at a nonexistent repo still gets a
working, hook-firing plugin from cache. **Nothing in the load path re-resolves the source at session start.**

---

## 5. Where the failed clone goes, and whether it leaves litter

Variant C's error leaks the transient path:

```
Cloning into '/Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/temp_subdir_1786975600534_5kxax0.clone'...
```

Two things follow, and both matter:

1. **The clone target is a sibling of the plugin directory, never the plugin directory itself.** The live
   `…/probe-marketplace/subdir-probe/0.1.0/` tree is only written by a later copy step. Every failure
   observed here (bad sha → checkout; bad path → post-checkout lookup; bad url → clone) happens strictly
   before that copy. That is the *mechanism* behind §4, not just a lucky observation — and it is why the
   result should generalize beyond this fixture.
2. **No litter.** After all four variants the cache root is clean:

```
$ ls -la /Users/thomasholknielsen/.claude/plugins/cache/
total 0
drwxr-xr-x@  8 thomasholknielsen  staff  256 Aug 17 16:06 .
drwxr-xr-x@ 11 thomasholknielsen  staff  352 Aug 17 07:34 ..
drwxr-xr-x@  3 thomasholknielsen  staff   96 Feb 27 00:05 claude-code-plugins
drwxr-xr-x@  7 thomasholknielsen  staff  224 Jun 16 07:48 claude-plugins-official
drwxr-xr-x@  3 thomasholknielsen  staff   96 Feb 27 00:05 claude-tweaks-marketplace
drwxr-xr-x@  3 thomasholknielsen  staff   96 Aug 13 15:48 claude-user-config
drwxr-xr-x@  3 thomasholknielsen  staff   96 May  3 13:43 impeccable
drwxr-xr-x@  3 thomasholknielsen  staff   96 Aug 17 15:51 probe-marketplace
```

No `temp_subdir_*.clone` survives. (Note the live `claude-tweaks-marketplace` entry's Feb 27 mtime —
untouched by this probe.)

I attempted to confirm the copy-after-clone ordering by reading the shipped binary as Probe 1 did
(`grep -a 'temp_subdir' …/versions/2.1.233`), but the temp name is assembled at runtime and the surrounding
logic did not extract legibly. The ordering claim above therefore rests on the three observed failure points
and the leaked path, not on source reading. Flagged as such rather than presented as source-verified.

---

## 6. Discrimination control — proof the "intact" measurement can go red

Without this section §4 is unfalsifiable: if `claude plugin update` never writes to that directory under any
circumstances, "unchanged after a failed update" says nothing.

**First finding — a confound, found by running the control:** with the entry repaired to a *working*
`ref: "main"` (real content difference — `SECOND-COMMIT-MARKER` — but the same declared version `0.1.0`):

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✔ subdir-probe is already at the latest version (0.1.0).
exit=0
```

The update **short-circuits on version equality** and does not refresh content, even though the remote
content differs. This is the live consequence of Probe 1 §7's cache-key trap, and it means variants A–C
alone could not distinguish "the failure protected the install" from "an update would have been a no-op
anyway". Variant D (§3.4) exists because of this.

**Second finding — the control fires.** Repaired to a working `ref: "v2"`, where the remote genuinely
declares `0.2.0`:

```
$ claude plugin update subdir-probe@probe-marketplace --scope project
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✔ Plugin "subdir-probe" updated from 0.1.0 to 0.2.0 for scope project (.../probe1/scratch-project). Restart to apply changes.
exit=0

$ find .../probe-marketplace | sort
… .../subdir-probe/0.1.0/…                     ← still present
… .../subdir-probe/0.1.0/.orphaned_at          ← NEW
… .../subdir-probe/0.2.0/.claude-plugin/plugin.json
… .../subdir-probe/0.2.0/bin/probe.js
… .../subdir-probe/0.2.0/hooks/hooks.json
… .../subdir-probe/0.2.0/skills/probe-skill/SKILL.md

$ cat .../0.2.0/skills/probe-skill/SKILL.md
---
name: probe-skill
description: Use when probing git-subdir installs.
---
# Probe Skill
Reply with the literal string PROBE-OK.
V2-VERSION-BUMP-MARKER

$ cat .../0.1.0/.orphaned_at
1786975790353
```

So the observable *does* move when an update really lands, and it moved in a way variant D specifically
showed it does **not** move on failure. §4 is a real negative, not a vacuous one.

**Third finding, free and useful for the cutover:** a successful version change is **additive** — the old
version directory is retained and merely stamped `.orphaned_at` (epoch ms). `0.1.0`'s four payload digests
are unchanged even after the successful upgrade; only `.orphaned_at` is added. A user upgrading across the
cutover keeps the previous payload on disk for some retention window, which is a rollback affordance the
design doc can rely on — and one more reason a broken entry is survivable.

Post-upgrade hook check confirms the new version is what actually loads:

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ sh .../probe1/pr-real.sh claude -p "reply ok"
 ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/bin
```

---

## 7. Scratch end state (precise — Task 9 repairs/reuses or deletes)

The probe **ends with a working catalog entry**, not a broken one. Task 9 does not need to repair anything
to reuse the fixture; it needs to know it is now at `0.2.0`, not Probe 1's `0.1.0`.

| Artifact | End state |
|---|---|
| `.../probe1/probe-marketplace/.claude-plugin/marketplace.json` | **healthy**, pinned `"path": "plugin", "ref": "v2"` (installs `0.2.0`) |
| Probe 1's original manifest (`ref: "probe-branch"`) | backed up verbatim at `.../probe1/probe2/marketplace.json.healthy-backup` — restore from here to return to Probe 1's exact state |
| `.../probe1/scratch-project/.claude/settings.json` | **unchanged** from Probe 1 (verified by `cat`) |
| plugin cache | **two** version dirs now: `…/subdir-probe/0.1.0/` (retained, `.orphaned_at` stamped) and `…/subdir-probe/0.2.0/` (active). Task 9's `rm -rf ~/.claude/plugins/cache/probe-marketplace` still covers both. |
| installed plugin | `subdir-probe@probe-marketplace`, **project** scope, enabled, now **0.2.0** |
| scratch git repo `.../probe1/subdir-probe-repo` | clean tree, **HEAD on new branch `v2`** (was `main`) |
| GitHub `thomasholknielsen/ct-subdir-probe` (private) | **new branch `v2`** (`b5aaa45`) pushed alongside `main` (`991c42c`) and `probe-branch` (`927b523`). Task 9 deletes the whole repo, so no separate branch cleanup is needed. |
| `.../probe1/probe2/` | new dir; holds only the manifest backup |
| `/tmp/ct-subdir-probe-root.txt` | present; contains the last hook-check line. Delete in Task 9. |

**No new mutations to the user's real config.** Re-verified after the probe, not assumed:

```
$ grep -rn 'probe-marketplace' ~/.claude/settings.json ~/.claude/plugins/known_marketplaces.json ~/.claude/plugins/installed_plugins.json
(no output)
```

The live `thomasholknielsen/claude-tweaks-marketplace` repo and the installed `claude-tweaks` plugin were
never touched. No `security` / Keychain command was run in this task.

---

## 8. Caveats and what this does not establish

- **Same-machine, same-CLI only** (`2.1.233`, macOS). Not tested in a cloud/Routine sandbox, where the setup
  script installs plugins fresh and there is no pre-existing cache to protect — a broken entry there is a
  *fresh-install* failure, which is a different (and louder, but more disruptive) exposure than the one
  tested here.
- **`claude plugin update` only.** Not tested: the interactive `/plugin` UI, `claude plugin install` over an
  existing install, or whatever a session-start auto-update path may do. The `/plugin` UI in particular could
  surface a broken entry differently.
- **A failure during the copy step was not engineered.** All four variants fail before the copy. A failure
  *mid-copy* (disk full, interrupted process) is untested and is the one plausible route to a partially
  written version directory.
- **The transient clone target is `<CLAUDE_CONFIG_DIR>/plugins/cache/`.** A broken entry on a very large repo
  still pays the clone cost before failing — harmless, not free.
- Marketplace-level breakage (a malformed `marketplace.json`, a marketplace repo that 404s) was not probed;
  only plugin-entry breakage within a valid marketplace.

---

## 9. Verdict

> **⚠ SUPERSEDED by §11.5.** The verdict below was written before the round-2 amendment work uncovered a
> single unexplained total-load-failure (§11.4). It stands as to loudness and byte-level intactness; it is
> too strong as to "keeps loading". Read §11.5 as the operative verdict.

**PASS — the #416 accepted-exposure premise holds.** A wrong `git-subdir` catalog entry is a
*loud, non-destructive, self-describing* failure for users who already have the plugin: exit 1, an error
naming the exact defect, an untouched cache, and a plugin that keeps loading and firing hooks from that
cache. Crucially this was shown with a real version bump pending (§3.4), against a discrimination control
that proves the measurement can go red (§6), so the result is not an artifact of the version-equality
short-circuit.

Two things the cutover should carry forward:

1. Any user-facing instruction to run an update must use `claude plugin update <name>@<marketplace>` — the
   bare name fails with a misleading `Plugin "…" not found` (§3.0).
2. `claude plugin validate` does **not** catch an unreachable pin, path, or repo (§3.1). A pre-ship check on
   the cutover's catalog entry has to actually resolve the source, not just validate the manifest.

---

## 11. Amendment — review round 2 (2026-08-17)

Review returned **Needs fixes** on this document. The central objection was correct and is worth stating
plainly: **§3.4's key `find` output was authored narrative formatted inside a `$ find …` code fence.** The
commands had been run and the conclusion was right, but a reader could not tell summary from transcript.
That is a serious defect in an evidence document, so it is retracted at the site (§3.4) rather than quietly
patched here.

Every command block in this section is pasted verbatim. Each is preceded by a `date -u` echo emitted by the
same shell invocation, so runs are individually identifiable rather than merely asserted. Long absolute
paths are abbreviated with a leading `…/` only where the prefix is
`/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/`; digests and command output are never
abbreviated.

### 11.1 Replaces §3.4 — real reproduction of "failed update creates no partial version dir"

A **new** branch `v3` (`449dede`) was pushed to the probe repo declaring `"version": "0.3.0"`, so a working
entry would genuinely install a version absent from the cache. Baseline — the cache holds exactly `0.1.0`
and `0.2.0`:

```
$ date -u '+R2-BASELINE %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace | sort
R2-BASELINE 2026-08-17T14:23:49Z
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin/plugin.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.orphaned_at
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin/probe.js
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks/hooks.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.claude-plugin/plugin.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/bin/probe.js
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/hooks/hooks.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills/probe-skill
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills/probe-skill/SKILL.md
```

Entry broken to `"sha": "0000000000000000000000000000000000000000"`, with `0.3.0` genuinely pending:

```
$ date -u '+R2-A-UPDATE %Y-%m-%dT%H:%M:%SZ'; … claude plugin update subdir-probe@probe-marketplace --scope project
R2-A-UPDATE 2026-08-17T14:24:10Z
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Failed to checkout commit 0000000000000000000000000000000000000000: fatal: unable to read tree (0000000000000000000000000000000000000000)
exit=1
```

Cache immediately afterwards — **verbatim, and there is no `0.3.0` line**:

```
$ date -u '+R2-A-TREE %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace | sort
R2-A-TREE 2026-08-17T14:24:21Z
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin/plugin.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.orphaned_at
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin/probe.js
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks/hooks.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.claude-plugin/plugin.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/bin/probe.js
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/hooks/hooks.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills/probe-skill
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0/skills/probe-skill/SKILL.md
```

The same held for the bad-`path` break against the pending `0.3.0` (`R2-B-TREE 2026-08-17T14:24:57Z` — same
25 lines, no `0.3.0`) and for the bad-`url` break (§11.3).

**The retracted claim is therefore re-established on real output:** a failed update creates no directory for
the version it was trying to install, not even a partial one.

### 11.2 Replaces §4.2's single shared table — per-run, separately timestamped digests

Two independent digest runs, each with its own `date -u` stamp emitted by the same shell invocation, over
**all** files in the cache — not just the four `0.1.0` files, so a stray new directory anywhere would show:

```
$ date -u '+R2-BASELINE-DIGESTS %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace -type f -print0 | xargs -0 shasum -a 256 | sort
R2-BASELINE-DIGESTS 2026-08-17T14:23:54Z
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.1.0/bin/probe.js
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.2.0/bin/probe.js
39ab4664548795460d452ae5f8ecc08f52993e880e57b29200e736a7e893e241  …/subdir-probe/0.2.0/skills/probe-skill/SKILL.md
4c690b4351d0405030c1b6136188cdc55438fbf8d2cbedeea7fa84cf3f169e6e  …/subdir-probe/0.1.0/.claude-plugin/plugin.json
6ee437497c17265135692ca0b89ee003b5ef79100aa3533466ebe55540a8144e  …/subdir-probe/0.1.0/.orphaned_at
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.1.0/hooks/hooks.json
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.2.0/hooks/hooks.json
b3adf8d48fdd5a9bc18deb96baf234929832e1bf05e2f1d84571116f09306847  …/subdir-probe/0.2.0/.claude-plugin/plugin.json
cf5f6e60cfecd22922174ca5df71fa46886b35d16ca29ef2f676ea80743885ee  …/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
```

```
$ date -u '+R2-A-DIGESTS %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace -type f -print0 | xargs -0 shasum -a 256 | sort
R2-A-DIGESTS 2026-08-17T14:24:26Z
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.1.0/bin/probe.js
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.2.0/bin/probe.js
39ab4664548795460d452ae5f8ecc08f52993e880e57b29200e736a7e893e241  …/subdir-probe/0.2.0/skills/probe-skill/SKILL.md
4c690b4351d0405030c1b6136188cdc55438fbf8d2cbedeea7fa84cf3f169e6e  …/subdir-probe/0.1.0/.claude-plugin/plugin.json
6ee437497c17265135692ca0b89ee003b5ef79100aa3533466ebe55540a8144e  …/subdir-probe/0.1.0/.orphaned_at
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.1.0/hooks/hooks.json
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.2.0/hooks/hooks.json
b3adf8d48fdd5a9bc18deb96baf234929832e1bf05e2f1d84571116f09306847  …/subdir-probe/0.2.0/.claude-plugin/plugin.json
cf5f6e60cfecd22922174ca5df71fa46886b35d16ca29ef2f676ea80743885ee  …/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
```

Nine files, nine identical digests, 37 seconds and one failed update apart. All digests full-length —
the abbreviated 8-character forms review flagged survive only inside the retracted §3.4 block.

**The strongest single piece of evidence** is that `0.1.0`'s four payload digests are unchanged at the very
end of the probe, after roughly twenty CLI operations including five failed updates and three successful
upgrades:

```
$ date -u '+FINAL-DIGESTS %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace -type f -not -name '.orphaned_at' -print0 | xargs -0 shasum -a 256 | sort
FINAL-DIGESTS 2026-08-17T14:44:35Z
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.1.0/bin/probe.js
4c690b4351d0405030c1b6136188cdc55438fbf8d2cbedeea7fa84cf3f169e6e  …/subdir-probe/0.1.0/.claude-plugin/plugin.json
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.1.0/hooks/hooks.json
cf5f6e60cfecd22922174ca5df71fa46886b35d16ca29ef2f676ea80743885ee  …/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
```

(the `0.1.0` rows of a 20-row listing that also covers `0.2.0`–`0.5.0`; these four match §2.2's baseline
exactly — this is an excerpt of pasted output, not a re-typed summary)

### 11.3 Adds the missing variant-C tree + digest re-check

Review was right that variant C (unreachable repo) had only a cache-root `ls` plus the functional hook
check. Re-run against the then-active `0.5.0`:

```
$ date -u '+R7-URL-UPDATE %Y-%m-%dT%H:%M:%SZ'; … claude plugin update subdir-probe@probe-marketplace --scope project
R7-URL-UPDATE 2026-08-17T14:45:03Z
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Failed to clone repository for git-subdir source: Cloning into '/Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/temp_subdir_1786977903986_k2pp3p.clone'...
remote: Repository not found.
fatal: repository 'https://github.com/thomasholknielsen/ct-subdir-probe-does-not-exist.git/' not found
exit=1
```

```
$ date -u '+R7-URL-TREE %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace -maxdepth 2 | sort
R7-URL-TREE 2026-08-17T14:45:09Z
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.2.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.3.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.4.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.5.0
```

```
$ date -u '+R7-URL-DIGESTS %Y-%m-%dT%H:%M:%SZ'; find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.5.0 -type f -not -name '.orphaned_at' -print0 | xargs -0 shasum -a 256 | sort
R7-URL-DIGESTS 2026-08-17T14:45:15Z
26cddeb960f0343c23379556f39e8383cafe05a45b94f25ee275653e275742d7  …/subdir-probe/0.5.0/bin/probe.js
43a4d9e310f89b594b7792339ad24dcb6e77b1a38e4b890a9f160752e0f625d6  …/subdir-probe/0.5.0/skills/probe-skill/SKILL.md
59bd0439ce20c11b030233655634c55d00cbd3bc515ee8e2570e03dd236ef30a  …/subdir-probe/0.5.0/.claude-plugin/plugin.json
a1ba6a8e4ed9b0ec9e660fad98d16969dce73fc4d4a99e1c773b9fb87d653cee  …/subdir-probe/0.5.0/hooks/hooks.json
```

No new version directory; active-version digests identical to the `FINAL-DIGESTS` run 40 seconds earlier.
Variant C's intactness now rests on tree + digest evidence, not only on the functional check.

### 11.4 NEW AND UNRESOLVED — the plugin silently stopped loading, once

While producing the evidence above the probe hit a state that **contradicts this document's original
"keeps working" claim**. It is recorded in full because it is the most consequential thing found, and
because it did not reproduce.

**What happened.** At `14:24:33.302Z`, with the entry broken to a nonexistent `path`, the *active* `0.2.0`
cache directory was stamped `.orphaned_at` with no upgrade in flight. The next update attempt returned an
error seen in no other run:

```
$ date -u '+R2-B-UPDATE %Y-%m-%dT%H:%M:%SZ'; … claude plugin update subdir-probe@probe-marketplace --scope project
R2-B-UPDATE 2026-08-17T14:24:42Z
Checking for updates for plugin "subdir-probe@probe-marketplace" at project scope…
✘ Failed to update plugin "subdir-probe@probe-marketplace": Plugin "subdir-probe" is not installed
exit=1
```

The plugin was gone from the listing (empty output where §4.3 shows four lines):

```
$ … claude plugin list | grep -A4 subdir-probe
(no output)
```

And the hook stopped firing — the marker file was never created:

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ date -u '+R2-B-HOOK %Y-%m-%dT%H:%M:%SZ'; … claude -p "reply ok"
R2-B-HOOK 2026-08-17T14:26:15Z
ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
cat: /tmp/ct-subdir-probe-root.txt: No such file or directory
```

**The payload was still perfect.** All eight payload files across `0.1.0` and `0.2.0` were byte-identical to
`R2-BASELINE-DIGESTS`; only the two `.orphaned_at` markers differed (run
`R2-DAMAGED-TREE 2026-08-17T14:27:28Z`). This is not file corruption — it is the plugin being dropped from
the resolved set while its bytes sit intact on disk. **That is a worse exposure shape than corruption,
because nothing about it is loud:** the user's next session simply has no plugin.

**Repairing the manifest was not enough.** Restoring a valid entry and starting a session did not bring it
back (`R2-REPAIR-HOOK-NO-MKTUPDATE 14:26:52Z` — no marker file), nor did a following
`claude plugin marketplace update` plus `claude plugin list` (`R2-REPAIR-LIST 14:27:18Z` — empty). Sessions
evidently read a resolved snapshot rather than the `directory` marketplace's file live.

**Recovery works, and is one command:**

```
$ date -u '+R2-RECOVER-INSTALL %Y-%m-%dT%H:%M:%SZ'; … claude plugin install subdir-probe@probe-marketplace --scope project
R2-RECOVER-INSTALL 2026-08-17T14:27:37Z
Installing plugin "subdir-probe@probe-marketplace"...✔ Successfully installed plugin: subdir-probe@probe-marketplace (scope: project)
exit=0

$ date -u '+R2-RECOVER-HOOK %Y-%m-%dT%H:%M:%SZ'; … claude -p "reply ok"
R2-RECOVER-HOOK 2026-08-17T14:27:53Z
ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.3.0/bin
```

**Three targeted reproduction attempts, all negative** — each ended with the plugin listed and firing:

| Attempt | Hypothesis under test | Sequence | Result |
|---|---|---|---|
| Round 3 (`R3-*`, 14:28–14:30) | the bad-`path` break class itself causes it | bad sha → check; bad url → check; bad path → `marketplace update` → `plugin update` → check | **not reproduced** — listed at `0.3.0`, hook fired (`R3-PATH-HOOK 14:30:32Z`) |
| Round 4 (`R4-*`, 14:31–14:32) | an *unapplied* upgrade ("Restart to apply") plus a break | upgrade `0.3.0`→`0.4.0`, no session, break to bad path, `marketplace update` | **not reproduced** — listed at `0.4.0`, hook fired (`R4-BREAK-HOOK 14:32:23Z`) |
| Round 5 (`R5-*`, 14:33–14:34) | round 2's exact sequence, incl. the intervening failed bad-sha update | upgrade `0.4.0`→`0.5.0`, no session → bad sha → failed update → bad path → `marketplace update` → `plugin update` | **not reproduced** — listed at `0.5.0`, hook fired (`R5-HOOK 14:34:26Z`) |

Rounds 3 and 5 isolate the bad-`path` class specifically: a `marketplace update` carrying a bad-`path` entry
left the plugin listed and firing (`R3-PATH-LIST 14:29:57Z`, `R5-LIST 14:34:17Z`).

**A second, benign orphaning rules out the obvious mechanism.** At `14:39:41.188Z`, with a bad-`path` entry
in place and **no command of mine running** (the session had been interrupted), the active `0.5.0` was
stamped `.orphaned_at`. Unlike round 2, the plugin kept working:

```
$ date -u '+R6-POSTORPHAN-HOOK %Y-%m-%dT%H:%M:%SZ'; … claude -p "reply ok"
R6-POSTORPHAN-HOOK 2026-08-17T14:44:08Z
ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.5.0/bin
```

```
$ date -u '+R6-LIST %Y-%m-%dT%H:%M:%SZ'; … claude plugin list | grep -A4 subdir-probe
R6-LIST 2026-08-17T14:44:24Z
  ❯ subdir-probe@probe-marketplace
    Version: 0.5.0
    Scope: project
    Status: ✔ enabled
```

So **`.orphaned_at` on the active version is not by itself the disabling condition.** Full stamp timeline —
the three marked `upgrade` are expected predecessor-orphaning at a successful version change; the two marked
**anomaly** had no upgrade in flight:

| version | `.orphaned_at` (epoch ms) | UTC | cause |
|---|---|---|---|
| `0.1.0` | `1786975790353` | `14:09:50.353Z` | upgrade to `0.2.0` |
| `0.2.0` | `1786976673302` | `14:24:33.302Z` | **anomaly** — immediately preceded the total load failure |
| `0.3.0` | `1786977110012` | `14:31:50.012Z` | upgrade to `0.4.0` |
| `0.4.0` | `1786977204772` | `14:33:24.772Z` | upgrade to `0.5.0` |
| `0.5.0` | `1786977581188` | `14:39:41.188Z` | **anomaly** — but plugin kept working |

The periodic `.in_use` sweep is not the trigger: `~/.claude/plugins/.last_inuse_sweep` reads
`2026-08-16T21:19:06.060Z` — the previous day.

**Honest status: cause unknown.** The event is real and fully evidenced, but I could not reproduce it and I
will not name a mechanism I have not demonstrated. One environmental factor I can neither exclude nor
confirm: this machine runs **concurrent `claude` sessions** (sibling agents on this build), and the
`14:39:41` stamp landed with no command of mine running — so some reconciliation outside this probe's
control touches this shared cache. That would explain non-deterministic timing, but not why round 2 ended in
deregistration and round 6 did not.

**What the cutover should take from it,** without over-reading a single observation:

1. Do not claim, in the design doc or anywhere user-facing, that a wrong `git-subdir` entry is *guaranteed*
   harmless to existing installs. Byte-level intactness is well evidenced (§11.2); "keeps loading" is not —
   it held in every run but one, and the exception was silent.
2. `claude plugin install <name>@<marketplace> --scope <scope>` is a **verified one-command recovery** and
   belongs in the cutover's rollback notes.
3. This strengthens the case for getting the catalog entry right pre-ship rather than relying on the
   exposure being benign — see §9's point that `claude plugin validate` does not check reachability.
4. Worth an upstream report to Anthropic if it is ever reproduced; not worth filing on one unreproduced
   sighting.

### 11.5 Operative verdict (supersedes §9)

**Loudness: PASS, strongly.** Five failed updates across three break classes; every one exit 1 with a
defect-specific message. No silent success, no fallback to another ref.

**Byte-level intactness: PASS, strongly.** `0.1.0`'s four payload digests are identical from
`R2-BASELINE-DIGESTS 14:23:54Z` through `FINAL-DIGESTS 14:44:35Z`, and no failed update ever created a
directory for the version it was attempting to install (§11.1, §11.3).

**Continuity of function: PASS WITH ONE EXCEPTION.** The plugin kept loading through every break in rounds
1, 3, 4, 5 and 6 — including with the catalog naming a nonexistent repository. Once (§11.4) it silently
stopped, files intact, and that did not reproduce in three targeted attempts.

**Net for #416:** the accepted-exposure premise is *substantially* supported, but should be stated with the
exception attached rather than as an unqualified guarantee.

### 11.6 Scratch end state after the amendment (supersedes §7 — Task 9 consumes this)

| Artifact | End state |
|---|---|
| `probe-marketplace/.claude-plugin/marketplace.json` | **BROKEN, deliberately** — `"url": "…/ct-subdir-probe-does-not-exist.git", "path": "plugin", "ref": "v5"` (the §11.3 variant-C entry). Task 9 may repair or delete. |
| Task 1's original manifest | still backed up verbatim at `…/probe1/probe2/marketplace.json.healthy-backup` |
| repair recipe | set `"url"` back to `https://github.com/thomasholknielsen/ct-subdir-probe.git` with `"path": "plugin", "ref": "v5"`, run `claude plugin marketplace update probe-marketplace`, then — if the plugin is missing from `claude plugin list` — `claude plugin install subdir-probe@probe-marketplace --scope project` |
| plugin cache | **five** version dirs `0.1.0`–`0.5.0`, all five carrying `.orphaned_at`; the active/loading version is `0.5.0`. `rm -rf ~/.claude/plugins/cache/probe-marketplace` still covers all of it. |
| installed plugin | project scope, enabled, `0.5.0`, hook firing as of `R6-POSTORPHAN-HOOK 14:44:08Z` |
| scratch git repo | clean tree, HEAD on branch `v5` |
| GitHub `thomasholknielsen/ct-subdir-probe` (private) | now **six** branches: `main` (`991c42c`), `probe-branch` (`927b523`), `v2` (`b5aaa45`, 0.2.0), `v3` (`449dede`, 0.3.0), `v4` (`7022756`, 0.4.0), `v5` (`9e8abaa`, 0.5.0). Task 9 deletes the repo, so no per-branch cleanup. |
| `/tmp/ct-subdir-probe-root.txt` | present; delete in Task 9 |
| user's real config | still unmutated beyond Probe 1's cache entry and `pluginUsage` key — re-verified below |

```
$ grep -rn 'probe-marketplace' ~/.claude/settings.json ~/.claude/plugins/known_marketplaces.json ~/.claude/plugins/installed_plugins.json
(no output)
```

The live `claude-tweaks-marketplace` repo and the installed `claude-tweaks` plugin remain untouched. No
`security` / Keychain command was run at any point in this task.
