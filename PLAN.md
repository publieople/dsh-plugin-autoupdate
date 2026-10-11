# 开发计划

目标：一个能进 DSH 插件市场、别人 `dsh plugin add` 就能用的**公开**插件。

## 状态总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 仓库与骨架（清单、cordis patch、CLI 契约、单测） | ✅ 已完成 |
| M1 | host 侧真实组合验证（临时 profile 跑通 check/apply/rollback） | ✅ 已完成（25/25） |
| M2 | 客户端页面（UniGetUI 式四视图） | ✅ v0.2.0：主栏页面 + 侧栏入口 + 刷新/重启 + 可用更新/已安装/发现/已锁定 + 中英本地化；仅剩 jsdom 挂载测试 |
| M2+ | 自动更新：定时检查 + 满足条件自己应用（用户 2026-10-11 拍板） | ✅ v0.3.0 |
| M3 | 发布到 npm + 打 tag | ✅ 0.2.0 已发布（2026-10-10）；此后打 tag 自动发布，Trusted Publisher 已验证 |
| M4 | 提交进插件目录（别人能搜到） | ⬜ 待做（条目已拟好，等确认开 PR） |

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

### 客户端页面（commit 3）—— 除 jsdom 挂载测试外全部并入 v0.2.0

- ✅ client：`src/client/*.tsx` + tsdown 构建 → `lib/client.js`；`exports['./client']`、`dsh.client.platform: 'web'`
- ✅ 客户端依赖写在 **client bundle 导出的 `export const inject`** 里（`dsh.client.inject` 只是预检/HMR 用的信息性元数据）
- ✅ 四个视图：可用更新（勾选 / 批量应用 / 导出 CSV / 锁定）、已安装、发现、已锁定
- ✅ 右上角两个按钮：**刷新界面**（`location.reload()`）与**重启 DSH**
  （能力门禁：桌面版报 409 + 原因，CLI/服务部署自重启；见 AGENTS.md 第 4 条）
- ⬜ jsdom 挂载测试用官方 `@deepseek-ai/dsh-client-test-runtime`

### M2 剩余

- ✅ 页面本地化（2026-10-09，第四轮，见下）
- ⬜ jsdom 挂载测试（官方 `@deepseek-ai/dsh-client-test-runtime`）

### 已完成：自动更新（2026-10-11，第五轮）

用户原话（m00560）："对的, 就是定时检查, 满足条件的自己更新, 重启后生效无所谓, 正常电脑都会自己重启的,
电脑重启的时候DSH桌面端肯定也重启了." —— 即"定时检查 + 自动应用"，不要求立刻生效。

- **状态文件仍是唯一真源**：`<profile>/.plugin-autoupdate.json` 现在同时放锁清单、`settings`
  （`checkOnStart` / `checkEveryMinutes` 0..10080 / `applyUpdates`）、`auto`（上次运行结果）与
  `failures`（`包@版本` → 首次失败时间，最多 50 条）；写入走 tmp + rename，永远整份写，
  因为四个字段共用一个文件，局部写会悄悄丢掉另一条路径的数据。
- **`lib/auto.js`**：`checkDue({settings,auto,now,since,startupDone,startDelayMs})` 是纯函数
  （reason ∈ disabled / grace / start / interval-off / not-due / interval）；`planAutoApply` 同样纯
  （锁定行已被 `splitLocked` 移出，失败过的 `name@latest` 移进 `skipped`）；
  `createAutoSupervisor` 用"心跳重读设置"而不是固定 interval 链 —— **页面改开关一拍内生效，不用重启宿主**；
  全部协作者可注入，所以 `test/auto.test.mjs` 用假时钟 + 假 CLI + 真临时 profile 目录跑完 16 个用例。
- **安全边界**：定时器只跑人也会跑的 `dsh plugin update`（绝不 `add pkg@版本`，否则会写
  `minimumReleaseAgeExclude` 绕开年龄策略）；锁定项永不自动应用；失败的 `包@版本` 不重试
  （换新版本才重试，「清除失败记忆」是逃生口）；apply 成功才 `pruneSnapshots`，`changed` 为空
  （精确钉版本）记为 `nothing moved` 当作失败，避免每拍空转；`profiles()` 为空、check 抛错都不炸
  （抛错也记 `lastCheckAt`/`lastError` 并标记本进程已跑过启动检查，缺 CLI 时不会每拍起进程）。
