export interface SaveBackend {
  write(generation: string, text: string): Promise<unknown>
  replace(generation: string, text: string, backup: boolean): Promise<{ generation: string }>
}

/** One ordered native writer; a replaced save invalidates already queued old snapshots. */
export class IOSSaveWriter {
  private tail: Promise<void> = Promise.resolve()
  private failure: unknown = null
  generation: string
  private readonly backend: SaveBackend

  constructor(generation: string, backend: SaveBackend) {
    if (!generation) throw new Error('The native save generation is missing.')
    this.generation = generation
    this.backend = backend
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run)
    this.tail = result.then(() => { this.failure = null }, (error) => { this.failure = error })
    return result
  }

  write(text: string): Promise<void> {
    const generation = this.generation
    return this.enqueue(async () => {
      if (generation !== this.generation) throw new Error('A previous save session cannot overwrite this pet.')
      await this.backend.write(generation, text)
    })
  }

  replace(text: string, backup: boolean): Promise<void> {
    const generation = this.generation
    return this.enqueue(async () => {
      if (generation !== this.generation) throw new Error('The save changed before replacement.')
      const reply = await this.backend.replace(generation, text, backup)
      if (!reply || typeof reply.generation !== 'string' || !reply.generation) throw new Error('Native save replacement did not acknowledge its generation.')
      this.generation = reply.generation
    })
  }

  async flush(): Promise<void> {
    // A renderer patch may arrive while an earlier write is being acknowledged.
    let pending: Promise<void>
    do {
      pending = this.tail
      await pending
    } while (pending !== this.tail)
    if (this.failure !== null) throw this.failure
  }
}
