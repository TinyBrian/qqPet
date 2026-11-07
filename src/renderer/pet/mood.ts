/**
 * Classic QQPet face-poke mood by current value (#131):
 * 兴奋 +5 / 高兴 +10 / 平静 +30 / 郁闷 +50 / 低落 +70.
 * The old rand(5, 15) made low mood almost impossible to raise without buying toys.
 */
export function pokeMoodGain(value: number): number {
  if (value >= 900) return 5
  if (value >= 800) return 10
  if (value >= 500) return 30
  if (value >= 200) return 50
  return 70
}

/**
 * Per-minute mood drain. Tencent's post-fix rate was 1/min idle; work/study/travel add 1.
 */
export function moodDecayPerMinute(busy: boolean): number {
  return 1 + (busy ? 1 : 0)
}

/**
 * Minutes of growth the pet gets this tick. Mood, hunger and cleanliness at zero all stop it, so a starving or dirty
 * pet stops growing instead of levelling up on an empty stomach; `rates` are the per-minute drains of the same tick.
 */
export function growMinutes(
  dt: number,
  stats: { mood: number; hunger: number; clean: number },
  rates: { mood: number; hunger: number; clean: number },
): number {
  const left = Math.min(stats.mood / rates.mood, stats.hunger / rates.hunger, stats.clean / rates.clean)
  return Math.max(0, Math.min(dt, left))
}

/**
 * The stat that ran out, which pauses growth the way the tray menu's own pause does: 'hunger' when the pet is
 * starving, 'clean' when it is filthy, '' when both are fine. Mood only stops activities, not growth.
 */
export function careHalt(stats: { hunger: number; clean: number }): 'hunger' | 'clean' | '' {
  if (stats.hunger <= 0) return 'hunger'
  if (stats.clean <= 0) return 'clean'
  return ''
}
