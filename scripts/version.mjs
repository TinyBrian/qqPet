import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('..', import.meta.url))
const semantic = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

function versionString(value) {
  const version = String(value).trim().replace(/^v/, '')
  const match = semantic.exec(version)
  if (!match || match[4]?.split('.').some(part => /^0\d+$/.test(part))) throw new Error('Version must be a semantic version such as 0.6.4 or 0.7.0-beta.1.')
  return version
}

function buildString(value) {
  const build = String(value).trim()
  if (!/^[1-9]\d*(?:\.\d+){0,2}$/.test(build)) throw new Error('Build number must be a positive integer or up to three numeric components.')
  return build
}

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

function checkoutVersion(root) {
  const tags = (git(root, ['tag', '--list']) ?? '').split('\n').filter(tag => {
    try { versionString(tag); return true } catch { return false }
  })
  if (!tags.length) return null
  const description = git(root, ['describe', '--tags', '--long', '--abbrev=8', ...tags.flatMap(tag => ['--match', tag])])
  const match = description && /^(.*)-(\d+)-g([0-9a-f]+)$/.exec(description)
  if (!match) return null
  const version = versionString(match[1])
  if (match[2] === '0') return version
  const [base, metadata] = version.split('+')
  const development = `${base}${base.includes('-') ? '.' : '-'}dev.${match[2]}`
  return `${development}+${metadata ? `${metadata}.` : ''}g${match[3]}`
}

/** One offline source of build identity for Web views and native package metadata. */
export function resolveAppVersion(options = {}) {
  const root = resolve(options.root ?? repository)
  const env = options.env ?? process.env
  let version, source
  const explicit = options.version ?? env.QQPET_VERSION
  const tag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : env.GITHUB_REF?.startsWith('refs/tags/') ? env.GITHUB_REF.slice('refs/tags/'.length) : undefined
  if (explicit !== undefined) { version = versionString(explicit); source = 'explicit' }
  else if (tag !== undefined) { version = versionString(tag); source = 'ci-tag' }
  else {
    version = checkoutVersion(root)
    source = 'git-tag'
    if (!version) {
      version = versionString(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version)
      source = 'package'
    }
  }
  const shortVersion = version.split(/[+-]/)[0]
  const buildVersion = buildString(options.buildNumber ?? env.QQPET_BUILD_NUMBER ?? env.GITHUB_RUN_NUMBER ?? git(root, ['rev-list', '--count', 'HEAD']) ?? '1')
  return { version, shortVersion, buildVersion, source }
}

export function stampIOSInfo(template, identity) {
  let result = template
  for (const [token, value] of [['@QQPET_SHORT_VERSION@', identity.shortVersion], ['@QQPET_BUILD_VERSION@', identity.buildVersion]]) {
    if (!result.includes(token)) throw new Error(`Info.plist is missing the ${token} version token.`)
    result = result.replaceAll(token, value)
  }
  return result
}

function main(args) {
  const options = {}
  let field, plist, output
  const values = { '--version': 'version', '--build-number': 'buildNumber', '--root': 'root' }
  for (let i = 0; i < args.length; i++) {
    const option = args[i], value = args[++i]
    if (!value) throw new Error(`Missing value for ${option}.`)
    if (Object.prototype.hasOwnProperty.call(values, option)) options[values[option]] = value
    else if (option === '--field') field = value
    else if (option === '--plist') plist = value
    else if (option === '--output') output = value
    else throw new Error(`Unknown version option ${option}.`)
  }
  const identity = resolveAppVersion(options)
  if (plist || output) {
    if (!plist || !output || field) throw new Error('Use --plist and --output together, without --field.')
    writeFileSync(output, stampIOSInfo(readFileSync(plist, 'utf8'), identity))
  } else if (field) {
    if (!['version', 'shortVersion', 'buildVersion', 'source'].includes(field)) throw new Error('Unknown version field.')
    process.stdout.write(identity[field] + '\n')
  } else process.stdout.write(JSON.stringify(identity) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
