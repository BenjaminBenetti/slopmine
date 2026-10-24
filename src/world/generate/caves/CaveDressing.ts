import { BlockIds } from '../../blocks/BlockIds.ts'
import { SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import { CAVE_MASK_AIR, CAVE_MASK_FLOODED, CAVE_MASK_ROCK, caveMaskIndex } from './CaveMask.ts'
import { CAVE_BIOME_IDS, type CaveBiomeId, type CaveBiomeSample } from './CaveBiomes.ts'

/** A block picked by weight. */
interface Weighted {
  readonly id: number
  readonly w: number
}

/** How a kind of cave surface (floor, wall, ceiling) is lined. */
interface SurfaceLining {
  /** Share of the surface lined (in noise-shaped patches). */
  readonly coverage: number
  readonly blocks: readonly Weighted[]
}

/**
 * A decoration rolled per floor (or ceiling) cell: a single block, a
 * dripstone formation (column segments under/over a tip) or a hanging chain
 * (vines, roots, glowworm threads; `chainBlocks` picked per segment).
 */
interface Decor {
  readonly chance: number
  readonly kind: 'single' | 'stalagmite' | 'stalactite' | 'chain'
  readonly blocks: readonly number[]
  readonly maxLength?: number
  /** Chain segments: picked per segment by weight. */
  readonly chainBlocks?: readonly Weighted[]
  /** Only this many blocks or less below the surface (roots reach down from the ground above). */
  readonly maxDepth?: number
}

interface CaveDressingSpec {
  readonly floor?: SurfaceLining
  readonly wall?: SurfaceLining
  readonly ceiling?: SurfaceLining
  readonly floorDecor: readonly Decor[]
  readonly ceilingDecor: readonly Decor[]
  /** Cobwebs (etc.) in air cells hemmed in by rock on two sides and above or below. */
  readonly cornerDecor?: Decor
  /** Giant pale mushrooms on the floor (fungal hollows). */
  readonly giantMushrooms?: boolean
  /** Cave air at or below this Y fills with lava (magma chambers' lava lakes). */
  readonly lavaLevel?: number
  /** Rock touching lava turns to this, at this chance. */
  readonly lavaContact?: { readonly id: number; readonly chance: number }
}

const B = BlockIds

/** Each cave biome's lining and decorations. */
const DRESSINGS: Readonly<Record<CaveBiomeId, CaveDressingSpec>> = {
  dripstone_caverns: {
    floor: { coverage: 0.6, blocks: [{ id: B.DRIPSTONE_BLOCK, w: 1 }] },
    ceiling: { coverage: 0.65, blocks: [{ id: B.DRIPSTONE_BLOCK, w: 1 }] },
    wall: { coverage: 0.35, blocks: [{ id: B.DRIPSTONE_BLOCK, w: 1 }] },
    floorDecor: [
      { chance: 0.07, kind: 'stalagmite', blocks: [B.STALAGMITE], maxLength: 3 },
      { chance: 0.025, kind: 'single', blocks: [B.PEBBLES] },
      { chance: 0.01, kind: 'single', blocks: [B.CAVE_PEARLS] },
    ],
    ceilingDecor: [{ chance: 0.11, kind: 'stalactite', blocks: [B.STALACTITE], maxLength: 4 }],
  },
  mossy_grotto: {
    floor: { coverage: 0.85, blocks: [{ id: B.MOSS, w: 1 }] },
    wall: { coverage: 0.5, blocks: [{ id: B.MOSSY_STONE, w: 3 }, { id: B.MOSS, w: 1 }] },
    ceiling: { coverage: 0.55, blocks: [{ id: B.MOSSY_STONE, w: 2 }, { id: B.MOSS, w: 1 }] },
    floorDecor: [
      { chance: 0.09, kind: 'single', blocks: [B.CAVE_FERN] },
      { chance: 0.1, kind: 'single', blocks: [B.SHORT_GRASS] },
      { chance: 0.035, kind: 'single', blocks: [B.GLOW_BLOOM] },
      { chance: 0.015, kind: 'single', blocks: [B.BROWN_MUSHROOMS] },
    ],
    ceilingDecor: [
      { chance: 0.06, kind: 'chain', blocks: [], maxLength: 6, chainBlocks: [{ id: B.CAVE_VINES, w: 2 }, { id: B.CAVE_VINES_BERRIES, w: 1 }] },
      { chance: 0.06, kind: 'chain', blocks: [], maxLength: 3, chainBlocks: [{ id: B.HANGING_ROOTS, w: 1 }] },
    ],
  },
  glowworm_grotto: {
    floor: { coverage: 0.9, blocks: [{ id: B.DAMP_SLATE, w: 1 }] },
    wall: { coverage: 0.9, blocks: [{ id: B.DAMP_SLATE, w: 1 }] },
    ceiling: { coverage: 0.95, blocks: [{ id: B.DAMP_SLATE, w: 1 }] },
    floorDecor: [
      { chance: 0.025, kind: 'single', blocks: [B.CAVE_PEARLS] },
      { chance: 0.02, kind: 'single', blocks: [B.PEBBLES] },
    ],
    ceilingDecor: [
      { chance: 0.24, kind: 'chain', blocks: [], maxLength: 3, chainBlocks: [{ id: B.GLOWWORM_THREADS, w: 1 }] },
    ],
  },
  crystal_geode: {
    floor: { coverage: 0.6, blocks: [{ id: B.CALCITE, w: 6 }, { id: B.CELESTITE_BLOCK, w: 1 }] },
    wall: { coverage: 0.6, blocks: [{ id: B.CALCITE, w: 5 }, { id: B.CELESTITE_BLOCK, w: 1 }] },
    ceiling: { coverage: 0.6, blocks: [{ id: B.CALCITE, w: 5 }, { id: B.CELESTITE_BLOCK, w: 1 }] },
    floorDecor: [
      { chance: 0.05, kind: 'single', blocks: [B.CELESTITE_CLUSTER] },
      { chance: 0.08, kind: 'single', blocks: [B.CELESTITE_BUD] },
    ],
    ceilingDecor: [{ chance: 0.08, kind: 'single', blocks: [B.HANGING_CELESTITE] }],
  },
  fungal_hollow: {
    floor: { coverage: 0.9, blocks: [{ id: B.PALE_MYCELIUM, w: 1 }] },
    wall: { coverage: 0.2, blocks: [{ id: B.PALE_MYCELIUM, w: 1 }] },
    floorDecor: [
      { chance: 0.11, kind: 'single', blocks: [B.CAVE_MUSHROOMS] },
      { chance: 0.045, kind: 'single', blocks: [B.PUFFBALLS] },
    ],
    ceilingDecor: [{ chance: 0.03, kind: 'chain', blocks: [], maxLength: 2, chainBlocks: [{ id: B.HANGING_ROOTS, w: 1 }] }],
    giantMushrooms: true,
  },
  frozen_cave: {
    floor: { coverage: 0.8, blocks: [{ id: B.GLACIAL_ICE, w: 1 }, { id: B.FROSTED_STONE, w: 1 }] },
    wall: { coverage: 0.75, blocks: [{ id: B.FROSTED_STONE, w: 1 }] },
    ceiling: { coverage: 0.7, blocks: [{ id: B.FROSTED_STONE, w: 1 }] },
    floorDecor: [
      { chance: 0.14, kind: 'single', blocks: [B.SNOW_PATCH] },
      { chance: 0.02, kind: 'single', blocks: [B.PEBBLES] },
    ],
    ceilingDecor: [{ chance: 0.16, kind: 'single', blocks: [B.ICICLE] }],
  },
  magma_chamber: {
    floor: { coverage: 0.85, blocks: [{ id: B.BASALT, w: 3 }, { id: B.MAGMA, w: 1 }] },
    wall: { coverage: 0.6, blocks: [{ id: B.BASALT, w: 3 }, { id: B.COLUMNAR_BASALT, w: 1 }] },
    ceiling: { coverage: 0.65, blocks: [{ id: B.BASALT, w: 1 }] },
    floorDecor: [
      { chance: 0.06, kind: 'single', blocks: [B.EMBERS] },
      { chance: 0.07, kind: 'single', blocks: [B.CINDERS] },
      { chance: 0.03, kind: 'single', blocks: [B.SULFUR_CLUSTER] },
      { chance: 0.02, kind: 'single', blocks: [B.OBSIDIAN_SHARDS] },
    ],
    ceilingDecor: [],
    lavaLevel: 160,
    lavaContact: { id: B.OBSIDIAN, chance: 0.25 },
  },
  webbed_hollow: {
    floorDecor: [
      { chance: 0.035, kind: 'single', blocks: [B.CAVE_BONES] },
      { chance: 0.02, kind: 'single', blocks: [B.EGG_SAC] },
      { chance: 0.03, kind: 'single', blocks: [B.COBWEB] },
      { chance: 0.03, kind: 'single', blocks: [B.PEBBLES] },
    ],
    ceilingDecor: [
      { chance: 0.06, kind: 'single', blocks: [B.COBWEB] },
      { chance: 0.02, kind: 'chain', blocks: [], maxLength: 2, chainBlocks: [{ id: B.HANGING_ROOTS, w: 1 }] },
    ],
    cornerDecor: { chance: 0.18, kind: 'single', blocks: [B.COBWEB] },
  },
}

/**
 * Plain caves - most of the underground, between the special zones: the
 * rock stays stone. Gravel patches on the floor, pebbles, now and then a
 * mushroom or bones, roots dangling where the ground is close above, a rare
 * cobweb; the andesite and granite blobs through the rock do the rest
 * (scatterRockBlobs).
 */
const PLAIN_CAVE: CaveDressingSpec = {
  floor: { coverage: 0.27, blocks: [{ id: B.GRAVEL, w: 1 }] },
  floorDecor: [
    { chance: 0.03, kind: 'single', blocks: [B.PEBBLES] },
    { chance: 0.004, kind: 'single', blocks: [B.BROWN_MUSHROOMS] },
    { chance: 0.0025, kind: 'single', blocks: [B.CAVE_BONES] },
  ],
  ceilingDecor: [
    { chance: 0.05, kind: 'chain', blocks: [], maxLength: 3, chainBlocks: [{ id: B.HANGING_ROOTS, w: 1 }], maxDepth: 16 },
  ],
  cornerDecor: { chance: 0.01, kind: 'single', blocks: [B.COBWEB] },
}

/** Highest lava level of any cave biome (sub-chunks above it skip the lava pass). */
export const MAX_LAVA_LEVEL = Math.max(...Object.values(DRESSINGS).map((d) => d.lavaLevel ?? -Infinity))

/** Zone strength a magma chamber needs for its lava lake (lakes keep off the zone's rim). */
const LAVA_MIN_STRENGTH = 0.7
/** Zone strength a giant pale mushroom needs at its foot. */
const MUSHROOM_MIN_STRENGTH = 0.6
/** Spacing of the world-aligned column lattice the cave biome is sampled on (blocks). */
const BIOME_LATTICE = 4

/** Rock the dressing may turn into a cave biome's lining (never ores or other features' blocks). */
const LINEABLE = B.STONE

/** No lining within this many blocks of the surface (cave mouths keep the surface look). */
const SURFACE_MARGIN = 3

function hash(x: number, y: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** Smooth 3D value noise (0-1) on a 6-block lattice: patches of lining. */
function patchNoise(x: number, y: number, z: number, salt: number): number {
  return valueNoise(x, y, z, 6, salt)
}

/** Smooth 3D value noise (0-1) on an s-block lattice (values bunch around 0.5: 0.27 / 0.73 are the 12% / 88% quantiles). */
function valueNoise(x: number, y: number, z: number, s: number, salt: number): number {
  const fx = x / s, fy = y / s, fz = z / s
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz)
  const tx = fx - x0, ty = fy - y0, tz = fz - z0
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz)
  let v = 0
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz)
        v += w * hash(x0 + dx, y0 + dy, z0 + dz, salt)
      }
    }
  }
  return v
}

