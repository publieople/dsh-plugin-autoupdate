# AGENTS.md

面向接手这个仓库的 agent 与人类贡献者。**先读 README 的「安全模型」，再改代码。**

## 不可违反的约束

1. **绝不调用 `dsh plugin ... add <pkg>@<version>`。** pnpm 会把显式版本请求写进用户的
   `minimumReleaseAgeExclude`，等于替用户绕过「最小发布时长」供应链策略。只允许 `update` / `install`。
2. **不自己选版本。** 版本决策全部交给 DSH CLI（`dsh plugin --profile <p> outdated|update`）。
   本插件不去查 registry 挑版本——那会让插件的判断和 `pnpm outdated` 不一致。
3. **写入前必须快照。** `applyUpdate` 先 `snapshotProfile`，保留最近 5 份；`rollback` 是一等公民。
4. **重启只能由用户点按钮触发，且只在宿主支持的部署里执行。** 给 agent 的工具永不重启宿主，只报告 `restartRequired`。
   页面上的「重启 DSH」走能力门禁：官方桌面版由外壳管理进程生命周期（判据是 `process.versions.electron`，
   不是服务查找 —— 见下面第三条实测；返回 409 并说明原因）；CLI / 服务部署才执行 —— 有 supervisor（systemd/pm2/launchd）就直接退出交给它，
   没有才 detached 拉起自己并等端口释放。**绝不 `app.relaunch` Electron。**
5. **只写 profile 目录**（`$DSH_HOME/profiles/<name>`），不碰用户代码、不碰 agent 配置。
   「锁定」写的是 profile 目录里的 `.plugin-autoupdate.json`（我们自己的状态文件），
   **绝不**为了锁定去动 manifest、也绝不做版本钉住。
6. **「发现」只能装官方目录里的包，且永远不带版本。** 目录就是 dsh-market 用的那份
   `https://awesome-dsh-plugin.com/plugins.json`；安装 spec 必须能在其中找到，且只取 `npm`/`name`，
   `pkg@1.2.3` 一律 400（否则又绕开年龄策略）。
7. **Windows 上自己拼命令行再交给 cmd.exe。** Node 的 `shell: true` 不转义参数（DEP0190），
   cmd 会吃掉 `^`。走 `buildWindowsCommand()` + `quoteForCmd()`，别直接 `spawn(cmd, args, { shell: true })`。

## 实测行为（别再踩）

- **判定「是不是官方桌面版」只能看 `process.versions.electron`（且没有 `ELECTRON_RUN_AS_NODE`）。**
  2026-10-09 我用 `ctx.get('desktopProfiles')` 判，在这台机器的运行中宿主里判成了「非桌面」，
  页面上的「重启 DSH」被点亮 —— 点下去就是 `process.exit(0)` 掉 Electron 主进程。
  `scheduleRestart()` 里已经加了硬闸（Electron 进程一律拒绝），但门禁本身也别再用服务查找。
- **「刷新界面」只换客户端半边，宿主半边只有重启进程才会重载。** 2026-10-09 15:0x 真实发生：
  新客户端 bundle（4 个 tab）随页面刷新立刻生效，而运行中的宿主进程还是 14:44 启动时加载的旧代码 ——
  「发现」页发出 `GET /plugin-autoupdate/catalog`，宿主答 404，页面把非 JSON 的 404 当成了「还没有目录数据」，
  并按 `catalog === null` 反复重试，用户看到的就是「等了十几秒没动静」。
  现在两头都有判据：`/status` 返回 `features`（`ROUTE_FEATURES`）与 `version`，页面比对出缺失就直说
  「宿主插件还是旧版本，退出 DSH 再重开」；`send()` 保留 HTTP 状态码与响应体；目录请求只自动发一次。
  **改宿主代码后必须让用户完全退出并重开 DSH，不能只说「刷新」。**

