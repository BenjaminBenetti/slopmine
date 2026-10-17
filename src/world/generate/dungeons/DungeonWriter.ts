import { BlockIds } from '../../blocks/BlockIds.ts'
import { BlockFacing } from '../../blocks/BlockFacing.ts'
import { hash01, hashString } from './DungeonRandom.ts'
import type {
  BlockSpec,
  Box,
  ChestOptions,
  DrawTarget,
  DungeonMarker,
  DungeonPalette,
  MarkerTarget,
  MarkerType,
} from './DungeonTypes.ts'

/**
 * Drawing back-ends for the dungeon framework: a clipped world writer into
 * one sub-chunk (or a recorder for layout-time dry runs) and rotated
 * module frames on top of it. Builders only ever see `DrawTarget`.
 */

/** The block storage a dungeon draws into (WorkerSubChunk satisfies it). Local coords 0-31. */
export interface SubChunkLike {
  getBlockId(x: number, y: number, z: number): number
  setBlockId(x: number, y: number, z: number, blockId: number): boolean
  setMetadata?(x: number, y: number, z: number, value: number): boolean
}

/** Sink for world writes: a sub-chunk (with its world origin), or null for a dry run. */
export interface WorldSink {
  readonly chunk: SubChunkLike
  readonly originX: number
  readonly originY: number
  readonly originZ: number
}

/** Intersection of two boxes (null when empty). */
export function intersectBoxes(a: Box, b: Box): Box | null {
  const x0 = Math.max(a.x0, b.x0)
  const y0 = Math.max(a.y0, b.y0)
  const z0 = Math.max(a.z0, b.z0)
  const x1 = Math.min(a.x1, b.x1)
  const y1 = Math.min(a.y1, b.y1)
  const z1 = Math.min(a.z1, b.z1)
  return x0 > x1 || y0 > y1 || z0 > z1 ? null : { x0, y0, z0, x1, y1, z1 }
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1 && a.z0 <= b.z1 && b.z0 <= a.z1
}

const materialSalts = new Map<string, number>()
function materialSalt(name: string): number {
  let salt = materialSalts.get(name)
  if (salt === undefined) {
    salt = hashString(name) | 0
    materialSalts.set(name, salt)
  }
  return salt
}

/** Resolve a palette material at a world position (weighted variants pick per position). */
export function resolveMaterial(palette: DungeonPalette, name: string, wx: number, wy: number, wz: number): number {
  if (name === 'air') return BlockIds.AIR
  const entry = palette[name]
  if (entry === undefined) {
    throw new Error(`[dungeons] palette has no material '${name}'`)
  }
  if (typeof entry === 'number') return entry
  let total = 0
  for (const [, weight] of entry) total += weight
  let roll = hash01(wx, wy, wz, materialSalt(name)) * total
  for (const [id, weight] of entry) {
    roll -= weight
    if (roll < 0) return id
  }
  return entry[entry.length - 1][0]
}

// BlockFacing <-> face index (E=0, S=1, W=2, N=3) for rotating metadata
const FACING_TO_FACE: Record<number, number> = {
  [BlockFacing.EAST]: 0,
  [BlockFacing.SOUTH]: 1,
  [BlockFacing.WEST]: 2,
  [BlockFacing.NORTH]: 3,
}
const FACE_TO_FACING = [BlockFacing.EAST, BlockFacing.SOUTH, BlockFacing.WEST, BlockFacing.NORTH]

/** Rotate the facing bits (0-2) of block metadata by `rotation` quarter turns (E→S→W→N); other bits kept. */
export function rotateFacingMeta(meta: number, rotation: number): number {
  const r = ((rotation % 4) + 4) % 4
  if (r === 0) return meta
  const face = FACING_TO_FACE[meta & 0b111]
  if (face === undefined) return meta
  return (meta & ~0b111) | FACE_TO_FACING[(face + r) % 4]
}

export interface MarkerConfig {
  readonly lootTierBlocks?: readonly number[]
  readonly palette: DungeonPalette
}

// ---------------------------------------------------------------------------
// Dev warnings
// ---------------------------------------------------------------------------

