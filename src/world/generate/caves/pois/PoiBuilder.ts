import { BlockIds } from '../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../blocks/BlockFacing.ts'
import { getBlock } from '../../../blocks/BlockRegistry.ts'
import { DungeonRng, hash01 } from '../../dungeons/DungeonRandom.ts'
import { rotateFacingMeta, type SubChunkLike } from '../../dungeons/DungeonWriter.ts'
import type { BlockSpec, Box, DrawTarget } from '../../dungeons/DungeonTypes.ts'
import type { PoiKindInfo } from './PoiCatalog.ts'

/**
 * How a kind of point of interest is built: its extent around the anchor
 * and the builder. Everything it writes must lie within `radius`
 * horizontally and `below`..`above` vertically of the anchor (writes beyond
 * are dropped), so the site's box is authoritative.
 */
export interface PoiBuildDef {
  readonly kind: PoiKindInfo
  /** Horizontal half extent (blocks) around the anchor column. */
  readonly radius: number
  /** Blocks above the anchor cell (inclusive) and below it (inclusive) it may write. */
  readonly above: number
  readonly below: number
  /** Draw the whole point of interest (called once per sub-chunk it crosses; writes are clipped). */
  build(b: PoiBuilder): void
}

/** A resolved point of interest: where, which way it faces, and the caves around it. */
export interface PoiSite {
  readonly def: PoiBuildDef
  /** Anchor: the cave floor's first air cell (local 0, 0, 0; the floor block is y = -1). */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Quarter turns: local +Z (forward) faces world +Z, -X, -Z, +X for 0-3. */
  readonly rotation: number
  /** Seed of the builder's random stream and hashes. */
  readonly seed: number
  /** World box the site may write (inclusive). */
  readonly box: Box
  /** The carved caves over `probeBox` (CaveCarver.probeRegion: STONE, AIR or a flood liquid). */
  readonly probe: Uint16Array
  /** The probed box: `box` and a margin around it. */
  readonly probeBox: Box
  /** Blended surface height at a world column. */
  readonly surfaceAt: (x: number, z: number) => number
}

/** Where a build call writes: one sub-chunk and its world origin. */
export interface PoiSink {
  readonly chunk: SubChunkLike
  readonly originX: number
  readonly originY: number
  readonly originZ: number
}

/**
 * The drawing context a point-of-interest builder gets: local coordinates
 * around the anchor, turned by the site's rotation (local +Z is forward,
 * toward the open cave; +X is to the right), clipped to the current
 * sub-chunk. It implements the dungeon framework's `DrawTarget`, so the
 * castle primitives (pillar, arch, dome, stairs...) draw here too.
 *
 * Builders must be pure functions of the site: they draw everything on
 * every call, read only the cave probe (`isCave`), the surface (`terrainY`)
 * and their own random stream (fresh and identical on every call), so any
 * sub-chunk order produces the same blocks. `setIf`/`fillIf` may test the
 * cell they write (earlier generation phases are deterministic per cell).
 */
export class PoiBuilder implements DrawTarget {
  readonly clip: Box
  readonly dryRun = false
  /** The builder's random stream: same sequence on every call. */
  readonly rng: DungeonRng
  readonly site: PoiSite
  private readonly sink: PoiSink
  private readonly sizeX: number
  private readonly sizeZ: number

  constructor(site: PoiSite, sink: PoiSink, clip: Box) {
    this.site = site
    this.sink = sink
    this.clip = clip
    this.rng = new DungeonRng(site.seed)
    this.sizeX = site.probeBox.x1 - site.probeBox.x0 + 1
    this.sizeZ = site.probeBox.z1 - site.probeBox.z0 + 1
  }

  // ---- Frame -------------------------------------------------------------

  /** World X of a local column. */
  wx(x: number, z: number): number {
    switch (this.site.rotation) {
      case 1: return this.site.x - z
      case 2: return this.site.x - x
      case 3: return this.site.x + z
      default: return this.site.x + x
    }
  }

  /** World Z of a local column. */
  wz(x: number, z: number): number {
    switch (this.site.rotation) {
      case 1: return this.site.z + x
      case 2: return this.site.z - z
      case 3: return this.site.z - x
      default: return this.site.z + z
    }
  }

  facing(blockFacing: number): number {
    return rotateFacingMeta(blockFacing, this.site.rotation)
  }

  terrainY(x: number, z: number): number {
    return this.site.surfaceAt(this.wx(x, z), this.wz(x, z)) - this.site.y
  }

  hash(x: number, y: number, z: number, salt = 0): number {
    return hash01(this.wx(x, z), this.site.y + y, this.wz(x, z), (this.site.seed ^ Math.imul(salt | 0, 0x9e3779b1)) | 0)
  }

  // ---- The caves around the site ----------------------------------------

