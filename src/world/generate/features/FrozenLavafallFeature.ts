import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { COCYTUS_BIOME, cocytusHash, cocytusSurfaceY } from '../cocytus/CocytusTerrain.ts'
import { isNearFrozenCitadel } from '../dungeons/kits/cocytus/frozenCitadelPlacement.ts'

/**
 * Settings for frozen lavafalls. Expected crags per chunk =
 * 1024 / gridSize² × chance.
 */
export interface FrozenLavafallFeatureSettings {
  gridSize: number
  chance: number
  /** Crag height range above its base. */
  minHeight: number
  maxHeight: number
  /** Crag base radius range. */
  minRadius: number
  maxRadius: number
}

/** The crag sinks this far into the ground. */
const ROOT_DEPTH = 3
/** Radius of the crag's top. */
const TOP_RADIUS = 2
/** Layers of frozen magma crowning the crag. */
const CROWN_LAYERS = 3
/** Fan of frozen magma at the foot of the fall: center distance beyond the base radius, radii. */
const FAN_OFFSET = 3
const FAN_RADIUS_ALONG = 5
const FAN_RADIUS_ACROSS = 3.5
/** Amplitude (blocks) of the crag's lumpy surface. */
const BUMP = 1.2
/** Horizontal directions for the fall: +X, -X, +Z, -Z. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Per-layer cascade shape (see buildFall). */
interface FallLayers {
  readonly y0: number
  readonly valid: Uint8Array
  readonly wander: Int32Array
  /** Per layer × lane (lane 0 = wander - fallHalfWidth): first cell outside the crag, -1 none. */
  readonly surface: Int32Array
}

interface Crag {
  readonly x: number
  readonly z: number
  readonly baseY: number
  readonly height: number
  readonly radius: number
  readonly dir: readonly [number, number]
  /** Half-width of the fall (lanes -w..w across it). */
  readonly fallHalfWidth: number
}

/**
 * Frozen lavafalls: tall crags of rimestone (frost-crusted where their
 * surfaces face up) whose crowns ooze lava that the cold of Cocytus froze in
 * mid-fall - a glowing frozen-magma cascade clinging to one face from the top
 * to the foot, spreading into a frozen fan on the ice or shore. The dim ember
 * glow (light 3 + emissive texels) is the only warm colour in the biome.
 *
 * World-anchored grid, pure per-crag parameters and analytic shape tests
 * (PineTreeFeature cross-chunk rules); vetoed near biome borders and Frozen
 * Citadels.
 */
export class FrozenLavafallFeature extends Feature {
  readonly settings: FrozenLavafallFeatureSettings

  constructor(settings: FrozenLavafallFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, config } = context
    const seed = config.seed
    const s = this.settings
    const coord = chunk.coordinate
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const maxY = minY + SUB_CHUNK_HEIGHT - 1
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    const surfaceAt = (x: number, z: number): number => cocytusSurfaceY(noise, seed, x, z, getBaseHeightAt(x, z))

    const reach = s.maxRadius + 2 + FAN_OFFSET + FAN_RADIUS_ALONG + 1
    const g = s.gridSize
    const firstX = Math.floor((chunkWorldX - reach) / g) * g - g
    const lastX = chunkWorldX + CHUNK_SIZE_X - 1 + reach
    const firstZ = Math.floor((chunkWorldZ - reach) / g) * g - g
    const lastZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + reach

    for (let gx = firstX; gx <= lastX; gx += g) {
      for (let gz = firstZ; gz <= lastZ; gz += g) {
        if (cocytusHash(seed, gx, gz, 601) >= s.chance) continue
        const ax = gx + Math.floor(cocytusHash(seed, gx, gz, 602) * g)
        const az = gz + Math.floor(cocytusHash(seed, gx, gz, 603) * g)
        if (ax + reach < chunkWorldX || ax - reach > chunkWorldX + CHUNK_SIZE_X - 1) continue
        if (az + reach < chunkWorldZ || az - reach > chunkWorldZ + CHUNK_SIZE_Z - 1) continue

        if (context.getBiomeNameAt) {
          let foreign = false
          for (const [ox, oz] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach], [reach, reach], [reach, -reach], [-reach, reach], [-reach, -reach]]) {
            if (context.getBiomeNameAt(ax + ox, az + oz) !== COCYTUS_BIOME) { foreign = true; break }
          }
          if (foreign) continue
        }
        if (isNearFrozenCitadel(ax, az, seed, reach + 4)) continue