/** A dev warning about a kit drawing call (module/pass id, call site, details). */
export interface DungeonDrawWarning {
  readonly module: string
  readonly callSite: string
  readonly message: string
}

let devWarnings = import.meta.env?.DEV === true
let warningSink: ((warning: DungeonDrawWarning) => void) | null = null
const warnedSites = new Set<string>()

/**
 * Enable/disable kit drawing warnings (default: on in dev builds) and
 * optionally collect them (harnesses). Warnings fire once per call site.
 */
export function setDungeonDevWarnings(enabled: boolean, sink: ((warning: DungeonDrawWarning) => void) | null = null): void {
  devWarnings = enabled
  warningSink = sink
  warnedSites.clear()
}

/** The first stack frames outside the framework's writer (the kit call site, via a primitive if any). */
function kitCallSite(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(1).map((line) => line.trim())
  const frames = lines.filter((line) => line.startsWith('at ') && !line.includes('DungeonWriter.ts'))
  const first = frames[0] ?? '?'
  // Through a framework primitive: name the kit line that called it too
  return first.includes('DungeonBuild.ts') && frames[1] ? `${first} <- ${frames[1]}` : first
}

function warnInvertedRange(module: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const callSite = kitCallSite()
  const key = `${module}|${callSite}`
  if (warnedSites.has(key)) return
  warnedSites.add(key)
  const message =
    `[dungeons] inverted fill range x ${x0}..${x1}, y ${y0}..${y1}, z ${z0}..${z1} in '${module}' - nothing written ` +
    `(ranges are inclusive and ordered; skip the call when the range is empty) at ${callSite}`
  if (warningSink) warningSink({ module, callSite, message })
  else console.warn(message)
}

/** Construction parameters of a FrameTarget. */
export interface FrameOptions {
  /** Where writes go (null = dry run: nothing written, markers recorded). */
  readonly sink: WorldSink | null
  /** World box writes are clipped to (null = write nothing). */
  readonly clip: Box | null
  readonly palette: DungeonPalette
  readonly markerConfig: MarkerConfig
  readonly terrainHeight: (x: number, z: number) => number
  /** World frame (passes): identity transform; the module fields are ignored. */
  readonly world: boolean
  /** Module box min corner (world) and canonical width/depth in blocks. */
  readonly mx?: number
  readonly my?: number
  readonly mz?: number
  readonly W?: number
  readonly D?: number
  readonly rotation?: number
  /** Default chest tier. */
  readonly tier?: number
  /** Module index recorded with markers (-1 for passes). */
  readonly moduleIndex?: number
  /** Module def id / pass name, for dev warnings. */
  readonly moduleId?: string
  /** Marker sink (dry runs). */
  readonly markers?: DungeonMarker[] | null
}

/**
 * A drawing frame: module-local (rotated, translated) or world (identity)
 * coordinates, clipped to a world box, writing into a sub-chunk (or
 * recording markers only, for layout-time dry runs).
 */
export class FrameTarget implements DrawTarget, MarkerTarget {
  private readonly sink: WorldSink | null
  /** World box writes are clipped to in this call (null in dry runs: nothing is written). */
  readonly clip: Box | null
  private readonly palette: DungeonPalette
  private readonly markerConfig: MarkerConfig
  private readonly terrainHeightAt: (x: number, z: number) => number
  private readonly world: boolean
  private readonly mx: number
  private readonly my: number
  private readonly mz: number
  private readonly W: number
  private readonly D: number
  readonly rotation: number
  private readonly defaultTier: number
  private readonly moduleIndex: number
  private readonly moduleId: string
  private readonly markers: DungeonMarker[] | null

  constructor(options: FrameOptions) {
    this.sink = options.sink
    this.clip = options.clip
    this.palette = options.palette
    this.markerConfig = options.markerConfig
    this.terrainHeightAt = options.terrainHeight
    this.world = options.world
    this.mx = options.mx ?? 0
    this.my = options.my ?? 0
    this.mz = options.mz ?? 0
    this.W = options.W ?? 1
    this.D = options.D ?? 1
    this.rotation = ((options.rotation ?? 0) % 4 + 4) % 4
    this.defaultTier = options.tier ?? 0
    this.moduleIndex = options.moduleIndex ?? -1
    this.moduleId = options.moduleId ?? '?'
    this.markers = options.markers ?? null
  }

