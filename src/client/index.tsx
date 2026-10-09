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
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ROUTE = '/plugin-autoupdate'
const TAB_UPDATES = 'updates'
const TAB_INSTALLED = 'installed'
const TAB_DISCOVER = 'discover'
const TAB_LOCKED = 'locked'
const Q = String.fromCharCode(34)

type Row = { name: string; current: string; latest: string }
type InstalledRow = { name: string; spec: string; source: string }
type Lock = { name: string; version?: string | null; note?: string | null; lockedAt?: string }
type Report = { profile: string; rows?: Row[]; lockedRows?: Row[]; locks?: Lock[]; installed?: InstalledRow[] }
type CatalogRow = {
  name: string; npm: string | null; owner: string | null; url: string | null; page: string | null
  category: string | null; description: { en?: string; zh?: string }; version: string | null
  stars: number; downloads: number; capabilities: string[]; redLines: string[]
}
type CatalogResult = {
  ok: boolean; total?: number; rows?: CatalogRow[]; categories?: { id: string; en: string; zh: string }[]
  updated?: string | null; stale?: boolean; error?: string | null; reason?: string
}
type Restart = { supported: boolean; reason?: string; supervisor?: string }
type Status = { ok: boolean; profiles?: string[]; reports?: Report[]; restart?: Restart; reason?: string; features?: string[]; version?: string | null }
type ActionResult = { ok: boolean; restartRequired?: boolean; reason?: string }

/**
 * Every route answers JSON - but only when the host actually has that route. A
 * host that predates this bundle answers 404 with a plain body, and `.json()` on
 * that is null, which used to look exactly like "no data yet" and hid the reason.
 * Keep the status code and a snippet of the body so the page can say what happened.
 */
async function send (path: string, init?: RequestInit): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(ROUTE + path, init)
  const text = await response.text()
  let json: any = null
  if (text !== '') { try { json = JSON.parse(text) } catch { json = null } }
  return { status: response.status, json, text }
}