- **别在用户可能刷新的时刻给运行中的桌面版 remove+add 插件。** 客户端 bundle 会短暂消失，
  此时「刷新界面」会让 web boot 挂掉（2026-10-09 14:31 真实发生：dsh-plugin-autoupdate 与 dshmarket 双双加载失败）。
  装完等几秒，或先告知用户别刷新。

- `dsh plugin add <pkg>@<范围>` 存的是**解析后的精确版本**（pnpm 行为）：这种依赖 `update` 不会动它，
  必须 `latest: true` 才能升。工具会主动报告这种情况。
- `defineTool` 会把 `parameters` 归一化成 JSON Schema（`required: ['action']`），不是原来的 `required: true`。
  写测试断言时按归一化后的形状写。

## 契约

**client bundle 不是 ES module。** 它必须是 classic script 里的闭包工厂：

```js
window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => { /* CJS 产物 */ return module.exports } })
```

`require` 由 web client 的模块表回答（react 与 `@deepseek-ai/dsh-client-*` 保持 external，其余内联）。
2026-10-09 我在这一条上翻过车：用普通 ESM 构建，构建、host 单测、CI 全绿，
一重启桌面版就 `Cannot use import statement outside a module`，整个 web boot 挂掉。
`tsdown.config.ts` 里的 banner/intro/footer 就是为此存在的，`test/client-bundle.test.mjs` 离线守这条契约。

- `cordis.patch.yml` 必须是顶层数组，并在 `package.json.dsh.bundle.patch` 指向它。
- peer 范围必须覆盖目标 DSH 版本（当前 `^0.2.0-rc.1` 覆盖到 `0.2.0-rc.2`）；
  声明不覆盖会被安装闸门直接拒绝。
- 插件是 **host + client**：`dsh.client.platform: 'web'` + `exports['./client']` 指向构建出来的 `lib/client.js`。
  client 依赖写在 client bundle 导出的 `export const inject` 里（真实激活依据）；
  `dsh.client.inject` 只是给预检/HMR diff 用的信息性元数据。

## 开发

```sh
npm install          # 只为装 devDependencies（peer 同名，见仓库惯例）
npm test             # node --test，离线、无网络依赖
```

本机（Windows + DSH 桌面版）也可以直接用 DSH 自带的 Node：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'D:\DSH\DeepSeek Harness.exe' --test
```

**别写成 `--test test/`**（2026-10-09 实测）：asar 里那个 Node 不展开目录参数，会报
`Cannot find module …\test`，还被算作一个失败的「测试」，看起来像代码坏了。不带参数才会自己发现
`test/*.test.mjs`；要指定就显式列文件。两条命令都必须全绿，所以测试本身也别去读环境的
`process.versions` / `process.argv` —— 在桌面版 Node 里那两样是 Electron 的，
`restart.test.mjs` 就因为漏了这一点只在其中一条命令下红。

## 验收（M1 已完成，见 `PLAN.md`）

临时 profile 上跑一遍离线的实时校验（会真的改动那个 profile，**别指向 desktop**）：

```sh
DSH_CLI=<dsh.cmd 路径> node scripts/m1-live-check.mjs <临时 profile 名>
```

它覆盖：工具契约、check、apply（含快照字节比对）、rollback、精确钉住路径、失败路径。
在真实 profile 上只允许跑只读的 `action=check`。

HTTP 那一半（状态、信任围栏、发现目录、锁定、安装）：

```sh
DSH_CLI=<dsh.cmd 路径> node scripts/m1-http-check.mjs <临时 profile 名>
```

**必须显式给 `DSH_CLI`**：普通 node 进程里 `findDshCli()` 看不到桌面版自带的 CLI（它按
`process.execPath` 推路径），会退化成 PATH 上的 `dsh.cmd`；脚本现在会先检查该文件存在，不存在就直接退出，
免得把环境问题报成 6 个失败。本机路径：`D:\DSH\resources\runtime\cli\bin\dsh.cmd`。