  /** Layout-time dry run (markers recorded, nothing written): skip expensive drawing loops. */
  get dryRun(): boolean {
    return this.sink === null
  }

  // --- transforms -----------------------------------------------------------

  private wx(lx: number, lz: number): number {
    if (this.world) return lx
    switch (this.rotation) {
      case 1: return this.mx + (this.D - 1 - lz)
      case 2: return this.mx + (this.W - 1 - lx)
      case 3: return this.mx + lz
      default: return this.mx + lx
    }
  }

  private wz(lx: number, lz: number): number {
    if (this.world) return lz
    switch (this.rotation) {
      case 1: return this.mz + lx
      case 2: return this.mz + (this.D - 1 - lz)
      case 3: return this.mz + (this.W - 1 - lx)
      default: return this.mz + lz
    }
  }

  private wy(ly: number): number {
    return this.world ? ly : this.my + ly
  }

  /** World → local x/z (inverse of wx/wz). */
  private lx(wx: number, wz: number): number {
    if (this.world) return wx
    switch (this.rotation) {
      case 1: return wz - this.mz
      case 2: return this.W - 1 - (wx - this.mx)
      case 3: return this.W - 1 - (wz - this.mz)
      default: return wx - this.mx
    }
  }

  private lz(wx: number, wz: number): number {
    if (this.world) return wz
    switch (this.rotation) {
      case 1: return this.D - 1 - (wx - this.mx)
      case 2: return this.D - 1 - (wz - this.mz)
      case 3: return wx - this.mx
      default: return wz - this.mz
    }
  }

  // --- DrawTarget -------------------------------------------------------------

  facing(blockFacing: number): number {
    return this.world ? blockFacing : rotateFacingMeta(blockFacing, this.rotation)
  }

  terrainY(x: number, z: number): number {
    return this.terrainHeightAt(this.wx(x, z), this.wz(x, z)) - (this.world ? 0 : this.my)
  }

  hash(x: number, y: number, z: number, salt = 0): number {
    return hash01(this.wx(x, z), this.wy(y), this.wz(x, z), salt)
  }

  set(x: number, y: number, z: number, block: BlockSpec, meta?: number): void {
    const sink = this.sink
    if (!sink) return
    const wx = this.wx(x, z)
    const wy = this.wy(y)
    const wz = this.wz(x, z)
    if (!this.inClip(wx, wy, wz)) return
    this.write(sink, wx, wy, wz, this.resolve(block, x, y, z, wx, wy, wz), meta)
  }

  setIf(x: number, y: number, z: number, block: BlockSpec, test: (currentId: number) => boolean, meta?: number): void {
    const sink = this.sink
    if (!sink) return
    const wx = this.wx(x, z)
    const wy = this.wy(y)
    const wz = this.wz(x, z)
    if (!this.inClip(wx, wy, wz)) return
    if (!test(sink.chunk.getBlockId(wx - sink.originX, wy - sink.originY, wz - sink.originZ))) return
    this.write(sink, wx, wy, wz, this.resolve(block, x, y, z, wx, wy, wz), meta)
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: BlockSpec, meta?: number): void {
    this.fillInternal(x0, y0, z0, x1, y1, z1, block, null, meta)
  }

  fillIf(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    block: BlockSpec, test: (currentId: number) => boolean, meta?: number
  ): void {
    this.fillInternal(x0, y0, z0, x1, y1, z1, block, test, meta)
  }

  // --- MarkerTarget -----------------------------------------------------------

  chest(x: number, y: number, z: number, options: ChestOptions = {}): void {
    const tier = Math.max(0, Math.min(3, options.tier ?? this.defaultTier))
    const facing = this.facing(options.facing ?? BlockFacing.SOUTH)
    this.record('chest', x, y, z, tier)
    this.set(x, y, z, BlockIds.CHEST, facing)
    const signature = this.markerConfig.lootTierBlocks?.[tier]
    if (options.signature !== false && signature !== undefined) this.set(x, y - 1, z, signature)
  }

