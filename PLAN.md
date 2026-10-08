# 开发计划

目标：一个能进 DSH 插件市场、别人 `dsh plugin add` 就能用的**公开**插件。

## 状态总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 仓库与骨架（清单、cordis patch、CLI 契约、单测） | ✅ 已完成 |
| M1 | host 侧真实组合验证（临时 profile 跑通 check/apply/rollback） | ⬜ 待做 |
| M2 | 客户端设置页（可选） | ⬜ 待定 |
| M3 | 发布到 npm + 打 tag | ⬜ 待做 |
| M4 | 提交进插件目录（别人能搜到） | ⬜ 待做 |

## M0 —— 已完成

- `package.json`：`dsh.bundle.patch`、peer 声明到 `^0.2.0-rc.1`、`publishConfig.access=public`
- `lib/`：`dsh-cli.js`（定位 DSH CLI）、`profiles.js`（发现 profile）、`outdated.js`（跑 CLI + 解析 `pnpm outdated`）、`apply.js`（快照 / 更新 / 回滚）、`index.js`（工具注册）
- `test/`：5 个单测全过（表格解析、manifest diff）

## M1 —— 真实组合验证（下一步）

验收标准，缺一不可：

1. 在**临时 profile** 上安装（`dsh plugin --profile <tmp> add <本地路径>`），`--dump-config` 输出里出现 `plugin-autoupdate` 行，退出码 0、零错误
2. 该 profile 下工具 `dsh_plugin_updates` 可用，`action=check` 返回真实 outdated 表
3. `action=apply` 在临时 profile 上真的升级了至少一个包；`<profile>/.plugin-backup-auto-*` 快照存在，且内容等于升级前的 `package.json`
4. `action=rollback` 能把 `package.json` 恢复到快照内容
5. 失败路径可读：CLI 不存在 / profile 不存在 / 无更新，返回结构化错误而不是抛异常
6. 在本机真实 desktop profile 上只跑 `check`（只读），确认结果与 `pnpm outdated` 完全一致

## M2 —— 设置页（可选）

host-only 版已经覆盖「让 agent 帮我更新」。设置页的收益是给人一个可视化入口。

若要加：补 `dsh.client` + `exports['./client']` + 设置页 slot。注意 client 依赖要写在 **client bundle 导出的 `export const inject`** 里 —— `dsh.client.inject` 只是给预检/HMR diff 用的信息性元数据，不决定激活顺序。

## M3 —— 发布

1. 建 GitHub 仓库，把 `repository` / `homepage` / `bugs` 填回 `package.json`
2. `npm publish`（已设 public access）
3. 打 tag `v0.1.0`

## M4 —— 进目录（能被搜到）

插件市场读的是社区目录（awesome-dsh-plugin / dsh.works / dsh.so 等）。需要：

1. 仓库公开、README 完整、LICENSE 齐全
2. 通过目录的静态检查（它们会记录能力面与风险标注）
3. 提交收录

> 本机已装 `dsh-find-plugins`，可以用它反查每个目录的收录要求与同类插件写法。

## 待你拍板

1. GitHub 账号/组织名与仓库名（决定 `repository` 字段与 README 徽章）
2. npm 发布者（用你的账号发，还是我准备好产物你来 `npm publish`）
3. 包名是否就用 `dsh-plugin-autoupdate`（已确认 npm 上未被占用）
4. LICENSE 版权署名是否用 `publieople`
