import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import {
  FACE_DIR,
  Face,
  registerDungeonKit,
  room,
  pillar,
  roofPitched,
  sprinkle,
  stairs,
  walls,
  type Box,
  type DungeonKit,
  type DungeonLayout,
  type LayoutInfo,
  type ModuleContext,
  type ModuleDef,
  type PassContext,
  type PlacedModule,
} from '../../index.ts'
import {
  BONE_KING_INDEX,
  CATACOMBS_KIT_ID,
  GARRISON_GHOUL_DEN,
  GARRISON_GUARD_CRYPT,
  GARRISON_NICHE_AMBUSH,
  GARRISON_PRIEST_SANCTUM,
  GARRISON_WRAITH_HAUNT,
} from './CatacombsConfig.ts'

/**
 * THE CATACOMBS - the Ossuary's procedural dungeon: the Necropolis of the
 * Bone King.
 *
 * Above ground: a walled cemetery precinct on the bone-ash plain - a gate
 * (obelisk / tusk / ruined variant), an avenue of soul candelabra between
 * sunken graves, gravestones scattered over the crypts, and the
 * chapel-mausoleum (the entrance) whose bone spire wears a crown of soul
 * fire. Inside the chapel a grand stair drops into a crypt complex on three
 * underground levels: niche-lined corridors, skull-walled ossuary halls,
 * shrines, ghoul dens, sarcophagus chambers, embalming rooms, priest
 * sanctums, reliquary vaults behind grates, spiral and grand stair descents,
 * and - at the deepest point - the Bone King's throne crypt.
 *
 * Levels: 0 = the surface (chapel nave, annex mausoleums); -1 Ossuary
 * Galleries; -2 Deep Crypts; -3 the Throne Crypt level. Walls are 1-thick
 * force-6 catacomb brick per module (2 between modules); deeper levels are
 * more cracked. Worker-safe: framework, BlockIds and BlockFacing only.
 */

const CS = 9
const FH = 7
/** Avenue length from the chapel door to the precinct gate. */
const AVENUE = 16
/** Plaza margin around the surface buildings. */
const PLAZA_PAD = 4
/** Gate approach path length beyond the precinct wall. */
const APPROACH_LENGTH = 26

const B = BlockIds

const palette = {
  wall: [
    [B.CATACOMB_BRICK, 80],
    [B.CRACKED_CATACOMB_BRICK, 20],
  ],
  deep: [
    [B.CATACOMB_BRICK, 55],
    [B.CRACKED_CATACOMB_BRICK, 45],
  ],
  floor: [
    [B.CATACOMB_TILE, 84],
    [B.CATACOMB_BRICK, 16],
  ],
  ground: [
    [B.BONE_ASH, 78],
    [B.CATACOMB_TILE, 14],
    [B.CRACKED_CATACOMB_BRICK, 8],
  ],
  skull: B.CATACOMB_SKULL_BRICK,
  niche: B.BURIAL_NICHE,
  frieze: B.CATACOMB_FRIEZE,
  pillar: B.CARVED_BONE_PILLAR,
  bone: B.BONE_BLOCK,
  foundation: B.OSSIFIED_ROCK,
  ash: B.BONE_ASH,
  grate: B.CRYPT_GRATE,
  altar: B.CRYPT_ALTAR,
  relic: B.GILDED_RELIQUARY,
  tomb: B.SARCOPHAGUS,
  light: B.SOUL_LANTERN,
} as const

const isAir = (id: number): boolean => id === B.AIR
const isSolidWall = (id: number): boolean => id !== B.AIR
/** Plain wall masonry (not frames, friezes or decor): what linings may replace. */
const isMasonry = (id: number): boolean => id === B.CATACOMB_BRICK || id === B.CRACKED_CATACOMB_BRICK

/** The wall material of a module's level (deeper = more ruined). */
function wallOf(ctx: ModuleContext): string {
  return ctx.level <= -2 ? 'deep' : 'wall'
}

/** Standard crypt room: shell, tile floor, ceiling, frieze-framed doorways. */
function crypt(ctx: ModuleContext, interiorFloors = true): void {
  const w = wallOf(ctx)
  room(ctx, { wall: w, floor: 'floor', ceiling: w, doorFrame: 'frieze', interiorFloors })
}

/** Replace the shell's plain masonry between y0 and y1 with `block` (doorways and their frames stay). */
function lineShell(ctx: ModuleContext, y0: number, y1: number, block: string | number): void {
  const { w, d } = ctx
  ctx.fillIf(0, y0, 0, w - 1, y1, 0, block, isMasonry)
  ctx.fillIf(0, y0, d - 1, w - 1, y1, d - 1, block, isMasonry)
  ctx.fillIf(0, y0, 1, 0, y1, d - 2, block, isMasonry)
  ctx.fillIf(w - 1, y0, 1, w - 1, y1, d - 2, block, isMasonry)
}

/** Bone piles strewn on the floor (y = floorY + 1) where it is open. */
function strewBones(ctx: ModuleContext, chance: number, salt: number, floorY = 0): void {
  sprinkle(ctx, { x0: 1, y0: floorY + 1, z0: 1, x1: ctx.w - 2, y1: floorY + 1, z1: ctx.d - 2 }, B.BONE_PILE, chance, salt, isAir)
}

/** Cobwebs in the upper corners of a room level. */
function cobwebs(ctx: ModuleContext, y: number, chance: number, salt: number): void {
  const { w, d } = ctx
  for (const [x, z] of [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2]]) {
    if (ctx.hash(x, y, z, salt) < chance) ctx.setIf(x, y, z, B.CRYPT_COBWEB, isAir)
  }
}

/** True if the box has no module above its cells (surface roof needed). */
function openAbove(ctx: ModuleContext): boolean {
  const [sx, sy, sz] = ctx.def.size
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (ctx.isCellOccupied(x, sy, z)) return false
  return true
}

// ===========================================================================
// Surface: the chapel-mausoleum (entrance) and its annex tombs
// ===========================================================================

/**
 * Chapel-mausoleum: 3×2 cells, two levels (the nave at the surface, a crypt
 * hall below), the precinct door on the south face of the upper level. A
 * grand stair drops from the nave floor into the lower hall, whose doors
 * lead into the Ossuary Galleries. Pitched roof with gables and a bone
 * spire crowned with soul fire (the landmark).
 */
