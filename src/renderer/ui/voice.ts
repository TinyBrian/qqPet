// The talk key's ear: while the key is held the microphone feeds this module,
// and on release the recording goes out as one 16 kHz utterance for local
// transcription. The transcript walks the same pipeline as the chat box.
import { speak } from '../pet/pet'
import { say, retell } from './talk'
import { talkToPet } from './chat'

const RATE = 16_000
/** Ignore stray taps; a real sentence is longer. */
const MIN_MS = 300
/** A rambling hold is capped so one press cannot fill memory. */
const MAX_MS = 60_000

let ctx: AudioContext | null = null
let mic: MediaStream | null = null
let node: ScriptProcessorNode | null = null
let chunks: Float32Array[] = []
let samples = 0
let partTimer = 0
/** The live transcript line currently in the bubble; retell swaps it in place. */
let hearing = ''

const tell = (s: string): void => speak({ s, now: true, ai: false }, 'speak')

/** The bubble tracks what has been heard so far, refreshing without stacking. */
function hear(text: string): void {
  const next = text ? `在听~：${text}` : '在听~…'
  const prev = hearing
  hearing = next
  if (prev) void retell(prev, next)
  else void say(next, ['在听'])
}

export function initVoice(): void {
  window.qqpet.onVoiceStart?.(() => void start())
  window.qqpet.onVoiceStop?.(() => stop())
  window.qqpet.onVoicePartial?.((text) => hear(text))
  window.qqpet.onVoiceText?.((text) => {
    hearing = ''
    if (!text) return tell('没听清呢~')
    void talkToPet(text)
  })
  window.qqpet.onVoiceError?.((message) => {
    hearing = ''
    tell(`耳朵出故障了：${message}`)
  })
}

async function start(): Promise<void> {
  if (mic) return
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return tell('主人~ 我听不到麦克风的声音呢')
  }
  chunks = []
  samples = 0
  const c = new AudioContext()
  ctx = c
  const source = c.createMediaStreamSource(mic)
  node = c.createScriptProcessor(4096, 1, 1)
  node.onaudioprocess = (e) => {
    if (samples > (MAX_MS / 1000) * c.sampleRate) return
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    chunks.push(data)
    samples += data.length
  }
  // The processor must sit in a graph that reaches the destination to run;
  // a muted gain keeps the speakers out of the loop.
  const mute = c.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute)
  mute.connect(c.destination)
  hearing = ''
  hear('')
  // Live transcript: try the audio so far twice a second; the main process
  // drops a beat when a decode is already in flight.
  partTimer = window.setInterval(() => {
    const total = chunks.reduce((n, f) => n + f.length, 0)
    if (!c || total < c.sampleRate * 0.4) return
    window.qqpet.voicePart?.(resample(join(chunks, total), c.sampleRate, RATE))
  }, 600)
}

function stop(): void {
  const c = ctx
  if (!c || !mic) return
  clearInterval(partTimer)
  node?.disconnect()
  void c.close().catch(() => {})
  mic.getTracks().forEach((t) => t.stop())
  const rate = c.sampleRate
  const heard = chunks
  ctx = null
  mic = null
  node = null
  chunks = []
  const total = heard.reduce((n, f) => n + f.length, 0)
  if (total < (MIN_MS / 1000) * rate) return tell('没听清呢~')
  window.qqpet.voiceAudio?.(resample(join(heard, total), rate, RATE))
}

function join(parts: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Linear resampling is plenty for speech features. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const out = new Float32Array(Math.round((input.length * to) / from))
  for (let i = 0; i < out.length; i++) {
    const at = (i * from) / to
    const lo = Math.floor(at)
    const hi = Math.min(lo + 1, input.length - 1)
    out[i] = input[lo]! + (input[hi]! - input[lo]!) * (at - lo)
  }
  return out
}
