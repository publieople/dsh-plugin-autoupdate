# dsh-plugin-autoupdate

给 DeepSeek Harness 的 profile 插件做**守规矩的**更新：只升 pnpm 供应链「最小发布时长」策略放行的版本，
动手前自动快照，随时可回滚；另配一个与对话页同级的主栏页面，看得见、点得动。

`status: early` · `license: MIT` · `dsh: 0.2.0-rc.x`

## 它解决什么

DSH 的插件装在 profile 里，由 `dsh plugin` 管理。手动更新时有四个坑：

| 坑 | 说明 |
|---|---|
| `pnpm outdated` 的 Latest 不是「仓库最新版」 | pnpm 的 supply-chain 策略会挡掉刚发布的版本；那一列才是**能装**的最新版 |
| `^0.59.2` 这类 0.x 的 caret 范围很窄 | 跨 minor 的更新默认升不上去（同 minor 的可以） |
| 升级后要重启 DSH | 宿主插件才重新加载；浏览器插件还要刷页面 |
| 升坏了怎么办 | 得自己想办法退回去 |

本插件把「检查」「应用」「回滚」「提示」自动化，把「重启」明确交还给你。

## 安装

```sh
dsh plugin --profile <你的 profile> add dsh-plugin-autoupdate
```

装完**完全退出 DSH 再重开**。宿主插件只在进程启动时加载 —— 刷新页面只换浏览器那一半。

## 用法一：页面「插件更新」

装好后侧栏多一个图标，打开是与对话页同级的主栏整页，四个 tab：

| Tab | 内容 |
|---|---|
| 可用更新 | 每个 profile 能升的插件；勾选后「更新所选」，或「全部更新」；每行可「锁定」 |
| 已安装 | profile 里记录的依赖、版本范围与来源；「回滚最近一次更新」 |
| 发现 | 插件市场的官方目录，可搜索、按分类筛选、一键安装（见下） |
| 已锁定 | 被锁定的包，可解锁 |

工具栏：重新加载 · 更新所选 · 全部更新 · 忽略版本范围（`--latest`） · 回滚 · 导出 CSV。
右上角两个按钮：

- **刷新界面** — `location.reload()`。只让浏览器那一半换新（比如刚装上的客户端插件）；宿主插件不会因此重载。
- **重启 DSH** — 能力门禁。官方桌面版由外壳管理进程生命周期，页面会说明「请退出再重开」并**拒绝执行**；
  CLI / 服务部署才真的重启：有 systemd / pm2 / launchd 就直接退出交给它，没有就拉一个 detached 助手，
  等这个进程释放端口后再拉起同一条命令。**绝不 `app.relaunch` Electron。**

## 用法二：agent 工具 `dsh_plugin_updates`

| action | 作用 |
|---|---|
| `check`（默认） | 列出每个 profile 里可更新的插件（就是 `pnpm outdated` 的结果） |
| `apply` | 先快照 profile，再执行更新，报告哪些范围动了 |
| `rollback` | 恢复最近的快照（或 `snapshot=` 指定的那份）并重装 |
| `lock` / `unlock` | 不再提示某个包的更新 / 恢复提示 |

- `profiles`：逗号分隔的 profile 名，默认是当前实例运行的 profile
- `latest`：等价于 `--latest`，忽略记录的 semver 范围来选版本 —— **仍然受发布时长策略约束**
- 工具**不会**替你重启 DSH，只在报告里写 `restartRequired`

> 注意：`dsh plugin add <pkg>@<版本或范围>` 记录的是**解析后的精确版本**（实测 pnpm 行为，
> 与 dsh 包装器无关）。这类依赖普通 `apply` 不会动它 —— 工具会明确告诉你「有可用更新
> 但被记录的范围挡住」，此时用 `latest=true`（仍受发布时长策略约束）。

## 「发现」读的是插件市场的官方目录

- 数据源 `https://awesome-dsh-plugin.com/plugins.json` —— 就是 dsh-market 用的那份
  （数千个插件，带分类、中英描述、npm 名、stars、下载量、能力标注）。