const getStatus = () => send('/status')
const post = (path: string, body: Record<string, unknown>) => send(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const S = {
  /**
   * The seat is AppFrame's centerCol: a column flex box with overflow:hidden. So
   * the page must own its own scrolling and fill BOTH axes - the maxWidth:1100px
   * this used to carry is what made the whole page hug the left edge on a wide
   * window, and nothing scrolled because the parent clips (user, 2026-10-09).
   */
  page: {
    boxSizing: 'border-box' as const,
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    padding: '0 clamp(20px, 3vw, 40px) 40px',
    fontSize: '13px',
    lineHeight: 1.55,
    color: 'var(--dsw-alias-label-primary, inherit)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    // The desktop shell draws a draggable title strip over the top of the frame.
    paddingTop: 'calc(24px + var(--dsh-frame-top-clearance, 0px))',
  },
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
  th: {
    textAlign: 'left' as const,
    padding: '6px 8px',
    // A sticky header needs an opaque background, so dim the text, not the cell.
    color: 'var(--dsw-alias-label-caption, rgba(128,128,128,.9))',
    fontWeight: 500,
    borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.25))',
    fontSize: '12px',
    position: 'sticky' as const,
    top: 0,
    background: 'var(--dsw-alias-bg-base, Canvas)',
    zIndex: 2,
  },
  td: { padding: '5px 8px', borderBottom: '1px solid rgba(128,128,128,.12)' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  note: { marginTop: '12px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(128,128,128,.08)', opacity: 0.85, fontSize: '12px' },
  banner: { marginBottom: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,180,60,.14)', border: '1px solid rgba(255,180,60,.4)', fontSize: '12px' },
  err: { marginBottom: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,90,90,.14)', border: '1px solid rgba(255,90,90,.4)', fontSize: '12px' },
  dim: { opacity: 0.6, fontSize: '12px' },
  input: { padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', fontSize: '12px', minWidth: '200px' },
  badge: { display: 'inline-block', padding: '1px 6px', marginRight: '4px', borderRadius: '999px', background: 'rgba(128,128,128,.16)', fontSize: '11px' },
  badgeWarn: { background: 'rgba(255,150,60,.18)' },
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
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [catalog, setCatalog] = useState<CatalogResult | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [catalogStartedAt, setCatalogStartedAt] = useState(0)
  const [, setTick] = useState(0)
  const catalogTried = useRef(false)

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
  const lockedRows = useMemo(() => reports.flatMap((report) => (report.lockedRows || []).map((row) => ({ ...row, profile: report.profile }))), [reports])
  const locks = useMemo(() => reports.flatMap((report) => (report.locks || []).map((lock) => ({ ...lock, profile: report.profile }))), [reports])
  const installedNames = useMemo(() => new Set(installed.map((row) => row.name)), [installed])
  const allProfiles = [...new Set(reports.map((report) => report.profile))]

  // The browser half is re-read from disk on every page load; the host half is only
  // loaded when the process starts. So a page refresh can show this bundle's tabs
  // while the running host still lacks their routes - exactly what happened on
  // 2026-10-09 15:0x: the 发现 tab existed and /catalog answered 404. Say so, in
  // those words, instead of reporting an empty catalog.
  const hostFeatures = (status && status.features) || []
  const hostTooOld = Boolean(status && status.ok) && !hostFeatures.includes('catalog')

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

  // Discovery reads the market's own catalog through the host (5 MB, cached there;
  // the browser never downloads it and never talks to the catalog itself).
  const searchCatalog = useCallback(async (text: string, nextCategory: string) => {
    setCatalogBusy(true)
    setCatalogError('')
    setCatalogStartedAt(Date.now())
    try {
      const params = new URLSearchParams()
      if (text.trim() !== '') params.set('q', text.trim())
      if (nextCategory !== '') params.set('category', nextCategory)
      params.set('limit', '60')
      const { status: code, json, text: body } = await send('/catalog?' + params.toString())
      if (json && json.ok === true) setCatalog(json)
      else {
        setCatalog(null)
        const reason = json && json.reason ? String(json.reason) : ''
        setCatalogError(code === 404
          ? '宿主没有 /catalog 路由（HTTP 404）—— 运行中的宿主插件还是旧版本。界面能刷新，宿主插件不能：完全退出 DSH（托盘图标 → 退出）再重开。'
          : 'HTTP ' + code + (reason !== '' ? '：' + reason : (body !== '' ? '：' + body.slice(0, 200) : '')))
      }
    } catch (err) {
      setCatalog(null)
      setCatalogError('读取目录失败：' + String((err && (err as Error).message) || err))
    }
    setCatalogBusy(false)
  }, [])

  // Load the first visit only - never re-fire on failure. The old shape keyed on
  // `catalog === null`, so a 404 (old host) retried in a tight loop forever.
  useEffect(() => {
    if (tab !== TAB_DISCOVER || catalogTried.current || catalogBusy || hostTooOld) return
    catalogTried.current = true
    void searchCatalog(query, category)
  }, [tab, catalogBusy, hostTooOld, query, category, searchCatalog])

  const lockOne = (row: any) => run(
    () => post('/lock', { name: row.name, version: row.latest, profiles: row.profile }),
    '已锁定 ' + row.name + '：不再提示它的更新（它仍会随范围升级，锁的是提示）',
  )

  const unlockOne = (lock: any) => run(
    () => post('/unlock', { name: lock.name, profiles: lock.profile }),
    '已解锁 ' + lock.name,
  )

  const installOne = async (entry: CatalogRow) => {
    const spec = entry.npm || entry.name
    const where = allProfiles.length > 0 ? allProfiles.join(', ') : '当前 profile'
    const proceed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm('安装 ' + spec + ' 到 ' + where + '？\n\n装完需要重启 DSH 才会生效。')
      : true
    if (!proceed) return
    await run(() => post('/install', { confirm: true, spec, profiles: allProfiles.join(',') }), '已安装 ' + spec + '（需要重启 DSH 生效）')
    await refresh(true)
  }

  // A 5 MB first fetch is not instant. Count the seconds out loud rather than show
  // a static line that reads like a hang (user, 2026-10-09).
  useEffect(() => {
    if (!catalogBusy) return
    const timer = setInterval(() => setTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [catalogBusy])
  const catalogElapsed = catalogBusy && catalogStartedAt > 0 ? Math.round((Date.now() - catalogStartedAt) / 1000) : 0

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
    tab === TAB_DISCOVER ? h('input', {
      style: S.input,
      placeholder: '搜索插件（名称 / 描述 / 作者）',
      value: query,
      onChange: (event: any) => setQuery(event.target.value),
      onKeyDown: (event: any) => { if (event.key === 'Enter') void searchCatalog(query, category) },
    }) : null,
    tab === TAB_DISCOVER ? h('select', {
      style: S.input,
      value: category,
      onChange: (event: any) => { setCategory(event.target.value); void searchCatalog(query, event.target.value) },
    }, h('option', { value: '' }, '全部分类'),
      ...((catalog && catalog.categories) || []).map((item) => h('option', { key: item.id, value: item.id }, item.zh || item.en))) : null,
    tab === TAB_DISCOVER ? h('button', {
      style: { ...S.btn, ...(catalogBusy ? S.btnOff : {}) },
      disabled: catalogBusy,
      onClick: () => { void searchCatalog(query, category) },
    }, catalogBusy ? '查询中…' : '搜索') : null,
    tab === TAB_DISCOVER ? null : h('button', { style: { ...S.btn, ...(allBlocked ? S.btnOff : {}) }, disabled: allBlocked, onClick: exportCsv }, '导出 CSV'),
  )

  return h('div', { style: S.page },
    h('div', { style: S.head },
      h('div', null,
        h('h1', { style: S.h1 }, '插件更新'),
        h('p', { style: S.sub }, '只升 pnpm「最小发布时长」策略放行的版本；应用前自动快照。'),
      ),
      h('div', { style: S.headRight },
        h('button', { style: S.btn, onClick: () => { try { location.reload() } catch {} }, title: '重新加载界面：新装的客户端插件会立刻生效。宿主插件不行，那要重启 DSH。' }, '刷新界面'),
        h('button', {
          style: { ...S.btn, ...(restartSupported ? S.btnPrimary : S.btnOff) },
          disabled: !restartSupported,
          title: restartHint,
          onClick: () => { void restartHost() },
        }, '重启 DSH'),
      ),
    ),
    restart ? h('div', { style: S.banner }, '已应用更新 —— 需要重启 DSH 才生效（宿主插件重新加载，浏览器插件还要刷新页面）。') : null,
    hostTooOld ? h('div', { style: S.banner },
      '宿主插件还是旧版本：这个界面是新构建的，运行中的宿主进程还是上次启动时加载的代码（没有 /catalog 路由）。',
      h('br'),
      '「刷新界面」不够 —— 请完全退出 DSH（托盘图标 → 退出，不是关窗口）再重开。',
    ) : null,
    error ? h('div', { style: S.err }, error) : null,
    message ? h('div', { style: S.note }, message) : null,
    h('div', { style: S.tabs },
      h('button', { style: { ...S.tab, ...(tab === TAB_UPDATES ? S.tabOn : {}) }, onClick: () => setTab(TAB_UPDATES) },
        '可用更新' + (updates.length > 0 ? ' (' + updates.length + ')' : '')),
      h('button', { style: { ...S.tab, ...(tab === TAB_INSTALLED ? S.tabOn : {}) }, onClick: () => setTab(TAB_INSTALLED) },
        '已安装' + (installed.length > 0 ? ' (' + installed.length + ')' : '')),
      h('button', { style: { ...S.tab, ...(tab === TAB_DISCOVER ? S.tabOn : {}) }, onClick: () => setTab(TAB_DISCOVER) }, '发现'),
      h('button', { style: { ...S.tab, ...(tab === TAB_LOCKED ? S.tabOn : {}) }, onClick: () => setTab(TAB_LOCKED) },
        '已锁定' + (locks.length > 0 ? ' (' + locks.length + ')' : '')),
    ),
    toolbar,
    tab === TAB_UPDATES
      ? h(UpdateTable, { updates, installed, selected, setSelected, onLock: lockOne })
      : tab === TAB_INSTALLED
        ? h(InstalledTable, { installed })
        : tab === TAB_DISCOVER
          ? h(DiscoverTable, {
            catalog, catalogBusy, catalogError, hostTooOld, elapsed: catalogElapsed,
            installedNames,
            onInstall: installOne,
            onRetry: () => { catalogTried.current = true; void searchCatalog(query, category) },
          })
          : h(LockedTable, { rows: lockedRows, locks, onUnlock: unlockOne }),
    h('div', { style: S.note },
      '更新与版本决策完全交给 dsh plugin（与手动执行逐字一致）；「发现」读的是插件市场的官方目录，安装同样不给它选版本。'),
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
      h('th', { style: S.th }, ''),
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
        h('td', { style: S.td }, h('button', {
          style: S.btn,
          title: '不再提示这个插件的更新',
          onClick: () => props.onLock(row),
        }, '锁定')),
      )
    })),
  )
}