function pickWeighted(list: readonly Weighted[], roll: number): number {
  let total = 0
  for (const e of list) total += e.w
  let r = roll * total
  for (const e of list) {
    r -= e.w
    if (r < 0) return e.id
  }
  return list[list.length - 1].id
}

export interface CaveDressingContext {
  readonly chunkWorldX: number
  readonly chunkWorldZ: number
  readonly minWorldY: number
  /** Blended surface height of a world column. */
  readonly getHeight: (worldX: number, worldZ: number) => number
  /** The cave biome under a world column (caveBiomeAt with the chunk's surface lookup). */
  readonly caveBiomeAt: (worldX: number, worldZ: number, out: CaveBiomeSample) => CaveBiomeSample
}

/**
 * Dress a sub-chunk's caves for their cave biomes (CaveBiomes.ts): line
 * floors, walls and ceilings with the biome's rock in noise-shaped patches,
 * fill magma chambers' lava lakes, then decorate - stalactites and
 * stalagmites, crystals, cave plants and fungi, vines, roots and glowworm
 * threads, cobwebs, giant pale mushrooms. Cells in a plain zone (or past a
 * special zone's ragged rim: zone strength against patch noise) get the
 * plain cave dressing. Runs in the generation worker after features and
 * lining, before light.
 *
 * The cave biome is sampled on a world-aligned 4-block column lattice
 * (lazily, only where caves are) and interpolated per cell, so its cost
 * stays small and every sub-chunk reads the same values at a shared face.
 *
 * Floors, ceilings and walls are told apart with the padded cave mask
 * (CaveMask.ts), so the sub-chunk's faces line exactly like its interior.
 * A decoration belongs to the sub-chunk holding its anchor (the air cell
 * next to the rock) and is kept inside it (formation lengths clamp), so
 * nothing is ever cut at a seam. Every choice is a hash of world
 * coordinates: identical in any generation order.
 */