  /** Probe block at a local cell (STONE outside the probed box). */
  private probeAt(x: number, y: number, z: number): number {
    const box = this.site.probeBox
    const px = this.wx(x, z) - box.x0
    const pz = this.wz(x, z) - box.z0
    const py = this.site.y + y - box.y0
    if (px < 0 || pz < 0 || py < 0 || px >= this.sizeX || pz >= this.sizeZ || py > box.y1 - box.y0) return BlockIds.STONE
    return this.site.probe[(py * this.sizeZ + pz) * this.sizeX + px]
  }

  /** The generator carved a cave (air) at this local cell. */
  isCave(x: number, y: number, z: number): boolean {
    return this.probeAt(x, y, z) === BlockIds.AIR
  }

  /** Natural rock at this local cell (before any point of interest). */
  isRock(x: number, y: number, z: number): boolean {
    return this.probeAt(x, y, z) === BlockIds.STONE
  }

  /**
   * The natural cave floor of a local column: the local y of the first air
   * cell above rock, scanning down from `fromY` to `toY` (null if the column
   * is rock or open all the way).
   */
  floorAt(x: number, z: number, fromY: number, toY: number): number | null {
    let wasAir = false
    for (let y = fromY; y >= toY; y--) {
      const air = this.isCave(x, y, z)
      if (!air && wasAir) return y + 1
      wasAir = air
    }
    return null
  }

  // ---- DrawTarget --------------------------------------------------------

  private write(wx: number, wy: number, wz: number, id: number, meta: number | undefined): void {
    const c = this.clip
    if (wx < c.x0 || wx > c.x1 || wy < c.y0 || wy > c.y1 || wz < c.z0 || wz > c.z1) return
    const s = this.sink
    s.chunk.setBlockId(wx - s.originX, wy - s.originY, wz - s.originZ, id)
    s.chunk.setMetadata?.(wx - s.originX, wy - s.originY, wz - s.originZ, meta ?? 0)
  }

  private resolve(block: BlockSpec, x: number, y: number, z: number): number {
    const id = typeof block === 'function' ? block(x, y, z) : block
    if (typeof id === 'string') throw new Error(`[pois] palette names are not supported ('${id}')`)
    return id
  }

  /** Current block at a local cell, or -1 outside this call's clip. */
  get(x: number, y: number, z: number): number {
    const wx = this.wx(x, z)
    const wy = this.site.y + y
    const wz = this.wz(x, z)
    const c = this.clip
    if (wx < c.x0 || wx > c.x1 || wy < c.y0 || wy > c.y1 || wz < c.z0 || wz > c.z1) return -1
    const s = this.sink
    return s.chunk.getBlockId(wx - s.originX, wy - s.originY, wz - s.originZ)
  }

  set(x: number, y: number, z: number, block: BlockSpec, meta?: number): void {
    this.write(this.wx(x, z), this.site.y + y, this.wz(x, z), this.resolve(block, x, y, z), meta)
  }

