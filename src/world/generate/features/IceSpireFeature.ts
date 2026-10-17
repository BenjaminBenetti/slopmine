import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import { COCYTUS_BIOME, cocytusHash, cocytusSurfaceY } from '../cocytus/CocytusTerrain.ts'
import { isNearFrozenCitadel } from '../dungeons/kits/cocytus/frozenCitadelPlacement.ts'

/**
 * Settings for ice spires (also used, scaled down, for stalagmites).
 * Expected clusters per chunk = 1024 / gridSize² × chance.
 */
export interface IceSpireFeatureSettings {
  /** World-anchored placement grid (blocks). */
  gridSize: number
  /** Chance (0-1) that a grid cell holds a cluster. */
  chance: number
  /** Height range of a cluster's main spire. */
  minHeight: number
  maxHeight: number
  /** Base radius range of the main spire. */
  minRadius: number
  maxRadius: number
  /** Up to this many smaller satellite spires around the main one. */
  maxSatellites: number
  /** Chance an overhanging spire cell drips an icicle below it. */
  icicleChance: number
  /** Fraction of clusters built of black ice instead of glacial ice. */
  blackIceChance: number
}

/** Blocks a spire may grow into (it never cuts terrain, structures or other spires). */
const REPLACEABLE = new Set<number>([BlockIds.AIR, BlockIds.ASH_SNOW, BlockIds.FROST_CRYSTAL, BlockIds.ICICLE])
/** Spires are rooted this many blocks into the ground (anchors them on slopes). */
const ROOT_DEPTH = 3
/** Farthest satellite offset from the cluster anchor. */
const SATELLITE_REACH = 7
/** Strongest lean, in blocks of drift per block of height at the tip. */
const MAX_LEAN = 0.12

/** Per-layer cross-sections of one spire (see buildLayers). */
interface SpireLayers {
  readonly y0: number
  readonly valid: Uint8Array
  readonly cx: Float64Array
  readonly cz: Float64Array
  readonly rr: Float64Array
  readonly hasAxis: Uint8Array
  readonly ax: Int32Array
  readonly az: Int32Array
  readonly hasNext: Uint8Array
  readonly nx: Int32Array
  readonly nz: Int32Array
}

interface Spire {
  readonly x: number
  readonly z: number
  readonly baseY: number
  readonly height: number
  readonly radius: number
  readonly leanX: number
  readonly leanZ: number
  readonly salt: number
}

/**
 * Jagged spires of glacial ice (sometimes black ice) rising from the frozen
 * lake and shores of Cocytus, in clusters of a main spire and smaller
 * satellites. Each spire tapers to a point, leans a little, has facetted
 * (per-layer jittered) flanks and drips icicles under its overhangs.
 *
 * Cross-chunk handling follows PineTreeFeature: a world-anchored grid,
 * per-spire parameters purely from the world position and seed, analytic
 * shape tests per cell, per-chunk/per-sub-chunk clipping; clusters whose
 * reach would cross into another biome region, or near a Frozen Citadel,
 * are vetoed deterministically.
 */
export class IceSpireFeature extends Feature {
  readonly settings: IceSpireFeatureSettings

  constructor(settings: IceSpireFeatureSettings) {
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

    const reach = SATELLITE_REACH + s.maxRadius + 1 + Math.ceil(MAX_LEAN * s.maxHeight) + 1
    const g = s.gridSize
    const firstX = Math.floor((chunkWorldX - reach) / g) * g - g
    const lastX = chunkWorldX + CHUNK_SIZE_X - 1 + reach
    const firstZ = Math.floor((chunkWorldZ - reach) / g) * g - g
    const lastZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + reach

    for (let gx = firstX; gx <= lastX; gx += g) {
      for (let gz = firstZ; gz <= lastZ; gz += g) {
        if (cocytusHash(seed, gx, gz, 501) >= s.chance) continue
        const ax = gx + Math.floor(cocytusHash(seed, gx, gz, 502) * g)
        const az = gz + Math.floor(cocytusHash(seed, gx, gz, 503) * g)
        // Cheap reject: cluster box misses this chunk
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

        const spires = this.cluster(ax, az, seed, (x, z) => cocytusSurfaceY(noise, seed, x, z, getBaseHeightAt(x, z)))
        const blockId = cocytusHash(seed, ax, az, 504) < s.blackIceChance ? BlockIds.BLACK_ICE : BlockIds.GLACIAL_ICE
        for (const spire of spires) {
          this.placeSpire(chunk, spire, blockId, seed, chunkWorldX, chunkWorldZ, minY, maxY)
        }
      }
    }
  }

  private cluster(ax: number, az: number, seed: number, surfaceAt: (x: number, z: number) => number): Spire[] {
    const s = this.settings
    const out: Spire[] = []
    const count = 1 + Math.floor(cocytusHash(seed, ax, az, 510) * (s.maxSatellites + 1))
    for (let i = 0; i < count; i++) {
      const main = i === 0
      const x = main ? ax : ax + Math.round((cocytusHash(seed, ax, az, 520 + i) * 2 - 1) * SATELLITE_REACH)
      const z = main ? az : az + Math.round((cocytusHash(seed, ax, az, 530 + i) * 2 - 1) * SATELLITE_REACH)
      const hRoll = cocytusHash(seed, ax, az, 540 + i)
      // Heavy tail: most spires are modest, a few soar
      const mainHeight = s.minHeight + (s.maxHeight - s.minHeight) * hRoll * hRoll
      const height = Math.round(main ? mainHeight : mainHeight * (0.3 + 0.4 * cocytusHash(seed, ax, az, 550 + i)))
      const rRoll = cocytusHash(seed, ax, az, 560 + i)
      const baseRadius = s.minRadius + (s.maxRadius - s.minRadius) * rRoll
      const radius = main ? baseRadius : Math.max(s.minRadius, baseRadius * (0.5 + 0.3 * cocytusHash(seed, ax, az, 570 + i)))
      const leanAngle = cocytusHash(seed, ax, az, 580 + i) * Math.PI * 2
      const lean = MAX_LEAN * cocytusHash(seed, ax, az, 590 + i)
      if (height < 2) continue
      out.push({
        x, z,
        baseY: surfaceAt(x, z) + 1,
        height,
        radius,
        leanX: Math.cos(leanAngle) * lean,
        leanZ: Math.sin(leanAngle) * lean,
        salt: i,
      })
    }
    return out
  }