export function dressCaves(chunk: ISubChunkData, mask: Uint8Array, ctx: CaveDressingContext): void {
  const { chunkWorldX, chunkWorldZ, minWorldY } = ctx
  const N = SUB_CHUNK_HEIGHT
  const at = (x: number, y: number, z: number): number => mask[caveMaskIndex(x, y, z)]

  // Surface per column (only columns with cave air matter)
  const surface = new Int32Array(N * N)
  const caveColumn = new Uint8Array(N * N)
  let anyCave = false
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let cave = false
      for (let y = 0; y < N && !cave; y++) {
        const m = at(x, y, z)
        if (m === CAVE_MASK_AIR || m === CAVE_MASK_FLOODED) cave = true
      }
      // Rock beside cave air in the shell still gets lined
      if (!cave) {
        for (let y = 0; y < N && !cave; y++) {
          if (at(x - 1, y, z) === CAVE_MASK_AIR || at(x + 1, y, z) === CAVE_MASK_AIR ||
            at(x, y, z - 1) === CAVE_MASK_AIR || at(x, y, z + 1) === CAVE_MASK_AIR ||
            at(x, y - 1, z) === CAVE_MASK_AIR || at(x, y + 1, z) === CAVE_MASK_AIR) cave = true
        }
      }
      if (!cave) continue
      anyCave = true
      caveColumn[z * N + x] = 1
      surface[z * N + x] = ctx.getHeight(chunkWorldX + x, chunkWorldZ + z)
    }
  }
  if (!anyCave) return

  // Cave biome column lattice (lazy): biome index (-2 not sampled yet, -1 plain zone) and strength
  const L = BIOME_LATTICE
  const lx0 = Math.floor((chunkWorldX - 1) / L)
  const lz0 = Math.floor((chunkWorldZ - 1) / L)
  const LN = Math.floor((chunkWorldX + N) / L) - lx0 + 2
  const latBiome = new Int8Array(LN * LN).fill(-2)
  const latStrength = new Float32Array(LN * LN)
  const sample: CaveBiomeSample = { biome: null, strength: 0 }
  const acc = new Float32Array(CAVE_BIOME_IDS.length)
  let cellStrength = 0
  /** The dressing for world cell (wx, wy, wz); sets cellStrength (0 for plain caves). */
  const specFor = (wx: number, wy: number, wz: number): CaveDressingSpec => {
    const fx = wx / L - lx0, fz = wz / L - lz0
    const i = Math.floor(fx), k = Math.floor(fz)
    const tx = fx - i, tz = fz - k
    acc.fill(0)
    for (let dz = 0; dz <= 1; dz++) {
      for (let dx = 0; dx <= 1; dx++) {
        const idx = (k + dz) * LN + (i + dx)
        if (latBiome[idx] === -2) {
          ctx.caveBiomeAt((lx0 + i + dx) * L, (lz0 + k + dz) * L, sample)
          latBiome[idx] = sample.biome ? CAVE_BIOME_IDS.indexOf(sample.biome) : -1
          latStrength[idx] = sample.strength
        }
        const b = latBiome[idx]
        if (b >= 0) acc[b] += (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz) * latStrength[idx]
      }
    }
    let best = -1
    for (let b = 0; b < acc.length; b++) if (acc[b] > 0 && (best < 0 || acc[b] > acc[best])) best = b
    // A special zone's rim is ragged: strength against patch noise
    if (best < 0 || acc[best] <= patchNoise(wx, wy, wz, 61)) {
      cellStrength = 0
      return PLAIN_CAVE
    }
    cellStrength = acc[best]
    return DRESSINGS[CAVE_BIOME_IDS[best]]
  }

  // 1) Magma chambers' lava lakes: cave air at or below the lava level, in a chamber's core
  if (minWorldY <= MAX_LAVA_LEVEL) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        if (!caveColumn[z * N + x]) continue
        for (let y = 0; y < N && minWorldY + y <= MAX_LAVA_LEVEL; y++) {
          if (at(x, y, z) !== CAVE_MASK_AIR || chunk.getBlockId(x, y, z) !== B.AIR) continue
          const spec = specFor(chunkWorldX + x, minWorldY + y, chunkWorldZ + z)
          if (!spec.lavaLevel || minWorldY + y > spec.lavaLevel || cellStrength < LAVA_MIN_STRENGTH) continue
          chunk.setBlockId(x, y, z, B.LAVA)
          mask[caveMaskIndex(x, y, z)] = CAVE_MASK_FLOODED
        }
      }
    }
  }

  // 2) Lining: rock touching cave air
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (!caveColumn[z * N + x]) continue
      const top = surface[z * N + x] - SURFACE_MARGIN
      const wx = chunkWorldX + x
      const wz = chunkWorldZ + z
      for (let y = 0; y < N; y++) {
        const wy = minWorldY + y
        if (wy > top) break
        if (at(x, y, z) !== CAVE_MASK_ROCK || chunk.getBlockId(x, y, z) !== LINEABLE) continue
        const above = at(x, y + 1, z)
        const below = at(x, y - 1, z)
        const sides = [at(x - 1, y, z), at(x + 1, y, z), at(x, y, z - 1), at(x, y, z + 1)]
        const touchesAir = above === CAVE_MASK_AIR || below === CAVE_MASK_AIR || sides.includes(CAVE_MASK_AIR)
        const touchesLava = above === CAVE_MASK_FLOODED || below === CAVE_MASK_FLOODED || sides.includes(CAVE_MASK_FLOODED)
        if (!touchesAir && !touchesLava) continue
        const spec = specFor(wx, wy, wz)
        if (spec.lavaContact && touchesLava) {
          if (hash(wx, wy, wz, 41) < spec.lavaContact.chance) {
            chunk.setBlockId(x, y, z, spec.lavaContact.id)
            continue
          }
        }
        let lining: SurfaceLining | undefined
        if (above === CAVE_MASK_AIR) lining = spec.floor
        else if (below === CAVE_MASK_AIR) lining = spec.ceiling
        else if (sides.includes(CAVE_MASK_AIR)) lining = spec.wall
        if (!lining) continue
        const patch = patchNoise(wx, wy, wz, 17)
        if (patch > lining.coverage) continue
        chunk.setBlockId(x, y, z, pickWeighted(lining.blocks, patchNoise(wx + 311, wy, wz - 177, 23)))
      }
    }
  }

  // 3) Decorations, anchored on the air cell beside the rock
  const isFreeAir = (x: number, y: number, z: number): boolean =>
    x >= 0 && x < N && y >= 0 && y < N && z >= 0 && z < N &&
    at(x, y, z) === CAVE_MASK_AIR && chunk.getBlockId(x, y, z) === B.AIR
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (!caveColumn[z * N + x]) continue
      const wx = chunkWorldX + x
      const wz = chunkWorldZ + z
      for (let y = 0; y < N; y++) {
        if (!isFreeAir(x, y, z)) continue
        const floor = at(x, y - 1, z) === CAVE_MASK_ROCK
        const ceiling = at(x, y + 1, z) === CAVE_MASK_ROCK
        if (!floor && !ceiling) continue
        const wy = minWorldY + y
        const spec = specFor(wx, wy, wz)
        const depth = surface[z * N + x] - wy
        const roll = hash(wx, wy, wz, 101)
        if (floor && placeDecor(spec.floorDecor, roll, depth, x, y, z, wx, wy, wz, chunk, isFreeAir)) continue
        if (ceiling && placeDecor(spec.ceilingDecor, roll, depth, x, y, z, wx, wy, wz, chunk, isFreeAir)) continue
        if (spec.cornerDecor) {
          let walls = 0
          if (at(x - 1, y, z) === CAVE_MASK_ROCK) walls++
          if (at(x + 1, y, z) === CAVE_MASK_ROCK) walls++
          if (at(x, y, z - 1) === CAVE_MASK_ROCK) walls++
          if (at(x, y, z + 1) === CAVE_MASK_ROCK) walls++
          if (walls >= 2 && hash(wx, wy, wz, 131) < spec.cornerDecor.chance) chunk.setBlockId(x, y, z, spec.cornerDecor.blocks[0])
        }
      }
    }
  }

  // 4) Giant pale mushrooms: whole inside the sub-chunk, so never cut at a seam
  for (let z = 3; z < N - 3; z++) {
    for (let x = 3; x < N - 3; x++) {
      if (!caveColumn[z * N + x]) continue
      const wx = chunkWorldX + x
      const wz = chunkWorldZ + z
      for (let y = 0; y < N - 8; y++) {
        if (!isFreeAir(x, y, z) || at(x, y - 1, z) !== CAVE_MASK_ROCK) continue
        const wy = minWorldY + y
        if (hash(wx, wy, wz, 211) > 0.08) continue
        if (!specFor(wx, wy, wz).giantMushrooms || cellStrength < MUSHROOM_MIN_STRENGTH) continue
        growGiantMushroom(chunk, x, y, z, wx, wy, wz, isFreeAir)
      }
    }
  }
}

