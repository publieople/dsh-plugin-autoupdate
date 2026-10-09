# dsh-plugin-autoupdate

**Well-behaved** plugin updates for DeepSeek Harness profiles: it only offers versions that
pnpm's supply-chain minimum-release-age policy lets through, snapshots the profile before
touching anything, and can roll back.

`status: early` · `license: MIT` · `dsh: 0.2.0-rc.x`

## The problem

DSH plugins live in a profile and are managed by `dsh plugin`. Doing it by hand hides four traps:

| Trap | Why it bites |
|---|---|
| The `Latest` column of `pnpm outdated` is not the newest publish | pnpm's supply-chain policy holds back versions that are too fresh; that column is the newest *installable* one |
| `^0.59.2`-style ranges are narrow on 0.x | cross-minor updates simply do not resolve; same-minor ones do |
| Updates need a DSH restart | host plugins only reload then; browser plugins also need a page refresh |
| Bad update? | you are on your own getting back |

This plugin automates the check and the rollback, and hands the restart decision back to you.

## Install

```sh
dsh plugin --profile <your profile> add dsh-plugin-autoupdate
```

Restart DSH afterwards.

## Usage

It registers one agent-facing tool, `dsh_plugin_updates`:

| action | What it does |
|---|---|
| `check` (default) | lists updatable plugins per profile (exactly what `pnpm outdated` reports) |
| `apply` | snapshots the profile, then updates, reporting which ranges moved |
| `rollback` | restores the newest snapshot (or a named one) and reinstalls |

- `profiles`: comma-separated profile names; defaults to the profile this instance runs
- `latest`: equivalent to `--latest`, ignoring the recorded semver ranges - **still bounded by the release-age policy**
- the tool never restarts DSH for you

> Note: `dsh plugin add <pkg>@<version-or-range>` records the **resolved exact version**
> (measured pnpm behaviour, not the dsh wrapper). Plain `apply` will correctly leave such a
> pin alone, and the tool says so - "updates are offered and blocked by the recorded range" -
> at which point `latest=true` moves it (still bounded by the release-age policy).

## Safety model

Each of these is deliberate:

1. **It never pins a version.** `pnpm add pkg@x.y.z` is not used anywhere: pnpm records such a
   request in `minimumReleaseAgeExclude`, which would silently bypass the age gate the user relies on.
2. **Every version decision is delegated to the DSH CLI.** The plugin never queries a registry to
   pick a version, so its answers match a manual update exactly.
3. **A snapshot is taken before every apply**, the newest five are kept, and `rollback` is a
   first-class action.
4. **It never restarts DSH behind your back** - the report says a restart is required.
5. It writes only inside the profile directory: no user code, no agent configuration.

## What it is not

- Not a harness updater: updating the DSH application itself is a different kind of plugin.
- It does not bypass the minimum-release-age policy. That is a feature, not a limitation.

## Development

```sh
npm install
npm test        # node --test test/, offline
```

## License

MIT
