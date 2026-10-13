export interface IOSRequest {
  page: string
  id: number
  op: string
  args: Record<string, unknown>
}

interface Pending {
  op: string
  resolve(value: unknown): void
  reject(error: Error): void
  cleanup(): void
}
const cancellable = new Set(['http', 'importSave', 'exportSave', 'openGame', 'editText'])

export interface RequestOptions {
  signal?: AbortSignal | null
  timeout?: number
}

function aborted(signal?: AbortSignal | null): Error {
  const reason = signal && 'reason' in signal ? signal.reason : undefined
  if (reason instanceof Error) return reason
  const error = new Error(reason === undefined ? 'The request was cancelled.' : String(reason))
  error.name = 'AbortError'
  return error
}

/** WK replies are structured values. Unknown or cancelled request IDs are harmless. */
export class IOSRPC {
  readonly page: string
  private sequence = 0
  private pending = new Map<number, Pending>()
  private closed = false
  private readonly post: (request: IOSRequest) => void

  constructor(post: (request: IOSRequest) => void, page = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`) {
    this.page = page
    this.post = post
  }

  notify(op: string, args: Record<string, unknown> = {}): void {
    if (!this.closed) this.post({ page: this.page, id: 0, op, args })
  }

  request<T>(op: string, args: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The iOS page has closed.'))
    if (options.signal?.aborted) return Promise.reject(aborted(options.signal))
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      const signal = options.signal
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
        this.pending.delete(id)
      }
      const fail = (error: Error, cancelNative: boolean): void => {
        if (!this.pending.has(id)) return
        cleanup()
        reject(error)
        // File mutations must finish in order even if their page disappears.
        if (cancelNative && cancellable.has(op)) {
          try { this.notify('cancel', { requestId: id }) } catch { /* Transport has already failed. */ }
        }
      }
      const cancel = (): void => fail(aborted(signal), true)
      this.pending.set(id, { op, resolve: (value) => resolve(value as T), reject, cleanup })
      signal?.addEventListener('abort', cancel)
      const timeout = options.timeout ?? 65_000
      if (timeout > 0) timer = setTimeout(() => {
        const error = new Error(`iOS ${op} request timed out.`)
        error.name = 'TimeoutError'
        fail(error, true)
      }, timeout)
      try { this.post({ page: this.page, id, op, args }) } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)), false)
      }
    })
  }

  resolve(id: number, value: unknown, error: string | null, page: string): void {
    if (page !== this.page) return
    const pending = this.pending.get(id)
    if (!pending) return
    pending.cleanup()
    if (error !== null && error !== undefined) pending.reject(new Error(error))
    else pending.resolve(value)
  }

  dispose(): void {
    for (const [id, pending] of this.pending) {
      if (cancellable.has(pending.op)) {
        try { this.notify('cancel', { requestId: id }) } catch { /* Page teardown is final. */ }
      }
      pending.cleanup()
      pending.reject(new Error('The iOS page has closed.'))
    }
    this.closed = true
  }
}