/** Roll a floor/ceiling decoration list; true if one was placed. */
function placeDecor(
  list: readonly Decor[], roll: number, depth: number, x: number, y: number, z: number, wx: number, wy: number, wz: number,
  chunk: ISubChunkData, isFreeAir: (x: number, y: number, z: number) => boolean,
): boolean {
  let acc = 0
  for (const decor of list) {
    acc += decor.chance
    if (roll >= acc) continue
    if (decor.maxDepth !== undefined && depth > decor.maxDepth) return false
    const variant = hash(wx, wy, wz, 151)
    const lengthRoll = hash(wx, wy, wz, 161)
    const max = decor.maxLength ?? 1
    let length = 1 + Math.floor(lengthRoll * max)
    if (decor.kind === 'single') {
      chunk.setBlockId(x, y, z, decor.blocks[Math.floor(variant * decor.blocks.length)])
      return true
    }
    if (decor.kind === 'stalagmite') {
      // Grows up: columns under the tip, all inside the sub-chunk
      let free = 0
      while (free < length && isFreeAir(x, y + free, z)) free++
      length = free
      for (let i = 0; i < length - 1; i++) chunk.setBlockId(x, y + i, z, BlockIds.DRIPSTONE_COLUMN)
      chunk.setBlockId(x, y + length - 1, z, BlockIds.STALAGMITE)
      return true
    }
    // Hangs down: stalactites (columns over the tip) and chains
    let free = 0
    while (free < length && isFreeAir(x, y - free, z)) free++
    length = free
    if (decor.kind === 'stalactite') {
      for (let i = 0; i < length - 1; i++) chunk.setBlockId(x, y - i, z, BlockIds.STALACTITE_COLUMN)
      chunk.setBlockId(x, y - length + 1, z, BlockIds.STALACTITE)
      return true
    }
    for (let i = 0; i < length; i++) {
      chunk.setBlockId(x, y - i, z, pickWeighted(decor.chainBlocks ?? [], hash(wx, wy - i, wz, 171)))
    }
    return true
  }
  return false
}

