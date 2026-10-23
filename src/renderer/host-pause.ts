// Ruffle redraws the transparent always-on-top window at the movie's frame rate even when nobody can see the pet:
// hidden, the screen locked, the system asleep or the user away. That kept an idle pet at half a CPU core (#119).
// The movies, the pose machine and their clocks pause meanwhile and carry on where they were.
import { setHostPaused } from './swf/player'
import { save } from './pet/store'

const reasons = { hidden: false, away: false }
let applied = false

function apply(): void {
  const paused = reasons.hidden || reasons.away
  if (paused === applied) return
  applied = paused
  setHostPaused(paused)
}

/** Runs the movies again before an `appear` pose: a paused machine would never start it, and it unhides the pet. */
export function wakeFromHidden(): void {
  reasons.hidden = false
  apply()
}

// iOS pauses the page itself (__qqpetSetPaused) and would fight a second owner.
if (!(window as { __qqpetIOS?: unknown }).__qqpetIOS) {
  reasons.hidden = save.settings.hidden
  window.addEventListener('qqpet-hidden-change', () => {
    reasons.hidden = save.settings.hidden
    apply()
  })
  window.qqpet.onPresence((gone) => {
    reasons.away = gone
    apply()
  })
  // The away flag only clears at the next idle poll (5 s); the first cursor move wakes the pet at once.
  window.qqpet.onCursor(() => {
    if (!reasons.away) return
    reasons.away = false
    apply()
  })
  apply()
}
