import type { Sex } from './save'

/** Growth stage names, mirroring the renderer's Stage. */
export type StageName = 'Egg' | 'Kid' | 'Adult'

/**
 * Bodies carried over the LAN link for 串门传话. The whole point of M3: no
 * chat window — a pet physically drops by and carries the line both ways.
 */
export type VisitMsg =
  | { t: 'visit'; name: string; host: string; sex: Sex; stage: StageName; text: string }
  | { t: 'visitOk' }
  | { t: 'visitNo' }
  | { t: 'visitEnd'; reply: string }
