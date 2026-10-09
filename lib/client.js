window.__ModuleLoader__.load({
	id: "dsh-plugin-autoupdate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.tsx
		/**
		* The settings page: 插件更新 / Plugin updates.
		*
		* Shape follows UniGetUI: one tab per view (可用更新 / 已安装), a toolbar that acts
		* on a selection, and a source column. Everything it shows comes from the host's
		* /plugin-autoupdate routes, which delegate every version decision to the DSH CLI -
		* so this page cannot offer something `pnpm outdated` would not offer.
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
		async function send(path, init) {
			const response = await fetch(ROUTE + path, init);
			const json = await response.json().catch(() => null);
			return {
				status: response.status,
				json
			};
		}
		const getStatus = () => send("/status");
		const post = (path, body) => send(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		});
		const S = {
			page: {
				padding: "22px 26px",
				fontSize: "13px",
				lineHeight: 1.55,
				maxWidth: "1100px"
			},
			head: {
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: "16px"
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
				padding: "5px 8px",
				opacity: .55,
				fontWeight: 500,
				borderBottom: "1px solid rgba(128,128,128,.25)",
				fontSize: "12px"
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
			const refresh = (0, react.useCallback)(async (quiet) => {
				if (!quiet) setBusy(true);
				try {
					const { json } = await getStatus();
					if (json && json.ok) {
						setStatus(json);
						setError("");
					} else setError(json && json.reason || "status failed");
				} catch (err) {
					setError("无法连接宿主：" + String(err && err.message || err));
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
			const run = async (fn, okText) => {
				setBusy(true);
				setError("");
				setMessage("");
				try {
					const { status: code, json } = await fn();
					if (json && json.ok) {
						setMessage(okText);
						setRestart(Boolean(json.restartRequired));
					} else setError("失败：" + (json && json.reason || "HTTP " + code));
				} catch (err) {
					setError("失败：" + String(err && err.message || err));
				}
				setBusy(false);
				await refresh(true);
			};
			const applyProfiles = (profiles) => run(() => post("/apply", {
				confirm: true,
				latest,
				profiles: profiles.join(",")
			}), latest ? "已按 --latest 应用（仍受发布时长策略约束）" : "已应用范围内的更新");
			const exportCsv = () => {
				const rows = [[
					"profile",
					"plugin",
					"current",
					"latest",
					"source"
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
				try {
					const params = new URLSearchParams();
					if (text.trim() !== "") params.set("q", text.trim());
					if (nextCategory !== "") params.set("category", nextCategory);
					params.set("limit", "60");
					const { json } = await send("/catalog?" + params.toString());
					setCatalog(json);
				} catch (err) {
					setCatalog({
						ok: false,
						reason: String(err && err.message || err)
					});
				}
				setCatalogBusy(false);
			}, []);
			(0, react.useEffect)(() => {
				if (tab === TAB_DISCOVER && catalog === null && !catalogBusy) searchCatalog("", "");
			}, [
				tab,
				catalog,
				catalogBusy,
				searchCatalog
			]);
			const lockOne = (row) => run(() => post("/lock", {
				name: row.name,
				version: row.latest,
				profiles: row.profile
			}), "已锁定 " + row.name + "：不再提示它的更新（它仍会随范围升级，锁的是提示）");
			const unlockOne = (lock) => run(() => post("/unlock", {
				name: lock.name,
				profiles: lock.profile
			}), "已解锁 " + lock.name);
			const installOne = async (entry) => {
				const spec = entry.npm || entry.name;
				const where = allProfiles.length > 0 ? allProfiles.join(", ") : "当前 profile";
				if (!(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm("安装 " + spec + " 到 " + where + "？\n\n装完需要重启 DSH 才会生效。") : true)) return;
				await run(() => post("/install", {
					confirm: true,
					spec,
					profiles: allProfiles.join(",")
				}), "已安装 " + spec + "（需要重启 DSH 生效）");
				await refresh(true);
			};
			const restartInfo = status && status.restart || null;
			const restartSupported = Boolean(restartInfo && restartInfo.supported);
			const restartHint = restartSupported ? "重启 DSH，让新装的宿主插件生效（界面会断开几秒）" : restartInfo && restartInfo.reason || "当前宿主不支持自重启";
			const restartHost = async () => {
				if (!restartSupported) return;
				if (!(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm("重启 DSH？当前界面会断开，几秒后自动恢复。") : true)) return;
				setBusy(true);
				setError("");
				setMessage("");
				try {
					const { status: code, json } = await post("/restart", { confirm: true });
					if (json && json.ok) setMessage(json.mode === "supervisor" ? "正在重启：已交给进程管理器接管。" : "正在重启：已安排自重启，界面断开几秒后会自己回来。");
					else setError("重启失败：" + (json && json.reason || "HTTP " + code));
				} catch (err) {
					setError("重启失败：" + String(err && err.message || err));
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
			}, "重新加载"), tab === TAB_UPDATES ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...S.btnPrimary,
					...selectedBlocked ? S.btnOff : {}
				},
				disabled: selectedBlocked,
				onClick: () => {
					applyProfiles([...new Set(picked.map((row) => row.profile))]);
				}
			}, "更新所选" + (picked.length > 0 ? " (" + picked.length + ")" : "")) : null, tab === TAB_UPDATES ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...allBlocked ? S.btnOff : {}
				},
				disabled: allBlocked,
				onClick: () => {
					applyProfiles(profilesWithUpdates);
				}
			}, "全部更新") : null, tab === TAB_UPDATES ? (0, react.createElement)("label", { style: {
				display: "flex",
				gap: "4px",
				alignItems: "center",
				...S.dim
			} }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: latest,
				onChange: (event) => setLatest(event.target.checked)
			}), "忽略版本范围 (--latest)") : null, tab === TAB_INSTALLED ? (0, react.createElement)("button", {
				style: {
					...S.btn,
					...busy ? S.btnOff : {}
				},
				disabled: busy,
				onClick: () => {
					run(() => post("/rollback", {}), "已回滚到最近的快照");
				}
			}, "回滚最近一次更新") : null, tab === TAB_DISCOVER ? (0, react.createElement)("input", {
				style: S.input,
				placeholder: "搜索插件（名称 / 描述 / 作者）",
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
			}, (0, react.createElement)("option", { value: "" }, "全部分类"), ...(catalog && catalog.categories || []).map((item) => (0, react.createElement)("option", {
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
			}, catalogBusy ? "查询中…" : "搜索") : null, tab === TAB_DISCOVER ? null : (0, react.createElement)("button", {
				style: {
					...S.btn,
					...allBlocked ? S.btnOff : {}
				},
				disabled: allBlocked,
				onClick: exportCsv
			}, "导出 CSV"));
			return (0, react.createElement)("div", { style: S.page }, (0, react.createElement)("div", { style: S.head }, (0, react.createElement)("div", null, (0, react.createElement)("h1", { style: S.h1 }, "插件更新"), (0, react.createElement)("p", { style: S.sub }, "只升 pnpm「最小发布时长」策略放行的版本；应用前自动快照。")), (0, react.createElement)("div", { style: S.headRight }, (0, react.createElement)("button", {
				style: S.btn,
				onClick: () => {
					try {
						location.reload();
					} catch {}
				},
				title: "重新加载界面：新装的客户端插件会立刻生效"
			}, "刷新界面"), (0, react.createElement)("button", {
				style: {
					...S.btn,
					...restartSupported ? S.btnPrimary : S.btnOff
				},
				disabled: !restartSupported,
				title: restartHint,
				onClick: () => {
					restartHost();
				}
			}, "重启 DSH"))), restart ? (0, react.createElement)("div", { style: S.banner }, "已应用更新 —— 需要重启 DSH 才生效（宿主插件重新加载，浏览器插件还要刷新页面）。") : null, error ? (0, react.createElement)("div", { style: S.err }, error) : null, message ? (0, react.createElement)("div", { style: S.note }, message) : null, (0, react.createElement)("div", { style: S.tabs }, (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_UPDATES ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_UPDATES)
			}, "可用更新" + (updates.length > 0 ? " (" + updates.length + ")" : "")), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_INSTALLED ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_INSTALLED)
			}, "已安装" + (installed.length > 0 ? " (" + installed.length + ")" : "")), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_DISCOVER ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_DISCOVER)
			}, "发现"), (0, react.createElement)("button", {
				style: {
					...S.tab,
					...tab === TAB_LOCKED ? S.tabOn : {}
				},
				onClick: () => setTab(TAB_LOCKED)
			}, "已锁定" + (locks.length > 0 ? " (" + locks.length + ")" : ""))), toolbar, tab === TAB_UPDATES ? (0, react.createElement)(UpdateTable, {
				updates,
				installed,
				selected,
				setSelected,
				onLock: lockOne
			}) : tab === TAB_INSTALLED ? (0, react.createElement)(InstalledTable, { installed }) : tab === TAB_DISCOVER ? (0, react.createElement)(DiscoverTable, {
				catalog,
				catalogBusy,
				installedNames,
				onInstall: installOne
			}) : (0, react.createElement)(LockedTable, {
				rows: lockedRows,
				locks,
				onUnlock: unlockOne
			}), (0, react.createElement)("div", { style: S.note }, "更新与版本决策完全交给 dsh plugin（与手动执行逐字一致）；「发现」读的是插件市场的官方目录，安装同样不给它选版本。"));
		}
		function UpdateTable(props) {
			const { updates, installed, selected, setSelected } = props;
			if (updates.length === 0) return (0, react.createElement)("div", { style: S.note }, "没有可用更新 —— 解析器允许的版本都已装上。");
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
			})), (0, react.createElement)("th", { style: S.th }, "插件"), (0, react.createElement)("th", { style: S.th }, "Profile"), (0, react.createElement)("th", { style: S.th }, "当前版本"), (0, react.createElement)("th", { style: S.th }, "新版本"), (0, react.createElement)("th", { style: S.th }, "来源"), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, updates.map((row) => {
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
					title: "不再提示这个插件的更新",
					onClick: () => props.onLock(row)
				}, "锁定")));
			})));
		}
		function DiscoverTable(props) {
			const { catalog, catalogBusy, installedNames, onInstall } = props;
			if (catalogBusy && catalog === null) return (0, react.createElement)("div", { style: S.note }, "正在读取插件目录…（首次约 5 MB，之后走本地缓存）");
			if (catalog === null) return (0, react.createElement)("div", { style: S.note }, "还没有目录数据，点「搜索」试一次。");
			if (catalog.ok !== true) return (0, react.createElement)("div", { style: S.err }, "目录不可用：" + (catalog.reason || catalog.error || "未知原因"));
			const rows = catalog.rows || [];
			return (0, react.createElement)("div", null, (0, react.createElement)("div", { style: {
				...S.dim,
				marginBottom: "6px"
			} }, "共 " + (catalog.total || 0) + " 条匹配 · 目录更新于 " + (catalog.updated || "未知") + (catalog.stale ? "（离线缓存" + (catalog.error ? "：" + catalog.error : "") + "）" : "")), rows.length === 0 ? (0, react.createElement)("div", { style: S.note }, "没有匹配的插件。换个关键词试试。") : (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, "插件"), (0, react.createElement)("th", { style: S.th }, "说明"), (0, react.createElement)("th", { style: S.th }, "热度"), (0, react.createElement)("th", { style: S.th }, "能力"), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, rows.map((entry) => {
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
				}, name))), (0, react.createElement)("td", { style: S.td }, already ? (0, react.createElement)("span", { style: S.dim }, "已安装") : (0, react.createElement)("button", {
					style: {
						...S.btn,
						...S.btnPrimary
					},
					onClick: () => {
						onInstall(entry);
					}
				}, "安装")));
			}))));
		}
		function LockedTable(props) {
			const { rows, locks, onUnlock } = props;
			if (locks.length === 0) return (0, react.createElement)("div", { style: S.note }, "没有被锁定的插件。在「可用更新」里点某一行的「锁定」，就不会再提示它的更新。");
			return (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, "插件"), (0, react.createElement)("th", { style: S.th }, "Profile"), (0, react.createElement)("th", { style: S.th }, "锁定时版本"), (0, react.createElement)("th", { style: S.th }, "当前可升到"), (0, react.createElement)("th", { style: S.th }, ""))), (0, react.createElement)("tbody", null, locks.map((lock) => {
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
				} }, row ? row.current + " → " + row.latest : "已是最新"), (0, react.createElement)("td", { style: S.td }, (0, react.createElement)("button", {
					style: S.btn,
					onClick: () => {
						onUnlock(lock);
					}
				}, "解锁")));
			})));
		}
		function InstalledTable(props) {
			const installed = props.installed;
			if (installed.length === 0) return (0, react.createElement)("div", { style: S.note }, "没有已安装的插件。");
			return (0, react.createElement)("table", { style: S.table }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, (0, react.createElement)("th", { style: S.th }, "插件"), (0, react.createElement)("th", { style: S.th }, "Profile"), (0, react.createElement)("th", { style: S.th }, "记录的版本范围"), (0, react.createElement)("th", { style: S.th }, "来源"))), (0, react.createElement)("tbody", null, installed.map((row) => (0, react.createElement)("tr", { key: row.profile + "/" + row.name }, (0, react.createElement)("td", { style: {
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
		* The browser half's load-bearing dependency. slots.inject fires only when the
		* composition actually serves that seat, so a deployment without the layout shows
		* none of this instead of erroring.
		*/
		const inject = ["slots"];
		const PANEL_ID = "plugin-autoupdate";
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID
			}, PluginUpdatesPage)), "dsh-plugin-autoupdate: main panel");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 40,
				label: () => "插件更新"
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