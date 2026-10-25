import { generateCloudNoise } from './cloudNoise3D.ts'

/** Builds the volumetric clouds' 3D noise off the main thread (about half a second of work). */
self.onmessage = (event: MessageEvent<{ seed: number }>) => {
  const data = generateCloudNoise(event.data.seed)
  ;(self as unknown as Worker).postMessage({ data }, [data.buffer])
}
