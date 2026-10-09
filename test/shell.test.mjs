import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteForCmd, buildWindowsCommand } from '../lib/outdated.js'

test('leaves plain tokens unquoted', () => {
  assert.equal(quoteForCmd('plugin'), 'plugin')
  assert.equal(quoteForCmd('--profile'), '--profile')
  assert.equal(quoteForCmd('@scope/name'), '@scope/name')
  assert.equal(quoteForCmd('1.66.9'), '1.66.9')
})

test('quotes a caret so cmd.exe cannot swallow it', () => {
  assert.equal(quoteForCmd('dsh-whale-widget@^0.3.17'), '"dsh-whale-widget@^0.3.17"')
})

test('escapes percent signs, which expand even inside quotes', () => {
  assert.equal(quoteForCmd('100%done'), '"100%%done"')
})

test('quotes paths containing spaces', () => {
  assert.equal(quoteForCmd('C:\\Program Files\\DeepSeek Harness.exe'), '"C:\\Program Files\\DeepSeek Harness.exe"')
})

test('builds one command line with every argument quoted independently', () => {
  assert.equal(
    buildWindowsCommand('dsh.cmd', ['plugin', '--profile', 'desktop', 'add', 'pkg@^1.2.3']),
    'dsh.cmd plugin --profile desktop add "pkg@^1.2.3"',
  )
})
