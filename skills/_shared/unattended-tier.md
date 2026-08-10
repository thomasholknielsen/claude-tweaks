# Unattended Tier (retired — 2026-08-09)

The standalone `unattended-tier` lever was merged into the `autonomy` ceiling's `trusted`/
`unattended` tiers — see `_shared/autonomy-ceiling.md`'s "Bookkeeping capabilities" section for
the three behaviors it used to gate (ledger Phase 2 narrowing, queue-write auto-file, ops-ack
auto-acknowledge) and their full contract (Floor rule, Restricted-disposition rule, Logging,
Notification, Error handling).

The `unattended-tier` key in `.claude-tweaks/policy.yml` is retired. A project that still sets it
is auto-detected via `bin/lib/policy-schema.js`'s `RENAMED_KEYS`/`renamedKeys` migration mechanism
at `/claude-tweaks:init --update`, which offers to rewrite it to the equivalent `autonomy` value.