const chapel: ModuleDef = {
  id: 'chapel',
  size: [3, 2, 2],
  tags: ['entrance'],
  levels: [-1, -1],
  rotations: [0, 1, 2, 3],
  overhang: { up: 35 },
  connectors: [
    { cell: [1, 1, 1], face: Face.South, exterior: true },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.West },
    { cell: [0, 0, 1], face: Face.West },
    { cell: [2, 0, 0], face: Face.East },
    { cell: [2, 0, 1], face: Face.East },
    { cell: [0, 1, 0], face: Face.West, kind: 'annex' },
    { cell: [2, 1, 0], face: Face.East, kind: 'annex' },
  ],
  build(ctx) {
    const { w, d } = ctx // 27 × 14 × 18
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'frieze' })

    // ---- Lower crypt hall (y 1..6): skull-brick walls, bone pillars
    lineShell(ctx, 2, 4, 'skull')
    lineShell(ctx, 5, 5, 'frieze')
    for (const [px, pz] of [[6, 4], [20, 4], [6, 13], [20, 13]]) pillar(ctx, px, pz, 1, 6, 'pillar')
    ctx.light(0, 4, 9)
    ctx.light(w - 1, 4, 9)
    strewBones(ctx, 0.05, 11)

    // ---- Nave (upper level, floor y 7, interior y 8..12)
    // Stairwell: a hole in the nave floor and a 5-wide flight rising south
    ctx.fill(11, 7, 6, 15, 7, 11, B.AIR)
    stairs(ctx, 11, 1, 6, Face.South, 6, 5, 'floor', 'wall', 1)
    // Bone railing around the hole (open toward the door side)
    ctx.fill(10, 8, 5, 16, 8, 5, 'bone')
    ctx.fill(10, 8, 6, 10, 8, 11, 'bone')
    ctx.fill(16, 8, 6, 16, 8, 11, 'bone')
    // Nave colonnade
    for (const pz of [3, 8, 13]) {
      pillar(ctx, 4, pz, 8, 12, 'pillar')
      pillar(ctx, w - 5, pz, 8, 12, 'pillar')
    }
    // Altar under a skull-brick reredos
    ctx.fill(11, 8, 0, 15, 12, 0, 'skull')
    ctx.fill(12, 8, 2, 14, 8, 2, 'altar')
    ctx.set(12, 9, 2, B.GRAVE_CANDLES)
    ctx.set(14, 9, 2, B.GRAVE_CANDLES)
    ctx.set(9, 8, 2, B.SOUL_CANDELABRA)
    ctx.set(17, 8, 2, B.SOUL_CANDELABRA)
    // Frieze band under the nave ceiling, burial niches along the long walls,
    // two soul lanterns in the side walls
    lineShell(ctx, 12, 12, 'frieze')
    ctx.fillIf(0, 9, 1, 0, 10, d - 2, 'niche', isMasonry)
    ctx.fillIf(w - 1, 9, 1, w - 1, 10, d - 2, 'niche', isMasonry)
    ctx.light(0, 11, 8)
    ctx.light(w - 1, 11, 8)
    // Bone ribs hanging under the nave vault
    for (const z of [4, 9, 14]) {
      for (let x = 1; x <= w - 2; x++) ctx.fill(x, Math.abs(x - 13) > 9 ? 11 : 12, z, x, 12, z, 'bone')
    }
    // Sarcophagus pews either side of a skull-paved aisle
    for (const z of [13, 15]) {
      ctx.fill(6, 8, z, 8, 8, z, 'tomb')
      ctx.fill(18, 8, z, 20, 8, z, 'tomb')
    }
    ctx.fill(12, 7, 12, 14, 7, d - 2, 'skull')
    // Side windows (grates) on the upper level's back cells
    ctx.fill(0, 9, 12, 0, 11, 14, 'grate')
    ctx.fill(w - 1, 9, 12, w - 1, 11, 14, 'grate')
    // Front facade: bone posts flanking the door, a skull crest, two windows
    pillar(ctx, 10, d - 1, 8, 13, 'pillar')
    pillar(ctx, 16, d - 1, 8, 13, 'pillar')
    ctx.fill(11, 12, d - 1, 15, 13, d - 1, 'skull')
    ctx.fill(5, 9, d - 1, 6, 11, d - 1, 'grate')
    ctx.fill(20, 9, d - 1, 21, 11, d - 1, 'grate')
    // Corner pillars of bone up the facade
    for (const [cx, cz] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) pillar(ctx, cx, cz, 7, 13, 'bone')

    // ---- Roof: steep gabled roof, ridge running front to back, bone ribs
    // striping both slopes
    roofPitched(ctx, 0, 0, w - 1, d - 1, 14, 'wall', false, 'skull')
    for (const z of [0, 4, 8, 13, d - 1]) {
      for (let i = 0; i <= 13; i++) {
        ctx.set(i, 14 + i, z, 'bone')
        ctx.set(w - 1 - i, 14 + i, z, 'bone')
      }
    }
    ctx.fill(13, 27, 0, 13, 27, d - 1, 'bone') // bone ridge

    // ---- Spire over the front half: a brick tower with bone corner
    // columns and grated belfry, then a bone needle crowned with soul fire
    const tx0 = 11, tz0 = 10
    ctx.fill(tx0, 14, tz0, tx0 + 4, 33, tz0 + 4, 'wall')
    ctx.fill(tx0 + 1, 15, tz0 + 1, tx0 + 3, 32, tz0 + 3, B.AIR)
    for (const [cx, cz] of [[tx0, tz0], [tx0 + 4, tz0], [tx0, tz0 + 4], [tx0 + 4, tz0 + 4]]) pillar(ctx, cx, cz, 14, 36, 'bone')
    for (const y of [24, 25, 26, 30, 31]) {
      ctx.set(tx0 + 2, y, tz0, 'grate')
      ctx.set(tx0 + 2, y, tz0 + 4, 'grate')
      ctx.set(tx0, y, tz0 + 2, 'grate')
      ctx.set(tx0 + 4, y, tz0 + 2, 'grate')
    }
    ctx.fill(tx0 + 1, 33, tz0 + 1, tx0 + 3, 33, tz0 + 3, 'frieze')
    ctx.fill(tx0 + 1, 34, tz0 + 1, tx0 + 3, 40, tz0 + 3, 'bone')
    for (const [cx, cz] of [[tx0 + 1, tz0 + 1], [tx0 + 3, tz0 + 1], [tx0 + 1, tz0 + 3], [tx0 + 3, tz0 + 3]]) pillar(ctx, cx, cz, 34, 41, 'pillar')
    ctx.fill(tx0 + 2, 41, tz0 + 2, tx0 + 2, 47, tz0 + 2, 'pillar')
    ctx.set(tx0 + 2, 44, tz0 + 1, 'bone')
    ctx.set(tx0 + 2, 44, tz0 + 3, 'bone')
    ctx.set(tx0 + 1, 44, tz0 + 2, 'bone')
    ctx.set(tx0 + 3, 44, tz0 + 2, 'bone')
    ctx.light(tx0 + 2, 48, tz0 + 2) // the soul-fire crown
    ctx.light(tx0, 37, tz0)
    ctx.light(tx0 + 4, 37, tz0 + 4)
    ctx.light(tx0 + 4, 37, tz0)
    ctx.light(tx0, 37, tz0 + 4)
  },
}

/** Annex tomb beside the chapel nave (surface): a loot tomb, a ghoul den or a little ossuary. */
const annex: ModuleDef = {
  id: 'annex_tomb',
  size: [1, 1, 1],
  tags: ['annex', 'room'],
  levels: [0, 0],
  maxCount: 2,
  weight: 1.5,
  overhang: { up: 6 },
  connectors: [{ cell: [0, 0, 0], face: Face.South, kind: 'annex' }],
  build(ctx) {
    const variant = ctx.rng.int(0, 2)
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'frieze' })
    for (const [cx, cz] of [[0, 0], [8, 0], [0, 8], [8, 8]]) pillar(ctx, cx, cz, 0, 6, 'pillar')
    lineShell(ctx, 5, 5, 'frieze')
    if (variant === 0) {
      ctx.fill(3, 1, 3, 5, 1, 4, 'tomb')
      ctx.set(4, 2, 3, B.GRAVE_CANDLES)
      ctx.chest(4, 1, 1, { tier: Math.max(1, ctx.tier), facing: BlockFacing.SOUTH })
    } else if (variant === 1) {
      lineShell(ctx, 1, 3, 'niche')
      ctx.garrison(4, 0, 4, GARRISON_GHOUL_DEN)
      strewBones(ctx, 0.15, 5)
    } else {
      lineShell(ctx, 1, 4, 'skull')
      ctx.set(1, 1, 1, B.FUNERARY_URN)
      ctx.set(7, 1, 1, B.FUNERARY_URN)
      ctx.fill(3, 1, 2, 5, 1, 2, 'bone')
      ctx.set(4, 2, 2, B.GRAVE_CANDLES)
      strewBones(ctx, 0.12, 6)
    }
    cobwebs(ctx, 5, 0.6, 7)
    if (openAbove(ctx)) roofPitched(ctx, 0, 0, 8, 8, 7, 'wall', true, 'frieze')
  },
}

// ===========================================================================
// Galleries: corridors
// ===========================================================================

/**
 * Niche corridor cell: a 3-wide passage (4 tall) through solid masonry along
 * the open connectors, its walls lined with burial niches under a frieze
 * band; a soul lantern in the vault. Variants: ash-choked and dark, or a
 * ghoul ambush (garrison in the floor).
 */
