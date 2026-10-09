window.__ModuleLoader__.load({
	id: "dsh-plugin-autoupdate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/locales.ts
		/**
		* Dictionaries for the 插件更新 page.
		*
		* Shape follows the plugins this one lives beside (\`@linxin666/dsh-update\`,
		* \`dsh-client-ui-plugin-manager\`, \`dsh-better-sidebar\`): one namespace, one
		* dictionary per language, registered through \`ctx.locale.register(NS, { zh, en })\`
		* and read through \`ctx.locale.bind(NS)\`.
		*
		* \`zh\` is the key-set source of truth and the offline fallback; \`en\` mirrors it key
		* for key, and \`test/client-bundle.test.mjs\` fails if the two ever drift apart.
		* Values may carry \`{placeholders}\`, filled from the \`params\` argument.
		*/
		const zh = {
			"nav.title": "插件更新",
			"page.title": "插件更新",
			"page.subtitle": "只升 pnpm「最小发布时长」策略放行的版本；应用前自动快照。",
			"page.refreshUi": "刷新界面",
			"page.refreshUiHint": "重新加载界面：新装的客户端插件会立刻生效。宿主插件不行，那要重启 DSH。",
			"page.restartDsh": "重启 DSH",
			"page.restartHint": "重启 DSH，让新装的宿主插件生效（界面会断开几秒）",
			"page.restartUnsupported": "当前宿主不支持自重启",
			"banner.restartRequired": "已应用更新 —— 需要重启 DSH 才生效（宿主插件重新加载，浏览器插件还要刷新页面）。",
			"banner.hostOld1": "宿主插件还是旧版本：这个界面是新构建的，运行中的宿主进程还是上次启动时加载的代码（没有 /catalog 路由）。",
			"banner.hostOld2": "「刷新界面」不够 —— 请完全退出 DSH（托盘图标 → 退出，不是关窗口）再重开。",
			"tab.updates": "可用更新",
			"tab.installed": "已安装",
			"tab.discover": "发现",
			"tab.locked": "已锁定",
			"action.reload": "重新加载",
			"action.updateSelected": "更新所选",
			"action.updateSelectedCount": "更新所选 ({count})",
			"action.updateAll": "全部更新",
			"action.latest": "忽略版本范围 (--latest)",
			"action.rollbackLast": "回滚最近一次更新",
			"action.exportCsv": "导出 CSV",
			"action.search": "搜索",
			"action.searching": "查询中…",
			"action.retry": "重试",
			"action.lock": "锁定",
			"action.lockHint": "不再提示这个插件的更新",
			"action.unlock": "解锁",
			"action.install": "安装",
			"placeholder.search": "搜索插件（名称 / 描述 / 作者）",
			"select.allCategories": "全部分类",
			"message.appliedLatest": "已按 --latest 应用（仍受发布时长策略约束）",
			"message.appliedRange": "已应用范围内的更新",
			"message.rolledBack": "已回滚到最近的快照",
			"message.locked": "已锁定 {name}：不再提示它的更新（它仍会随范围升级，锁的是提示）",
			"message.unlocked": "已解锁 {name}",
			"message.installed": "已安装 {spec}（需要重启 DSH 生效）",
			"message.restartSupervisor": "正在重启：已交给进程管理器接管。",
			"message.restartHelper": "正在重启：已安排自重启，界面断开几秒后会自己回来。",
			"confirm.install": "安装 {spec} 到 {where}？\n\n装完需要重启 DSH 才会生效。",
			"confirm.restart": "重启 DSH？当前界面会断开，几秒后自动恢复。",
			"confirm.currentProfile": "当前 profile",
			"error.cannotReachHost": "无法连接宿主：{reason}",
			"error.failed": "失败：{reason}",
			"error.restartFailed": "重启失败：{reason}",
			"error.statusFailed": "status 请求失败",
			"error.unknownReason": "未知原因",
			"error.catalogRead": "读取目录失败：{reason}",
			"error.catalogUnavailable": "目录不可用：{reason}",
			"error.catalog404": "宿主没有 /catalog 路由（HTTP 404）—— 运行中的宿主插件还是旧版本。界面能刷新，宿主插件不能：完全退出 DSH（托盘图标 → 退出）再重开。",
			"error.http": "HTTP {code}",
			"error.httpDetail": "HTTP {code}：{reason}",
			"discover.loading": "正在读取插件目录…",
			"discover.loadingElapsed": "（已 {seconds} 秒；首次要下 5 MB，之后走本地缓存）",
			"discover.loadingFirst": "（首次约 5 MB，之后走本地缓存）",
			"discover.empty": "还没有目录数据。",
			"discover.read": "读取目录",
			"discover.noHostRoute": "宿主插件没有目录路由 —— 退出 DSH 再重开，然后回到这里。",
			"discover.summary": "共 {total} 条匹配 · 目录更新于 {updated}",
			"discover.stale": "（离线缓存：{reason}）",
			"discover.staleBare": "（离线缓存）",
			"discover.updatedUnknown": "未知",
			"discover.noMatch": "没有匹配的插件。换个关键词试试。",
			"discover.installed": "已安装",
			"col.plugin": "插件",
			"col.profile": "Profile",
			"col.current": "当前版本",
			"col.latest": "新版本",
			"col.source": "来源",
			"col.description": "说明",
			"col.popularity": "热度",
			"col.capabilities": "能力",
			"col.versionRange": "记录的版本范围",
			"col.lockedAt": "锁定时版本",
			"col.canUpdateTo": "当前可升到",
			"col.alreadyLatest": "已是最新",
			"empty.updates": "没有可用更新 —— 解析器允许的版本都已装上。",
			"empty.installed": "没有已安装的插件。",
			"empty.locked": "没有被锁定的插件。在「可用更新」里点某一行的「锁定」，就不会再提示它的更新。",
			"footer.note": "更新与版本决策完全交给 dsh plugin（与手动执行逐字一致）；「发现」读的是插件市场的官方目录，安装同样不给它选版本。"
		};
		const en = {
			"nav.title": "Plugin updates",
			"page.title": "Plugin updates",
			"page.subtitle": "Only versions pnpm's minimum-release-age policy lets through; a snapshot is taken before every apply.",
			"page.refreshUi": "Refresh UI",
			"page.refreshUiHint": "Reload the page: a freshly installed client plugin takes effect at once. Host plugins do not - those need a DSH restart.",
			"page.restartDsh": "Restart DSH",
			"page.restartHint": "Restart DSH so newly installed host plugins load (the UI drops for a few seconds)",
			"page.restartUnsupported": "this host cannot restart itself",
			"banner.restartRequired": "Updates applied - a DSH restart is required for them to take effect (host plugins reload; browser plugins also need a page refresh).",
			"banner.hostOld1": "The host plugin is an older build: this page is new, but the running host process still carries the code it loaded at start (no /catalog route).",
			"banner.hostOld2": "\"Refresh UI\" is not enough - quit DSH completely (tray icon -> Quit, not just the window) and reopen it.",
			"tab.updates": "Updates",
			"tab.installed": "Installed",
			"tab.discover": "Discover",
			"tab.locked": "Locked",
			"action.reload": "Reload",
			"action.updateSelected": "Update selected",
			"action.updateSelectedCount": "Update selected ({count})",
			"action.updateAll": "Update all",
			"action.latest": "Ignore ranges (--latest)",
			"action.rollbackLast": "Roll back the last update",
			"action.exportCsv": "Export CSV",
			"action.search": "Search",
			"action.searching": "Searching…",
			"action.retry": "Retry",
			"action.lock": "Lock",
			"action.lockHint": "stop offering this plugin update",
			"action.unlock": "Unlock",
			"action.install": "Install",
			"placeholder.search": "Search plugins (name / description / author)",
			"select.allCategories": "All categories",
			"message.appliedLatest": "Applied with --latest (still bounded by the release-age policy)",
			"message.appliedRange": "Applied the updates the recorded ranges allow",
			"message.rolledBack": "Rolled back to the newest snapshot",
			"message.locked": "Locked {name}: its updates are no longer offered (it still updates within its range - a lock suppresses the offer)",
			"message.unlocked": "Unlocked {name}",
			"message.installed": "Installed {spec} (restart DSH for it to take effect)",
			"message.restartSupervisor": "Restarting: handed to the process supervisor.",
			"message.restartHelper": "Restarting: a self-restart is scheduled; the UI comes back on its own in a few seconds.",
			"confirm.install": "Install {spec} into {where}?\n\nDSH must be restarted for it to take effect.",
			"confirm.restart": "Restart DSH? The UI drops and comes back on its own in a few seconds.",
			"confirm.currentProfile": "the current profile",
			"error.cannotReachHost": "Cannot reach the host: {reason}",
			"error.failed": "Failed: {reason}",
			"error.restartFailed": "Restart failed: {reason}",
			"error.statusFailed": "the status request failed",
			"error.unknownReason": "unknown reason",
			"error.catalogRead": "Cannot read the catalog: {reason}",
			"error.catalogUnavailable": "Catalog unavailable: {reason}",
			"error.catalog404": "The host has no /catalog route (HTTP 404) - the running host plugin is an older build. The page reloads; the host plugin does not: quit DSH completely (tray icon -> Quit) and reopen it.",
			"error.http": "HTTP {code}",
			"error.httpDetail": "HTTP {code}: {reason}",
			"discover.loading": "Reading the plugin catalog…",
			"discover.loadingElapsed": "({seconds}s so far; the first fetch is about 5 MB, later ones come from the local cache)",
			"discover.loadingFirst": "(about 5 MB the first time, then the local cache)",
			"discover.empty": "No catalog data yet.",
			"discover.read": "Load the catalog",
			"discover.noHostRoute": "The host plugin has no catalog route - quit DSH, reopen it, then come back here.",
			"discover.summary": "{total} matches · catalog updated {updated}",
			"discover.stale": "(offline cache: {reason})",
			"discover.staleBare": "(offline cache)",
			"discover.updatedUnknown": "unknown",
			"discover.noMatch": "No plugin matches. Try another keyword.",
			"discover.installed": "Installed",
			"col.plugin": "Plugin",
			"col.profile": "Profile",
			"col.current": "Current",
			"col.latest": "New",
			"col.source": "Source",
			"col.description": "Description",
			"col.popularity": "Popularity",
			"col.capabilities": "Capabilities",
			"col.versionRange": "Recorded range",
			"col.lockedAt": "Version at lock",
			"col.canUpdateTo": "Can update to",
			"col.alreadyLatest": "already current",
			"empty.updates": "No updates available - everything the resolver allows is installed.",
			"empty.installed": "No plugins installed.",
			"empty.locked": "Nothing is locked. Use Lock on a row under Updates to stop being offered that update.",
			"footer.note": "Every update and version decision is delegated to dsh plugin (identical to running it by hand); Discover reads the plugin market's official catalog and does not pick versions either."
		};
		//#endregion
		//#region src/client/i18n.ts
		/**
		* The page's translation surface.
		*
		* Same shape the neighbouring plugins use: register one namespace dictionary in
		* apply(), read it back through \`locale.bind(NS)\`, and re-render on a language
		* switch through \`locale.subscribe\`. The service is captured at apply() time
		* instead of imported, so this bundle keeps depending on nothing but React - the
		* client module table is what answers \`require\`, and a hard import of a client
		* package here would have to be externalised to stay resolvable.
		*
		* \`translate\` stays usable when the service is absent (unit tests, a host that
		* serves no locale seat): it then answers from the Chinese dictionary, which is the
		* key-set source of truth.
		*/
		/** Dictionary namespace owned by this plugin; also the seat's \`locale\` field. */
		const NS = "plugin-autoupdate";
		let service = null;
		/** Capture the client locale service. \`undefined\` (no seat) leaves the fallback in place. */
		function attachLocale(locale) {
			const candidate = locale;
			service = candidate && typeof candidate.bind === "function" ? candidate : null;
		}
		/** One key, in the reader's language. Unknown keys fall back to the zh dictionary. */
		function translate(key, params) {
			if (service !== null) try {
				const text = service.bind(NS)(key, params);
				if (typeof text === "string" && text !== "" && text !== key) return text;
			} catch {}
			return fill(zh[key] === void 0 ? key : zh[key], params);
		}
		/** Re-render hook for a language switch. Returns a disposer in every case. */
		function subscribeLocale(listener) {
			if (service === null || typeof service.subscribe !== "function") return () => {};
			try {
				const dispose = service.subscribe(listener);
				return typeof dispose === "function" ? dispose : () => {};
			} catch {
				return () => {};
			}
		}
		/** \`{name}\` placeholders, the same ones the locale service fills in. */
		function fill(text, params) {
			if (params === void 0) return text;
			return text.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* The updates page: 插件更新 / Plugin updates.
		*
		* Shape follows UniGetUI: one tab per view (可用更新 / 已安装 / 发现 / 已锁定), a
		* toolbar that acts on a selection, and a source column. Everything it shows comes
		* from the host's /plugin-autoupdate routes, which delegate every version decision
		* to the DSH CLI - so this page cannot offer something `pnpm outdated` would not offer.
		*
		* Copy lives in ./locales.ts and is read through ./i18n.ts, the same two-file shape
		* the neighbouring plugins use (@linxin666/dsh-update, dsh-client-ui-plugin-manager):
		* one namespace registered in apply(), read back with locale.bind(NS). Adding a
		* language is adding a dictionary - no component changes.
		*
		* Styles are inline on purpose: no CSS pipeline in the build, and the page stays
		* readable in any theme.
		*/
		const ROUTE = "/plugin-autoupdate";
		const TAB_UPDATES = "updates";
		const TAB_INSTALLED = "installed";
		const TAB_DISCOVER = "discover";
		const TAB_LOCKED = "locked";
		const Q = String.fromCharCode(34);
		/**
		* Every route answers JSON - but only when the host actually has that route. A
		* host that predates this bundle answers 404 with a plain body, and `.json()` on
		* that is null, which used to look exactly like "no data yet" and hid the reason.
		* Keep the status code and a snippet of the body so the page can say what happened.
		*/
		async function send(path, init) {
			const response = await fetch(ROUTE + path, init);
			const text = await response.text();
			let json = null;
			if (text !== "") try {
				json = JSON.parse(text);
			} catch {
				json = null;
			}
			return {
				status: response.status,
				json,
				text
			};
		}
		const getStatus = () => send("/status");
		const post = (path, body) => send(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		});
		const S = {
			/**
			* The seat is AppFrame's centerCol: a column flex box with overflow:hidden. So
			* the page must own its own scrolling and fill BOTH axes - the maxWidth:1100px
			* this used to carry is what made the whole page hug the left edge on a wide
			* window, and nothing scrolled because the parent clips (user, 2026-10-09).
			*/
			page: {
				boxSizing: "border-box",
				width: "100%",
				height: "100%",
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				overflow: "auto",
				padding: "0 clamp(20px, 3vw, 40px) 40px",
				fontSize: "13px",
				lineHeight: 1.55,
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			head: {
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: "16px",
				paddingTop: "calc(24px + var(--dsh-frame-top-clearance, 0px))"
			},
			headRight: {
				display: "flex",
				gap: "8px",
				flexShrink: 0,
				paddingTop: "8px"
			},
			h1: {
				fontSize: "19px",
				fontWeight: 650,
				margin: "0 0 4px"
			},
			title: {
				fontSize: "15px",
				fontWeight: 600,
				margin: "0 0 2px"
			},
			sub: {
				opacity: .6,
				margin: "0 0 12px"
			},
			tabs: {
				display: "flex",
				gap: "4px",
				marginBottom: "10px",
				borderBottom: "1px solid rgba(128,128,128,.25)"
			},
			tab: {
				padding: "6px 12px",
				background: "none",
				border: "none",
				borderBottom: "2px solid transparent",
				cursor: "pointer",
				color: "inherit",
				opacity: .65,
				fontSize: "13px"
			},
			tabOn: {
				opacity: 1,
				fontWeight: 600,
				borderBottom: "2px solid currentColor"
			},
			bar: {
				display: "flex",
				flexWrap: "wrap",
				gap: "8px",
				alignItems: "center",
				marginBottom: "10px"
			},
			btn: {
				padding: "4px 10px",
				borderRadius: "6px",
				border: "1px solid rgba(128,128,128,.4)",
				background: "rgba(128,128,128,.08)",
				color: "inherit",
				cursor: "pointer",
				fontSize: "12px"
			},
			btnPrimary: {
				borderColor: "rgba(80,140,255,.6)",
				background: "rgba(80,140,255,.15)"
			},
			btnOff: {
				opacity: .45,
				cursor: "not-allowed"
			},
			table: {
				width: "100%",
				borderCollapse: "collapse"
			},
			th: {
				textAlign: "left",
				padding: "6px 8px",
				color: "var(--dsw-alias-label-caption, rgba(128,128,128,.9))",
				fontWeight: 500,
				borderBottom: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.25))",
				fontSize: "12px",
				position: "sticky",
				top: 0,
				background: "var(--dsw-alias-bg-base, Canvas)",
				zIndex: 2
			},
			td: {
				padding: "5px 8px",
				borderBottom: "1px solid rgba(128,128,128,.12)"
			},
			mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
			note: {
				marginTop: "12px",
				padding: "8px 10px",
				borderRadius: "6px",
				background: "rgba(128,128,128,.08)",
				opacity: .85,
				fontSize: "12px"
			},
			banner: {
				marginBottom: "10px",
				padding: "8px 10px",
				borderRadius: "6px",
				background: "rgba(255,180,60,.14)",
				border: "1px solid rgba(255,180,60,.4)",
				fontSize: "12px"
			},
			err: {
				marginBottom: "10px",
				padding: "8px 10px",
				borderRadius: "6px",
				background: "rgba(255,90,90,.14)",
				border: "1px solid rgba(255,90,90,.4)",
				fontSize: "12px"
			},
			dim: {
				opacity: .6,
				fontSize: "12px"
			},
			input: {
				padding: "4px 8px",
				borderRadius: "6px",
				border: "1px solid rgba(128,128,128,.4)",
				background: "transparent",
				color: "inherit",
				fontSize: "12px",
				minWidth: "200px"
			},
			badge: {
				display: "inline-block",
				padding: "1px 6px",
				marginRight: "4px",
				borderRadius: "999px",
				background: "rgba(128,128,128,.16)",
				fontSize: "11px"
			},
			badgeWarn: { background: "rgba(255,150,60,.18)" }
		};
		/** RFC4180-ish: quote every cell, double the quotes inside. */
		function toCsv(rows) {
			return rows.map((cells) => cells.map((cell) => Q + String(cell).split(Q).join("\"\"") + Q).join(",")).join(String.fromCharCode(13) + String.fromCharCode(10));
		}
		function download(name, text) {
			const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = name;
			anchor.click();
			URL.revokeObjectURL(url);
		}
		function PluginUpdatesPage() {
			const [status, setStatus] = (0, react.useState)(null);
			const [tab, setTab] = (0, react.useState)(TAB_UPDATES);
			const [selected, setSelected] = (0, react.useState)({});
			const [busy, setBusy] = (0, react.useState)(false);
			const [latest, setLatest] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [restart, setRestart] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("");
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [catalogBusy, setCatalogBusy] = (0, react.useState)(false);
			const [catalogError, setCatalogError] = (0, react.useState)("");
			const [catalogStartedAt, setCatalogStartedAt] = (0, react.useState)(0);
			const [, setTick] = (0, react.useState)(0);
			const catalogTried = (0, react.useRef)(false);
			const [, setLocaleRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => subscribeLocale(() => setLocaleRevision((value) => value + 1)), []);
			const refresh = (0, react.useCallback)(async (quiet) => {
				if (!quiet) setBusy(true);
				try {
					const { json } = await getStatus();
					if (json && json.ok) {
						setStatus(json);
						setError("");
					} else setError(json && json.reason || translate("error.statusFailed"));
				} catch (err) {
					setError(translate("error.cannotReachHost", { reason: String(err && err.message || err) }));
				}
				setBusy(false);
			}, []);
			(0, react.useEffect)(() => {
				refresh(true);
			}, [refresh]);
			const reports = (0, react.useMemo)(() => status && status.reports || [], [status]);
			const updates = (0, react.useMemo)(() => reports.flatMap((report) => (report.rows || []).map((row) => ({
				...row,
				profile: report.profile
			}))), [reports]);
			const installed = (0, react.useMemo)(() => reports.flatMap((report) => (report.installed || []).map((row) => ({
				...row,
				profile: report.profile
			}))), [reports]);
			const picked = updates.filter((row) => selected[row.profile + "/" + row.name]);
			const profilesWithUpdates = [...new Set(updates.map((row) => row.profile))];
			const lockedRows = (0, react.useMemo)(() => reports.flatMap((report) => (report.lockedRows || []).map((row) => ({
				...row,
				profile: report.profile
			}))), [reports]);
			const locks = (0, react.useMemo)(() => reports.flatMap((report) => (report.locks || []).map((lock) => ({
				...lock,
				profile: report.profile
			}))), [reports]);
			const installedNames = (0, react.useMemo)(() => new Set(installed.map((row) => row.name)), [installed]);
			const allProfiles = [...new Set(reports.map((report) => report.profile))];
			const hostFeatures = status && status.features || [];
			const hostTooOld = Boolean(status && status.ok) && !hostFeatures.includes("catalog");
			const run = async (fn, okText) => {
				setBusy(true);
				setError("");
				setMessage("");
				try {
					const { status: code, json } = await fn();
					if (json && json.ok) {
						setMessage(okText);
						setRestart(Boolean(json.restartRequired));
					} else setError(translate("error.failed", { reason: json && json.reason || translate("error.http", { code }) }));
				} catch (err) {
					setError(translate("error.failed", { reason: String(err && err.message || err) }));
				}
				setBusy(false);
				await refresh(true);
			};
			const applyProfiles = (profiles) => run(() => post("/apply", {
				confirm: true,
				latest,
				profiles: profiles.join(",")
			}), latest ? translate("message.appliedLatest") : translate("message.appliedRange"));
			const exportCsv = () => {
				const rows = [[
					translate("col.profile"),
					translate("col.plugin"),
					translate("col.current"),
					translate("col.latest"),
					translate("col.source")
				]];
				for (const row of updates) {
					const match = installed.find((item) => item.profile === row.profile && item.name === row.name);
					rows.push([
						row.profile,
						row.name,
						row.current,
						row.latest,
						match ? match.source : "npm"
					]);
				}
				download("dsh-plugin-updates.csv", toCsv(rows));
			};
			const searchCatalog = (0, react.useCallback)(async (text, nextCategory) => {
				setCatalogBusy(true);
				setCatalogError("");
				setCatalogStartedAt(Date.now());
				try {
					const params = new URLSearchParams();
					if (text.trim() !== "") params.set("q", text.trim());
					if (nextCategory !== "") params.set("category", nextCategory);
					params.set("limit", "60");
					const { status: code, json, text: body } = await send("/catalog?" + params.toString());
					if (json && json.ok === true) setCatalog(json);
					else {
						setCatalog(null);
						const detail = (json && json.reason ? String(json.reason) : "") || (body !== "" ? body.slice(0, 200) : "");
						setCatalogError(code === 404 ? translate("error.catalog404") : detail !== "" ? translate("error.httpDetail", {
							code,
							reason: detail
						}) : translate("error.http", { code }));
					}
				} catch (err) {
					setCatalog(null);
					setCatalogError(translate("error.catalogRead", { reason: String(err && err.message || err) }));
				}
				setCatalogBusy(false);
			}, []);
			(0, react.useEffect)(() => {
				if (tab !== TAB_DISCOVER || catalogTried.current || catalogBusy || hostTooOld) return;
				catalogTried.current = true;
				searchCatalog(query, category);
			}, [
				tab,
				catalogBusy,
				hostTooOld,
				query,
				category,
				searchCatalog
			]);
			const lockOne = (row) => run(() => post("/lock", {
				name: row.name,
				version: row.latest,
				profiles: row.profile
			}), translate("message.locked", { name: row.name }));
			const unlockOne = (lock) => run(() => post("/unlock", {
				name: lock.name,
				profiles: lock.profile
			}), translate("message.unlocked", { name: lock.name }));
			const installOne = async (entry) => {
				const spec = entry.npm || entry.name;
				const where = allProfiles.length > 0 ? allProfiles.join(", ") : translate("confirm.currentProfile");
				if (!(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(translate("confirm.install", {
					spec,
					where
				})) : true)) return;
				await run(() => post("/install", {
					confirm: true,
					spec,
					profiles: allProfiles.join(",")
				}), translate("message.installed", { spec }));
				await refresh(true);
			};
			(0, react.useEffect)(() => {
				if (!catalogBusy) return;
				const timer = setInterval(() => setTick((value) => value + 1), 1e3);
				return () => clearInterval(timer);
			}, [catalogBusy]);
			const catalogElapsed = catalogBusy && catalogStartedAt > 0 ? Math.round((Date.now() - catalogStartedAt) / 1e3) : 0;
			const restartInfo = status && status.restart || null;
			const restartSupported = Boolean(restartInfo && restartInfo.supported);
			const restartHint = restartSupported ? translate("page.restartHint") : restartInfo && restartInfo.reason || translate("page.restartUnsupported");
			const restartHost = async () => {
				if (!restartSupported) return;
				if (!(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(translate("confirm.restart")) : true)) return;
				setBusy(true);
				setError("");
				setMessage("");
				try {
					const { status: code, json } = await post("/restart", { confirm: true });
					if (json && json.ok) setMessage(json.mode === "supervisor" ? translate("message.restartSupervisor") : translate("message.restartHelper"));
					else setError(translate("error.restartFailed", { reason: json && json.reason || translate("error.http", { code }) }));
				} catch (err) {
					setError(translate("error.restartFailed", { reason: String(err && err.message || err) }));
				}
				setBusy(false);
			};
			const selectedBlocked = busy || picked.length === 0;
			const allBlocked = busy || updates.length === 0;
			const toolbar = (0, react.createElement)("div", { style: S.bar }, (0, react.createElement)("button", {
				style: S.btn,
				disabled: busy,
				onClick: () => {
					refresh();
				}
			}, translate("action.reload")), tab === TAB_UPDATES ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...S.btnPrimary,
					...selectedBlocked ? S.btnOff : {}
				},
				disabled: selectedBlocked,
				onClick: () => {
					applyProfiles([...new Set(picked.map((row) => row.profile))]);
				}
			}, picked.length > 0 ? translate("action.updateSelectedCount", { count: picked.length }) : translate("action.updateSelected")) : null, tab === TAB_UPDATES ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...allBlocked ? S.btnOff : {}
				},
				disabled: allBlocked,
				onClick: () => {
					applyProfiles(profilesWithUpdates);
				}
			}, translate("action.updateAll")) : null, tab === TAB_UPDATES ? (0, react.createElement)("label", { style: {
				display: "flex",
				gap: "4px",
				alignItems: "center",
				...S.dim
			} }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: latest,
				onChange: (event) => setLatest(event.target.checked)
			}), translate("action.latest")) : null, tab === TAB_INSTALLED ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...busy ? S.btnOff : {}
				},
				disabled: busy,
				onClick: () => {
					run(() => post("/rollback", {}), translate("message.rolledBack"));
				}
			}, translate("action.rollbackLast")) : null, tab === TAB_DISCOVER ? (0, react.createElement)("input", {
				style: S.input,
				placeholder: translate("placeholder.search"),
				value: query,
				onChange: (event) => setQuery(event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Enter") searchCatalog(query, category);
				}
			}) : null, tab === TAB_DISCOVER ? (0, react.createElement)("select", {
				style: S.input,
				value: category,
				onChange: (event) => {
					setCategory(event.target.value);
					searchCatalog(query, event.target.value);
				}
			}, (0, react.createElement)("option", { value: "" }, translate("select.allCategories")), ...(catalog && catalog.categories || []).map((item) => (0, react.createElement)("option", {
				key: item.id,
				value: item.id
			}, item.zh || item.en))) : null, tab === TAB_DISCOVER ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...catalogBusy ? S.btnOff : {}
				},
				disabled: catalogBusy,
				onClick: () => {
					searchCatalog(query, category);
				}
			}, catalogBusy ? translate("action.searching") : translate("action.search")) : null, tab === TAB_DISCOVER ? null : (0, react.createElement)("button", {
				style: {
					...S.btn,
					...allBlocked ? S.btnOff : {}
				},
				disabled: allBlocked,
				onClick: exportCsv
			}, translate("action.exportCsv")));
			return (0, react.createElement)("div", { style: S.page }, (0, react.createElement)("div", { style: S.head }, (0, react.createElement)("div", null, (0, react.createElement)("h1", { style: S.h1 }, translate("page.title")), (0, react.createElement)("p", { style: S.sub }, translate("page.subtitle"))), (0, react.createElement)("div", { style: S.headRight }, (0, react.createElement)("button", {
				style: S.btn,
				onClick: () => {
					try {
						location.reload();
					} catch {}
				},
				title: translate("page.refreshUiHint")
			}, translate("page.refreshUi")), (0, react.createElement)("button", {
				style: {
					...S.btn,
					...restartSupported ? S.btnPrimary : S.btnOff
				},
				disabled: !restartSupported,
				title: restartHint,
				onClick: () => {
					restartHost();
				}
			}, translate("page.restartDsh")))), restart ? (0, react.createElement)("div", { style: S.banner }, translate("banner.restartRequired")) : null, hostTooOld ? (0, react.createElement)("div", { style: S.banner }, translate("banner.hostOld1"), (0, react.createElement)("br"), translate("banner.hostOld2")) : null, error ? (0, react.createElement)("div", { style: S.err }, error) : null, message ? (0, react.createElement)("div", { style: S.note }, message) : null, (0, react.createElement)("div", { style: S.tabs }, (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_UPDATES ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_UPDATES)
			}, translate("tab.updates") + (updates.length > 0 ? " (" + updates.length + ")" : "")), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_INSTALLED ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_INSTALLED)
			}, translate("tab.installed") + (installed.length > 0 ? " (" + installed.length + ")" : "")), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_DISCOVER ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_DISCOVER)
			}, translate("tab.discover")), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_LOCKED ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_LOCKED)
			}, translate("tab.locked") + (locks.length > 0 ? " (" + locks.length + ")" : ""))), toolbar, tab === TAB_UPDATES ? (0, react.createElement)(UpdateTable, {
				updates,
				installed,
				selected,
				setSelected,
				onLock: lockOne
			}) : tab === TAB_INSTALLED ? (0, react.createElement)(InstalledTable, { installed }) : tab === TAB_DISCOVER ? (0, react.createElement)(DiscoverTable, {
				catalog,
				catalogBusy,
				catalogError,
				hostTooOld,
				elapsed: catalogElapsed,
				installedNames,
				onInstall: installOne,
				onRetry: () => {
					catalogTried.current = true;
					searchCatalog(query, category);
				}
			}) : (0, react.createElement)(LockedTable, {
				rows: lockedRows,
				locks,
				onUnlock: unlockOne
			}), (0, react.createElement)("div", { style: S.note }, translate("footer.note")));
		}
		function UpdateTable(props) {
			const { updates, installed, selected, setSelected } = props;
			if (updates.length === 0) return (0, react.createElement)("div", { style: S.note }, translate("empty.updates"));
			const allOn = updates.every((row) => selected[row.profile + "/" + row.name]);
			const toggleAll = () => {
				const next = {};
				if (!allOn) for (const row of updates) next[row.profile + "/" + row.name] = true;
				setSelected(next);
			};
			return (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: {
				...S.th,
				width: "28px"
			} }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: allOn,
				onChange: toggleAll
			})), (0, react.createElement)("th", { style: S.th }, translate("col.plugin")), (0, react.createElement)("th", { style: S.th }, translate("col.profile")), (0, react.createElement)("th", { style: S.th }, translate("col.current")), (0, react.createElement)("th", { style: S.th }, translate("col.latest")), (0, react.createElement)("th", { style: S.th }, translate("col.source")), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, updates.map((row) => {
				const key = row.profile + "/" + row.name;
				const match = installed.find((item) => item.profile === row.profile && item.name === row.name);
				return (0, react.createElement)("tr", { key }, (0, react.createElement)("td", { style: S.td }, (0, react.createElement)("input", {
					type: "checkbox",
					checked: Boolean(selected[key]),
					onChange: (event) => setSelected({
						...selected,
						[key]: event.target.checked
					})
				})), (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, row.name), (0, react.createElement)("td", { style: S.td }, row.profile), (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, row.current), (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, row.latest), (0, react.createElement)("td", { style: {
					...S.td,
					...S.dim
				} }, match ? match.source : "npm"), (0, react.createElement)("td", { style: S.td }, (0, react.createElement)("button", {
					style: S.btn,
					title: translate("action.lockHint"),
					onClick: () => props.onLock(row)
				}, translate("action.lock"))));
			})));
		}
		function DiscoverTable(props) {
			const { catalog, catalogBusy, catalogError, hostTooOld, elapsed, installedNames, onInstall } = props;
			if (hostTooOld) return (0, react.createElement)("div", { style: S.note }, translate("discover.noHostRoute"));
			if (catalogError !== "") return (0, react.createElement)("div", null, (0, react.createElement)("div", { style: S.err }, catalogError), (0, react.createElement)("button", {
				style: S.btn,
				onClick: () => props.onRetry()
			}, translate("action.retry")));
			if (catalogBusy && catalog === null) return (0, react.createElement)("div", { style: S.note }, translate("discover.loading") + (elapsed > 2 ? translate("discover.loadingElapsed", { seconds: elapsed }) : translate("discover.loadingFirst")));
			if (catalog === null) return (0, react.createElement)("div", null, (0, react.createElement)("div", { style: S.note }, translate("discover.empty")), (0, react.createElement)("button", {
				style: S.btn,
				onClick: () => props.onRetry()
			}, translate("discover.read")));
			if (catalog.ok !== true) return (0, react.createElement)("div", { style: S.err }, translate("error.catalogUnavailable", { reason: catalog.reason || catalog.error || translate("error.unknownReason") }));
			const rows = catalog.rows || [];
			return (0, react.createElement)("div", null, (0, react.createElement)("div", { style: {
				...S.dim,
				marginBottom: "6px"
			} }, translate("discover.summary", {
				total: catalog.total || 0,
				updated: catalog.updated || translate("discover.updatedUnknown")
			}) + (catalog.stale ? catalog.error ? translate("discover.stale", { reason: catalog.error }) : translate("discover.staleBare") : "")), rows.length === 0 ? (0, react.createElement)("div", { style: S.note }, translate("discover.noMatch")) : (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, translate("col.plugin")), (0, react.createElement)("th", { style: S.th }, translate("col.description")), (0, react.createElement)("th", { style: S.th }, translate("col.popularity")), (0, react.createElement)("th", { style: S.th }, translate("col.capabilities")), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, rows.map((entry) => {
				entry.npm || entry.name;
				const already = installedNames.has(entry.name) || entry.npm !== null && installedNames.has(entry.npm);
				return (0, react.createElement)("tr", { key: entry.name }, (0, react.createElement)("td", { style: S.td }, (0, react.createElement)("div", { style: S.mono }, entry.name), (0, react.createElement)("div", { style: S.dim }, (entry.owner || "") + (entry.version ? "  v" + entry.version : ""))), (0, react.createElement)("td", { style: {
					...S.td,
					maxWidth: "520px"
				} }, entry.description && (entry.description.zh || entry.description.en) || ""), (0, react.createElement)("td", { style: {
					...S.td,
					...S.dim
				} }, "★" + entry.stars + "  ↓" + entry.downloads), (0, react.createElement)("td", { style: S.td }, ...entry.capabilities.map((name) => (0, react.createElement)("span", {
					key: name,
					style: S.badge
				}, name)), ...entry.redLines.map((name) => (0, react.createElement)("span", {
					key: name,
					style: {
						...S.badge,
						...S.badgeWarn
					}
				}, name))), (0, react.createElement)("td", { style: S.td }, already ? (0, react.createElement)("span", { style: S.dim }, translate("discover.installed")) : (0, react.createElement)("button", {
					style: {
						...S.btn,
						...S.btnPrimary
					},
					onClick: () => {
						onInstall(entry);
					}
				}, translate("action.install"))));
			}))));
		}
		function LockedTable(props) {
			const { rows, locks, onUnlock } = props;
			if (locks.length === 0) return (0, react.createElement)("div", { style: S.note }, translate("empty.locked"));
			return (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, translate("col.plugin")), (0, react.createElement)("th", { style: S.th }, translate("col.profile")), (0, react.createElement)("th", { style: S.th }, translate("col.lockedAt")), (0, react.createElement)("th", { style: S.th }, translate("col.canUpdateTo")), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, locks.map((lock) => {
				const row = rows.find((item) => item.name === lock.name && item.profile === lock.profile);
				return (0, react.createElement)("tr", { key: lock.profile + "/" + lock.name }, (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, lock.name), (0, react.createElement)("td", { style: S.td }, lock.profile), (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, lock.version || "—"), (0, react.createElement)("td", { style: {
					...S.td,
					...S.mono
				} }, row ? row.current + " → " + row.latest : translate("col.alreadyLatest")), (0, react.createElement)("td", { style: S.td }, (0, react.createElement)("button", {
					style: S.btn,
					onClick: () => {
						onUnlock(lock);
					}
				}, translate("action.unlock"))));
			})));
		}
		function InstalledTable(props) {
			const installed = props.installed;
			if (installed.length === 0) return (0, react.createElement)("div", { style: S.note }, translate("empty.installed"));
			return (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, translate("col.plugin")), (0, react.createElement)("th", { style: S.th }, translate("col.profile")), (0, react.createElement)("th", { style: S.th }, translate("col.versionRange")), (0, react.createElement)("th", { style: S.th }, translate("col.source")))), (0, react.createElement)("tbody", null, installed.map((row) => (0, react.createElement)("tr", { key: row.profile + "/" + row.name }, (0, react.createElement)("td", { style: {
				...S.td,
				...S.mono
			} }, row.name), (0, react.createElement)("td", { style: S.td }, row.profile), (0, react.createElement)("td", { style: {
				...S.td,
				...S.mono
			} }, row.spec), (0, react.createElement)("td", { style: {
				...S.td,
				...S.dim
			} }, row.source)))));
		}
		/** The rail icon. Hand-drawn so this bundle needs no icon package: the sidebar
		* passes only { size }, and currentColor inherits the rail's state colour. */
		function PluginUpdatesIcon(props) {
			const size = props && props.size ? props.size : 16;
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("path", { d: "M20 12a8 8 0 1 1-2.34-5.66" }), (0, react.createElement)("path", { d: "M20 4v4h-4" }), (0, react.createElement)("path", { d: "M12 8.5v7" }), (0, react.createElement)("path", { d: "M8.5 12.5 12 16l3.5-3.5" }));
		}
		/**
		* The browser half's load-bearing dependencies. slots.inject fires only when the
		* composition actually serves that seat, so a deployment without the layout shows
		* none of this instead of erroring; locale is required because the page renders
		* its copy through it.
		*/
		const inject = ["slots", "locale"];
		const PANEL_ID = "plugin-autoupdate";
		function apply(ctx) {
			attachLocale(ctx.locale);
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "dsh-plugin-autoupdate: dictionaries");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS
			}, PluginUpdatesPage)), "dsh-plugin-autoupdate: main panel");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 40,
				label: () => translate("nav.title"),
				locale: NS
			}, PluginUpdatesIcon)), "dsh-plugin-autoupdate: sidebar entry");
		}
		//#endregion
		exports.PluginUpdatesIcon = PluginUpdatesIcon;
		exports.PluginUpdatesPage = PluginUpdatesPage;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map