- 宿主侧下载并缓存到 `$DSH_HOME/.plugin-autoupdate-catalog.json`，TTL 12 小时；
  拉不到就继续用旧缓存并在页面上标注，而不是给你一个空页面。
- **安装只认目录里的包，且只取 npm 名、永远不带版本。** `pkg@1.2.3` 这类 spec 一律拒绝 ——
  那是唯一会写 `minimumReleaseAgeExclude`、绕过年龄策略的形式。

## 快照与回滚

- 每次 `apply` 之前，把 `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `cordis.patch.yml`
  复制进 `<profile>/.plugin-backup-auto-<时间戳>/`，只保留最近 5 份。
- `rollback` 把快照文件还原回去，再跑 `dsh plugin --profile <p> install`，让 `node_modules` 跟上 manifest。

## 锁定

- 「锁定」= **不再提示**这个包的更新，状态写在 `<profile>/.plugin-autoupdate.json`（本插件自己的文件）。
- **不碰 manifest、不钉版本。** 锁的是提示，不是解析结果：那个包仍会按你记录的范围正常升级。
- 锁定后它从「可用更新」移到「已锁定」—— 抑制提示，但不隐藏事实。

## HTTP 接口（页面用）

页面走宿主上 8 条精确路由：

```
GET  /plugin-autoupdate/status     GET  /plugin-autoupdate/catalog
POST /plugin-autoupdate/apply      POST /plugin-autoupdate/rollback
POST /plugin-autoupdate/install    POST /plugin-autoupdate/restart
POST /plugin-autoupdate/lock       POST /plugin-autoupdate/unlock
```

- 读（`status` / `catalog`）不设栅栏 —— 用名字访问的部署也必须能用。
- 写要求 `Host` 是 loopback 或你声明的 authority（`PLUGIN_AUTOUPDATE_TRUSTED_HOSTS=host1,host2`），
  并且请求体带 `confirm: true`。
- `/status` 会回传 `features`（本构建注册的路由）与 `version`：浏览器那一半每次刷新都从磁盘重读，
  宿主那一半只在进程启动时加载，页面靠这个比对，发现宿主是旧版本时直说「退出 DSH 再重开」。

## 安全模型

这几条是刻意的：

1. **绝不钉版本。** 不走 `pnpm add pkg@x.y.z` —— pnpm 会把这种请求写进 `minimumReleaseAgeExclude`，
   等于悄悄绕过用户依赖的年龄策略。
2. **版本决策全部交给 DSH CLI。** 插件不自己查 registry 挑版本，所以语义和你手动跑完全一致。
3. **apply 前一定快照**，保留最近 5 份；`rollback` 是一等公民。
4. **不替用户重启 DSH。** 给 agent 的工具只报告需要重启；页面上的「重启 DSH」走能力门禁，
   桌面版一律拒绝并说明由外壳负责。
5. **只写 profile 目录**（`$DSH_HOME/profiles/<name>`）与 `$DSH_HOME` 下自己的目录缓存，
   不碰用户代码、不碰 agent 配置。
6. **「发现」只能装目录里的包，且永远不带版本。**
7. **Windows 上自己拼命令行**再交给 cmd.exe —— Node 的 `shell: true` 不转义参数（DEP0190），
   cmd 会把 `^` 吃掉。

## 它不是什么

- 不是 DSH 主程序（harness）更新器 —— 那是另一类插件。
- 不会绕过「最小发布时长」策略。这是特性，不是缺陷。

## 开发

```sh
npm install
npm test          # node --test，离线、无网络依赖
```

本机（Windows + DSH 桌面版）也可以直接用 DSH 自带的 Node：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'D:\DSH\DeepSeek Harness.exe' --test
```

注意用**不带参数**的 `--test`：那个 Node（asar 里的 v24）不展开目录参数，`--test test/` 会报
`Cannot find module …\test`，看起来像测试坏了。

## License

MIT
