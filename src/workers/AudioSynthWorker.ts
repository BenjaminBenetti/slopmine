/**
 * Audio synth worker: renders procedural sound recipes (src/audio/synth/) off
 * the main thread. Every request carries a `requestId` that the reply echoes.
 * Replies transfer their sample buffers.
 */

import { measureLoudnessDb, renderRecipe } from '../audio/synth/recipes.ts'
import { renderImpulseResponse } from '../audio/synth/instruments.ts'
import type { AudioSynthRequest, AudioSynthResponse } from '../audio/synth/AudioSynthProtocol.ts'

self.onmessage = (event: MessageEvent<AudioSynthRequest>) => {
  const request = event.data
  let response: AudioSynthResponse
  try {
    let channels: Float32Array[]
    if (request.kind === 'impulse') {
      channels = renderImpulseResponse(request.sampleRate, request.seconds, request.brightness, request.seed)
    } else {
      channels = [renderRecipe(request.recipe, request.seed, request.sampleRate)]
    }
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) {
        if (!Number.isFinite(ch[i])) throw new Error(`non-finite sample in ${describe(request)}`)
      }
    }
    response = {
      requestId: request.requestId,
      ok: true,
      channels,
      loudnessDb: request.kind === 'impulse' ? 0 : measureLoudnessDb(channels[0], request.sampleRate),
    }
    ;(self as unknown as Worker).postMessage(response, channels.map((c) => c.buffer))
  } catch (error) {
    response = { requestId: request.requestId, ok: false, error: String(error) }
    ;(self as unknown as Worker).postMessage(response)
  }
}

function describe(request: AudioSynthRequest): string {
  return request.kind === 'impulse' ? 'impulse response' : request.recipe
}
