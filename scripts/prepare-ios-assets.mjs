#!/usr/bin/env node
// Explicit preparation only. Ordinary iOS builds use these verified local files.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, constants } from 'node:fs'
import { promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.resolve(process.env.QQPET_RESOURCES_ROOT || path.join(root, 'out/ios-assets'))
const checkOnly = process.argv.includes('--check')
const requestedJobs = Number(process.env.QQPET_ASSET_JOBS || 2)
const jobs = Number.isInteger(requestedJobs) ? Math.max(1, Math.min(6, requestedJobs)) : 2
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`)
  return result.stdout
}
// Default to the common upstream asset revision. CI supplies a repository and
// revision together, while the tracked pointers still verify each resource byte.
const revision = process.env.QQPET_ASSET_REVISION || git('merge-base', 'HEAD', 'origin/main').trim()
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('QQPET_ASSET_REVISION must be a full commit SHA')
const repositorySlug = process.env.QQPET_ASSET_REPOSITORY || 'AnkioTomas/qqpet'
if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug)) throw new Error('QQPET_ASSET_REPOSITORY must be owner/repository')
const repository = `https://github.com/${repositorySlug}`
const active = new Set()
let interrupted = false
const stop = () => {
  interrupted = true
  for (const controller of active) controller.abort()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

async function digest(file) {
  const hash = createHash('sha256')
  let size = 0
  for await (const bytes of createReadStream(file)) { hash.update(bytes); size += bytes.length }
  return { sha256: hash.digest('hex'), size }
}
async function valid(file, entry) {
  try {
    if ((await fs.stat(file)).size !== entry.size) return false
    return (await digest(file)).sha256 === entry.sha256
  } catch { return false }
}
async function download(entry, target) {
  const url = `https://media.githubusercontent.com/media/${repositorySlug}/${revision}/${entry.source.split('/').map(encodeURIComponent).join('/')}`
  const temporary = `${target}.download-${process.pid}`
  await fs.mkdir(path.dirname(target), { recursive: true })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (interrupted) throw new Error('Asset preparation interrupted')
    const controller = new AbortController()
    active.add(controller)
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'qqpet-ios-asset-preparation' } })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${entry.source}`)
      const hash = createHash('sha256')
      let size = 0
      const verify = new Transform({ transform(bytes, encoding, next) {
        size += bytes.length
        hash.update(bytes)
        if (size > entry.size) next(new Error(`Unexpected asset size: ${entry.source}`))
        else next(null, bytes)
      } })
      await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(temporary, { flags: 'wx' }), { signal: controller.signal })
      if (size !== entry.size || hash.digest('hex') !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.source}`)
      await fs.rename(temporary, target)
      return
    } catch (error) {
      await fs.rm(temporary, { force: true })
      if (interrupted || attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    } finally { clearTimeout(timer); active.delete(controller) }
  }
}

async function main() {
  const files = git('ls-files', '-z', 'resources').split('\0').filter(Boolean)
  const entries = []
  for (const source of files) {
    const file = path.join(root, source)
    const stat = await fs.stat(file)
    const pointer = stat.size < 1024 ? await fs.readFile(file, 'utf8') : ''
    const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)\s*$/.exec(pointer)
    const metadata = match ? { sha256: match[1], size: Number(match[2]) } : await digest(file)
    entries.push({ source, file: source.slice('resources/'.length), ...metadata, lfs: Boolean(match) })
  }
  if (!entries.length) throw new Error('No tracked resources found')
  await fs.mkdir(destination, { recursive: true })
  const unique = new Map()
  for (const entry of entries) {
    const list = unique.get(entry.sha256) || []
    list.push(entry)
    unique.set(entry.sha256, list)
  }
  const groups = [...unique.values()]
  let cursor = 0, finished = 0, reused = 0
  console.log(`${checkOnly ? 'Checking' : 'Preparing'} ${entries.length} files (${groups.length} unique assets), ${jobs} workers, revision ${revision.slice(0, 7)}`)
  const results = await Promise.allSettled(Array.from({ length: jobs }, async () => {
    try {
    while (cursor < groups.length) {
      if (interrupted) throw new Error('Asset preparation interrupted')
      const group = groups[cursor++]
      const entry = group[0]
      const target = path.join(destination, entry.file)
      if (await valid(target, entry)) reused++
      else if (checkOnly) throw new Error(`Missing or invalid prepared asset: ${entry.file}`)
      else if (entry.lfs) await download(entry, target)
      else {
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(path.join(root, entry.source), target, constants.COPYFILE_FICLONE)
      }
      for (const duplicate of group.slice(1)) {
        const other = path.join(destination, duplicate.file)
        if (checkOnly) {
          if (!await valid(other, duplicate)) throw new Error(`Missing or invalid prepared asset: ${duplicate.file}`)
        } else if (!await valid(other, duplicate)) {
          await fs.mkdir(path.dirname(other), { recursive: true })
          await fs.copyFile(target, other, constants.COPYFILE_FICLONE)
        }
      }
      finished++
      if (finished % 250 === 0 || finished === groups.length) console.log(`${finished}/${groups.length} unique assets verified (${reused} reused)`)
    }
    } catch (error) { stop(); throw error }
  }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
  if (!checkOnly) await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ repository, revision, files: entries }, null, 2) + '\n')
  console.log(`Verified ${entries.reduce((sum, entry) => sum + entry.size, 0)} resource bytes in ${destination}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
