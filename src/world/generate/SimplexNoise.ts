/**
 * Seeded 2D Simplex noise implementation.
 * Based on Stefan Gustavson's simplex noise algorithm.
 */
export class SimplexNoise {
  private readonly perm: Uint8Array
  private readonly permMod12: Uint8Array

  // Gradient vectors for 2D
  private static readonly GRAD2: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  // Skewing factors for 2D
  private static readonly F2 = 0.5 * (Math.sqrt(3) - 1)
  private static readonly G2 = (3 - Math.sqrt(3)) / 6

  constructor(seed: number) {
    this.perm = new Uint8Array(512)
    this.permMod12 = new Uint8Array(512)

    // Initialize base permutation array
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      p[i] = i
    }

    // Fisher-Yates shuffle with seeded LCG random
    let s = seed >>> 0
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) >>> 0
      const j = s % (i + 1)
      const tmp = p[i]
      p[i] = p[j]
      p[j] = tmp
    }

    // Double the permutation table for wrapping
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.permMod12[i] = this.perm[i] % 8
    }
  }

  /**
   * 2D Simplex noise, returns value in range [-1, 1]
   */
  noise2D(x: number, z: number): number {
    const F2 = SimplexNoise.F2
    const G2 = SimplexNoise.G2

    // Skew input space to determine which simplex cell we're in
    const s = (x + z) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(z + s)

    const t = (i + j) * G2
    const X0 = i - t
    const Y0 = j - t
    const x0 = x - X0
    const y0 = z - Y0

    // Determine which simplex we're in (upper or lower triangle)
    let i1: number, j1: number
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    } else {
      i1 = 0
      j1 = 1
    }

    // Offsets for middle corner in (x,y) unskewed coords
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    // Offsets for last corner in (x,y) unskewed coords
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    // Hash coordinates of the three simplex corners
    const ii = i & 255
    const jj = j & 255

    // Calculate contributions from the three corners
    let n0 = 0
    let n1 = 0
    let n2 = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) {
      t0 *= t0
      const gi0 = this.permMod12[ii + this.perm[jj]]
      n0 = t0 * t0 * this.dot2(SimplexNoise.GRAD2[gi0], x0, y0)
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) {
      t1 *= t1
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]]
      n1 = t1 * t1 * this.dot2(SimplexNoise.GRAD2[gi1], x1, y1)
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) {
      t2 *= t2
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]]
      n2 = t2 * t2 * this.dot2(SimplexNoise.GRAD2[gi2], x2, y2)
    }

    // Scale to [-1, 1]
    return 70 * (n0 + n1 + n2)
  }

  private dot2(g: readonly [number, number], x: number, y: number): number {
    return g[0] * x + g[1] * y
  }

  /**
   * Fractal/octave noise for more natural terrain.
   * @param x - X coordinate (world space)
   * @param z - Z coordinate (world space)
   * @param octaves - Number of noise layers (4-6 typical)
   * @param persistence - Amplitude multiplier per octave (0.5 typical)
   * @param scale - Base frequency scale (0.01 for gentle terrain)
   * @returns Noise value normalized to [-1, 1]
   */
  fractalNoise2D(
    x: number,
    z: number,
    octaves: number,
    persistence: number,
    scale: number
  ): number {
    let total = 0
    let amplitude = 1
    let frequency = scale
    let maxValue = 0

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, z * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= 2
    }

    return total / maxValue
  }
}
