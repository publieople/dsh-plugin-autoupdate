/**
 * dsh-plugin-autoupdate - keep a DeepSeek Harness profile's plugins current without
 * ever weakening the supply-chain rules that protect it.
 *
 * Design boundaries, all deliberate:
 *   - every version decision is delegated to the DSH CLI. We never query a registry
 *     to pick a version ourselves, so pnpm's minimum-release-age policy and the
 *     profile's semver ranges apply exactly as they do for a manual update;
 *   - we never pin a version: `add pkg@x.y.z` is not used anywhere, because pnpm
 *     records such a request in minimumReleaseAgeExclude and that silently bypasses
 *     the age gate the user relies on;
 *   - a snapshot is taken before every apply, and rollback is a first-class action;
 *   - nothing restarts DSH behind the user's back: the report says a restart is
 *     needed and leaves the decision where it belongs.
 *
 * @module dsh-plugin-autoupdate
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { findDshCli } from './dsh-cli.js'
import { dshHome, resolveProfiles } from './profiles.js'
import { checkProfile } from './outdated.js'
import { applyUpdate, rollback, pruneSnapshots } from './apply.js'

export const name = 'dsh-plugin-autoupdate'
export const inject = ['tools']

const MAX_ROWS = 40

export function apply (ctx) {
  ctx.tools.register(defineTool({
    name: 'dsh_plugin_updates',
    description:
      'Check, apply or roll back plugin updates for DeepSeek Harness profiles. ' +
      'Every version decision is delegated to the DSH CLI (dsh plugin --profile <p> outdated|update|install), ' +
      'so the semver ranges recorded in the profile and pnpm supply-chain minimum-release-age policy keep applying ' +
      'exactly as they do for a manual update - a version that was published minutes ago is not offered, and this ' +
      'tool cannot make it offered. It deliberately never pins a version: pnpm add pkg@x.y.z is not used, because ' +
      'that would write a minimumReleaseAgeExclude entry and silently bypass the age gate. ' +
      'Actions: check (default) reports installed vs updatable per profile; apply snapshots the profile and then ' +
      'updates, reporting exactly which ranges moved; rollback restores the newest snapshot and reinstalls. ' +
      'Ask the user before using action=apply or action=rollback - both write to the profile directory. ' +
      'Host plugins only reload on a DSH restart, which this tool never performs for you.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: "One of 'check', 'apply', 'rollback'. Use 'check' unless the user explicitly asked to install updates or to undo one.",
      },
      profiles: {
        type: 'string',
        description: 'Comma-separated profile names. Default: the profile this DSH instance is running (DSH_PROFILE).',
      },
      latest: {
        type: 'boolean',
        description: 'Pass --latest: ignore the recorded semver ranges when choosing versions. Still obeys the release-age policy. Default false.',
      },
      snapshot: {
        type: 'string',
        description: 'rollback only: snapshot directory name to restore. Default: the newest snapshot.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderReport(value) }],
    },
    execute: async (args) => {
      const action = String(args.action || 'check').trim().toLowerCase()
      if (!['check', 'apply', 'rollback'].includes(action)) {
        return { ok: false, action, reason: 'unknown action: ' + action }
      }
      const home = dshHome()
      const resolved = resolveProfiles(args.profiles)
      if (resolved.profiles.length === 0) {
        return { ok: false, action, reason: 'no profile resolved', knownProfiles: resolved.all, unknownProfiles: resolved.unknown }
      }
      const cli = findDshCli()
      const base = { action, cli, dshHome: home, unknownProfiles: resolved.unknown }
      try {
        if (action === 'check') {
          const reports = []
          for (const profile of resolved.profiles) reports.push(await checkProfile({ cli, profile }))
          return { ...base, ok: true, reports }
        }
        if (action === 'apply') {
          const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
          const reports = []
          for (const profile of resolved.profiles) {
            const profileDir = joinProfile(home, profile)
            reports.push(await applyUpdate({ cli, profile, profileDir, latest: args.latest === true, stamp }))
            pruneSnapshots(profileDir, 5)
          }
          return { ...base, ok: true, reports, restartRequired: true }
        }
        const reports = []
        for (const profile of resolved.profiles) {
          reports.push(await rollback({ cli, profile, profileDir: joinProfile(home, profile), snapshot: args.snapshot }))
        }
        return { ...base, ok: reports.every((r) => r.ok), reports, restartRequired: true }
      } catch (err) {
        return { ...base, ok: false, reason: String((err && err.message) || err) }
      }
    },
    timeoutMs: 900000,
  }))
}

function joinProfile (home, profile) {
  return [home, 'profiles', profile].join(require_sep())
}

function require_sep () {
  return process.platform === 'win32' ? '\\' : '/'
}

function renderReport (value) {
  const lines = []
  lines.push('action: ' + (value.action || '?') + '   ok: ' + (value.ok === true))
  lines.push('dsh cli: ' + (value.cli || '?'))
  if (value.unknownProfiles && value.unknownProfiles.length > 0) {
    lines.push('unknown profiles ignored: ' + value.unknownProfiles.join(', '))
  }
  if (value.reason) lines.push('reason: ' + value.reason)
  for (const report of value.reports || []) {
    lines.push('')
    if (report.rows) {
      lines.push('[' + report.profile + '] ' + report.rows.length + ' update(s) available')
      for (const row of report.rows.slice(0, MAX_ROWS)) {
        lines.push('  ' + row.name + '  ' + row.current + ' -> ' + row.latest)
      }
      if (report.rows.length === 0) lines.push('  (everything the release-age policy allows is already installed)')
    } else {
      lines.push('[' + report.profile + '] exit=' + report.code + (report.latest ? '  (--latest)' : ''))
      if (report.snapshot && report.code === 0) lines.push('  snapshot: ' + report.snapshot)
      if (report.changed && report.changed.length > 0) {
        lines.push('  changed:')
        for (const change of report.changed) lines.push('    ' + change)
      } else {
        lines.push('  no manifest change')
      }
      if (report.restored) lines.push('  restored: ' + report.restored.join(', '))
    }
  }
  if (value.restartRequired) {
    lines.push('')
    lines.push('Restart DSH for updated host plugins to reload; browser plugins need a page refresh.')
  }
  return lines.join(String.fromCharCode(10))
}
