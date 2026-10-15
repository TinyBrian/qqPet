import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deliveries waiting for a friend to come home: the pet "sits by the door" in
 * the user's words. Kept in userData and flushed the moment that peer's
 * heartbeat returns, so nothing is ever lost to a restart.
 */
export class VisitQueue {
  private readonly file: string
  private items: { toId: string; body: unknown }[] = []

  constructor(dir: string) {
    this.file = join(dir, 'visit-queue.json')
    try {
      if (existsSync(this.file)) this.items = JSON.parse(readFileSync(this.file, 'utf8')) as { toId: string; body: unknown }[]
    } catch {
      this.items = []
    }
  }

  add(toId: string, body: unknown): void {
    this.items.push({ toId, body })
    this.save()
  }

  /** The queued deliveries for one peer, removing them. */
  take(toId: string): unknown[] {
    const mine = this.items.filter((q) => q.toId === toId)
    if (mine.length) {
      this.items = this.items.filter((q) => q.toId !== toId)
      this.save()
    }
    return mine.map((q) => q.body)
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.items))
    } catch (e) {
      console.error('visit queue save failed:', e)
    }
  }
}