        const hRoll = cocytusHash(seed, ax, az, 610)
        const crag: Crag = {
          x: ax,
          z: az,
          baseY: surfaceAt(ax, az) + 1,
          height: Math.round(s.minHeight + (s.maxHeight - s.minHeight) * hRoll),
          radius: s.minRadius + (s.maxRadius - s.minRadius) * cocytusHash(seed, ax, az, 611),
          dir: DIRS[Math.floor(cocytusHash(seed, ax, az, 612) * 4) & 3],
          fallHalfWidth: cocytusHash(seed, ax, az, 613) < 0.5 ? 1 : 2,
        }
        this.place(chunk, crag, noise, seed, surfaceAt, chunkWorldX, chunkWorldZ, minY, maxY)
      }
    }
  }

  /** Crag radius at height y (no bumps), 0 outside its span. */
  private radiusAt(c: Crag, y: number): number {
    if (y < c.baseY - ROOT_DEPTH || y >= c.baseY + c.height) return 0
    if (y < c.baseY) return c.radius + 0.5
    const t = (y - c.baseY) / c.height
    return c.radius + (TOP_RADIUS - c.radius) * Math.pow(t, 0.8)
  }

  /** Is (x, y, z) inside the crag, whose plain radius at y is `r` (radiusAt)? */
  private inCrag(c: Crag, noise: SimplexNoise, x: number, y: number, z: number, r: number): boolean {
    if (r <= 0) return false
    const dx = x - c.x, dz = z - c.z
    const d2 = dx * dx + dz * dz
    if (d2 > (r + BUMP) * (r + BUMP)) return false
    if (r > BUMP && d2 <= (r - BUMP) * (r - BUMP)) return true
    const bump = noise.noise3D(x * 0.11 + c.x * 0.01, y * 0.08, z * 0.11) * BUMP
    const rr = r + bump
    return d2 <= rr * rr
  }

  /**
   * The cascade's shape per layer y0..y1 (computed once per layer and lane
   * instead of per cell): its side-to-side wander and, for each lane across
   * the fall face, the first cell outside the crag marching out from the
   * centre (-1: none).
   */
  private buildFall(c: Crag, noise: SimplexNoise, radii: Float64Array, ry0: number, y0: number, y1: number): FallLayers {
    const n = Math.max(0, y1 - y0 + 1)
    const lanes = 2 * c.fallHalfWidth + 1
    const F: FallLayers = { y0, valid: new Uint8Array(n), wander: new Int32Array(n), surface: new Int32Array(n * lanes).fill(-1) }
    const [ddx, ddz] = c.dir
    const steps = Math.ceil(c.radius) + 4
    for (let i = 0; i < n; i++) {
      const y = y0 + i
      if (y < c.baseY || y > c.baseY + c.height - CROWN_LAYERS) continue
      F.valid[i] = 1
      // the cascade wanders a little from side to side as it falls
      const wander = Math.round(noise.noise2D(c.x * 0.37 + 5.1, y * 0.09) * 1.2)
      F.wander[i] = wander
      const r = radii[y - ry0]
      for (let lane = 0; lane < lanes; lane++) {
        const across = wander - c.fallHalfWidth + lane
        for (let k = 1; k <= steps; k++) {
          const px = c.x + ddx * k + -ddz * across
          const pz = c.z + ddz * k + ddx * across
          if (!this.inCrag(c, noise, px, y, pz, r)) { F.surface[i * lanes + lane] = k; break }
        }
      }
    }
    return F
  }

  /** Is (x, y, z) part of the frozen cascade on the crag's fall face? `F` must cover y. */
  private inFall(c: Crag, F: FallLayers, x: number, y: number, z: number): boolean {
    const i = y - F.y0
    if (i < 0 || i >= F.valid.length || !F.valid[i]) return false
    const [ddx, ddz] = c.dir
    const along = (x - c.x) * ddx + (z - c.z) * ddz
    const across = (x - c.x) * -ddz + (z - c.z) * ddx
    const wander = F.wander[i]
    if (Math.abs(across - wander) > c.fallHalfWidth) return false
    if (along <= 0 || along > Math.ceil(c.radius) + 5) return false
    const lanes = 2 * c.fallHalfWidth + 1
    const surface = F.surface[i * lanes + (across - wander + c.fallHalfWidth)]
    if (surface < 0) return false
    return along === surface || (along === surface + 1 && Math.abs(across - wander) < c.fallHalfWidth)
  }

  private inFan(c: Crag, x: number, z: number): boolean {
    const [ddx, ddz] = c.dir
    const cx = c.x + ddx * (Math.round(c.radius) + FAN_OFFSET)
    const cz = c.z + ddz * (Math.round(c.radius) + FAN_OFFSET)
    const along = (x - cx) * ddx + (z - cz) * ddz
    const across = (x - cx) * -ddz + (z - cz) * ddx
    const e = (along * along) / (FAN_RADIUS_ALONG * FAN_RADIUS_ALONG) + (across * across) / (FAN_RADIUS_ACROSS * FAN_RADIUS_ACROSS)
    return e <= 1
  }

  private place(
    chunk: FeatureContext['chunk'],
    c: Crag,
    noise: SimplexNoise,
    seed: number,
    surfaceAt: (x: number, z: number) => number,
    chunkWorldX: number,
    chunkWorldZ: number,
    minY: number,
    maxY: number
  ): void {
    const ext = Math.ceil(c.radius) + 2 + FAN_OFFSET + FAN_RADIUS_ALONG + 1
    const x0 = Math.max(c.x - ext, chunkWorldX)
    const x1 = Math.min(c.x + ext, chunkWorldX + CHUNK_SIZE_X - 1)
    const z0 = Math.max(c.z - ext, chunkWorldZ)
    const z1 = Math.min(c.z + ext, chunkWorldZ + CHUNK_SIZE_Z - 1)
    const top = c.baseY + c.height - 1
    // Crag body and cascade rows of this sub-chunk; radii one layer further
    // (the frosted-top and icicle tests look one layer up)
    const y0 = Math.max(c.baseY - ROOT_DEPTH, minY)
    const y1 = Math.min(top + 1, maxY)
    const radii = new Float64Array(Math.max(0, y1 - y0 + 2))
    for (let y = y0; y <= y1 + 1; y++) radii[y - y0] = this.radiusAt(c, y)
    const fall = this.buildFall(c, noise, radii, y0, y0, y1)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const lx = x - chunkWorldX
        const lz = z - chunkWorldZ
        for (let y = y0; y <= y1; y++) {
          const ly = y - minY
          const cur = chunk.getBlockId(lx, ly, lz)
          if (this.inCrag(c, noise, x, y, z, radii[y - y0])) {
            if (cur !== BlockIds.AIR && cur !== BlockIds.ASH_SNOW && cur !== BlockIds.FROST_CRYSTAL) continue
            let id: number = BlockIds.RIMESTONE
            if (y > top - CROWN_LAYERS) id = BlockIds.FROZEN_MAGMA
            else if (!this.inCrag(c, noise, x, y + 1, z, radii[y + 1 - y0])) id = BlockIds.FROSTED_RIMESTONE
            chunk.setBlockId(lx, ly, lz, id)
          } else if (cur === BlockIds.AIR || cur === BlockIds.ASH_SNOW || cur === BlockIds.FROST_CRYSTAL) {
            if (this.inFall(c, fall, x, y, z)) {
              chunk.setBlockId(lx, ly, lz, BlockIds.FROZEN_MAGMA)
            } else if (y >= c.baseY && cur === BlockIds.AIR && this.inCrag(c, noise, x, y + 1, z, radii[y + 1 - y0]) && cocytusHash(seed, x, z, y * 5 + 3) < 0.3) {
              chunk.setBlockId(lx, ly, lz, BlockIds.ICICLE)
            }
          }
        }
        // Frozen fan at the foot of the fall, on the local surface
        if (this.inFan(c, x, z)) {
          const sy = surfaceAt(x, z)
          if (sy >= minY && sy <= maxY) {
            const cur = chunk.getBlockId(lx, sy - minY, lz)
            if (cur !== BlockIds.AIR) chunk.setBlockId(lx, sy - minY, lz, BlockIds.FROZEN_MAGMA)
          }
          const by = sy + 1
          if (by >= minY && by <= maxY && cocytusHash(seed, x, z, 621) < 0.35) {
            const cur = chunk.getBlockId(lx, by - minY, lz)
            if (cur === BlockIds.AIR || cur === BlockIds.ASH_SNOW) chunk.setBlockId(lx, by - minY, lz, BlockIds.FROZEN_MAGMA)
          }
        }
      }
    }
  }
}