function niches(id: string, faces: Face[], weight: number, levels: readonly [number, number], maxCount: number): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: ['corridor'],
    weight,
    maxCount,
    levels,
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    build(ctx) {
      const dark = ctx.rng.chance(0.22)
      const ambush = ctx.depth >= 3 && ctx.rng.chance(0.3)
      const W = wallOf(ctx)
      ctx.fill(0, 0, 0, 8, 6, 8, W)
      ctx.fill(1, 0, 1, 7, 0, 7, 'floor')
      // Channels: the centre and an arm to every open connector
      const channels: Box[] = [{ x0: 3, y0: 1, z0: 3, x1: 5, y1: 4, z1: 5 }]
      for (const c of ctx.connectors) {
        if (!c.open) continue
        if (c.face === Face.North) channels.push({ x0: 3, y0: 1, z0: 0, x1: 5, y1: 4, z1: 2 })
        else if (c.face === Face.South) channels.push({ x0: 3, y0: 1, z0: 6, x1: 5, y1: 4, z1: 8 })
        else if (c.face === Face.East) channels.push({ x0: 6, y0: 1, z0: 3, x1: 8, y1: 4, z1: 5 })
        else if (c.face === Face.West) channels.push({ x0: 0, y0: 1, z0: 3, x1: 2, y1: 4, z1: 5 })
      }
      for (const b of channels) ctx.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, B.AIR)
      // Burial-niche walls and a frieze band hugging every channel
      for (const b of channels) {
        ctx.fillIf(b.x0 - 1, 1, b.z0 - 1, b.x1 + 1, 3, b.z1 + 1, 'niche', isMasonry)
        ctx.fillIf(b.x0 - 1, 4, b.z0 - 1, b.x1 + 1, 4, b.z1 + 1, 'frieze', isMasonry)
      }
      // Re-open the doorways the lining may have touched
      for (const c of ctx.connectors) {
        if (!c.open) continue
        const db = ctx.doorwayBox(c)
        ctx.fill(db.x0, db.y0, db.z0, db.x1, db.y1, db.z1, B.AIR)
      }
      if (dark) {
        // Ash-choked: a drift along the floor, no light
        sprinkle(ctx, { x0: 3, y0: 1, z0: 3, x1: 5, y1: 1, z1: 5 }, 'ash', 0.35, 21, isAir)
        strewBones(ctx, 0.08, 22)
      } else {
        ctx.light(4, 5, 4)
        strewBones(ctx, 0.04, 23)
      }
      if (ambush) ctx.garrison(4, 0, 4, GARRISON_NICHE_AMBUSH)
      if (ctx.hash(4, 4, 4, 24) < 0.5) ctx.setIf(3, 4, 3, B.CRYPT_COBWEB, isAir)
    },
  }
}

// ===========================================================================
// Galleries: rooms
// ===========================================================================

const HALL_CONNECTORS = [
  { cell: [0, 0, 0] as const, face: Face.North },
  { cell: [1, 0, 0] as const, face: Face.North },
  { cell: [1, 0, 0] as const, face: Face.East },
  { cell: [1, 0, 1] as const, face: Face.East },
  { cell: [1, 0, 1] as const, face: Face.South },
  { cell: [0, 0, 1] as const, face: Face.South },
  { cell: [0, 0, 1] as const, face: Face.West },
  { cell: [0, 0, 0] as const, face: Face.West },
]

/** Ossuary hall: skull-brick walls, carved bone pillars, a bone heap or a candlelit tomb; sometimes haunted by wraiths. */
const ossuaryHall: ModuleDef = {
  id: 'ossuary_hall',
  size: [2, 1, 2],
  tags: ['room', 'hall'],
  weight: 2.2,
  maxCount: 5,
  levels: [-2, -1],
  connectors: HALL_CONNECTORS,
  build(ctx) {
    const variant = ctx.rng.int(0, 2)
    const haunted = ctx.depth >= 2 && ctx.rng.chance(0.45)
    const hasChest = ctx.rng.chance(0.35)
    crypt(ctx)
    lineShell(ctx, 1, 4, 'skull')
    lineShell(ctx, 5, 5, 'frieze')
    for (const [px, pz] of [[4, 4], [13, 4], [4, 13], [13, 13]]) {
      pillar(ctx, px, pz, 1, 5, 'pillar')
      ctx.set(px, 1, pz, 'bone')
    }
    if (variant === 0) {
      // A heap of the dead
      ctx.fill(7, 1, 7, 10, 1, 10, 'bone')
      ctx.fill(8, 2, 8, 9, 2, 9, 'bone')
      ctx.set(8, 3, 8, B.BONE_PILE)
      sprinkle(ctx, { x0: 5, y0: 1, z0: 5, x1: 12, y1: 1, z1: 12 }, B.BONE_PILE, 0.35, 31, isAir)
    } else if (variant === 1) {
      // A candlelit tomb
      ctx.fill(8, 1, 7, 9, 1, 10, 'tomb')
      ctx.set(8, 2, 7, B.GRAVE_CANDLES)
      ctx.set(9, 2, 10, B.GRAVE_CANDLES)
      ctx.set(6, 1, 6, B.SOUL_CANDELABRA)
      ctx.set(11, 1, 11, B.SOUL_CANDELABRA)
    } else {
      // Bone racks: rows of stacked bones between the pillars
      for (const z of [7, 10]) {
        ctx.fill(6, 1, z, 11, 2, z, 'bone')
        sprinkle(ctx, { x0: 6, y0: 3, z0: z, x1: 11, y1: 3, z1: z }, B.BONE_PILE, 0.5, 32 + z, isAir)
      }
    }
    strewBones(ctx, 0.05, 33)
    cobwebs(ctx, 5, 0.7, 34)
    ctx.light(8, 6, 3)
    ctx.light(9, 6, 14)
    if (hasChest) ctx.chest(1, 1, 8, { facing: BlockFacing.EAST, tier: Math.max(1, ctx.tier) })
    if (haunted) ctx.garrison(8, 0, 13, GARRISON_WRAITH_HAUNT)
  },
}

/** Shrine: an altar of soul runes, candles, bone pews; a tier-2+ chest before the altar. */
const shrine: ModuleDef = {
  id: 'shrine',
  size: [1, 1, 2],
  tags: ['shrine', 'room'],
  weight: 1.2,
  maxCount: 3,
  levels: [-3, -1],
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
  ],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 5, 5, 'frieze')
    // Reredos of skulls behind the altar, altar with candles
    ctx.fill(2, 1, 0, 6, 4, 0, 'skull')
    ctx.fill(3, 1, 2, 5, 1, 2, 'altar')
    ctx.set(3, 2, 2, B.GRAVE_CANDLES)
    ctx.set(5, 2, 2, B.GRAVE_CANDLES)
    pillar(ctx, 1, 1, 1, 5, 'pillar')
    pillar(ctx, 7, 1, 1, 5, 'pillar')
    ctx.chest(4, 1, 4, { facing: BlockFacing.SOUTH, tier: Math.max(2, ctx.tier) })
    // Pews: sarcophagus lids in two rows
    for (const z of [7, 10]) {
      ctx.fill(1, 1, z, 2, 1, z, 'tomb')
      ctx.fill(6, 1, z, 7, 1, z, 'tomb')
    }
    ctx.fill(1, 1, 13, 2, 1, 13, 'tomb')
    ctx.set(1, 1, 15, B.FUNERARY_URN)
    ctx.light(4, 6, 9)
    cobwebs(ctx, 5, 0.5, 41)
  },
}

