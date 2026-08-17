# Probe 2 — failed-update harmlessness

**Task:** Task 2 of the plugin-payload-cutover build (spec #418). Tests the #416 accepted-exposure premise:
*if the cutover ships a broken `git-subdir` catalog entry, does an already-installed user get hurt?*
**Date:** 2026-08-17
**Verdict:** **PASS** — a broken catalog entry fails **loudly** (non-zero exit, specific error naming the
exact defect) and leaves the already-cached install **byte-identical and fully functional**.
**Environment:** `claude` CLI `2.1.233 (Claude Code)` (`/Users/thomasholknielsen/.local/bin/claude`),
macOS darwin 25.5.0. Fixture reused from Probe 1 — see `probe-1-findings.md` §8.

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

Cache afterwards — **no `0.2.0/` directory was created, not even a partial one**, and `0.1.0/` is untouched:

```
$ find .../probe-marketplace | sort
… identical to §2.1's full tree, 13 lines, no 0.2.0 …

$ find .../0.1.0 -type f -print0 | xargs -0 shasum -a 256 | sort
26cddeb9…  .../0.1.0/bin/probe.js
4c690b43…  .../0.1.0/.claude-plugin/plugin.json
a1ba6a8e…  .../0.1.0/hooks/hooks.json
cf5f6e60…  .../0.1.0/skills/probe-skill/SKILL.md
```

This is the variant that actually answers #416's question.

---

## 4. Step 3 — the existing install is intact

### 4.1 File list — identical

The cache tree was re-enumerated after **every** variant and the entry set was identical each time — no file
added, removed, or renamed under `0.1.0/`. Enumeration method per variant, stated exactly because they were
not all the same command: variants A, B and D used §2.1's full `find … | sort` (13 lines, identical);
variant C used §2.2's `find … | xargs stat` listing, which enumerates the same 13 entries with more detail.

### 4.2 Content — identical

The four SHA-256 digests in §2.2 were re-taken after variant A, after variant B, and after variant D. All
four unchanged every time:

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