function DiscoverTable (props: any) {
  const { catalog, catalogBusy, catalogError, hostTooOld, elapsed, installedNames, onInstall } = props
  if (hostTooOld) return h('div', { style: S.note }, '宿主插件没有目录路由 —— 退出 DSH 再重开，然后回到这里。')
  if (catalogError !== '') {
    return h('div', null,
      h('div', { style: S.err }, catalogError),
      h('button', { style: S.btn, onClick: () => props.onRetry() }, '重试'),
    )
  }
  if (catalogBusy && catalog === null) {
    return h('div', { style: S.note }, '正在读取插件目录…'
      + (elapsed > 2 ? '（已 ' + elapsed + ' 秒；首次要下 5 MB，之后走本地缓存）' : '（首次约 5 MB，之后走本地缓存）'))
  }
  if (catalog === null) {
    return h('div', null,
      h('div', { style: S.note }, '还没有目录数据。'),
      h('button', { style: S.btn, onClick: () => props.onRetry() }, '读取目录'),
    )
  }
  if (catalog.ok !== true) return h('div', { style: S.err }, '目录不可用：' + (catalog.reason || catalog.error || '未知原因'))
  const rows: CatalogRow[] = catalog.rows || []
  return h('div', null,
    h('div', { style: { ...S.dim, marginBottom: '6px' } },
      '共 ' + (catalog.total || 0) + ' 条匹配 · 目录更新于 ' + (catalog.updated || '未知')
      + (catalog.stale ? '（离线缓存' + (catalog.error ? '：' + catalog.error : '') + '）' : '')),
    rows.length === 0
      ? h('div', { style: S.note }, '没有匹配的插件。换个关键词试试。')
      : h('table', { style: S.table },
        h('thead', null, h('tr', null,
          h('th', { style: S.th }, '插件'),
          h('th', { style: S.th }, '说明'),
          h('th', { style: S.th }, '热度'),
          h('th', { style: S.th }, '能力'),
          h('th', { style: S.th }, ''),
        )),
        h('tbody', null, rows.map((entry) => {
          const spec = entry.npm || entry.name
          const already = installedNames.has(entry.name) || (entry.npm !== null && installedNames.has(entry.npm as string))
          return h('tr', { key: entry.name },
            h('td', { style: S.td },
              h('div', { style: S.mono }, entry.name),
              h('div', { style: S.dim }, (entry.owner || '') + (entry.version ? '  v' + entry.version : '')),
            ),
            h('td', { style: { ...S.td, maxWidth: '520px' } }, (entry.description && (entry.description.zh || entry.description.en)) || ''),
            h('td', { style: { ...S.td, ...S.dim } }, '★' + entry.stars + '  ↓' + entry.downloads),
            h('td', { style: S.td },
              ...entry.capabilities.map((name) => h('span', { key: name, style: S.badge }, name)),
              ...entry.redLines.map((name) => h('span', { key: name, style: { ...S.badge, ...S.badgeWarn } }, name)),
            ),
            h('td', { style: S.td },
              already
                ? h('span', { style: S.dim }, '已安装')
                : h('button', { style: { ...S.btn, ...S.btnPrimary }, onClick: () => { void onInstall(entry) } }, '安装')),
          )
        })),
      ),
  )
}

function LockedTable (props: any) {
  const { rows, locks, onUnlock } = props
  if (locks.length === 0) return h('div', { style: S.note }, '没有被锁定的插件。在「可用更新」里点某一行的「锁定」，就不会再提示它的更新。')
  return h('table', { style: S.table },
    h('thead', null, h('tr', null,
      h('th', { style: S.th }, '插件'),
      h('th', { style: S.th }, 'Profile'),
      h('th', { style: S.th }, '锁定时版本'),
      h('th', { style: S.th }, '当前可升到'),
      h('th', { style: S.th }, ''),
    )),
    h('tbody', null, locks.map((lock: any) => {
      const row = rows.find((item: any) => item.name === lock.name && item.profile === lock.profile)
      return h('tr', { key: lock.profile + '/' + lock.name },
        h('td', { style: { ...S.td, ...S.mono } }, lock.name),
        h('td', { style: S.td }, lock.profile),
        h('td', { style: { ...S.td, ...S.mono } }, lock.version || '—'),
        h('td', { style: { ...S.td, ...S.mono } }, row ? row.current + ' → ' + row.latest : '已是最新'),
        h('td', { style: S.td }, h('button', { style: S.btn, onClick: () => { void onUnlock(lock) } }, '解锁')),
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
