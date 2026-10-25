/**
 * The volumetric clouds' noise: a tileable 3D volume (CLOUD_NOISE_SIZE³,
 * RGBA8), the classic cloud recipe. R = Perlin-Worley (billowy blobs: the
 * cloud shapes), G/B/A = inverted Worley fBm at rising frequencies (G erodes
 * the shapes into puffs, B and A carve the fine detail). Every channel tiles
 * in all three axes. Pure: generated once in a worker (cloudNoiseWorker.ts).
 */

export const CLOUD_NOISE_SIZE = 64

function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(seed, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}

const wrap = (i: number, period: number): number => ((i % period) + period) % period

/** Tileable gradient (Perlin) noise at (x, y, z) in cells, repeating every `period` cells. About -1..1. */
function perlin(x: number, y: number, z: number, period: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)
  const u = fade(fx)
  const v = fade(fy)
  const w = fade(fz)
  let result = 0
  for (let c = 0; c < 8; c++) {
    const dx = c & 1
    const dy = (c >> 1) & 1
    const dz = (c >> 2) & 1
    const h = hash(wrap(ix + dx, period), wrap(iy + dy, period), wrap(iz + dz, period), seed) % 12
    // The 12 cube-edge gradients
    const gx = h < 8 ? (h & 1 ? -1 : 1) : 0
    const gy = h < 4 ? (h & 2 ? -1 : 1) : h >= 8 ? (h & 1 ? -1 : 1) : 0
    const gz = h >= 4 ? (h & 2 ? -1 : 1) : 0
    const dot = gx * (fx - dx) + gy * (fy - dy) + gz * (fz - dz)
    const weight = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w)
    result += dot * weight
  }
  return result
}

/** Tileable Worley noise: distance to the nearest feature point (one per cell, `cells` per tile), 0..~1. */
function worley(x: number, y: number, z: number, cells: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  let best = 9
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx
        const cy = iy + dy
        const cz = iz + dz
        const h = hash(wrap(cx, cells), wrap(cy, cells), wrap(cz, cells), seed)
        const px = cx + (h & 0x3ff) / 1024
        const py = cy + ((h >>> 10) & 0x3ff) / 1024
        const pz = cz + ((h >>> 20) & 0x3ff) / 1024
        const d = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z)
        if (d < best) best = d
      }
    }
  }
  return Math.min(1, Math.sqrt(best))
}

const remap = (v: number, lo: number, hi: number, newLo: number, newHi: number): number =>
  newLo + ((v - lo) / (hi - lo)) * (newHi - newLo)

/** Generate the volume: CLOUD_NOISE_SIZE³ texels of RGBA8 (x fastest, then y, then z). */
export function generateCloudNoise(seed = 1337): Uint8Array {
  const size = CLOUD_NOISE_SIZE
  const out = new Uint8Array(size * size * size * 4)
  // Worley at each frequency once per texel, shared by the channels
  const freqs = [4, 8, 16, 32]
  const wv = new Float32Array(freqs.length)
  let o = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size
        const ny = y / size
        const nz = z / size
        for (let f = 0; f < freqs.length; f++) wv[f] = 1 - worley(nx * freqs[f], ny * freqs[f], nz * freqs[f], freqs[f], seed + f * 101)
        // Perlin fBm, 3 octaves from 4 cells per tile
        let p = 0
        let amp = 1
        let norm = 0
        for (let oct = 0; oct < 3; oct++) {
          const cells = 4 << oct
          p += perlin(nx * cells, ny * cells, nz * cells, cells, seed + 7 + oct) * amp
          norm += amp
          amp *= 0.5
        }
        p = Math.min(1, Math.max(0, p / norm * 1.3 + 0.5))
        const worleyLow = wv[0] * 0.625 + wv[1] * 0.25 + wv[2] * 0.125
        // Perlin-Worley: Perlin's soft blobs, cut into billows by the Worley cells (stretched to use the whole range)
        const perlinWorley = Math.min(1, Math.max(0, (remap(p, 0, 1, worleyLow, 1) - 0.42) / 0.58))
        out[o++] = Math.round(perlinWorley * 255)
        out[o++] = Math.round((wv[0] * 0.625 + wv[1] * 0.25 + wv[2] * 0.125) * 255)
        out[o++] = Math.round((wv[1] * 0.625 + wv[2] * 0.25 + wv[3] * 0.125) * 255)
        out[o++] = Math.round((wv[2] * 0.75 + wv[3] * 0.25) * 255)
      }
    }
  }
  return out
}