/** Sarcophagus chamber: two rows of coffins, urns, candles; a tier-1+ chest. */
const sarcophagusChamber: ModuleDef = {
  id: 'sarcophagus_chamber',
  size: [2, 1, 1],
  tags: ['room', 'tombs'],
  weight: 1.8,
  maxCount: 4,
  levels: [-3, -2],
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [1, 0, 0], face: Face.North },
  ],
  build(ctx) {
    const hasChest = ctx.rng.chance(0.6)
    crypt(ctx)
    lineShell(ctx, 5, 5, 'frieze')
    for (const [x0, z] of [[1, 2], [5, 2], [9, 2], [7, 6], [11, 6], [15, 6]]) {
      ctx.fill(x0, 1, z, x0 + 1, 1, z, 'tomb')
      if (ctx.hash(x0, 1, z, 51) < 0.35) ctx.set(x0, 2, z, B.GRAVE_CANDLES)
    }
    ctx.set(16, 1, 1, B.FUNERARY_URN)
    ctx.set(1, 1, 7, B.FUNERARY_URN)
    if (hasChest) ctx.chest(4, 1, 1, { facing: BlockFacing.SOUTH, tier: Math.max(1, ctx.tier) })
    strewBones(ctx, 0.04, 52)
    cobwebs(ctx, 5, 0.8, 53)
    ctx.light(8, 6, 4)
  },
}

/** Embalming room: a slab table, urns on brick plinths, ash heaps and candles. */
const embalmingRoom: ModuleDef = {
  id: 'embalming_room',
  size: [1, 1, 1],
  tags: ['room'],
  weight: 1.3,
  maxCount: 3,
  levels: [-3, -1],
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 5, 5, 'frieze')
    ctx.fill(4, 1, 4, 5, 1, 4, 'tomb') // the slab
    ctx.set(4, 2, 4, B.BONE_PILE)
    ctx.set(5, 2, 4, B.GRAVE_CANDLES)
    for (const x of [1, 3, 5, 7]) {
      ctx.set(x, 1, 1, 'wall')
      ctx.set(x, 2, 1, B.FUNERARY_URN)
    }
    ctx.set(7, 1, 7, B.FUNERARY_URN)
    sprinkle(ctx, { x0: 1, y0: 1, z0: 5, x1: 7, y1: 1, z1: 7 }, 'ash', 0.25, 61, isAir)
    cobwebs(ctx, 5, 0.8, 62)
  },
}

// ===========================================================================
// Garrisons
// ===========================================================================

/** Ghoul den: walls of burial niches, bones everywhere, almost no light - crypt ghouls lurk. */
const ghoulDen: ModuleDef = {
  id: 'ghoul_den',
  size: [2, 1, 1],
  tags: ['garrison', 'room'],
  weight: 1.6,
  maxCount: 3,
  minDepth: 2,
  levels: [-3, -2],
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.South },
  ],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 1, 3, 'niche')
    lineShell(ctx, 4, 5, 'deep')
    strewBones(ctx, 0.2, 71)
    sprinkle(ctx, { x0: 1, y0: 1, z0: 1, x1: 16, y1: 1, z1: 7 }, 'ash', 0.08, 72, isAir)
    cobwebs(ctx, 5, 0.9, 73)
    ctx.set(9, 1, 1, B.GRAVE_CANDLES) // one guttering candle
    ctx.garrison(9, 0, 4, GARRISON_GHOUL_DEN)
  },
}

/** Priest sanctum: a ritual ring of candles around an altar, where a hollow priest and its skeletons wait. */
const priestSanctum: ModuleDef = {
  id: 'priest_sanctum',
  size: [1, 1, 2],
  tags: ['garrison', 'room'],
  weight: 1.4,
  maxCount: 2,
  minDepth: 3,
  levels: [-3, -2],
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 0], face: Face.North },
  ],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 1, 4, 'skull')
    lineShell(ctx, 5, 5, 'frieze')
    for (const [x, z] of [[1, 8], [7, 8], [4, 5], [4, 12], [2, 6], [6, 6], [2, 11], [6, 11]]) ctx.set(x, 1, z, B.GRAVE_CANDLES)
    ctx.set(1, 1, 1, B.FUNERARY_URN)
    ctx.set(7, 1, 16, B.FUNERARY_URN)
    ctx.garrison(4, 0, 9, GARRISON_PRIEST_SANCTUM)
    ctx.light(4, 6, 3)
    ctx.light(4, 6, 14)
  },
}

/** Guard crypt: skeleton racks of stacked bones; the dead stand watch. */
const guardCrypt: ModuleDef = {
  id: 'guard_crypt',
  size: [1, 1, 1],
  tags: ['garrison', 'room'],
  weight: 1.4,
  maxCount: 3,
  minDepth: 1,
  levels: [-2, -1],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.South },
  ],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 5, 5, 'frieze')
    for (const [x, z] of [[1, 2], [7, 2], [1, 6], [7, 6]]) {
      ctx.fill(x, 1, z, x, 3, z, 'bone')
      ctx.set(x, 4, z, B.BONE_PILE)
    }
    ctx.set(1, 1, 4, B.FUNERARY_URN)
    ctx.set(7, 1, 4, B.FUNERARY_URN)
    strewBones(ctx, 0.06, 81)
    ctx.garrison(4, 0, 4, GARRISON_GUARD_CRYPT)
    ctx.light(4, 6, 4)
  },
}

// ===========================================================================
// Descents
// ===========================================================================

/** Grand stair: a 7-wide flight between frieze-banded walls down one level. */
const grandStair: ModuleDef = {
  id: 'grand_stair',
  size: [1, 2, 2],
  tags: ['stairs'],
  weight: 1.2,
  maxCount: 3,
  levels: [-3, -2],
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 1, 0], face: Face.North },
  ],
  build(ctx) {
    const W = wallOf(ctx)
    room(ctx, { wall: W, floor: 'floor', ceiling: W, interiorFloors: false, doorFrame: 'frieze' })
    // Upper landing (z 1..7) on solid masonry
    ctx.fill(1, 1, 1, 7, 6, 7, W)
    ctx.fill(1, 7, 1, 7, 7, 7, 'floor')
    stairs(ctx, 1, 1, 13, Face.North, 6, 7, 'floor', W, 1)
    // Frieze bands down both side walls, lanterns at the foot and the head
    for (let z = 8; z <= 16; z++) {
      const y = Math.max(5, 19 - z)
      ctx.setIf(0, y, z, 'frieze', isSolidWall)
      ctx.setIf(8, y, z, 'frieze', isSolidWall)
    }
    lineShell(ctx, 12, 12, 'frieze')
    ctx.light(0, 3, 15)
    ctx.light(8, 10, 3)
  },
}

/** Spiral descent: steps turning around a bone-and-brick core from the lower door to the upper landing. */
const spiralDescent: ModuleDef = {
  id: 'spiral_descent',
  size: [1, 2, 1],
  tags: ['stairs'],
  weight: 1,
  maxCount: 2,
  levels: [-3, -2],
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 1, 0], face: Face.North },
  ],
  build(ctx) {
    const W = wallOf(ctx)
    room(ctx, { wall: W, floor: 'floor', ceiling: W, interiorFloors: false, doorFrame: 'frieze' })
    // Core: bone pillar shell around brick, soul lanterns in its faces
    ctx.fill(2, 1, 2, 6, 12, 6, 'pillar')
    ctx.fill(3, 1, 3, 5, 12, 5, W)
    ctx.light(6, 4, 4)
    ctx.light(4, 10, 6)
    // Steps: west along the south row, then north up the west side
    const path: Array<[number, number]> = [[2, 7], [1, 7], [1, 6], [1, 5], [1, 4], [1, 3], [1, 2]]
    path.forEach(([x, z], i) => ctx.set(x, 1 + i, z, 'floor'))
    // Landing across the north row; railing over the open east side
    ctx.fill(1, 7, 1, 7, 7, 1, 'floor')
    ctx.fill(7, 1, 2, 7, 8, 2, 'pillar')
    lineShell(ctx, 12, 12, 'frieze')
  },
}

/**
 * The Bone Well: the necropolis's great descent - a 21-block shaft from the
 * Ossuary Galleries (level -1) to the deepest level (-3), with a stepped
 * ramp of tiles winding down two walls behind a parapet, a landing and door
 * on the Deep Crypts level (-2), and at the bottom a mound of bones under a
 * soul lantern hung on a chain of vertebrae. One per necropolis; it
 * guarantees the throne level is reached.
 */
