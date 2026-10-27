// The pet's stage box is mostly transparent: an egg draws about half of it and the hide clips
// hang off one side. Peeking, clamping and walking follow the drawn pet, so this measures how far
// the current drawing sits inside its box, using the same alpha coverage the mobile overlay
// window already samples (throttled to one look per LOOK_MS, so it costs no extra readback).
import { hitCover, type Box } from '../../mobile/overlay'
import { PET_INSETS_NONE, type PetInsets } from '../../shared/layout'

/** Per movie, because a pose that draws six pixels from a side must keep doing so after a swap. */
const learned = new Map<string, PetInsets>()
let last: PetInsets = PET_INSETS_NONE

function union(a: Box | null, b: Box | null): Box | null {
  if (!a || !b) return a ?? b
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

/**
 * How far the drawn pet sits inside its box. A movie without a sample yet keeps its own earlier
 * reading, else the one before it, so a pose swap cannot fall back to the whole transparent stage.
 */
export function petInsets(): PetInsets {
  const pet = document.getElementById('pet')
  const rect = pet?.getBoundingClientRect()
  if (!pet || !rect || !rect.width || !rect.height) return last
  const players = pet.querySelectorAll<HTMLElement>('ruffle-player')
  let movie = ''
  for (const player of players) {
    if (movie || player.style.opacity === '0') continue
    movie = player.getAttribute('data-swf') ?? ''
  }
  // An equipped background covers the stage, so the whole box is drawn.
  let bounds = hitCover(pet)
  for (const player of players) bounds = union(bounds, hitCover(player))
  if (!bounds) return learned.get(movie) ?? last
  const measured: PetInsets = {
    left: bounds.left - rect.left,
    right: rect.right - bounds.right,
    top: bounds.top - rect.top,
    bottom: rect.bottom - bounds.bottom,
  }
  if (movie) learned.set(movie, measured)
  last = measured
  return measured
}
