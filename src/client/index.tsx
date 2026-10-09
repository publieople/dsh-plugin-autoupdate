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
import { createElement as h, useCallback, useEffect, useMemo, useState } from 'react'

const ROUTE = '/plugin-autoupdate'
const TAB_UPDATES = 'updates'
const TAB_INSTALLED = 'installed'
const Q = String.fromCharCode(34)

type Row = { name: string; current: string; latest: string }
type InstalledRow = { name: string; spec: string; source: string }
type Report = { profile: string; rows?: Row[]; installed?: InstalledRow[] }
type Restart = { supported: boolean; reason?: string; supervisor?: string }
type Status = { ok: boolean; profiles?: string[]; reports?: Report[]; restart?: Restart; reason?: string }
type ActionResult = { ok: boolean; restartRequired?: boolean; reason?: string }

async function send (path: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const response = await fetch(ROUTE + path, init)
  const json = await response.json().catch(() => null)
  return { status: response.status, json }
}

const getStatus = () => send('/status')
const post = (path: string, body: Record<string, unknown>) => send(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const S = {
  page: { padding: '22px 26px', fontSize: '13px', lineHeight: 1.55, maxWidth: '1100px' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' },
  headRight: { display: 'flex', gap: '8px', flexShrink: 0, paddingTop: '8px' },
  h1: { fontSize: '19px', fontWeight: 650, margin: '0 0 4px' },
  title: { fontSize: '15px', fontWeight: 600, margin: '0 0 2px' },
  sub: { opacity: 0.6, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '10px', borderBottom: '1px solid rgba(128,128,128,.25)' },
  tab: { padding: '6px 12px', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', color: 'inherit', opacity: 0.65, fontSize: '13px' },
  tabOn: { opacity: 1, fontWeight: 600, borderBottom: '2px solid currentColor' },
  bar: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px', alignItems: 'center', marginBottom: '10px' },
  btn: { padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'rgba(128,128,128,.08)', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
  btnPrimary: { borderColor: 'rgba(80,140,255,.6)', background: 'rgba(80,140,255,.15)' },
  btnOff: { opacity: 0.45, cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '5px 8px', opacity: 0.55, fontWeight: 500, borderBottom: '1px solid rgba(128,128,128,.25)', fontSize: '12px' },
  td: { padding: '5px 8px', borderBottom: '1px solid rgba(128,128,128,.12)' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  note: { marginTop: '12px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(128,128,128,.08)', opacity: 0.85, fontSize: '12px' },
  banner: { marginBottom: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,180,60,.14)', border: '1px solid rgba(255,180,60,.4)', fontSize: '12px' },
  err: { marginBottom: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,90,90,.14)', border: '1px solid rgba(255,90,90,.4)', fontSize: '12px' },
  dim: { opacity: 0.6, fontSize: '12px' },
}

/** RFC4180-ish: quote every cell, double the quotes inside. */
function toCsv (rows: string[][]): string {
  return rows
    .map((cells) => cells.map((cell) => Q + String(cell).split(Q).join(Q + Q) + Q).join(','))
    .join(String.fromCharCode(13) + String.fromCharCode(10))
}

function download (name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function PluginUpdatesPage () {
  const [status, setStatus] = useState<Status | null>(null)
  const [tab, setTab] = useState<string>(TAB_UPDATES)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [latest, setLatest] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [restart, setRestart] = useState(false)

  const refresh = useCallback(async (quiet?: boolean) => {
    if (!quiet) setBusy(true)
    try {
      const { json } = await getStatus()
      if (json && json.ok) { setStatus(json); setError('') } else { setError((json && json.reason) || 'status failed') }
    } catch (err) {
      setError('无法连接宿主：' + String((err && (err as Error).message) || err))
    }
    setBusy(false)
  }, [])

  useEffect(() => { void refresh(true) }, [refresh])

  const reports = useMemo(() => (status && status.reports) || [], [status])
  const updates = useMemo(() => reports.flatMap((report) => (report.rows || []).map((row) => ({ ...row, profile: report.profile }))), [reports])
  const installed = useMemo(() => reports.flatMap((report) => (report.installed || []).map((row) => ({ ...row, profile: report.profile }))), [reports])
  const picked = updates.filter((row) => selected[row.profile + '/' + row.name])
  const profilesWithUpdates = [...new Set(updates.map((row) => row.profile))]

  const run = async (fn: () => Promise<{ status: number; json: ActionResult | null }>, okText: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { status: code, json } = await fn()
      if (json && json.ok) { setMessage(okText); setRestart(Boolean(json.restartRequired)) }
      else setError('失败：' + ((json && json.reason) || ('HTTP ' + code)))
    } catch (err) {
      setError('失败：' + String((err && (err as Error).message) || err))
    }
    setBusy(false)
    await refresh(true)
  }

  const applyProfiles = (profiles: string[]) => run(
    () => post('/apply', { confirm: true, latest, profiles: profiles.join(',') }),
    latest ? '已按 --latest 应用（仍受发布时长策略约束）' : '已应用范围内的更新',
  )

  const exportCsv = () => {
    const rows: string[][] = [['profile', 'plugin', 'current', 'latest', 'source']]
    for (const row of updates) {
      const match = installed.find((item) => item.profile === row.profile && item.name === row.name)
      rows.push([row.profile, row.name, row.current, row.latest, match ? match.source : 'npm'])
    }
    download('dsh-plugin-updates.csv', toCsv(rows))
  }

  // Restart is a capability, not an assumption: the official Desktop shell owns its
  // own process lifecycle, so the host reports unsupported there and the button says
  // who does own it rather than relaunching Electron behind the launcher's back.
  const restartInfo = (status && status.restart) || null
  const restartSupported = Boolean(restartInfo && restartInfo.supported)
  const restartHint = restartSupported
    ? '重启 DSH，让新装的宿主插件生效（界面会断开几秒）'
    : ((restartInfo && restartInfo.reason) || '当前宿主不支持自重启')

  const restartHost = async () => {
    if (!restartSupported) return
    const proceed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm('重启 DSH？当前界面会断开，几秒后自动恢复。')
      : true
    if (!proceed) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { status: code, json } = await post('/restart', { confirm: true })
      if (json && json.ok) {
        setMessage(json.mode === 'supervisor'
          ? '正在重启：已交给进程管理器接管。'
          : '正在重启：已安排自重启，界面断开几秒后会自己回来。')
      } else setError('重启失败：' + ((json && json.reason) || ('HTTP ' + code)))
    } catch (err) {
      setError('重启失败：' + String((err && (err as Error).message) || err))
    }
    setBusy(false)
  }

  const selectedBlocked = busy || picked.length === 0
  const allBlocked = busy || updates.length === 0

  const toolbar = h('div', { style: S.bar },
    h('button', { style: S.btn, disabled: busy, onClick: () => { void refresh() } }, '重新加载'),
    tab === TAB_UPDATES ? h('button', {
      style: { ...S.btn, ...S.btnPrimary, ...(selectedBlocked ? S.btnOff : {}) },
      disabled: selectedBlocked,
      onClick: () => { void applyProfiles([...new Set(picked.map((row) => row.profile))]) },
    }, '更新所选' + (picked.length > 0 ? ' (' + picked.length + ')' : '')) : null,
    tab === TAB_UPDATES ? h('button', {
      style: { ...S.btn, ...(allBlocked ? S.btnOff : {}) },
      disabled: allBlocked,
      onClick: () => { void applyProfiles(profilesWithUpdates) },
    }, '全部更新') : null,
    tab === TAB_UPDATES ? h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center', ...S.dim } },
      h('input', { type: 'checkbox', checked: latest, onChange: (event: any) => setLatest(event.target.checked) }),
      '忽略版本范围 (--latest)') : null,
    tab === TAB_INSTALLED ? h('button', {
      style: { ...S.btn, ...(busy ? S.btnOff : {}) },
      disabled: busy,
      onClick: () => { void run(() => post('/rollback', {}), '已回滚到最近的快照') },
    }, '回滚最近一次更新') : null,
    h('button', { style: { ...S.btn, ...(allBlocked ? S.btnOff : {}) }, disabled: allBlocked, onClick: exportCsv }, '导出 CSV'),
  )

  return h('div', { style: S.page },
    h('div', { style: S.head },
      h('div', null,
        h('h1', { style: S.h1 }, '插件更新'),
        h('p', { style: S.sub }, '只升 pnpm「最小发布时长」策略放行的版本；应用前自动快照。'),
      ),
      h('div', { style: S.headRight },
        h('button', { style: S.btn, onClick: () => { try { location.reload() } catch {} }, title: '重新加载界面：新装的客户端插件会立刻生效' }, '刷新界面'),
        h('button', {
          style: { ...S.btn, ...(restartSupported ? S.btnPrimary : S.btnOff) },
          disabled: !restartSupported,
          title: restartHint,
          onClick: () => { void restartHost() },
        }, '重启 DSH'),
      ),
    ),
    restart ? h('div', { style: S.banner }, '已应用更新 —— 需要重启 DSH 才生效（宿主插件重新加载，浏览器插件还要刷新页面）。') : null,
    error ? h('div', { style: S.err }, error) : null,
    message ? h('div', { style: S.note }, message) : null,
    h('div', { style: S.tabs },
      h('button', { style: { ...S.tab, ...(tab === TAB_UPDATES ? S.tabOn : {}) }, onClick: () => setTab(TAB_UPDATES) },
        '可用更新' + (updates.length > 0 ? ' (' + updates.length + ')' : '')),
      h('button', { style: { ...S.tab, ...(tab === TAB_INSTALLED ? S.tabOn : {}) }, onClick: () => setTab(TAB_INSTALLED) },
        '已安装' + (installed.length > 0 ? ' (' + installed.length + ')' : '')),
    ),
    toolbar,
    tab === TAB_UPDATES
      ? h(UpdateTable, { updates, installed, selected, setSelected })
      : h(InstalledTable, { installed }),
    h('div', { style: S.note },
      '要装新插件请到 Settings → 插件（插件市场）。本页只管已装插件的更新：版本决策完全交给 dsh plugin，与手动执行逐字一致。'),
  )
}

function UpdateTable (props: any) {
  const { updates, installed, selected, setSelected } = props
  if (updates.length === 0) return h('div', { style: S.note }, '没有可用更新 —— 解析器允许的版本都已装上。')
  const allOn = updates.every((row: any) => selected[row.profile + '/' + row.name])
  const toggleAll = () => {
    const next: Record<string, boolean> = {}
    if (!allOn) for (const row of updates) next[row.profile + '/' + row.name] = true
    setSelected(next)
  }
  return h('table', { style: S.table },
    h('thead', null, h('tr', null,
      h('th', { style: { ...S.th, width: '28px' } }, h('input', { type: 'checkbox', checked: allOn, onChange: toggleAll })),
      h('th', { style: S.th }, '插件'),
      h('th', { style: S.th }, 'Profile'),
      h('th', { style: S.th }, '当前版本'),
      h('th', { style: S.th }, '新版本'),
      h('th', { style: S.th }, '来源'),
    )),
    h('tbody', null, updates.map((row: any) => {
      const key = row.profile + '/' + row.name
      const match = installed.find((item: any) => item.profile === row.profile && item.name === row.name)
      return h('tr', { key },
        h('td', { style: S.td }, h('input', {
          type: 'checkbox',
          checked: Boolean(selected[key]),
          onChange: (event: any) => setSelected({ ...selected, [key]: event.target.checked }),
        })),
        h('td', { style: { ...S.td, ...S.mono } }, row.name),
        h('td', { style: S.td }, row.profile),
        h('td', { style: { ...S.td, ...S.mono } }, row.current),
        h('td', { style: { ...S.td, ...S.mono } }, row.latest),
        h('td', { style: { ...S.td, ...S.dim } }, match ? match.source : 'npm'),
      )
    })),
  )
}

function InstalledTable (props: any) {
  const installed = props.installed
  if (installed.length === 0) return h('div', { style: S.note }, '没有已安装的插件。')
  return h('table', { style: S.table },
    h('thead', null, h('tr', null,
      h('th', { style: S.th }, '插件'),
      h('th', { style: S.th }, 'Profile'),
      h('th', { style: S.th }, '记录的版本范围'),
      h('th', { style: S.th }, '来源'),
    )),
    h('tbody', null, installed.map((row: any) => h('tr', { key: row.profile + '/' + row.name },
      h('td', { style: { ...S.td, ...S.mono } }, row.name),
      h('td', { style: S.td }, row.profile),
      h('td', { style: { ...S.td, ...S.mono } }, row.spec),
      h('td', { style: { ...S.td, ...S.dim } }, row.source),
    ))),
  )
}

/** The rail icon. Hand-drawn so this bundle needs no icon package: the sidebar
 * passes only { size }, and currentColor inherits the rail's state colour. */
export function PluginUpdatesIcon (props: any) {
  const size = props && props.size ? props.size : 16
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
    h('path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
    h('path', { d: 'M20 4v4h-4' }),
    h('path', { d: 'M12 8.5v7' }),
    h('path', { d: 'M8.5 12.5 12 16l3.5-3.5' }),
  )
}

/**
 * The browser half's load-bearing dependency. slots.inject fires only when the
 * composition actually serves that seat, so a deployment without the layout shows
 * none of this instead of erroring.
 */
export const inject = ['slots']

const PANEL_ID = 'plugin-autoupdate'

export function apply (ctx: any) {
  ctx.effect(
    // A MAIN-COLUMN panel, the same seat the Plugins page and the task manager
    // occupy: 'main' is the keyed slot behind the main column, and
    // 'sidebar.panellist' is the rail entry that selects it. The settings
    // section was too cramped for tables (user, 2026-10-09).
    () => ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
    }, PluginUpdatesPage)),
    'dsh-plugin-autoupdate: main panel',
  )
  ctx.effect(
    () => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 40,
      // The rail CALLS label() - first-party code passes a locale-bound function,
      // so a plain string would throw. A literal is the smallest correct shape;
      // locale binding is future work.
      label: () => '插件更新',
    }, PluginUpdatesIcon)),
    'dsh-plugin-autoupdate: sidebar entry',
  )
}
