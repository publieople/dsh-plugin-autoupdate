# 开发计划

目标：一个能进 DSH 插件市场、别人 `dsh plugin add` 就能用的**公开**插件。

## 状态总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 仓库与骨架（清单、cordis patch、CLI 契约、单测） | ✅ 已完成 |
| M1 | host 侧真实组合验证（临时 profile 跑通 check/apply/rollback） | ✅ 已完成（25/25） |
| M2 | 客户端页面（UniGetUI 式三视图） | 🚧 v0.2.0：主栏页面 + 侧栏入口 + 刷新/重启按钮 ✅；已安装/可用更新两视图 ✅；**发现视图待做** |
| M3 | 发布到 npm + 打 tag | ⬜ 待做 |
| M4 | 提交进插件目录（别人能搜到） | ⬜ 待做 |

## M0 —— 已完成

- `package.json`：`dsh.bundle.patch`、peer 声明到 `^0.2.0-rc.1`、`publishConfig.access=public`
- `lib/`：`dsh-cli.js`（定位 DSH CLI）、`profiles.js`（发现 profile）、`outdated.js`（跑 CLI + 解析 `pnpm outdated`）、`apply.js`（快照 / 更新 / 回滚）、`index.js`（工具注册）
- `test/`：5 个单测全过（表格解析、manifest diff）

## M1 —— 真实组合验证 ✅ 已完成（2026-10-09）

在临时 profile `m1test` 上验证，**不碰 desktop**：

- 从 GitHub 安装（真实用户路径）：`dsh plugin --profile m1test add github:publieople/dsh-plugin-autoupdate` → 23 个包，exit 0，**没有被安装闸门拒**
- `dsh --profile m1test --dump-config` → 368 行，exit 0，包含 `- id: plugin-autoupdate`，零错误
- `node scripts/m1-live-check.mjs m1test` → **25/25 通过**：工具契约（defineTool 归一化后的 schema）、check、apply（含快照字节级校验）、rollback、精确钉住路径、失败路径
- 单测 `npm test` → **10/10 通过**（含新增的 cmd 转义测试）

**M1 抓到并修掉的两个真实缺陷：**

1. **Windows 参数被 cmd.exe 吃掉。** `runCli` 用 `shell: true` 时 Node 只把参数空格拼接、不转义（DEP0190），
   cmd.exe 于是把 `pkg@^1.2.3` 变成 `pkg@1.2.3`。已改为自己构造命令行并对每个参数做 cmd 转义
   （引号处理元字符，`%` 显式翻倍），并补了 `test/shell.test.mjs`。
2. **钉住版本的依赖不会自动升级，但工具没说。** `apply` 现在会在「manifest 没动」时额外报告
   「解析器仍然提供了这些更新，只是被记录的范围挡住」，并提示 `latest=true`。
   （顺带确定：`dsh plugin add pkg@<范围>` 存的是**解析后的精确版本**——pnpm 行为，已写进 README。）

验收标准，缺一不可：

1. 在**临时 profile** 上安装（`dsh plugin --profile <tmp> add <本地路径>`），`--dump-config` 输出里出现 `plugin-autoupdate` 行，退出码 0、零错误
2. 该 profile 下工具 `dsh_plugin_updates` 可用，`action=check` 返回真实 outdated 表
3. `action=apply` 在临时 profile 上真的升级了至少一个包；`<profile>/.plugin-backup-auto-*` 快照存在，且内容等于升级前的 `package.json`
4. `action=rollback` 能把 `package.json` 恢复到快照内容
5. 失败路径可读：CLI 不存在 / profile 不存在 / 无更新，返回结构化错误而不是抛异常
6. 在本机真实 desktop profile 上只跑 `check`（只读），确认结果与 `pnpm outdated` 完全一致

## M2 —— 设置页（进行中）

形态参照 UniGetUI：**已安装 / 可用更新 / 发现** 三个视图 + 统一工具栏 + 来源筛选。
座位是 `settings.section`（独立页「插件更新」），不是 Plugins 里的 tab ——
`settings.plugins.tab` 由 Plugins 区的 owner 在运行时声明，用户没装那个 bundle 时我们的 tab 无处安放。
设置页 shell 只给 section 一个 `close()`，**导航权在 shell 手里**，所以第三方 section 不能跳到另一个 section。

「发现」视图：**用插件市场的数据源自己做**（用户 2026-10-09 决定），暂缓，先用市场已有的页面。

### 已完成：host HTTP 层（commit 1）

- `lib/http.js`：`GET /plugin-autoupdate/status`、`POST /plugin-autoupdate/apply`、`POST /plugin-autoupdate/rollback`
- 三条路由都是**裸 `webServer` 精确注册**（照 `dsh-market` 的做法）。关键原因：DSH 的 `/api` 栅栏是**前缀**路由，精确路由会盖过它 —— 所以 Host 信任检查必须自己做
- 策略与 #729 一致：**读不设栅栏**（命名部署必须能用），**写要求 loopback 或已声明 authority**；`PLUGIN_AUTOUPDATE_TRUSTED_HOSTS` 可增补
- 写操作要求 `confirm: true`，仍走同一批函数（`checkProfile` / `applyUpdate` / `rollback`），安全模型一条不改
- 客户端是**可选注入**（`ctx.inject(['webServer'], …)`）：headless profile 没有 webServer 也照样拿到工具

