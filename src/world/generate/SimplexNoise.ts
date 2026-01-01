/**
 * Seeded 2D and 3D Simplex noise implementation.
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

  // Gradient vectors for 3D (12 edge midpoints of a cube)
  private static readonly GRAD3: ReadonlyArray<
    readonly [number, number, number]
  > = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
  ]

  // Skewing factors for 2D
  private static readonly F2 = 0.5 * (Math.sqrt(3) - 1)
  private static readonly G2 = (3 - Math.sqrt(3)) / 6

  // Skewing factors for 3D
  private static readonly F3 = 1 / 3
  private static readonly G3 = 1 / 6

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

  private dot3(
    g: readonly [number, number, number],
    x: number,
    y: number,
    z: number
  ): number {
    return g[0] * x + g[1] * y + g[2] * z
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

  /**
   * 3D Simplex noise, returns value in range [-1, 1]
   */
  noise3D(x: number, y: number, z: number): number {
    const F3 = SimplexNoise.F3
    const G3 = SimplexNoise.G3

    // Skew input space to determine which simplex cell we're in
    const s = (x + y + z) * F3
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const k = Math.floor(z + s)

    const t = (i + j + k) * G3
    const X0 = i - t
    const Y0 = j - t
    const Z0 = k - t
    const x0 = x - X0
    const y0 = y - Y0
    const z0 = z - Z0

    // Determine which simplex we're in (one of 6 tetrahedra)
    let i1: number, j1: number, k1: number
    let i2: number, j2: number, k2: number

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1
        j1 = 0
        k1 = 0
        i2 = 1
        j2 = 1
        k2 = 0
      } else if (x0 >= z0) {
        i1 = 1
        j1 = 0
        k1 = 0
        i2 = 1
        j2 = 0
        k2 = 1
      } else {
        i1 = 0
        j1 = 0
        k1 = 1
        i2 = 1
        j2 = 0
        k2 = 1
      }
    } else {
      if (y0 < z0) {
        i1 = 0
        j1 = 0
        k1 = 1
        i2 = 0
        j2 = 1
        k2 = 1
      } else if (x0 < z0) {
        i1 = 0
        j1 = 1
        k1 = 0
        i2 = 0
        j2 = 1
        k2 = 1
      } else {
        i1 = 0
        j1 = 1
        k1 = 0
        i2 = 1
        j2 = 1
        k2 = 0
      }
    }

    // Offsets for second corner in (x,y,z) unskewed coords
    const x1 = x0 - i1 + G3
    const y1 = y0 - j1 + G3
    const z1 = z0 - k1 + G3

    // Offsets for third corner
    const x2 = x0 - i2 + 2 * G3
    const y2 = y0 - j2 + 2 * G3
    const z2 = z0 - k2 + 2 * G3

    // Offsets for last corner
    const x3 = x0 - 1 + 3 * G3
    const y3 = y0 - 1 + 3 * G3
    const z3 = z0 - 1 + 3 * G3

    // Hash coordinates of the four simplex corners
    const ii = i & 255
    const jj = j & 255
    const kk = k & 255

    // Calculate contributions from the four corners
    let n0 = 0
    let n1 = 0
    let n2 = 0
    let n3 = 0

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 >= 0) {
      t0 *= t0
      const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]]
      n0 = t0 * t0 * this.dot3(SimplexNoise.GRAD3[gi0], x0, y0, z0)
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 >= 0) {
      t1 *= t1
      const gi1 =
        this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]]
      n1 = t1 * t1 * this.dot3(SimplexNoise.GRAD3[gi1], x1, y1, z1)
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 >= 0) {
      t2 *= t2
      const gi2 =
        this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]]
      n2 = t2 * t2 * this.dot3(SimplexNoise.GRAD3[gi2], x2, y2, z2)
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 >= 0) {
      t3 *= t3
      const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]]
      n3 = t3 * t3 * this.dot3(SimplexNoise.GRAD3[gi3], x3, y3, z3)
    }

    // Scale to [-1, 1]
    return 32 * (n0 + n1 + n2 + n3)
  }

  /**
   * Fractal/octave 3D noise for cave generation.
   * @param x - X coordinate (world space)
   * @param y - Y coordinate (world space)
   * @param z - Z coordinate (world space)
   * @param octaves - Number of noise layers (2-4 typical for caves)
   * @param persistence - Amplitude multiplier per octave (0.5 typical)
   * @param scale - Base frequency scale
   * @returns Noise value normalized to [-1, 1]
   */
  fractalNoise3D(
    x: number,
    y: number,
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
      total +=
        this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= 2
    }

    return total / maxValue
  }
}
