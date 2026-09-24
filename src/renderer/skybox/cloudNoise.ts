import * as THREE from 'three'

/**
 * Seamlessly tiling fractal noise texture for the sky dome's cloud layer.
 * R = large cloud shapes (low base frequency), G = fine detail (higher base
 * frequency). Both channels are periodic over the texture, so the clouds can
 * scroll forever with RepeatWrapping. Generated once on the CPU at startup.
 */
export function createCloudNoiseTexture(size = 256, seed = 1337): THREE.DataTexture {
  const shapes = periodicFbm(size, 4, 5, seed)
  const detail = periodicFbm(size, 16, 3, seed + 101)

  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = shapes[i]
    data[i * 4 + 1] = detail[i]
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // The cloud deck is seen at grazing angles (2-3x anisotropic footprints):
  // without anisotropy its detail layers blur isotropically into steps
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

/**
 * Fractal sum of periodic 2D gradient noise, normalized to 0-255.
 * @param baseCells - lattice cells across the texture for the first octave
 */
function periodicFbm(size: number, baseCells: number, octaves: number, seed: number): Uint8Array {
  const values = new Float32Array(size * size)
  let min = Infinity
  let max = -Infinity
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      let amplitude = 1
      let cells = baseCells
      for (let o = 0; o < octaves; o++) {
        sum += amplitude * periodicGradientNoise((x / size) * cells, (y / size) * cells, cells, seed + o * 31)
        amplitude *= 0.5
        cells *= 2
      }
      values[y * size + x] = sum
      if (sum < min) min = sum
      if (sum > max) max = sum
    }
  }

  const out = new Uint8Array(size * size)
  const scale = 255 / (max - min)
  for (let i = 0; i < values.length; i++) {
    out[i] = Math.round((values[i] - min) * scale)
  }
  return out
}

/** Perlin-style gradient noise whose lattice wraps every `period` cells. */
function periodicGradientNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const u = fade(fx)
  const v = fade(fy)

  const n00 = gradientDot(x0, y0, fx, fy, period, seed)
  const n10 = gradientDot(x0 + 1, y0, fx - 1, fy, period, seed)
  const n01 = gradientDot(x0, y0 + 1, fx, fy - 1, period, seed)
  const n11 = gradientDot(x0 + 1, y0 + 1, fx - 1, fy - 1, period, seed)

  const nx0 = n00 + (n10 - n00) * u
  const nx1 = n01 + (n11 - n01) * u
  return nx0 + (nx1 - nx0) * v
}

function gradientDot(ix: number, iy: number, dx: number, dy: number, period: number, seed: number): number {
  const wx = ((ix % period) + period) % period
  const wy = ((iy % period) + period) % period
  const angle = (hash(wx, wy, seed) / 4294967296) * Math.PI * 2
  return Math.cos(angle) * dx + Math.sin(angle) * dy
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return h >>> 0
}