const boneWell: ModuleDef = {
  id: 'bone_well',
  size: [2, 3, 2],
  tags: ['stairs', 'well'],
  weight: 2.5,
  minCount: 1,
  maxCount: 1,
  minDepth: 3,
  levels: [-3, -3],
  connectors: [
    { cell: [0, 2, 0], face: Face.North },
    { cell: [1, 1, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  build(ctx) {
    const W = 'deep'
    room(ctx, { wall: W, floor: 'floor', ceiling: W, interiorFloors: false, doorFrame: 'frieze' })
    // Skull-lined shaft with frieze bands at every level
    lineShell(ctx, 1, 19, 'skull')
    lineShell(ctx, 5, 5, 'frieze')
    lineShell(ctx, 12, 12, 'frieze')
    lineShell(ctx, 19, 19, 'frieze')
    // Top landing (level -1, floor y 14) on a masonry block, parapet toward the pit
    ctx.fill(1, 1, 1, 7, 13, 4, W)
    ctx.fill(1, 14, 1, 7, 14, 4, 'floor')
    ctx.fill(1, 1, 5, 7, 15, 5, W)
    // North ramp: x 8..13 down from y 13 to 8 (3 wide along the north wall)
    for (let x = 8; x <= 13; x++) {
      const y = 21 - x
      ctx.fill(x, 1, 1, x, y - 1, 3, W)
      ctx.fill(x, y, 1, x, y, 3, 'floor')
      ctx.fill(x, 1, 4, x, y + 1, 4, W)
    }
    // Middle landing (level -2, floor y 7) before the east door
    ctx.fill(14, 1, 1, 16, 6, 6, W)
    ctx.fill(14, 7, 1, 16, 7, 6, 'floor')
    ctx.fill(13, 1, 5, 13, 8, 6, W)
    // East ramp: z 7..12 down from y 6 to 1
    for (let z = 7; z <= 12; z++) {
      const y = 13 - z
      if (y > 1) ctx.fill(14, 1, z, 16, y - 1, z, W)
      ctx.fill(14, y, z, 16, y, z, 'floor')
      ctx.fill(13, 1, z, 13, y + 1, z, W)
    }
    // The bone mound at the bottom of the well
    ctx.fill(3, 1, 8, 9, 1, 14, 'bone')
    ctx.fill(4, 2, 9, 8, 2, 13, 'bone')
    ctx.fill(5, 3, 10, 7, 3, 12, 'bone')
    ctx.set(6, 4, 11, 'skull')
    sprinkle(ctx, { x0: 1, y0: 1, z0: 6, x1: 12, y1: 1, z1: 16 }, B.BONE_PILE, 0.22, 111, isAir)
    // A lantern hung on a chain of vertebrae over the pit
    ctx.fill(6, 15, 11, 6, 19, 11, 'pillar')
    ctx.light(6, 14, 11)
    ctx.light(17, 3, 15)
    cobwebs(ctx, 19, 0.8, 112)
  },
}

// ===========================================================================
// Vaults, caps and the throne crypt
// ===========================================================================

/** Reliquary vault: behind a crypt grate with one squeeze gap - gilded reliquaries guard a tier-3 chest. */
const reliquaryVault: ModuleDef = {
  id: 'reliquary_vault',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 2,
  minDepth: 5,
  levels: [-3, -2],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    crypt(ctx)
    lineShell(ctx, 1, 4, 'skull')
    lineShell(ctx, 5, 5, 'frieze')
    // The grate, with a 1-wide, 2-tall gap
    ctx.fill(1, 1, 5, 7, 5, 5, 'grate')
    ctx.fill(4, 1, 5, 4, 2, 5, B.AIR)
    ctx.chest(4, 1, 2, { facing: BlockFacing.SOUTH, tier: 3 })
    ctx.set(2, 1, 1, 'relic')
    ctx.set(6, 1, 1, 'relic')
    ctx.set(1, 1, 1, B.GOLD_BLOCK)
    ctx.set(7, 1, 1, B.GOLD_BLOCK)
    ctx.set(2, 2, 1, B.GRAVE_CANDLES)
    ctx.set(6, 2, 1, B.GRAVE_CANDLES)
    ctx.light(4, 6, 3)
    cobwebs(ctx, 5, 0.6, 91)
  },
}

/** Burial alcove (cap): a short niche passage ending in a skull wall; sometimes a forgotten chest. */
const burialAlcove: ModuleDef = {
  id: 'burial_alcove',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1.5,
  maxCount: 8,
  levels: [-3, -1],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    const hasChest = ctx.rng.chance(0.3)
    const W = wallOf(ctx)
    ctx.fill(0, 0, 0, 8, 6, 8, W)
    ctx.fill(3, 1, 4, 5, 4, 8, B.AIR)
    ctx.fillIf(2, 1, 3, 6, 3, 8, 'niche', isMasonry)
    ctx.fill(3, 1, 3, 5, 4, 3, 'skull')
    ctx.fillIf(2, 4, 3, 6, 4, 8, 'frieze', isMasonry)
    ctx.set(4, 1, 4, B.GRAVE_CANDLES)
    if (hasChest) {
      // A step back from the skull wall: loot tables read the richest tier
      // signature in the chest's 3x3x3, and skull brick is tier 1's
      ctx.chest(4, 1, 5, { facing: BlockFacing.SOUTH })
      ctx.set(3, 1, 6, B.BONE_PILE)
    } else {
      ctx.set(4, 1, 5, B.BONE_PILE)
    }
  },
}

/** Caved-in passage (cap): rubble and bone ash choke a corridor a few blocks in. */
const cavedIn: ModuleDef = {
  id: 'caved_in',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 4,
  levels: [-3, -1],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    ctx.fill(0, 0, 0, 8, 6, 8, 'deep')
    ctx.fill(3, 1, 3, 5, 4, 8, B.AIR)
    // Rubble slope: ash rising toward the collapse
    ctx.fill(3, 1, 3, 5, 3, 4, 'ash')
    ctx.fill(3, 1, 5, 5, 2, 5, 'ash')
    ctx.fill(3, 1, 6, 5, 1, 6, 'ash')
    ctx.set(4, 2, 6, B.BONE_PILE)
    ctx.fill(3, 4, 3, 5, 4, 5, B.CRACKED_CATACOMB_BRICK)
  },
}

/**
 * The Throne Crypt (boss): the deepest vault of the necropolis - a nave of
 * carved bone pillars under hanging bone ribs, sarcophagi of dead kings
 * along the walls, a two-step dais, the Bone King's throne with a skull
 * crown and soul braziers, and his altar (GUARDIAN_SPAWNER, index 2) on
 * the dais front. The reward chest appears on the altar.
 */
const throneCrypt: ModuleDef = {
  id: 'throne_crypt',
  size: [3, 2, 3],
  tags: ['boss'],
  levels: [-3, -3],
  connectors: [{ cell: [1, 0, 2], face: Face.South }],
  build(ctx) {
    const { w } = ctx // 27 × 14 × 27
    room(ctx, { wall: 'deep', floor: 'floor', ceiling: 'deep', interiorFloors: false, doorFrame: 'frieze' })
    lineShell(ctx, 1, 6, 'skull')
    lineShell(ctx, 7, 7, 'frieze')
    // Bone ribs hanging under the vault, every 6 blocks along the nave
    for (const z of [4, 10, 16, 22]) {
      for (let x = 1; x <= w - 2; x++) {
        const u = (x - 13) / 12
        const drop = Math.round(3 * (1 - u * u))
        ctx.fill(x, 12 - (3 - drop), z, x, 12, z, 'bone')
      }
    }
    // Two rows of 2×2 carved pillars with soul-lantern bands
    for (const pz of [7, 13, 19]) {
      pillar(ctx, 5, pz, 1, 12, 'pillar', 2)
      pillar(ctx, w - 7, pz, 1, 12, 'pillar', 2)
    }
    ctx.light(5, 6, 13)
    ctx.light(w - 6, 6, 13)
    // Sarcophagi of past kings along the side walls
    for (const z of [9, 15, 21]) {
      ctx.fill(1, 1, z, 1, 1, z + 1, 'tomb')
      ctx.fill(w - 2, 1, z, w - 2, 1, z + 1, 'tomb')
      ctx.set(1, 2, z, B.GRAVE_CANDLES)
      ctx.set(w - 2, 2, z + 1, B.GRAVE_CANDLES)
    }
    // Dais and throne at the north end
    ctx.fill(7, 1, 1, 19, 1, 8, 'floor')
    ctx.fill(9, 2, 1, 17, 2, 4, 'floor')
    ctx.fill(12, 3, 1, 14, 8, 1, 'bone') // backrest
    ctx.set(13, 9, 1, 'skull')
    ctx.set(12, 9, 1, 'bone')
    ctx.set(14, 9, 1, 'bone')
    ctx.light(13, 10, 1) // the crown's soul gem
    ctx.set(13, 3, 2, 'bone') // seat
    ctx.fill(12, 3, 2, 12, 4, 2, 'bone') // arms
    ctx.fill(14, 3, 2, 14, 4, 2, 'bone')
    // Soul braziers flanking the throne
    for (const x of [10, 16]) {
      ctx.set(x, 3, 1, 'bone')
      ctx.light(x, 4, 1)
    }
    ctx.guardian(13, 2, 7, BONE_KING_INDEX)
    strewBones(ctx, 0.04, 101)
    cobwebs(ctx, 12, 0.9, 102)
  },
}