- **宿主接口**：`ROUTE_FEATURES` 追加 `settings`（9 条）；`GET /status` 每条 report 增加
  `settings` 与 `auto`；新增 `POST /settings`（同样信任围栏，但**不要 `confirm`**：不装代码、可逆，
  与 lock/unlock 同类；`clearFailures: true` 顺带清失败记忆）；agent 工具加 `settings` 动作与
  `checkOnStart`/`checkEveryMinutes`/`applyUpdates` 参数。
- **页面**：第 5 个 tab「自动更新 / Auto-update」，每 profile 一块（两个复选 + 间隔下拉 + 保存 +
  上次检查/已应用/跳过/错误 + 清除失败记忆）；草稿用 JSON 比对而不是对象身份重同步，避免轮询把没保存的编辑冲掉。
- **发布与装盘（2026-10-11）**：`v0.3.0` tag 驱动 `publish.yml`（run 38101086231）全绿发布 ——
  Trusted Publisher 真生效，带 sigstore provenance（transparency log index 3196976190），
  20 个文件 / 84.8 kB；装进 desktop profile 后逐文件 SHA256 与仓库一致（含新增的 `lib/auto.js`）。
  **三个开关默认全关**（`DEFAULT_SETTINGS`：`checkOnStart:false` / `checkEveryMinutes:0` /
  `applyUpdates:false`）—— 别人装上不会自己跑任何检查，也不会自己写 profile；
  只有本机 desktop profile 手动打开了：启动后检查一次 + 每 6 小时 + 发现更新就自动应用（用户明确要求本地开着）。
- **测试**：`test/auto.test.mjs` 16 个用例；`test/http.test.mjs` features 断言改 9 条 +
  `/settings` 的 403 / 405 / 400（无 profile）/ 200（先 clearFailures 再写）与 status 带 settings+auto。
  全套 76/76（原 57 + 16 auto + 3 http）。

### 已完成：中英本地化（2026-10-09，第四轮）

- 参考三份已装插件的实现（`@linxin666/dsh-update`、`@linxin666/dsh-client-ui-plugin-manager`、
  `dsh-better-sidebar`、`@agents-anywhere/dsh-bridge-next`）：一个命名空间 + 每语言一份词典，
  `ctx.locale.register(NS, { zh, en })` 注册、`ctx.locale.bind(NS)` 读取、`ctx.locale.subscribe` 管语言切换重渲染
- `src/client/locales.ts`（77 个 key：`zh` 是 key 全集与离线回退，`en` 逐 key 对齐）+
  `src/client/i18n.ts`（apply 时抓住 locale 服务；服务缺席或拒绝时回退中文词典，绝不渲染出 key）
- `src/client/index.tsx` 不再有硬编码文案；两个 slot 注册都声明 `locale: NS`
- `test/client-bundle.test.mjs` 新增契约测试：zh/en 键集合必须相等、代码里 `translate("…")` 用到的 key
  必须都在词典里、词典里不能有死 key（本文件抓到了正则漏掉带数字的 key：`error.catalog404`）

### 已完成：文档对齐（2026-10-09，第三轮）

- README.md / README.en.md 重写：补上 v0.2.0 的页面四视图、发现目录的数据源与缓存、锁定语义、
  8 条 HTTP 路由与信任围栏、重启能力门禁、快照目录；安全模型扩到 7 条
- AGENTS.md 的开发命令修正：`--test test/` 在 DSH 自带 Node（asar 里的 v24）里不展开目录参数，
  会报 `Cannot find module …\test` 并算作一个失败的「测试」；改用不带参数的 `--test`
- `test/restart.test.mjs` 不再继承环境的 `process.versions` / `process.argv` —— 桌面版 Node 里那两样是
  Electron 的，`restartCapability({ desktop: false, env: {} })` 会被环境判成桌面宿主而失败（55 中红 1）

### 已完成：发现视图 + 锁定（2026-10-09，第二轮）

- **发现**：host 侧拉 `https://awesome-dsh-plugin.com/plugins.json`（=`dsh-market` 的官方目录，4460 个插件，
  5.3 MB，带分类/中英描述/stars/下载量/能力标注），缓存在 `$DSH_HOME/.plugin-autoupdate-catalog.json`（TTL 12h，
  拉不到就退回旧缓存并标注 stale）；页面走 `GET /plugin-autoupdate/catalog`，搜索框 + 分类筛选 + 安装按钮。
