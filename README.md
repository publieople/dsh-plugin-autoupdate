# dsh-plugin-autoupdate

给 DeepSeek Harness 的 profile 插件做**守规矩的**更新：只升 pnpm 供应链「最小发布时长」策略放行的版本，动手前自动快照，随时可回滚。

`status: early` · `license: MIT` · `dsh: 0.2.0-rc.x`

## 它解决什么

DSH 的插件装在 profile 里，由 `dsh plugin` 管理。手动更新时有四个坑：

| 坑 | 说明 |
|---|---|
| `pnpm outdated` 的 Latest 不是「仓库最新版」 | pnpm 的 supply-chain 策略会挡掉刚发布的版本；那一列才是**能装**的最新版 |
| `^0.59.2` 这类 0.x 的 caret 范围很窄 | 跨 minor 的更新默认升不上去（同 minor 的可以） |
| 升级后要重启 DSH | 宿主插件才重新加载；浏览器插件还要刷页面 |
| 升坏了怎么办 | 得自己想办法退回去 |

本插件把「检查」和「回滚」自动化，把「重启」明确交还给你。

## 安装

```sh
dsh plugin --profile <你的 profile> add dsh-plugin-autoupdate
```

装完重启 DSH。

## 用法

它给 agent 一个工具 `dsh_plugin_updates`：

| action | 作用 |
|---|---|
| `check`（默认） | 列出每个 profile 里可更新的插件（就是 `pnpm outdated` 的结果） |
| `apply` | 先快照 profile，再执行更新，报告哪些范围动了 |
| `rollback` | 恢复最近的快照（或指定快照）并重装 |

- `profiles`：逗号分隔的 profile 名，默认是当前实例运行的 profile
- `latest`：等价于 `--latest`，忽略记录的 semver 范围来选版本 —— **仍然受发布时长策略约束**
- 工具**不会**替你重启 DSH

> 注意：`dsh plugin add <pkg>@<版本或范围>` 记录的是**解析后的精确版本**（实测 pnpm 行为，
> 与 dsh 包装器无关）。这类依赖用普通 `apply` 不会被自动升级——工具会明确告诉你「有可用更新
> 但被记录的范围挡住」，此时用 `latest=true`（仍受发布时长策略约束）。

## 安全模型

这几条是刻意的：

1. **绝不钉版本。** 不走 `pnpm add pkg@x.y.z` —— pnpm 会把这种请求写进 `minimumReleaseAgeExclude`，等于悄悄绕过用户依赖的年龄策略。
2. **版本决策全部交给 DSH CLI。** 插件不自己查 registry 挑版本，所以语义和你手动跑完全一致。
3. **apply 前一定快照**，保留最近 5 份；`rollback` 是一等公民。
4. **不替用户重启 DSH**，只在报告里写明需要重启。
5. 只写 profile 目录，不碰代码、不碰 agent 配置。

## 它不是什么

- 不是 DSH 主程序（harness）更新器 —— 那是另一类插件
- 不会绕过「最小发布时长」策略。这是特性，不是缺陷

## 开发

单元测试用 DSH 自带的 Node 跑：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'D:\DSH\DeepSeek Harness.exe' --test test/parse.test.mjs
```

## License

MIT