  /** Rounded axis cell of the spire at height y (where the lean has carried it). */
  private axisAt(sp: Spire, y: number): [number, number] {
    const t = Math.max(0, (y - sp.baseY) / sp.height)
    return [Math.round(sp.x + sp.leanX * t * t * sp.height), Math.round(sp.z + sp.leanZ * t * t * sp.height)]
  }

  /**
   * The spire's cross-section per layer y0..y1 (everything inSpire needs that
   * depends only on y - taper, lean, jag hash, axis cells - computed once
   * per layer instead of per cell). Layers outside the spire are invalid.
   */
  private buildLayers(sp: Spire, seed: number, y0: number, y1: number): SpireLayers {
    const n = y1 - y0 + 1
    const L: SpireLayers = {
      y0,
      valid: new Uint8Array(n), cx: new Float64Array(n), cz: new Float64Array(n), rr: new Float64Array(n),
      hasAxis: new Uint8Array(n), ax: new Int32Array(n), az: new Int32Array(n),
      hasNext: new Uint8Array(n), nx: new Int32Array(n), nz: new Int32Array(n),
    }
    for (let i = 0; i < n; i++) {
      const y = y0 + i
      if (y < sp.baseY - ROOT_DEPTH || y >= sp.baseY + sp.height) continue
      L.valid[i] = 1
      let cx = sp.x, cz = sp.z, r: number
      if (y < sp.baseY) {
        r = sp.radius + 0.5
      } else {
        const t = (y - sp.baseY) / sp.height
        cx += sp.leanX * t * t * sp.height
        cz += sp.leanZ * t * t * sp.height
        const jag = (cocytusHash(seed, sp.x * 31 + sp.salt, sp.z, y) - 0.5) * 0.7
        r = sp.radius * Math.pow(1 - t, 0.85) + 0.45 + jag * (1 - t)
        const [ax, az] = this.axisAt(sp, y)
        L.hasAxis[i] = 1; L.ax[i] = ax; L.az[i] = az
        if (y + 1 < sp.baseY + sp.height) {
          const [nx, nz] = this.axisAt(sp, y + 1)
          L.hasNext[i] = 1; L.nx[i] = nx; L.nz[i] = nz
        }
      }
      L.cx[i] = cx; L.cz[i] = cz; L.rr[i] = r * r
    }
    return L
  }

  /**
   * Analytic shape test: is (x, y, z) inside the spire? Besides the tapered,
   * jittered cross-section, every layer keeps its own axis cell and steps
   * toward the next layer's axis, so a leaning tip stays 6-connected (never
   * a diagonal-only floater). `L` must cover y.
   */
  private inSpire(L: SpireLayers, x: number, y: number, z: number): boolean {
    const i = y - L.y0
    if (!L.valid[i]) return false
    if (L.hasAxis[i]) {
      if (x === L.ax[i] && z === L.az[i]) return true
      if (L.hasNext[i] && x === L.nx[i] && (z === L.nz[i] || z === L.az[i])) return true
    }
    const dx = x - L.cx[i], dz = z - L.cz[i]
    return dx * dx + dz * dz <= L.rr[i]
  }

  private placeSpire(
    chunk: FeatureContext['chunk'],
    sp: Spire,
    blockId: number,
    seed: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    minY: number,
    maxY: number
  ): void {
    const y0 = Math.max(sp.baseY - ROOT_DEPTH, minY)
    const y1 = Math.min(sp.baseY + sp.height - 1, maxY)
    if (y0 > y1) return
    const ext = Math.ceil(sp.radius + 1.5 + MAX_LEAN * sp.height)
    const x0 = Math.max(sp.x - ext, chunkWorldX)
    const x1 = Math.min(sp.x + ext, chunkWorldX + CHUNK_SIZE_X - 1)
    const z0 = Math.max(sp.z - ext, chunkWorldZ)
    const z1 = Math.min(sp.z + ext, chunkWorldZ + CHUNK_SIZE_Z - 1)
    // Layers y0..y1 + 1 (the icicle test looks one layer up)
    const L = this.buildLayers(sp, seed, y0, y1 + 1)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const lx = x - chunkWorldX
        const lz = z - chunkWorldZ
        for (let y = y0; y <= y1; y++) {
          const ly = y - minY
          if (this.inSpire(L, x, y, z)) {
            if (REPLACEABLE.has(chunk.getBlockId(lx, ly, lz))) chunk.setBlockId(lx, ly, lz, blockId)
          } else if (
            y >= sp.baseY &&
            this.settings.icicleChance > 0 &&
            this.inSpire(L, x, y + 1, z) &&
            cocytusHash(seed, x, z, y * 7 + 13) < this.settings.icicleChance &&
            chunk.getBlockId(lx, ly, lz) === BlockIds.AIR
          ) {
            chunk.setBlockId(lx, ly, lz, BlockIds.ICICLE)
          }
        }
      }
    }
  }
}