- **安装**：`POST /install`，要求 `confirm: true` + Host 信任；**spec 必须在目录里，且只取 npm 名，绝不带版本**
  （`pkg@x` → 400），然后交给 `dsh plugin add`。装完提示需要重启。
- **锁定**：`POST /lock`、`/unlock`，状态写在 `<profile>/.plugin-autoupdate.json`（我们自己的文件，不碰 manifest、不钉版本）；
  `check`/`/status` 会把锁定的包从「可更新」移进 `lockedRows` —— **抑制提示，但不隐藏事实**；agent 工具也有 `lock`/`unlock`。
- 页面：四个 tab（可用更新 / 已安装 / 发现 / 已锁定），可用更新里每行多一个「锁定」按钮。

### 已完成（v0.2.0，2026-10-09）

- 座位：`main`（keyed slot）+ `sidebar.panellist` 图标 → 与对话页同级的主栏整页
- 两个 tab：可用更新（勾选 / 批量应用 / 来源）/ 已安装（版本范围 / 来源 / 回滚）
- 工具栏：重新加载 · 更新所选 · 全部更新 · `--latest` · 回滚 · 导出 CSV
- 右上角：**刷新界面**（`location.reload()`）与**重启 DSH**（能力门禁：桌面宿主判为不支持并说明原因）

## M3 —— 发布 ✅（0.2.0 已发布，之后走 tag）

1. ~~建 GitHub 仓库，填 `repository` / `homepage` / `bugs`~~ —— 已完成（publieople/dsh-plugin-autoupdate）
2. ~~`npm publish`~~ —— **0.2.0 于 2026-10-10 发布**（用户交互式 2FA 通过可见控制台窗口完成；
   非 TTY 下 npm 直接抛 EOTP，见 `npm/lib/utils/auth.js` 的 otplease）。registry 上的 tarball 已逐文件核对
   （19 个文件，`lib/client.js` SHA256 与仓库一致），并用全新 profile `npmtest` 装过、`--dump-config` 验证。
3. **Trusted Publisher 已配好并验证**：用 `workflow_dispatch` 触发 `publish.yml`（run 38046722589），
   测试步骤全绿、Publish 步骤报 `You cannot publish over the previously published versions: 0.2.0` ——
   这个"版本冲突"而不是"未登录"证明 OIDC 换到了 token（`npm/lib/utils/oidc.js` 交换成功后才走到版本检查），
   且副作用为零。**发布新版本从此只需**：改 `version` → `git tag vX.Y.Z && git push origin vX.Y.Z`。
4. 注意：**绝不能给 0.2.0 补打 tag**（会重复发布同一版本而失败）；`0.0.0-stage` 是 npm 11 用 staged publish
   建包留下的占位版本，可清理（要交互式 2FA）。

## M4 —— 进目录（能被搜到）

插件市场读的是社区目录（awesome-dsh-plugin / dsh.works / dsh.so 等）。需要：

1. 仓库公开、README 完整、LICENSE 齐全
2. 通过目录的静态检查（它们会记录能力面与风险标注）
3. 提交收录

> 本机已装 `dsh-find-plugins`，可以用它反查每个目录的收录要求与同类插件写法。

## 待你拍板

1. ~~GitHub 账号/仓库名~~ —— 已用 gh CLI（账号 `publieople`）建好并推送
2. ~~npm 发布方式~~ —— 已定：先本地发 0.2.0 让包存在，再配 Trusted Publisher；已配好并用 0.2.0 验证通过
3. ~~包名~~ —— `dsh-plugin-autoupdate` 已确认未被占用
4. **LICENSE 版权署名** —— 现为 `publieople`，要改说一声
5. ~~要不要现在发 0.2.0~~ —— 已发布（2026-10-10）
6. **M4 目录 PR** —— 条目已按 awesome-dsh-plugin 的 contributing.md 拟好（`data/plugins/publieople__dsh-plugin-autoupdate.yml`，
   category 选 `market`，中英描述各一句），等一句"开吧"
7. **桌面版「重启 DSH」** —— 用户 2026-10-09 已否决外部重启助手（"外部的重启那没必要"）；按钮保持置灰 + 说明原因
8. **待清理**：npm 上的 `0.0.0-stage` 是否 unpublish；CI 里那个红的 run 38046722589（TP 验证留下的证据）是否删

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