// ===========================================================================
// Passes: the precinct
// ===========================================================================

interface PrecinctFrame {
  /** Forward (out of the chapel door) and right unit vectors. */
  readonly fx: number
  readonly fz: number
  readonly rx: number
  readonly rz: number
  /** World block just outside the chapel door (floor + 1). */
  readonly ex: number
  readonly ez: number
  /** Plaza rectangle (world, inclusive). */
  readonly x0: number
  readonly z0: number
  readonly x1: number
  readonly z1: number
  /** Distance (blocks) from the door point to the front wall line. */
  readonly front: number
}

function precinctFrame(L: DungeonLayout): PrecinctFrame {
  const [fx, , fz] = FACE_DIR[L.entrance.face]
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const m of L.modules) {
    if (m.cell[1] > 0 || m.cell[1] + m.size[1] <= 0) continue
    x0 = Math.min(x0, m.box.x0)
    z0 = Math.min(z0, m.box.z0)
    x1 = Math.max(x1, m.box.x1)
    z1 = Math.max(z1, m.box.z1)
  }
  x0 -= PLAZA_PAD
  z0 -= PLAZA_PAD
  x1 += PLAZA_PAD
  z1 += PLAZA_PAD
  if (fx > 0) x1 += AVENUE
  else if (fx < 0) x0 -= AVENUE
  else if (fz > 0) z1 += AVENUE
  else z0 -= AVENUE
  const ex = L.entrance.x
  const ez = L.entrance.z
  const front = fx > 0 ? x1 - ex : fx < 0 ? ex - x0 : fz > 0 ? z1 - ez : ez - z0
  return { fx, fz, rx: -fz, rz: fx, ex, ez, x0, z0, x1, z1, front }
}

/**
 * World x/z box of everything the surface precinct draws (walls, corner
 * obelisks, gate, approach) - other Ossuary features keep out of it.
 */
export function catacombsPrecinctBox(L: DungeonLayout): { x0: number; z0: number; x1: number; z1: number } {
  const f = precinctFrame(L)
  const reach = APPROACH_LENGTH + 4
  return {
    x0: f.x0 - 2 - (f.fx < 0 ? reach : 0),
    z0: f.z0 - 2 - (f.fz < 0 ? reach : 0),
    x1: f.x1 + 2 + (f.fx > 0 ? reach : 0),
    z1: f.z1 + 2 + (f.fz > 0 ? reach : 0),
  }
}

/** Forward/lateral offsets of a world column in the precinct frame. */
function frameCoords(f: PrecinctFrame, x: number, z: number): [number, number] {
  return [(x - f.ex) * f.fx + (z - f.ez) * f.fz, (x - f.ex) * f.rx + (z - f.ez) * f.rz]
}

function frameWorld(f: PrecinctFrame, a: number, b: number): [number, number] {
  return [f.ex + f.fx * a + f.rx * b, f.ez + f.fz * a + f.rz * b]
}

/** Gate variant of a necropolis: 0 obelisks, 1 tusks, 2 ruined (pure, the same in every pass). */
function gateVariantOf(ctx: PassContext): number {
  const L = ctx.layout
  return Math.min(2, Math.floor(ctx.hash(L.anchorX, 0, L.anchorZ, 241) * 3))
}

/**
 * Foundation pre-pass (before any module, so the modules overwrite whatever
 * it leaves in their boxes): level the plaza (fill dips with ossified rock,
 * cut into dunes, lay the yard), heap barrows over crypts the dunes leave
 * bare, and lay the approach from the gate over the barrows (never down
 * into a crypt) - plus the ruined gate's fallen obelisk.
 */
function foundationPass(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const f = precinctFrame(L)
  const x0 = Math.max(f.x0, clip.x0), x1 = Math.min(f.x1, clip.x1)
  const z0 = Math.max(f.z0, clip.z0), z1 = Math.min(f.z1, clip.z1)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const ground = ctx.terrainHeight(x, z)
      if (ground < L.baseY - 1) ctx.fill(x, Math.max(ground + 1, L.baseY - 30), z, x, L.baseY - 1, z, 'foundation')
      ctx.set(x, L.baseY, z, 'ground')
      // Cut into higher ground, taking whatever grew on it (blooms, bone piles) too
      if (ground > L.baseY) ctx.fill(x, L.baseY + 1, z, x, Math.min(ground + 3, L.baseY + 24), z, B.AIR)
    }
  }
  buryCrypts(ctx, f)
  gateApproach(ctx, f)
  if (gateVariantOf(ctx) === 2) {
    // The ruined gate's fallen obelisk, lying outward on whatever ground is there
    for (let a = 1; a <= 7; a++) {
      for (const db of [0, 1]) {
        const [x, z] = frameWorld(f, f.front + a, 6 + db)
        ctx.set(x, surfaceAt(ctx, f, x, z) + 1, z, 'bone')
      }
    }
  }
}

