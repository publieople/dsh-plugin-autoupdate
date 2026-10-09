# dsh-plugin-autoupdate

**Well-behaved** plugin updates for DeepSeek Harness profiles: it only offers versions that
pnpm's supply-chain minimum-release-age policy lets through, snapshots the profile before
touching anything, can roll back - and ships a full main-column page you can actually click.

`status: early` · `license: MIT` · `dsh: 0.2.0-rc.x`

## The problem

DSH plugins live in a profile and are managed by `dsh plugin`. Doing it by hand hides four traps:

| Trap | Why it bites |
|---|---|
| The `Latest` column of `pnpm outdated` is not the newest publish | pnpm's supply-chain policy holds back versions that are too fresh; that column is the newest *installable* one |
| `^0.59.2`-style ranges are narrow on 0.x | cross-minor updates simply do not resolve; same-minor ones do |
| Updates need a DSH restart | host plugins only reload then; browser plugins also need a page refresh |
| Bad update? | you are on your own getting back |

This plugin automates the check, the apply, the rollback and the reminder, and hands the
restart decision back to you.

## Install

```sh
dsh plugin --profile <your profile> add dsh-plugin-autoupdate
```

**Quit DSH completely and reopen it afterwards.** Host plugins are loaded when the process
starts - refreshing the page only swaps the browser half.

## Use it as a page: "插件更新" (Plugin updates)

The sidebar gains an icon; it opens a full main-column page next to the conversation, with
four tabs:

| Tab | Contents |
|---|---|
| 可用更新 / Updates | what each profile can update, with per-row selection, "update selected", "update all", and a per-row "lock" |
| 已安装 / Installed | the dependencies recorded in each profile, their ranges and sources, plus "roll back the last update" |
| 发现 / Discover | the plugin market's official catalog: search, filter by category, install in one click (below) |
| 已锁定 / Locked | packages whose updates are no longer offered, with an unlock button |

Toolbar: reload · update selected · update all · ignore ranges (`--latest`) · rollback · export CSV.
Two buttons in the top right:

- **Refresh UI** - `location.reload()`. Only the browser half is replaced (a freshly installed
  client plugin takes effect); host plugins do not reload that way.
- **Restart DSH** - capability-gated. The official Desktop shell owns its own process lifecycle,
  so the page explains who owns the restart and **refuses**; CLI/service deployments really do
  restart: with systemd / pm2 / launchd the process just exits and the supervisor brings it back,
  otherwise a detached helper waits for this process to release its port and relaunches the same
  command. It **never** `app.relaunch`es Electron.

## Use it as a tool: `dsh_plugin_updates`

| action | What it does |
|---|---|
| `check` (default) | lists updatable plugins per profile (exactly what `pnpm outdated` reports) |
| `apply` | snapshots the profile, then updates, reporting which ranges moved |
| `rollback` | restores the newest snapshot (or the one named by `snapshot=`) and reinstalls |
| `lock` / `unlock` | stop offering updates for a package / offer them again |

- `profiles`: comma-separated profile names; defaults to the profile this instance runs
- `latest`: equivalent to `--latest`, ignoring the recorded semver ranges - **still bounded by the release-age policy**
- the tool never restarts DSH for you; its report carries `restartRequired`

> Note: `dsh plugin add <pkg>@<version-or-range>` records the **resolved exact version**
> (measured pnpm behaviour, not the dsh wrapper). Plain `apply` will correctly leave such a
> pin alone, and the tool says so - "updates are offered and blocked by the recorded range" -
> at which point `latest=true` moves it (still bounded by the release-age policy).

## Discover reads the plugin market's official catalog

- Source: `https://awesome-dsh-plugin.com/plugins.json` - the same file dsh-market uses
  (thousands of plugins with category, bilingual description, npm name, stars, downloads and
  capability annotations).
- The host downloads it and caches it at `$DSH_HOME/.plugin-autoupdate-catalog.json` with a
  12-hour TTL. A failed refresh keeps serving the last good copy and says so, instead of
  showing you an empty page.
- **Only packages listed in the catalog can be installed, by npm name, never with a version.**
  A spec like `pkg@1.2.3` is rejected - that is the one form that writes
  `minimumReleaseAgeExclude` and bypasses the age policy.

## Snapshots and rollback

- Before every `apply`, `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` /
  `cordis.patch.yml` are copied into `<profile>/.plugin-backup-auto-<stamp>/`; the newest five are kept.
- `rollback` restores the snapshot files and runs `dsh plugin --profile <p> install` so
  `node_modules` matches the manifest again.

## Locking

- A lock means "stop offering updates for this package"; it lives in
  `<profile>/.plugin-autoupdate.json`, a file this plugin owns.
- **It never touches the manifest and never pins a version.** A lock suppresses the offer, not
  the resolution: the package still updates within the range you recorded.
- A locked package moves from "Updates" to "Locked" - the offer is hidden, the fact is not.

## HTTP surface (used by the page)

The page talks to eight exact routes on the host:

```
GET  /plugin-autoupdate/status     GET  /plugin-autoupdate/catalog
POST /plugin-autoupdate/apply      POST /plugin-autoupdate/rollback
POST /plugin-autoupdate/install    POST /plugin-autoupdate/restart
POST /plugin-autoupdate/lock       POST /plugin-autoupdate/unlock
```

- Reads (`status` / `catalog`) are unfenced, so deployments reached by a name keep working.
- Writes require a loopback `Host` or one you declared
  (`PLUGIN_AUTOUPDATE_TRUSTED_HOSTS=host1,host2`), plus `confirm: true` in the body.
- `/status` reports `features` (the routes this build registered) and `version`: the browser
  half is re-read from disk on every page load while the host half only loads at process start,
  so the page compares the two and says "the host plugin is older - quit DSH and reopen".

## Safety model

Each of these is deliberate:

1. **It never pins a version.** `pnpm add pkg@x.y.z` is not used anywhere: pnpm records such a
   request in `minimumReleaseAgeExclude`, which would silently bypass the age gate the user relies on.
2. **Every version decision is delegated to the DSH CLI.** The plugin never queries a registry to
   pick a version, so its answers match a manual update exactly.
3. **A snapshot is taken before every apply**, the newest five are kept, and `rollback` is a
   first-class action.
4. **It never restarts DSH behind your back.** The agent tool only reports that a restart is
   required; the page's restart button is capability-gated and refuses on Desktop, saying who
   owns the lifecycle instead.
5. **It writes only inside the profile directory** (`$DSH_HOME/profiles/<name>`) and its own
   cache under `$DSH_HOME`: no user code, no agent configuration.
6. **Discover installs only catalog packages, and never with a version.**
7. **On Windows it builds the command line itself** before handing it to cmd.exe - Node's
   `shell: true` does not escape arguments (DEP0190) and cmd.exe swallows `^`.

## What it is not

- Not a harness updater: updating the DSH application itself is a different kind of plugin.
- It does not bypass the minimum-release-age policy. That is a feature, not a limitation.

## Development

```sh
npm install
npm test        # node --test, offline, no network
```

On this machine (Windows + DSH Desktop) the bundled Node works too:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'D:\DSH\DeepSeek Harness.exe' --test
```

Use a **bare** `--test`: that Node (v24 inside the asar) does not expand a directory argument,
so `--test test/` fails with `Cannot find module …\test` and reads like a broken test.

## License

MIT
