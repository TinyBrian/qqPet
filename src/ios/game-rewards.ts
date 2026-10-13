/** Validate against the initialized save before recording a session as delivered. */
export function gameRewards(
  ready: () => Promise<void>,
  generation: () => string | undefined,
  onPlayed: (minutes: number) => void,
): (payload: unknown) => Promise<void> {
  const played = new Set<string>()
  return async (payload) => {
    const game = payload as { sessionId?: unknown; generation?: unknown; minutes?: unknown } | null
    if (!game || typeof game.minutes !== 'number' || !Number.isFinite(game.minutes) || game.minutes < 0 || typeof game.sessionId !== 'string' || !game.sessionId) return
    const { sessionId, minutes } = game
    const sessionGeneration = game.generation
    await ready()
    if (typeof sessionGeneration === 'string' && sessionGeneration !== generation()) return
    if (played.has(sessionId)) return
    played.add(sessionId)
    onPlayed(minutes)
  }
}
