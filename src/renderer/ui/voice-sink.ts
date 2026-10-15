/** Where a spoken line goes: the chat box by default, or a dialog that is
 *  waiting for words (the visit reply box) while one is open. Both the live
 *  transcript and the released text only FILL their input — nothing is ever
 *  sent by voice alone, so transcription slips can be fixed by hand. */

export interface VoiceSink {
  partial?(text: string): void
  final(text: string): void
}

let sink: VoiceSink | null = null

export const setVoiceSink = (s: VoiceSink | null): void => {
  sink = s
}

export const voiceSink = (): VoiceSink | null => sink
