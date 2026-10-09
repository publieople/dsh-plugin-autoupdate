# AGENTS.md

面向接手这个仓库的 agent 与人类贡献者。**先读 README 的「安全模型」，再改代码。**

## 不可违反的约束

1. **绝不调用 `dsh plugin ... add <pkg>@<version>`。** pnpm 会把显式版本请求写进用户的
   `minimumReleaseAgeExclude`，等于替用户绕过「最小发布时长」供应链策略。只允许 `update` / `install`。
2. **不自己选版本。** 版本决策全部交给 DSH CLI（`dsh plugin --profile <p> outdated|update`）。
   本插件不去查 registry 挑版本——那会让插件的判断和 `pnpm outdated` 不一致。
3. **写入前必须快照。** `applyUpdate` 先 `snapshotProfile`，保留最近 5 份；`rollback` 是一等公民。
4. **不替用户重启 DSH。** 只能报告 `restartRequired`。
5. **只写 profile 目录**（`$DSH_HOME/profiles/<name>`），不碰用户代码、不碰 agent 配置。
6. **Windows 上自己拼命令行再交给 cmd.exe。** Node 的 `shell: true` 不转义参数（DEP0190），
   cmd 会吃掉 `^`。走 `buildWindowsCommand()` + `quoteForCmd()`，别直接 `spawn(cmd, args, { shell: true })`。

## 两条实测行为（别再踩）

- `dsh plugin add <pkg>@<范围>` 存的是**解析后的精确版本**（pnpm 行为）：这种依赖 `update` 不会动它，
  必须 `latest: true` 才能升。工具会主动报告这种情况。
- `defineTool` 会把 `parameters` 归一化成 JSON Schema（`required: ['action']`），不是原来的 `required: true`。
  写测试断言时按归一化后的形状写。

## 契约

- `cordis.patch.yml` 必须是顶层数组，并在 `package.json.dsh.bundle.patch` 指向它。
- peer 范围必须覆盖目标 DSH 版本（当前 `^0.2.0-rc.1` 覆盖到 `0.2.0-rc.2`）；
  声明不覆盖会被安装闸门直接拒绝。
- 这是 host-only 插件：**不要**加 `dsh.client`，也不要构建 client bundle。
  加设置页时，client 依赖要写在 client bundle 导出的 `export const inject` 里，
  `dsh.client.inject` 只是给预检/HMR diff 用的信息性元数据。

## 开发

```sh
npm install          # 只为装 devDependencies（peer 同名，见仓库惯例）
npm test             # node --test test/，离线、无网络依赖
```

本机（Windows + DSH 桌面版）也可以直接用 DSH 自带的 Node：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'D:\DSH\DeepSeek Harness.exe' --test test/
```

## 验收标准（M1，尚未完成）

见 `PLAN.md`。核心是：在**临时 profile** 上真实安装并跑通 check / apply / rollback，
再在真实 profile 上只跑只读的 check。
