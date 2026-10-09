import { createElement, useCallback, useEffect, useMemo, useState } from "react";
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
		padding: "6px 2px",
		fontSize: "13px",
		lineHeight: 1.55
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
	}
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
	const [status, setStatus] = useState(null);
	const [tab, setTab] = useState(TAB_UPDATES);
	const [selected, setSelected] = useState({});
	const [busy, setBusy] = useState(false);
	const [latest, setLatest] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [restart, setRestart] = useState(false);
	const refresh = useCallback(async (quiet) => {
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
	useEffect(() => {
		refresh(true);
	}, [refresh]);
	const reports = useMemo(() => status && status.reports || [], [status]);
	const updates = useMemo(() => reports.flatMap((report) => (report.rows || []).map((row) => ({
		...row,
		profile: report.profile
	}))), [reports]);
	const installed = useMemo(() => reports.flatMap((report) => (report.installed || []).map((row) => ({
		...row,
		profile: report.profile
	}))), [reports]);
	const picked = updates.filter((row) => selected[row.profile + "/" + row.name]);
	const profilesWithUpdates = [...new Set(updates.map((row) => row.profile))];
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
	const selectedBlocked = busy || picked.length === 0;
	const allBlocked = busy || updates.length === 0;
	const toolbar = createElement("div", { style: S.bar }, createElement("button", {
		style: S.btn,
		disabled: busy,
		onClick: () => {
			refresh();
		}
	}, "重新加载"), tab === TAB_UPDATES ? createElement("button", {
		style: {
			...S.btn,
			...S.btnPrimary,
			...selectedBlocked ? S.btnOff : {}
		},
		disabled: selectedBlocked,
		onClick: () => {
			applyProfiles([...new Set(picked.map((row) => row.profile))]);
		}
	}, "更新所选" + (picked.length > 0 ? " (" + picked.length + ")" : "")) : null, tab === TAB_UPDATES ? createElement("button", {
		style: {
			...S.btn,
			...allBlocked ? S.btnOff : {}
		},
		disabled: allBlocked,
		onClick: () => {
			applyProfiles(profilesWithUpdates);
		}
	}, "全部更新") : null, tab === TAB_UPDATES ? createElement("label", { style: {
		display: "flex",
		gap: "4px",
		alignItems: "center",
		...S.dim
	} }, createElement("input", {
		type: "checkbox",
		checked: latest,
		onChange: (event) => setLatest(event.target.checked)
	}), "忽略版本范围 (--latest)") : null, tab === TAB_INSTALLED ? createElement("button", {
		style: {
			...S.btn,
			...busy ? S.btnOff : {}
		},
		disabled: busy,
		onClick: () => {
			run(() => post("/rollback", {}), "已回滚到最近的快照");
		}
	}, "回滚最近一次更新") : null, createElement("button", {
		style: {
			...S.btn,
			...allBlocked ? S.btnOff : {}
		},
		disabled: allBlocked,
		onClick: exportCsv
	}, "导出 CSV"));
	return createElement("div", { style: S.page }, createElement("h2", { style: S.title }, "插件更新"), createElement("p", { style: S.sub }, "只升 pnpm「最小发布时长」策略放行的版本；应用前自动快照；本页不会替你重启 DSH。"), restart ? createElement("div", { style: S.banner }, "已应用更新 —— 需要重启 DSH 才生效（宿主插件重新加载，浏览器插件还要刷新页面）。") : null, error ? createElement("div", { style: S.err }, error) : null, message ? createElement("div", { style: S.note }, message) : null, createElement("div", { style: S.tabs }, createElement("button", {
		style: {
			...S.tab,
			...tab === TAB_UPDATES ? S.tabOn : {}
		},
		onClick: () => setTab(TAB_UPDATES)
	}, "可用更新" + (updates.length > 0 ? " (" + updates.length + ")" : "")), createElement("button", {
		style: {
			...S.tab,
			...tab === TAB_INSTALLED ? S.tabOn : {}
		},
		onClick: () => setTab(TAB_INSTALLED)
	}, "已安装" + (installed.length > 0 ? " (" + installed.length + ")" : ""))), toolbar, tab === TAB_UPDATES ? createElement(UpdateTable, {
		updates,
		installed,
		selected,
		setSelected
	}) : createElement(InstalledTable, { installed }), createElement("div", { style: S.note }, "要装新插件请到 Settings → 插件（插件市场）。本页只管已装插件的更新：版本决策完全交给 dsh plugin，与手动执行逐字一致。"));
}
function UpdateTable(props) {
	const { updates, installed, selected, setSelected } = props;
	if (updates.length === 0) return createElement("div", { style: S.note }, "没有可用更新 —— 解析器允许的版本都已装上。");
	const allOn = updates.every((row) => selected[row.profile + "/" + row.name]);
	const toggleAll = () => {
		const next = {};
		if (!allOn) for (const row of updates) next[row.profile + "/" + row.name] = true;
		setSelected(next);
	};
	return createElement("table", { style: S.table }, createElement("thead", null, createElement("tr", null, createElement("th", { style: {
		...S.th,
		width: "28px"
	} }, createElement("input", {
		type: "checkbox",
		checked: allOn,
		onChange: toggleAll
	})), createElement("th", { style: S.th }, "插件"), createElement("th", { style: S.th }, "Profile"), createElement("th", { style: S.th }, "当前版本"), createElement("th", { style: S.th }, "新版本"), createElement("th", { style: S.th }, "来源"))), createElement("tbody", null, updates.map((row) => {
		const key = row.profile + "/" + row.name;
		const match = installed.find((item) => item.profile === row.profile && item.name === row.name);
		return createElement("tr", { key }, createElement("td", { style: S.td }, createElement("input", {
			type: "checkbox",
			checked: Boolean(selected[key]),
			onChange: (event) => setSelected({
				...selected,
				[key]: event.target.checked
			})
		})), createElement("td", { style: {
			...S.td,
			...S.mono
		} }, row.name), createElement("td", { style: S.td }, row.profile), createElement("td", { style: {
			...S.td,
			...S.mono
		} }, row.current), createElement("td", { style: {
			...S.td,
			...S.mono
		} }, row.latest), createElement("td", { style: {
			...S.td,
			...S.dim
		} }, match ? match.source : "npm"));
	})));
}
function InstalledTable(props) {
	const installed = props.installed;
	if (installed.length === 0) return createElement("div", { style: S.note }, "没有已安装的插件。");
	return createElement("table", { style: S.table }, createElement("thead", null, createElement("tr", null, createElement("th", { style: S.th }, "插件"), createElement("th", { style: S.th }, "Profile"), createElement("th", { style: S.th }, "记录的版本范围"), createElement("th", { style: S.th }, "来源"))), createElement("tbody", null, installed.map((row) => createElement("tr", { key: row.profile + "/" + row.name }, createElement("td", { style: {
		...S.td,
		...S.mono
	} }, row.name), createElement("td", { style: S.td }, row.profile), createElement("td", { style: {
		...S.td,
		...S.mono
	} }, row.spec), createElement("td", { style: {
		...S.td,
		...S.dim
	} }, row.source)))));
}
/**
* The browser half's load-bearing dependency. slots.inject fires only when the
* composition actually serves the settings section, so a deployment without the
* settings shell shows none of this instead of erroring.
*/
const inject = ["slots"];
function apply(ctx) {
	ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "plugin-autoupdate",
		order: 60,
		label: () => "插件更新"
	}, PluginUpdatesPage)), "dsh-plugin-autoupdate: settings page");
}
//#endregion
export { PluginUpdatesPage, apply, inject };
