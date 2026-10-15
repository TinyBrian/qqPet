// Local speech-to-text: Paraformer-zh (int8, 2025-10-07) plus CT-Transformer
// punctuation, both run in this process through sherpa-onnx-node (N-API). The
// models ship with the app under resources/asr — recognition never leaves the
// machine. Paraformer won the bake-off on content words (4/4 where SenseVoice
// scored 1/4) but writes no punctuation, hence the second model.

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resourcesRoot } from './content'

const SAMPLE_RATE = 16_000

interface Stream {
  acceptWaveform(w: { sampleRate: number; samples: Float32Array }): void
}
interface Recognizer {
  createStream(): Stream
  decodeAsync(stream: Stream): Promise<{ text?: string }>
}
interface Sherpa {
  OfflineRecognizer: { createAsync(config: Record<string, unknown>): Promise<Recognizer> }
  OfflinePunctuation: new (config: Record<string, unknown>) => {
    addPunct(text: string): string
  }
}

const load = (): Sherpa => createRequire(import.meta.url)('sherpa-onnx-node') as Sherpa
const asrRoot = (): string => join(resourcesRoot, 'asr')
const PARA = (): string => join(asrRoot(), 'paraformer-zh-2025-10-07')
const PUNCT = (): string => join(asrRoot(), 'punct-ct-transformer')

let rec: Recognizer | null = null
let recPromise: Promise<Recognizer | null> | null = null
let punct: InstanceType<Sherpa['OfflinePunctuation']> | null = null
let punctTried = false
let detail = ''

/** Why recognition is not ready, or '' when it is (or will be once loaded). */
export const asrError = (): string => detail

async function recognizer(): Promise<Recognizer | null> {
  if (rec) return rec
  recPromise ??= (async () => {
    const model = join(PARA(), 'model.int8.onnx')
    const tokens = join(PARA(), 'tokens.txt')
    if (!existsSync(model) || !existsSync(tokens)) {
      detail = '识别模型缺失（resources/asr）'
      return null
    }
    try {
      rec = await load().OfflineRecognizer.createAsync({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: { paraformer: { model, tokens }, tokens, numThreads: 4, provider: 'cpu', debug: 0 },
      })
      detail = ''
      return rec
    } catch (e) {
      detail = `识别模型载入失败：${(e as Error).message}`
      return null
    }
  })()
  return recPromise
}

function addPunctuation(text: string): string {
  if (!text) return text
  try {
    if (!punct && !punctTried) {
      punctTried = true
      const ct = join(PUNCT(), 'model.onnx')
      if (existsSync(ct)) {
        const S = load()
        punct = new S.OfflinePunctuation({ model: { ctTransformer: ct, numThreads: 4, provider: 'cpu', debug: 0 } })
      }
    }
    const p = punct
    return p ? p.addPunct(text) : text
  } catch {
    return text
  }
}

/**
 * One finished utterance (16 kHz mono, -1..1) to punctuated text. Empty text
 * means nothing was heard; a throw never escapes.
 */
export async function transcribe(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Promise<string> {
  const r = await recognizer()
  if (!r) throw new Error(detail || '识别未就绪')
  const stream = r.createStream()
  stream.acceptWaveform({ sampleRate, samples })
  const out = await r.decodeAsync(stream)
  return addPunctuation((out.text ?? '').trim())
}

/** Warm the model up so the first held hotkey answers quickly. */
export function preloadAsr(): void {
  void recognizer()
}