  setIf(x: number, y: number, z: number, block: BlockSpec, test: (currentId: number) => boolean, meta?: number): void {
    const current = this.get(x, y, z)
    if (current < 0 || !test(current)) return
    this.set(x, y, z, block, meta)
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: BlockSpec, meta?: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) this.set(x, y, z, block, meta)
      }
    }
  }

  fillIf(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    block: BlockSpec, test: (currentId: number) => boolean, meta?: number
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) this.setIf(x, y, z, block, test, meta)
      }
    }
  }

  // ---- Shapes ------------------------------------------------------------

  /**
   * Every cell of an ellipsoid (centre, radii), optionally roughened: the
   * surface wobbles by up to `rough` of the radius with world-anchored noise.
   */
  ellipsoid(
    cx: number, cy: number, cz: number, rx: number, ry: number, rz: number,
    block: BlockSpec, rough = 0, test?: (currentId: number) => boolean
  ): void {
    const ix = Math.ceil(rx * (1 + rough))
    const iy = Math.ceil(ry * (1 + rough))
    const iz = Math.ceil(rz * (1 + rough))
    for (let y = -iy; y <= iy; y++) {
      for (let z = -iz; z <= iz; z++) {
        for (let x = -ix; x <= ix; x++) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz)
          const limit = rough > 0 ? 1 + rough * (this.smoothNoise(cx + x, cy + y, cz + z) * 2 - 1) : 1
          if (d > limit * limit) continue
          if (test) this.setIf(cx + x, cy + y, cz + z, block, test)
          else this.set(cx + x, cy + y, cz + z, block)
        }
      }
    }
  }

  /**
   * The local y of the first cell above the centre that a roughened
   * ellipsoid (as `ellipsoid`/`chamber` draw it) leaves alone, in column
   * (x, z): the chamber's ceiling there. Pure, so every sub-chunk agrees.
   */
  ellipsoidTop(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, rough: number, x: number, z: number): number {
    const top = Math.ceil(ry * (1 + rough)) + 1
    for (let dy = 0; dy <= top; dy++) {
      const dx = x - cx, dz = z - cz
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz)
      const limit = rough > 0 ? 1 + rough * (this.smoothNoise(x, cy + dy, z) * 2 - 1) : 1
      if (d > limit * limit) return cy + dy
    }
    return cy + top
  }

  /**
   * A natural chamber: a roughened ellipsoid of air whose lower part is cut
   * flat at `floorY` (local), with a rock floor laid where the cave below
   * would leave it hanging. The walls keep whatever rock the cave had.
   */
  chamber(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, floorY: number, floorBlock: BlockSpec, rough = 0.18): void {
    const floor = (x: number, y: number, z: number): number | string => (typeof floorBlock === 'function' ? floorBlock(x, y, z) : floorBlock)
    this.ellipsoid(cx, cy, cz, rx, ry, rz, (x, y, z) => (y < floorY ? floor(x, y, z) : BlockIds.AIR), rough)
    // Seal the floor: one layer of floor block under the flattened bottom
    for (let z = -Math.ceil(rz); z <= Math.ceil(rz); z++) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        const d = (x * x) / (rx * rx) + (z * z) / (rz * rz)
        if (d > 1) continue
        this.set(cx + x, floorY - 1, cz + z, floorBlock)
      }
    }
  }

  /** A flat floor of `block` over a rectangle at local y, with `support` filled down to rock under any open cave (up to `maxDepth`). */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, block: BlockSpec, support: BlockSpec = BlockIds.STONE, maxDepth = 6): void {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        this.set(x, y, z, block)
        this.foundation(x, z, y - 1, support, maxDepth)
      }
    }
  }

  /** Fill a local column downward from `topY` with `block` while the cave below is open (up to `maxDepth` cells). */
  foundation(x: number, z: number, topY: number, block: BlockSpec, maxDepth = 6): void {
    for (let y = topY; y > topY - maxDepth; y--) {
      if (!this.isCave(x, y, z)) return
      this.set(x, y, z, block)
    }
  }

  /** World-anchored smooth noise in [0, 1) (value noise on a 4-block lattice, trilinear). */
  smoothNoise(x: number, y: number, z: number, salt = 7): number {
    const wx = this.wx(x, z) / 4
    const wy = (this.site.y + y) / 4
    const wz = this.wz(x, z) / 4
    const x0 = Math.floor(wx), y0 = Math.floor(wy), z0 = Math.floor(wz)
    const fx = wx - x0, fy = wy - y0, fz = wz - z0
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz)
    const s = (this.site.seed ^ salt) | 0
    const c = (i: number, j: number, k: number): number => hash01(x0 + i, y0 + j, z0 + k, s)
    const a = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * sx
    const b = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * sx
    const d = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * sx
    const e = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * sx
    const lo = a + (b - a) * sy
    const hi = d + (e - d) * sy
    return lo + (hi - lo) * sz
  }

  // ---- Markers -----------------------------------------------------------

  /** A worldgen chest (loot rolled on first open by the 'cave-poi' table, through the keystone). */
  chest(x: number, y: number, z: number, facing: number = BlockFacing.SOUTH): void {
    this.set(x, y, z, BlockIds.CHEST, this.facing(facing))
  }

  /**
   * The keystone: a stone-looking block whose metadata names the kind. The
   * main thread finds loaded points of interest through it (discovery,
   * chest loot), so every chest must lie within 8 blocks (Chebyshev) of it.
   */
  keystone(x: number, y: number, z: number): void {
    this.set(x, y, z, BlockIds.POI_KEYSTONE, this.site.def.kind.index)
  }

  /** A guardian's altar (GUARDIAN_SPAWNER, metadata = the guardian's index; see src/dungeons/GuardianRegistry.ts). */
  guardian(x: number, y: number, z: number, index: number): void {
    this.set(x, y, z, BlockIds.GUARDIAN_SPAWNER, index)
  }

  /** A test for `setIf`/`fillIf`: the cell is open - air, a liquid or a non-solid block (cave plants, cobwebs). */
  static readonly open = (id: number): boolean => id === BlockIds.AIR || !getBlock(id).properties.isSolid

  /** A test for `setIf`/`fillIf`: the cell holds natural rock or soil (never the structure's own blocks or plants). */
  static readonly natural = (id: number): boolean => NATURAL.has(id)
}

/** Blocks of the cave walls a builder may cut into or re-skin. */
const NATURAL = new Set<number>([
  BlockIds.STONE, BlockIds.DIRT, BlockIds.GRAVEL, BlockIds.ANDESITE, BlockIds.GRANITE, BlockIds.MOSSY_STONE, BlockIds.MOSS,
  BlockIds.DRIPSTONE_BLOCK, BlockIds.CALCITE, BlockIds.DAMP_SLATE, BlockIds.FROSTED_STONE, BlockIds.PALE_MYCELIUM,
  BlockIds.BASALT, BlockIds.SANDSTONE, BlockIds.SAND, BlockIds.CLAY, BlockIds.MUD,
])
