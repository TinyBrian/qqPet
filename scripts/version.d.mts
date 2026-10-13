export interface AppVersion {
  version: string
  shortVersion: string
  buildVersion: string
  source: 'explicit' | 'ci-tag' | 'git-tag' | 'package'
}
export interface VersionOptions {
  root?: string
  env?: Record<string, string | undefined>
  version?: string
  buildNumber?: string
}
export function resolveAppVersion(options?: VersionOptions): AppVersion
export function stampIOSInfo(template: string, identity: AppVersion): string
