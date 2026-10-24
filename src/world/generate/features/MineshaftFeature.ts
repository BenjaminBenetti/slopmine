import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { isLiquidBlock } from '../../liquid/LiquidPhysicsAlgorithm.ts'

export interface MineshaftSettings {
  /** Decorrelates networks between worlds' features (keep equal in every biome: networks cross region borders). */
  readonly salt: number
  /** Chance a network cell holds a mineshaft. */
  readonly chance: number
  /** Floor Y range of the network. */
  readonly minY: number
  readonly maxY: number
}

/** Side of a network cell (blocks); each holds at most one network, kept inside it. */
const CELL = 320
const MARGIN = 12
/** Corridor half-width (3 wide) and height (3 tall). */
const HALF = 1
const HEIGHT = 3
/** A support frame every this many blocks along a corridor. */
const SUPPORT_SPACING = 4
/** Corridors never come closer than this to the surface (blocks). */
const SURFACE_CLEARANCE = 6

interface Corridor {
  readonly axis: 'x' | 'z'
  /** Start and end along the axis (inclusive, ordered), the fixed cross coordinate, floor Y. */
  readonly a0: number
  readonly a1: number
  readonly cross: number
  readonly y: number
}

interface Network {
  readonly corridors: readonly Corridor[]
  /** Junction rooms: centre X/Z, floor Y, half size. */
  readonly rooms: readonly { x: number; z: number; y: number; r: number }[]
  /** Loot chests: position (on the floor) and the crate beside them. */
  readonly chests: readonly { x: number; y: number; z: number; crateX: number; crateZ: number }[]
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** A seeded generator for one network. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const networks = new Map<string, Network | null>()

/**
 * The mineshaft network of a cell (or null): a pure function of the cell,
 * the seed and the settings, cached per worker. A flat tree of straight
 * corridors grown from a central junction, with junction rooms where
 * branches meet and loot chests at some dead ends.
 */
function networkAt(cellX: number, cellZ: number, seed: number, s: MineshaftSettings): Network | null {
  const key = `${cellX},${cellZ},${seed},${s.salt}`
  const cached = networks.get(key)
  if (cached !== undefined) return cached
  if (networks.size > 256) networks.clear()
  let network: Network | null = null
  if (hash(cellX, cellZ, seed ^ s.salt) < s.chance) {
    const r = rng(Math.floor(hash(cellZ, cellX, seed ^ (s.salt * 7)) * 0xffffffff))
    const lo = MARGIN
    const hi = CELL - MARGIN
    const ox = cellX * CELL
    const oz = cellZ * CELL
    const y = s.minY + Math.floor(r() * (s.maxY - s.minY + 1))
    const nodes: { x: number; z: number; degree: number }[] = [{ x: ox + 100 + Math.floor(r() * 120), z: oz + 100 + Math.floor(r() * 120), degree: 0 }]
    const corridors: Corridor[] = []
    const rooms: { x: number; z: number; y: number; r: number }[] = []
    const count = 9 + Math.floor(r() * 8)
    for (let i = 0; i < count; i++) {
      const from = nodes[Math.floor(r() * nodes.length)]
      const axis = r() < 0.5 ? 'x' : 'z'
      const dir = r() < 0.5 ? -1 : 1
      const length = 14 + Math.floor(r() * 34)
      const start = axis === 'x' ? from.x : from.z
      const origin = axis === 'x' ? ox : oz
      const end = Math.max(origin + lo, Math.min(origin + hi, start + dir * length))
      if (Math.abs(end - start) < 8) continue
      corridors.push({ axis, a0: Math.min(start, end), a1: Math.max(start, end), cross: axis === 'x' ? from.z : from.x, y })
      from.degree++
      const node = axis === 'x' ? { x: end, z: from.z, degree: 1 } : { x: from.x, z: end, degree: 1 }
      nodes.push(node)
      // Branch from along the corridor too, not only its ends
      if (r() < 0.35) {
        const t = start + dir * Math.floor(Math.abs(end - start) * (0.3 + r() * 0.4))
        nodes.push(axis === 'x' ? { x: t, z: from.z, degree: 2 } : { x: from.x, z: t, degree: 2 })
      }
    }
    for (const n of nodes) if (n.degree >= 3 || (n === nodes[0])) rooms.push({ x: n.x, z: n.z, y, r: 2 })
    // Chests at a few dead ends, a crate beside each (the loot table's signature)
    const chests: Network['chests'][number][] = []
    for (const n of nodes) {
      if (n.degree !== 1 || chests.length >= 3 || r() > 0.45) continue
      chests.push({ x: n.x, y, z: n.z, crateX: n.x + 1, crateZ: n.z + 1 })
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const c of corridors) {
      const x0 = c.axis === 'x' ? c.a0 : c.cross - HALF - 1
      const x1 = c.axis === 'x' ? c.a1 : c.cross + HALF + 1
      const z0 = c.axis === 'z' ? c.a0 : c.cross - HALF - 1
      const z1 = c.axis === 'z' ? c.a1 : c.cross + HALF + 1
      minX = Math.min(minX, x0 - 3); maxX = Math.max(maxX, x1 + 3); minZ = Math.min(minZ, z0 - 3); maxZ = Math.max(maxZ, z1 + 3)
    }
    if (corridors.length > 0) network = { corridors, rooms, chests, minX, maxX, minZ, maxZ }
  }
  networks.set(key, network)
  return network
}

/**
 * Abandoned mineshafts: networks of 3×3 timber-framed corridors deep in the
 * overworld's rock (one chance per 320-block cell), with oak post-and-beam
 * supports every 4 blocks, plank floors where a corridor bridges a cave,
 * cobwebs, junction rooms and loot chests at dead ends beside ore crates
 * (the 'abandoned-mineshaft' chest loot table's signature). Listed in every
 * overworld biome with the same settings, so networks cross biome borders
 * whole; each sub-chunk rasterises the corridors that cross it (pure
 * functions of world coordinates - any generation order matches).
 */
export class MineshaftFeature extends Feature {
  readonly settings: MineshaftSettings