/** A giant pale mushroom on the floor at (x, y, z) if it fits: stem 4-7 tall, domed cap radius 2-3. */
function growGiantMushroom(
  chunk: ISubChunkData, x: number, y: number, z: number, wx: number, wy: number, wz: number,
  isFreeAir: (x: number, y: number, z: number) => boolean,
): void {
  const height = 4 + Math.floor(hash(wx, wy, wz, 221) * 4)
  const radius = 2 + Math.floor(hash(wx, wy, wz, 231) * 2)
  for (let i = 0; i <= height + 1; i++) if (!isFreeAir(x, y + i, z)) return
  const capY = y + height
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dz * dz > radius * radius + 1) continue
      if (!isFreeAir(x + dx, capY, z + dz)) return
    }
  }
  for (let i = 0; i < height; i++) chunk.setBlockId(x, y + i, z, BlockIds.PALE_MUSHROOM_STEM)
  for (let layer = 0; layer <= 1; layer++) {
    const r = radius - layer
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue
        if (isFreeAir(x + dx, capY + layer, z + dz)) chunk.setBlockId(x + dx, capY + layer, z + dz, BlockIds.PALE_MUSHROOM_CAP)
      }
    }
  }
}

/** Andesite and granite: blob noise above this turns stone (about 10% of the rock). */
const BLOB_THRESHOLD = 0.745
/** Blob noise lattice, and the much larger one choosing andesite or granite (blocks). */
const BLOB_CELL = 7
const BLOB_KIND_CELL = 40
/** Blobs stay this deep under the surface (cliff faces keep plain stone) and above the Hell ceiling. */
const BLOB_MIN_DEPTH = 8
const BLOB_MIN_Y = 146