/** Exterior pass (after the modules): precinct wall, gate, avenue, yard graves, obelisks, gravestones, lights. */
function exteriorPass(ctx: PassContext): void {
  const L = ctx.layout
  const f = precinctFrame(L)
  const y = L.baseY
  const gateVariant = gateVariantOf(ctx)
  if (ctx.dryRun) {
    lightMarkers(ctx, f, y, gateVariant)
    return
  }

  // ---- Avenue: tiles from the door to the gate, candelabra pairs
  for (let a = 0; a <= f.front; a++) {
    for (let b = -2; b <= 2; b++) {
      const [x, z] = frameWorld(f, a, b)
      ctx.set(x, y, z, B.CATACOMB_TILE)
      ctx.fill(x, y + 1, z, x, y + 5, z, B.AIR)
    }
  }

  // ---- Yard graves (lattice of 4, off the avenue, inside the walls)
  for (let x = f.x0 + 2; x <= f.x1 - 2; x++) {
    for (let z = f.z0 + 2; z <= f.z1 - 2; z++) {
      if (((x % 4) + 4) % 4 !== 0 || ((z % 4) + 4) % 4 !== 0) continue
      const [a, b] = frameCoords(f, x, z)
      if (Math.abs(b) <= 4 && a >= -2) continue
      if (insideSurfaceModule(L, x, z, 2)) continue
      if (ctx.hash(x, y, z, 201) >= 0.55) continue
      const hx = x + f.fx, hz = z + f.fz
      if (insideSurfaceModule(L, hx, hz, 2)) continue
      ctx.set(x, y, z, 'tomb')
      ctx.set(hx, y, hz, 'tomb')
      ctx.set(x - f.fx, y + 1, z - f.fz, ctx.hash(x, y, z, 202) < 0.5 ? 'bone' : 'pillar') // headstone
      if (ctx.hash(x, y, z, 203) < 0.2) ctx.set(hx, y + 1, hz, B.GRAVE_CANDLES)
      else if (ctx.hash(x, y, z, 204) < 0.3) ctx.set(hx, y + 1, hz, B.BONE_PILE)
    }
  }

  // ---- Precinct wall with bone posts and a bone coping, gate gap on the front wall
  const wallTop = y + 4
  walls(ctx, { x0: f.x0, y0: y + 1, z0: f.z0, x1: f.x1, y1: wallTop, z1: f.z1 }, 'wall')
  walls(ctx, { x0: f.x0, y0: wallTop, z0: f.z0, x1: f.x1, y1: wallTop, z1: f.z1 }, 'bone')
  perimeter(f, (x, z, i) => {
    if (i % 6 !== 0) return
    ctx.fill(x, y + 1, z, x, y + 6, z, 'pillar')
  })
  // Corner obelisks with soul-fire caps
  for (const [cx, cz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) {
    ctx.fill(cx - 1, y + 1, cz - 1, cx + 1, y + 7, cz + 1, 'bone')
    ctx.fill(cx, y + 8, cz, cx, y + 10, cz, 'pillar')
  }
  // Ruined stretches of wall (never through a post: its top would be left floating)
  perimeter(f, (x, z, i) => {
    if (i % 6 !== 0 && ctx.hash(x, y, z, 211) < 0.12) ctx.fill(x, wallTop - 1, z, x, wallTop, z, B.AIR)
    if (ctx.hash(x, y, z, 212) < 0.08) ctx.set(x, y + 1, z, 'ash')
  })

  // ---- Gate (cleared to the top of the wall posts, y + 6)
  for (let b = -3; b <= 3; b++) {
    const [x, z] = frameWorld(f, f.front, b)
    ctx.fill(x, y + 1, z, x, y + 6, z, B.AIR)
    ctx.set(x, y, z, B.CATACOMB_TILE)
  }
  if (gateVariant === 0) obeliskGate(ctx, f, y)
  else if (gateVariant === 1) tuskGate(ctx, f, y)
  else ruinedGate(ctx, f, y)

  // ---- Gravestones over the crypts (outside the precinct, on ground that covers them)
  for (const m of L.modules) {
    if (m.cell[1] >= 0) continue
    for (let x = m.box.x0; x <= m.box.x1; x++) {
      for (let z = m.box.z0; z <= m.box.z1; z++) {
        if (((x % 7) + 7) % 7 !== 3 || ((z % 7) + 7) % 7 !== 3) continue
        if (x >= f.x0 - 1 && x <= f.x1 + 1 && z >= f.z0 - 1 && z <= f.z1 + 1) continue
        if (ctx.hash(x, 0, z, 221) >= 0.3) continue
        const ty = ctx.terrainHeight(x, z)
        if (ty <= m.box.y1 + 1) continue
        const sy = surfaceAt(ctx, f, x, z)
        ctx.set(x, sy + 1, z, 'bone')
        if (ctx.hash(x, 0, z, 222) < 0.45) ctx.set(x, sy + 2, z, 'bone')
        if (ctx.hash(x, 0, z, 223) < 0.3) ctx.setIf(x + 1, sy + 1, z, B.SOUL_BLOOM, isAir)
      }
    }
  }

  // ---- Lights (same markers as the dry run)
  lightMarkers(ctx, f, y, gateVariant)
}

/** How far (blocks) a barrow slopes out from the crypt it covers. */
const BARROW_SLOPE = 3

/** Is the column inside the precinct (walls included, plus one)? */
function inPrecinct(f: PrecinctFrame, x: number, z: number): boolean {
  return x >= f.x0 - 1 && x <= f.x1 + 1 && z >= f.z0 - 1 && z <= f.z1 + 1
}

/** Top of the barrow over a column (-Infinity where there is none): one above a crypt roof, sloping 1 per block. */
function barrowTop(L: LayoutInfo, f: PrecinctFrame, x: number, z: number): number {
  if (inPrecinct(f, x, z)) return -Infinity
  let top = -Infinity
  for (const m of L.modules) {
    if (m.cell[1] + m.size[1] > 0) continue
    const dist = Math.max(m.box.x0 - x, x - m.box.x1, m.box.z0 - z, z - m.box.z1, 0)
    if (dist <= BARROW_SLOPE) top = Math.max(top, m.box.y1 + 1 - dist)
  }
  return top
}

/** Surface height outside the precinct once the barrows are heaped: terrain or barrow, whichever is higher. */
function surfaceAt(ctx: PassContext, f: PrecinctFrame, x: number, z: number): number {
  return Math.max(ctx.terrainHeight(x, z), barrowTop(ctx.layout, f, x, z))
}

/**
 * Bury exposed crypts: where the terrain dips below an underground module's
 * roof, heap bone ash over it (one block above the roof, sloping down one
 * per block around it) - burial mounds instead of bare brick boxes. Runs in
 * the foundation pre-pass, so the crypts themselves overwrite the ash in
 * their boxes. Never in the precinct; per sub-chunk (clip) only.
 */
function buryCrypts(ctx: PassContext, f: PrecinctFrame): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  for (const m of L.modules) {
    if (m.cell[1] + m.size[1] > 0) continue
    const x0 = Math.max(m.box.x0 - BARROW_SLOPE, clip.x0), x1 = Math.min(m.box.x1 + BARROW_SLOPE, clip.x1)
    const z0 = Math.max(m.box.z0 - BARROW_SLOPE, clip.z0), z1 = Math.min(m.box.z1 + BARROW_SLOPE, clip.z1)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (inPrecinct(f, x, z)) continue
        const dist = Math.max(m.box.x0 - x, x - m.box.x1, m.box.z0 - z, z - m.box.z1, 0)
        const top = Math.min(m.box.y1 + 1 - dist, clip.y1)
        // Skip when the barrow top lies below this sub-chunk (an inverted range must write nothing)
        const y0 = Math.max(ctx.terrainHeight(x, z) + 1, clip.y0)
        if (y0 <= top) ctx.fillIf(x, y0, z, x, top, z, 'ash', isAir)
      }
    }
  }
}

/**
 * The path out of the gate (5 wide, up to APPROACH_LENGTH): follows the
 * surface (terrain and barrows) one block up or down per block - a
 * causeway on ossified rock over dips, a trench through rises - and stops
 * once it meets the ground at its own level. Pre-pass: crypts it crosses
 * overwrite its supports, and it never steps down below a barrow's crest.
 */
function gateApproach(ctx: PassContext, f: PrecinctFrame): void {
  const L = ctx.layout
  const half = 2
  const levels: number[] = []
  let level = L.baseY
  for (let i = 0; i < APPROACH_LENGTH; i++) {
    let ground = -Infinity
    for (let b = -half; b <= half; b++) {
      const [x, z] = frameWorld(f, f.front + 1 + i, b)
      ground = Math.max(ground, surfaceAt(ctx, f, x, z))
    }
    if (i > 0) {
      if (ground < level) level = Math.max(ground, level - 1)
      else if (ground > level) level = Math.min(ground, level + 1)
    }
    levels.push(level)
    if (i > 2 && ground === level) break
  }
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    for (let b = -half; b <= half; b++) {
      const [x, z] = frameWorld(f, f.front + 1 + i, b)
      const ground = ctx.terrainHeight(x, z)
      if (ground < lv - 1) ctx.fill(x, Math.max(ground + 1, lv - 48), z, x, lv - 1, z, 'foundation')
      ctx.set(x, lv, z, B.CATACOMB_TILE)
      // An open cut up to the surface: a 4-tall tunnel would leave the ground
      // (or barrow) above it hanging over the path
      ctx.fill(x, lv + 1, z, x, Math.max(lv + 4, surfaceAt(ctx, f, x, z)), z, B.AIR)
    }
  }
}