验证：`npm test` **20/20**（含 Host 信任、405/403/400、confirm 门禁）+
`node scripts/m1-http-check.mjs m1test` **14/14**（真实 socket、真实 handler、真实 CLI、真实 profile：status → 405 → 伪造 Host 403 → 缺 confirm 400 → apply 改变 manifest → rollback 字节级还原）。

### 已完成：客户端页面（v0.2.0）

- 座位从 `settings.section` 换成 **主栏页面**：`main`（keyed slot，key = 面板 id）+ `sidebar.panellist`（侧栏图标）。
  用户反馈「设置页太小」，而 `main` 就是对话、插件页、任务管理器共用的那一栏。
  第一方范例：`packages/client/ui-plugin-manager/src/client/index.ts:110`。
- 构建形态见 AGENTS.md：client bundle 必须是 `window.__ModuleLoader__.load({id, factory})` 闭包工厂，不是 ESM
  （2026-10-09 用 ESM 构建导致桌面版整个 web boot 挂掉）。
- `test/client-bundle.test.mjs` 离线执行产物，断言工厂格式、`require('react')` 外置、两个 slot 注册与 `label()` 形态。

### 待做（commit 3）

- client：`src/client/*.tsx` + tsdown 构建 → `lib/client.js`；`exports['./client']`、`dsh.client.platform: 'web'`
- 客户端依赖写在 **client bundle 导出的 `export const inject`** 里（`dsh.client.inject` 只是预检/HMR 用的信息性元数据）
- 页面：已安装 / 可用更新两个视图先做（含勾选、批量应用、导出 CSV、快照列表）；「发现」后做
- 右上角两个按钮：**刷新界面**（`location.reload()`，让新装的客户端插件立刻生效）与**重启 DSH**
  （能力门禁：桌面版报 409 + 原因，CLI/服务部署自重启；见 AGENTS.md 第 4 条）
- jsdom 挂载测试用官方 `@deepseek-ai/dsh-client-test-runtime`

### M2 剩余（你已确认要做，但排在后面）

1. **发现视图**：借 DSH 市场的数据源，自己做「发现 + 安装」页（2026-10-09 你定的方向；当时说先不急）
2. **忽略更新**：需要新增一份持久化状态（按插件名 + 版本记录忽略项），core 稳了再加
3. 页面本地化（现在 label 是硬编码中文；生态惯例是 `ctx.locale.register` + 中英词典）

### 已完成（v0.2.0，2026-10-09）

- 座位：`main`（keyed slot）+ `sidebar.panellist` 图标 → 与对话页同级的主栏整页
- 两个 tab：可用更新（勾选 / 批量应用 / 来源）/ 已安装（版本范围 / 来源 / 回滚）
- 工具栏：重新加载 · 更新所选 · 全部更新 · `--latest` · 回滚 · 导出 CSV
- 右上角：**刷新界面**（`location.reload()`）与**重启 DSH**（能力门禁：桌面宿主判为不支持并说明原因）

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

1. ~~GitHub 账号/仓库名~~ —— 已用 gh CLI（账号 `publieople`）建好并推送
2. **npm 发布者**：待定 —— 你在 npmjs.com 配 Trusted Publisher（我打 tag 自动发），还是你本地 `npm publish`
3. ~~包名~~ —— `dsh-plugin-autoupdate` 已确认未被占用
4. **LICENSE 版权署名** —— 现为 `publieople`，要改说一声
5. **要不要现在发 0.2.0** —— 代码已过真实组合验证（42/42 + 14/14 live + CI 绿），可以直接发；也可以先把发现视图做完一起发

## 仓库规范（对齐生态惯例）

对照三个已进市场的插件仓库（`dsh-find-plugins` / `dsh-smooth-stream` / `dsh-purge`）后采用：

| 惯例 | 出处 | 本仓库 |
|---|---|---|
| `README.md` + 第二语言 README | 3/3 都有 | `README.md`(中文) + `README.en.md` |
| `.github/workflows/test.yml`（checkout@v6 / setup-node@v6 / matrix 22+24） | `dsh-find-plugins` | 已照搬 |
| `.github/workflows/publish.yml`（tag 驱动 + npm OIDC，无长期 token） | `dsh-find-plugins` | 已照搬 |
| peer 同时列进 `devDependencies`，CI 一次 `npm install` 就能跑测试 | `dsh-find-plugins` | 已采用 |
| 提交 lockfile（`npm ci` 需要） | `dsh-find-plugins` | 已提交 `package-lock.json` |
| `dsh.engines.dsh` 声明 | `@linxin666/*` 家族 | `>=0.2.0-rc.1` |
| `AGENTS.md` 写给接手的 agent | `dsh-smooth-stream` | 已加（5 条不可违反约束） |
| `repository` / `homepage` / `bugs` | 生态普遍 | 已填 |
| `.gitattributes`（强制 LF） | 生态未用，但 Windows 编辑 + Linux CI 必需 | 已加 |

未采用：`CHANGELOG.md` / `CONTRIBUTING.md` / `icon.svg` —— 三个参考仓库都没有（icon 只有 UI 类插件用）。