/**
 * Andesite and granite blobs through the overworld's rock (about 10% of
 * the stone, in lumps a few blocks across): every cave wall and every
 * tunnel dug shows them, so plain caves are not one flat grey. Only STONE
 * turns (ores, cave linings and features keep their blocks). A pure function
 * of world position, like the dressing; runs on every surface-layer
 * sub-chunk, caves or not, after dressCaves.
 */
export function scatterRockBlobs(
  chunk: ISubChunkData, ctx: Pick<CaveDressingContext, 'chunkWorldX' | 'chunkWorldZ' | 'minWorldY' | 'getHeight'>,
): void {
  const { chunkWorldX, chunkWorldZ, minWorldY } = ctx
  const N = SUB_CHUNK_HEIGHT
  if (minWorldY + N - 1 < BLOB_MIN_Y) return
  // Blob noise corners for this sub-chunk, then per-axis lattice index + smoothstep weight
  const S = BLOB_CELL
  const i0 = Math.floor(chunkWorldX / S), j0 = Math.floor(minWorldY / S), k0 = Math.floor(chunkWorldZ / S)
  const C = Math.floor((chunkWorldX + N - 1) / S) - i0 + 2
  const corner = new Float32Array(C * C * C)
  for (let k = 0; k < C; k++) {
    for (let j = 0; j < C; j++) {
      for (let i = 0; i < C; i++) corner[(k * C + j) * C + i] = hash(i0 + i, j0 + j, k0 + k, 301)
    }
  }
  const axis = (origin: number, first: number): { idx: Int32Array; w: Float32Array } => {
    const idx = new Int32Array(N)
    const w = new Float32Array(N)
    for (let a = 0; a < N; a++) {
      const f = (origin + a) / S
      const c = Math.floor(f)
      const t = f - c
      idx[a] = c - first
      w[a] = t * t * (3 - 2 * t)
    }
    return { idx, w }
  }
  const ax = axis(chunkWorldX, i0), ay = axis(minWorldY, j0), az = axis(chunkWorldZ, k0)
  for (let z = 0; z < N; z++) {
    const kz = az.idx[z], sz = az.w[z]
    for (let x = 0; x < N; x++) {
      const ix = ax.idx[x], sx = ax.w[x]
      const wx = chunkWorldX + x
      const wz = chunkWorldZ + z
      const top = ctx.getHeight(wx, wz) - BLOB_MIN_DEPTH
      for (let y = 0; y < N; y++) {
        const wy = minWorldY + y
        if (wy > top) break
        if (wy < BLOB_MIN_Y || chunk.getBlockId(x, y, z) !== B.STONE) continue
        const jy = ay.idx[y], sy = ay.w[y]
        const c00 = corner[(kz * C + jy) * C + ix], c10 = corner[(kz * C + jy) * C + ix + 1]
        const c01 = corner[(kz * C + jy + 1) * C + ix], c11 = corner[(kz * C + jy + 1) * C + ix + 1]
        const d00 = corner[((kz + 1) * C + jy) * C + ix], d10 = corner[((kz + 1) * C + jy) * C + ix + 1]
        const d01 = corner[((kz + 1) * C + jy + 1) * C + ix], d11 = corner[((kz + 1) * C + jy + 1) * C + ix + 1]
        const near = (c00 + (c10 - c00) * sx) + ((c01 + (c11 - c01) * sx) - (c00 + (c10 - c00) * sx)) * sy
        const far = (d00 + (d10 - d00) * sx) + ((d01 + (d11 - d01) * sx) - (d00 + (d10 - d00) * sx)) * sy
        if (near + (far - near) * sz <= BLOB_THRESHOLD) continue
        chunk.setBlockId(x, y, z, valueNoise(wx, wy, wz, BLOB_KIND_CELL, 307) < 0.5 ? B.ANDESITE : B.GRANITE)
      }
    }
  }
}