  garrison(x: number, y: number, z: number, index: number): void {
    this.record('garrison', x, y, z, index)
    this.set(x, y, z, BlockIds.GARRISON_SPAWNER, index & 0xff)
  }

  guardian(x: number, y: number, z: number, index: number): void {
    this.record('guardian', x, y, z, index)
    this.set(x, y, z, BlockIds.GUARDIAN_SPAWNER, index & 0xff)
  }

  light(x: number, y: number, z: number, block?: BlockSpec): void {
    this.record('light', x, y, z, 0)
    this.set(x, y, z, block ?? (this.palette.light !== undefined ? 'light' : BlockIds.TORCH))
  }

  // --- internals --------------------------------------------------------------

  private record(type: MarkerType, x: number, y: number, z: number, value: number): void {
    if (!this.markers) return
    this.markers.push({ type, x: this.wx(x, z), y: this.wy(y), z: this.wz(x, z), value, module: this.moduleIndex })
  }

  private inClip(wx: number, wy: number, wz: number): boolean {
    const c = this.clip
    return c !== null && wx >= c.x0 && wx <= c.x1 && wy >= c.y0 && wy <= c.y1 && wz >= c.z0 && wz <= c.z1
  }

  private resolve(block: BlockSpec, lx: number, ly: number, lz: number, wx: number, wy: number, wz: number): number {
    let spec: number | string
    if (typeof block === 'function') spec = block(lx, ly, lz)
    else spec = block
    return typeof spec === 'number' ? spec : resolveMaterial(this.palette, spec, wx, wy, wz)
  }

  private write(sink: WorldSink, wx: number, wy: number, wz: number, id: number, meta: number | undefined): void {
    const x = wx - sink.originX
    const y = wy - sink.originY
    const z = wz - sink.originZ
    sink.chunk.setBlockId(x, y, z, id)
    sink.chunk.setMetadata?.(x, y, z, meta ?? 0)
  }

  private fillInternal(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    block: BlockSpec, test: ((currentId: number) => boolean) | null, meta: number | undefined
  ): void {
    // An inverted range (x0 > x1, y0 > y1 or z0 > z1 in the caller's frame) is EMPTY: never
    // swapped - a swap turns an empty clipped span into a stray slab (QA2: floating sheets)
    if (x0 > x1 || y0 > y1 || z0 > z1) {
      if (devWarnings) warnInvertedRange(this.moduleId, x0, y0, z0, x1, y1, z1)
      return
    }
    const sink = this.sink
    const clip = this.clip
    if (!sink || !clip) return
    // The local box maps to an axis-aligned world box (rotation may swap its
    // corners, the range itself is ordered): clip it once
    const ax = this.wx(x0, z0), bx = this.wx(x1, z1)
    const az = this.wz(x0, z0), bz = this.wz(x1, z1)
    const ay = this.wy(y0), by = this.wy(y1)
    const wx0 = Math.max(Math.min(ax, bx), clip.x0)
    const wx1 = Math.min(Math.max(ax, bx), clip.x1)
    const wz0 = Math.max(Math.min(az, bz), clip.z0)
    const wz1 = Math.min(Math.max(az, bz), clip.z1)
    const wy0 = Math.max(ay, clip.y0)
    const wy1 = Math.min(by, clip.y1)
    if (wx0 > wx1 || wz0 > wz1 || wy0 > wy1) return
    const constId = typeof block === 'number' ? block : -1
    const chunk = sink.chunk
    for (let wy = wy0; wy <= wy1; wy++) {
      const y = wy - sink.originY
      const ly = this.world ? wy : wy - this.my
      for (let wz = wz0; wz <= wz1; wz++) {
        const z = wz - sink.originZ
        for (let wx = wx0; wx <= wx1; wx++) {
          const x = wx - sink.originX
          if (test && !test(chunk.getBlockId(x, y, z))) continue
          const id = constId >= 0 ? constId : this.resolve(block, this.lx(wx, wz), ly, this.lz(wx, wz), wx, wy, wz)
          chunk.setBlockId(x, y, z, id)
          chunk.setMetadata?.(x, y, z, meta ?? 0)
        }
      }
    }
  }
}