/** Every light the exterior pass places (called in the dry run too, so markers match). */
function lightMarkers(ctx: PassContext, f: PrecinctFrame, y: number, gateVariant: number): void {
  for (let a = 4; a < f.front - 2; a += 6) {
    for (const b of [-3, 3]) {
      const [x, z] = frameWorld(f, a, b)
      ctx.set(x, y + 1, z, B.SOUL_CANDELABRA)
    }
  }
  for (const [cx, cz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) ctx.light(cx, y + 11, cz)
  if (gateVariant === 0) {
    for (const b of [-5, 5]) {
      const [x, z] = frameWorld(f, f.front, b)
      ctx.light(x, y + 11, z)
    }
  }
}

/** Walk the plaza rectangle's perimeter (index = position along it). */
function perimeter(f: PrecinctFrame, visit: (x: number, z: number, i: number) => void): void {
  let i = 0
  for (let x = f.x0; x <= f.x1; x++) visit(x, f.z0, i++)
  for (let z = f.z0 + 1; z <= f.z1; z++) visit(f.x1, z, i++)
  for (let x = f.x1 - 1; x >= f.x0; x--) visit(x, f.z1, i++)
  for (let z = f.z1 - 1; z > f.z0; z--) visit(f.x0, z, i++)
}

function insideSurfaceModule(L: LayoutInfo, x: number, z: number, pad: number): boolean {
  for (const m of L.modules) {
    if (m.cell[1] > 0 || m.cell[1] + m.size[1] <= 0) continue
    if (x >= m.box.x0 - pad && x <= m.box.x1 + pad && z >= m.box.z0 - pad && z <= m.box.z1 + pad) return true
  }
  return false
}

/** Gate A: twin bone obelisks under a frieze lintel and a skull crest. */
function obeliskGate(ctx: PassContext, f: PrecinctFrame, y: number): void {
  for (const b of [-5, 5]) {
    for (const db of [0, b > 0 ? 1 : -1]) {
      for (const da of [0, 1]) {
        const [x, z] = frameWorld(f, f.front + da - 1, b + db)
        ctx.fill(x, y + 1, z, x, y + 9, z, 'bone')
      }
    }
    const [tx, tz] = frameWorld(f, f.front, b)
    ctx.set(tx, y + 10, tz, 'pillar')
  }
  for (let b = -4; b <= 4; b++) {
    const [x, z] = frameWorld(f, f.front, b)
    ctx.set(x, y + 6, z, 'frieze')
    if (Math.abs(b) <= 1) ctx.set(x, y + 7, z, 'skull')
  }
}

/** Gate B: two colossal tusks curving up from either side and crossing over the path. */
function tuskGate(ctx: PassContext, f: PrecinctFrame, y: number): void {
  for (const side of [-1, 1]) {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const b = side * Math.round(6 - 7 * t)
      const up = Math.round(11 * Math.sin(t * Math.PI * 0.62))
      const [x, z] = frameWorld(f, f.front, b)
      ctx.set(x, y + 1 + up, z, 'bone')
      ctx.set(x, y + 2 + up, z, 'bone')
      const [x2, z2] = frameWorld(f, f.front - 1, b)
      ctx.set(x2, y + 1 + up, z2, 'bone')
    }
    const [bx, bz] = frameWorld(f, f.front, side * 6)
    ctx.fill(bx, y + 1, bz, bx, y + 3, bz, 'bone')
  }
}

/** Gate C: a broken gate - one obelisk standing, the other fallen across the yard, rubble and ash. */
function ruinedGate(ctx: PassContext, f: PrecinctFrame, y: number): void {
  const [sx, sz] = frameWorld(f, f.front, -5)
  ctx.fill(sx, y + 1, sz, sx, y + 8, sz, 'bone')
  ctx.set(sx, y + 9, sz, 'pillar')
  // (its fallen twin lies outside the gate - drawn in the foundation pre-pass)
  // The wall beside the gate is broken down to rubble
  for (let b = -10; b <= 10; b++) {
    if (Math.abs(b) <= 3 || b === -5) continue
    const [x, z] = frameWorld(f, f.front, b)
    const keep = Math.abs(b) <= 6 ? 0 : Math.floor(ctx.hash(x, y, z, 233) * 4)
    ctx.fill(x, y + 1 + keep, z, x, y + 6, z, B.AIR)
    if (keep === 0 && ctx.hash(x, y, z, 231) < 0.6) ctx.set(x, y + 1, z, B.CRACKED_CATACOMB_BRICK)
    const [ax, az] = frameWorld(f, f.front - 1, b)
    if (ctx.hash(ax, y, az, 232) < 0.3) ctx.setIf(ax, y + 1, az, 'ash', isAir)
  }
}

// ===========================================================================
// The kit
// ===========================================================================

/** A copy of a module def for another level band (own id and count limit). */
function variant(def: ModuleDef, suffix: string, levels: readonly [number, number], maxCount: number): ModuleDef {
  return { ...def, id: def.id + suffix, levels, maxCount }
}

/**
 * Level bands: the Ossuary Galleries (-1) take a limited set of modules, so
 * once they are spent the growth has to go down the stairs into the Deep
 * Crypts (-2) and the throne level (-3), which have their own sets.
 */
const galleries: ModuleDef[] = [
  niches('gallery_corridor', [Face.North, Face.South], 3, [-1, -1], 3),
  niches('gallery_corner', [Face.South, Face.East], 2, [-1, -1], 2),
  niches('gallery_tee', [Face.South, Face.East, Face.West], 2, [-1, -1], 2),
  niches('gallery_cross', [Face.North, Face.South, Face.East, Face.West], 1.4, [-1, -1], 1),
  variant(ossuaryHall, '', [-1, -1], 2),
  variant(guardCrypt, '', [-1, -1], 2),
  variant(embalmingRoom, '', [-1, -1], 1),
  variant(shrine, '', [-1, -1], 1),
]

const deepCrypts: ModuleDef[] = [
  niches('crypt_corridor', [Face.North, Face.South], 3, [-3, -2], 5),
  niches('crypt_corner', [Face.South, Face.East], 2, [-3, -2], 3),
  niches('crypt_tee', [Face.South, Face.East, Face.West], 2, [-3, -2], 3),
  niches('crypt_cross', [Face.North, Face.South, Face.East, Face.West], 1.4, [-3, -2], 2),
  variant(ossuaryHall, '_deep', [-2, -2], 2),
  variant(guardCrypt, '_deep', [-2, -2], 1),
  variant(embalmingRoom, '_deep', [-3, -2], 2),
  variant(shrine, '_deep', [-3, -2], 2),
  sarcophagusChamber,
  ghoulDen,
  priestSanctum,
  reliquaryVault,
]

function tierFor(m: PlacedModule, L: LayoutInfo): number {
  const tags = m.def.tags ?? []
  if (tags.includes('boss') || tags.includes('vault')) return 3
  const base = L.maxDepth > 0 ? Math.min(2, Math.floor((3 * m.depth) / (L.maxDepth + 1))) : 0
  if (tags.includes('shrine')) return Math.max(2, base)
  return base
}

export const catacombsKit: DungeonKit = {
  id: CATACOMBS_KIT_ID,
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-3, 0],
  worldYRange: [4, 126],
  baseYRange: [31, 84],
  modules: [chapel, annex, ...galleries, ...deepCrypts, grandStair, spiralDescent, boneWell, burialAlcove, cavedIn, throneCrypt],
  targetModules: [26, 36],
  bossDepthFraction: 0.6,
  require: [
    { tag: 'garrison', count: 3 },
    { tag: 'vault', count: 1 },
    { tag: 'shrine', count: 1 },
    { tag: 'stairs', count: 2 },
  ],
  palette,
  lootTierBlocks: [B.CATACOMB_TILE, B.CATACOMB_SKULL_BRICK, B.CRYPT_ALTAR, B.GILDED_RELIQUARY],
  exteriorMargin: PLAZA_PAD + AVENUE + APPROACH_LENGTH + 8,
  foundationDepth: 32,
  exteriorHeight: 16,
  tierFor,
  foundation: foundationPass,
  exterior: exteriorPass,
}

registerDungeonKit(catacombsKit)
