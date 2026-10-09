import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultProfile, listProfiles, resolveProfiles } from '../lib/profiles.js'

function fakeHome (names) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'))
  for (const name of names) {
    mkdirSync(path.join(home, 'profiles', name), { recursive: true })
    writeFileSync(path.join(home, 'profiles', name, 'package.json'), '{}')
  }
  return home
}

test('an explicit name wins and unknown names are reported', () => {
  const home = fakeHome(['desktop', 'm1test'])
  const resolved = resolveProfiles('m1test,nope', {}, home)
  assert.deepEqual(resolved.profiles, ['m1test'])
  assert.deepEqual(resolved.unknown, ['nope'])
  assert.equal(resolved.defaulted, false)
})

test('DSH_PROFILE wins over the launcher hint', () => {
  const home = fakeHome(['desktop', 'web'])
  assert.equal(defaultProfile(listProfiles(home), { DSH_PROFILE: 'web' }, 'desktop'), 'web')
})

test('the launcher hint resolves when DSH_PROFILE is absent (the Electron case)', () => {
  const home = fakeHome(['desktop', 'web'])
  const resolved = resolveProfiles('', {}, home, 'web')
  assert.deepEqual(resolved.profiles, ['web'])
  assert.equal(resolved.defaulted, true)
})

test('with no hint at all the app profile desktop is used', () => {
  const home = fakeHome(['desktop', 'other'])
  assert.deepEqual(resolveProfiles('', {}, home).profiles, ['desktop'])
})

test('a lone profile is used when there is no desktop profile', () => {
  const home = fakeHome(['only'])
  assert.deepEqual(resolveProfiles('', {}, home).profiles, ['only'])
})

test('several profiles and no hint resolves nothing rather than guessing', () => {
  const home = fakeHome(['a', 'b'])
  const resolved = resolveProfiles('', {}, home)
  assert.deepEqual(resolved.profiles, [])
  assert.equal(resolved.defaulted, false)
  assert.deepEqual(resolved.all, ['a', 'b'])
})
