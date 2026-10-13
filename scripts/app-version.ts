import type { Plugin } from 'vite'
import { resolveAppVersion } from './version.mjs'

/** Stamp the shared renderer and publish its portable identity beside the built pages. */
export function appVersion(): Plugin {
  const identity = resolveAppVersion({ root: process.cwd() })
  return {
    name: 'app-version',
    config() { return { define: { __APP_VERSION__: JSON.stringify(identity.version) } } },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(identity) + '\n' })
    },
  }
}
