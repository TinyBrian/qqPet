import { withTimeoutSignal } from './compat'
import type { Fetch, Release } from './ipc'

/** GitHub's latest-release API of this repository (the fork); one call a day needs no token. */
const API = 'https://api.github.com/repos/TinyBrian/qqPet/releases/latest'

interface Reply {
  tag_name: string
  html_url: string
}

/** Rejects while offline or when the proxy fails. */
export async function latestRelease(fetch: Fetch): Promise<Release> {
  return withTimeoutSignal(20_000, async (signal) => {
    const r = await fetch(API, { signal })
    // No release published yet: an empty version reads as up to date in every newer-than check.
    if (r.status === 404) return { version: '', url: '' }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 100)}`)
    const d = (await r.json()) as Reply
    return { version: d.tag_name.replace(/^v/, ''), url: d.html_url }
  })
}
