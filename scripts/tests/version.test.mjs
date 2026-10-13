import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { resolveAppVersion, stampIOSInfo } from '../version.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'qqpet-version-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }))
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Version Test', '-c', 'user.email=version@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const commit = value => {
    writeFileSync(join(root, 'fixture.txt'), value)
    git('add', '.')
    git('commit', '-qm', value)
  }
  try { run({ root, git, commit }) }
  finally { rmSync(root, { recursive: true, force: true }) }
}

test('explicit build identity wins over CI tags and keeps a numeric native version', () => fixture(({ root }) => {
  const version = resolveAppVersion({ root, version: 'v0.7.0-beta.2+feature', buildNumber: '42.3', env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.6.4', GITHUB_RUN_NUMBER: '9' } })
  assert.deepEqual(version, { version: '0.7.0-beta.2+feature', shortVersion: '0.7.0', buildVersion: '42.3', source: 'explicit' })
  assert.equal(resolveAppVersion({ root, env: { QQPET_VERSION: '0.8.0', QQPET_BUILD_NUMBER: '23' } }).version, '0.8.0')
}))

test('tag CI works in a shallow or archive checkout without changing the package template', () => fixture(({ root }) => {
  assert.deepEqual(resolveAppVersion({ root, env: { GITHUB_REF: 'refs/tags/v0.6.4', GITHUB_RUN_NUMBER: '27' } }), { version: '0.6.4', shortVersion: '0.6.4', buildVersion: '27', source: 'ci-tag' })
  assert.equal(resolveAppVersion({ root, env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.6.5' } }).version, '0.6.5')
  assert.equal(resolveAppVersion({ root, env: { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'v0.9.0' } }).version, '0.1.0')
}))

test('ordinary git builds use the reachable release and a development identity after it', () => fixture(({ root, git, commit }) => {
  git('init', '-q')
  commit('first')
  git('tag', 'v0.6.4')
  assert.deepEqual(resolveAppVersion({ root, env: {} }), { version: '0.6.4', shortVersion: '0.6.4', buildVersion: '1', source: 'git-tag' })
  commit('second')
  git('tag', 'checkpoint')
  const version = resolveAppVersion({ root, env: {} })
  assert.match(version.version, /^0\.6\.4-dev\.1\+g[0-9a-f]{8}$/)
  assert.equal(version.shortVersion, '0.6.4')
  assert.equal(version.buildVersion, '2')
  assert.equal(version.source, 'git-tag')
}))

test('prerelease tags retain their suffix and metadata in development checkouts', () => fixture(({ root, git, commit }) => {
  git('init', '-q')
  commit('first')
  git('tag', 'v0.7.0-rc.1+api')
  assert.equal(resolveAppVersion({ root, env: {} }).version, '0.7.0-rc.1+api')
  commit('second')
  assert.match(resolveAppVersion({ root, env: {} }).version, /^0\.7\.0-rc\.1\.dev\.1\+api\.g[0-9a-f]{8}$/)
}))

test('package fallback and plist stamping share the same portable identity', () => fixture(({ root }) => {
  const identity = resolveAppVersion({ root, env: {} })
  assert.deepEqual(identity, { version: '0.1.0', shortVersion: '0.1.0', buildVersion: '1', source: 'package' })
  const template = '<string>@QQPET_SHORT_VERSION@</string><string>@QQPET_BUILD_VERSION@</string>'
  assert.equal(stampIOSInfo(template, identity), '<string>0.1.0</string><string>1</string>')
  assert.throws(() => stampIOSInfo('<plist/>', identity), /missing/)
}))

test('malformed explicit versions and build numbers fail instead of falling back silently', () => fixture(({ root }) => {
  for (const version of ['', '0.6', 'v0.6.4/path', '0.6.4-beta.01']) assert.throws(() => resolveAppVersion({ root, env: {}, version }), /semantic version/)
  for (const buildNumber of ['0', 'development', '1.2.3.4']) assert.throws(() => resolveAppVersion({ root, env: {}, version: '0.6.4', buildNumber }), /Build number/)
}))

test('the native build CLI provides clean fields and stamps the same version into its plist', () => fixture(({ root }) => {
  const script = fileURLToPath(new URL('../version.mjs', import.meta.url))
  const args = [script, '--root', root, '--version', 'v0.9.0-dev.3+g1234', '--build-number', '44']
  const options = { env: {}, encoding: 'utf8' }
  assert.equal(execFileSync(process.execPath, [...args, '--field', 'version'], options), '0.9.0-dev.3+g1234\n')
  const input = join(root, 'Info.template.plist'), output = join(root, 'Info.plist')
  writeFileSync(input, '<string>@QQPET_SHORT_VERSION@</string><string>@QQPET_BUILD_VERSION@</string>')
  execFileSync(process.execPath, [...args, '--plist', input, '--output', output], options)
  assert.equal(readFileSync(output, 'utf8'), '<string>0.9.0</string><string>44</string>')
}))