  constructor(settings: MineshaftSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, config, getBaseHeightAt } = context
    const s = this.settings
    const coord = chunk.coordinate as ISubChunkCoordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const maxY = minY + SUB_CHUNK_HEIGHT - 1
    if (s.maxY + HEIGHT + 1 < minY || s.minY - 1 > maxY) return
    const cx0 = Number(coord.x) * CHUNK_SIZE_X
    const cz0 = Number(coord.z) * CHUNK_SIZE_Z
    const cx1 = cx0 + CHUNK_SIZE_X - 1
    const cz1 = cz0 + CHUNK_SIZE_Z - 1

    const get = (x: number, y: number, z: number): number => chunk.getBlockId(x - cx0, y - minY, z - cz0)
    const inside = (x: number, y: number, z: number): boolean =>
      x >= cx0 && x <= cx1 && z >= cz0 && z <= cz1 && y >= minY && y <= maxY
    const deep = (x: number, y: number, z: number): boolean => y + HEIGHT + SURFACE_CLEARANCE < getBaseHeightAt(x, z)
    const set = (x: number, y: number, z: number, id: number): void => {
      if (!inside(x, y, z) || !deep(x, y, z)) return
      if (isLiquidBlock(get(x, y, z))) return
      chunk.setBlockId(x - cx0, y - minY, z - cz0, id)
    }

    for (let gx = Math.floor(cx0 / CELL); gx <= Math.floor(cx1 / CELL); gx++) {
      for (let gz = Math.floor(cz0 / CELL); gz <= Math.floor(cz1 / CELL); gz++) {
        const net = networkAt(gx, gz, config.seed, s)
        if (!net || net.maxX < cx0 || net.minX > cx1 || net.maxZ < cz0 || net.minZ > cz1) continue
        for (const c of net.corridors) this.carveCorridor(c, set, get, inside)
        for (const room of net.rooms) {
          for (let dx = -room.r; dx <= room.r; dx++) {
            for (let dz = -room.r; dz <= room.r; dz++) {
              for (let dy = 0; dy <= HEIGHT; dy++) set(room.x + dx, room.y + dy, room.z + dz, BlockIds.AIR)
              if (inside(room.x + dx, room.y - 1, room.z + dz) && get(room.x + dx, room.y - 1, room.z + dz) === BlockIds.AIR) {
                set(room.x + dx, room.y - 1, room.z + dz, BlockIds.OAK_PLANKS)
              }
            }
          }
          for (const [dx, dz] of [[-room.r, -room.r], [room.r, -room.r], [-room.r, room.r], [room.r, room.r]]) {
            for (let dy = 0; dy <= HEIGHT; dy++) set(room.x + dx, room.y + dy, room.z + dz, BlockIds.OAK_LOG)
          }
        }
        for (const chest of net.chests) {
          set(chest.x, chest.y, chest.z, BlockIds.CHEST)
          set(chest.crateX, chest.y, chest.crateZ, BlockIds.ORE_CRATE)
          if (hash(chest.x, chest.z, 77) < 0.6) set(chest.crateX, chest.y + 1, chest.crateZ, BlockIds.ORE_CRATE)
        }
      }
    }
  }

  private carveCorridor(
    c: Corridor,
    set: (x: number, y: number, z: number, id: number) => void,
    get: (x: number, y: number, z: number) => number,
    inside: (x: number, y: number, z: number) => boolean,
  ): void {
    for (let a = c.a0; a <= c.a1; a++) {
      const support = (a - c.a0) % SUPPORT_SPACING === 0
      for (let w = -HALF; w <= HALF; w++) {
        const x = c.axis === 'x' ? a : c.cross + w
        const z = c.axis === 'x' ? c.cross + w : a
        for (let dy = 0; dy < HEIGHT; dy++) set(x, c.y + dy, z, BlockIds.AIR)
        // Bridge planks where the corridor crosses open cave
        if (inside(x, c.y - 1, z) && get(x, c.y - 1, z) === BlockIds.AIR) set(x, c.y - 1, z, BlockIds.OAK_PLANKS)
        if (support) {
          set(x, c.y + HEIGHT - 1, z, BlockIds.OAK_PLANKS)
          if (w !== 0) {
            set(x, c.y, z, BlockIds.OAK_FENCE)
            set(x, c.y + 1, z, BlockIds.OAK_FENCE)
          }
        } else if (w !== 0 && hash(x * 7 + c.y, z, 191) < 0.06) {
          // Old cobwebs in the upper corners
          set(x, c.y + HEIGHT - 1, z, BlockIds.COBWEB)
        }
      }
    }
  }
}
