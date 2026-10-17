/** Messages between the main thread and AudioSynthWorker. */

export type AudioSynthRequest =
  | { requestId: number; kind: 'recipe'; recipe: string; seed: number; sampleRate: number }
  | { requestId: number; kind: 'impulse'; seconds: number; brightness: number; seed: number; sampleRate: number }

export type AudioSynthResponse =
  | { requestId: number; ok: true; channels: Float32Array[]; loudnessDb: number }
  | { requestId: number; ok: false; error: string }
