import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, FACE_DIR, type DrawTarget, type DungeonKit, type ModuleContext, type ModuleDef, type PassContext } from '../../DungeonTypes.ts'
import { battlements, doorway, pillar, room, spiralRing, spiralStairs, sprinkle, stairs, windows } from '../../DungeonBuild.ts'
import { registerDungeonKit } from '../../DungeonKitRegistry.ts'
import { LAKE_LEVEL, MAX_RIDGE_HEIGHT } from '../../../cocytus/CocytusTerrain.ts'
import { CITADEL_GARRISON, RIME_SOVEREIGN_GUARDIAN_INDEX } from './frozenCitadelConfig.ts'

/**
 * FROZEN CITADEL - the Rime Sovereign's procedural ice palace on the black
 * ice lake of Cocytus (see scratch kit-design.md).
 *
 * Above the ice: an icicle gatehouse behind a drawbridge over a crevasse,
 * curtain walls with frost-lantern towers, frozen courtyards (fountain,
 * garden of sinners, cloister), a great hall, guard rooms, a library,
 * a chapel of penance, archer galleries, frost-lantern towers and ONE great
 * spire - the landmark seen across the lake. Below the ice (levels -1, -2):
 * the undercroft cut into the lake - prison of the damned, the gaol
 * warden, frozen cisterns - and, deepest of all, the Rime Sovereign's throne
 * hall. Vaults hide off the path at depth 4+.
 *
 * Floor datum: the lake surface + 1 (Y 47); on a shore, the median terrain
 * (cut into the hill). The black ice is the foundation; undercroft ceilings
 * are black ice, flush with the lake.
 *
 * Worker-safe: imports only the framework, BlockIds/BlockFacing and pure
 * Cocytus constants.
 */

export const FROZEN_CITADEL_KIT_ID = 'frozen_citadel'

const CS = 9
const FH = 8
/** Curtain wall distance out from the ground modules. */
const BAILEY = 4
/** Crevasse in front of the gate: starts this far past the wall, this long along the approach, this deep. */
const CREVASSE_GAP = 3
const CREVASSE_LENGTH = 6
const CREVASSE_DEPTH = 7
const CREVASSE_HALF_WIDTH = 6
/**
 * The causeway beyond the drawbridge. Long on purpose: the lake is broken by steep rimestone
 * ridges, and a causeway that reaches the ridge ringing a lake pocket ramps over it.
 */
const APPROACH_LENGTH = 44
/** Corner tower radius and height above the base. */
const TOWER_R = 4
const TOWER_TOP = 18
const WALL_TOP = 11
/** Great spire: the cone rises this far above its module. */
const SPIRE_RISE = 40

const AIR = BlockIds.AIR
const isAir = (id: number): boolean => id === AIR

const palette = {
  wall: [
    [BlockIds.GLACIAL_BRICK, 72],
    [BlockIds.FROSTED_GLACIAL_BRICK, 28],
  ],
  // Undercroft walls: masonry patched with the lake's own black ice
  wallDeep: [
    [BlockIds.GLACIAL_BRICK, 48],
    [BlockIds.BLACK_ICE, 37],
    [BlockIds.FROSTED_GLACIAL_BRICK, 15],
  ],
  trim: BlockIds.CARVED_GLACIAL_BRICK,
  floor: BlockIds.GLACIAL_TILES,
  paving: BlockIds.POLISHED_ICE,
  pillar: BlockIds.ICE_PILLAR,
  ice: BlockIds.BLACK_ICE,
  glacial: BlockIds.GLACIAL_ICE,
  planks: BlockIds.FROSTBOUND_PLANKS,
  shelf: BlockIds.FROZEN_BOOKSHELF,
  grate: BlockIds.RIME_GRATE,
  snow: BlockIds.ASH_SNOW,
  glyph: BlockIds.RIME_GLYPH,
  foundation: BlockIds.GLACIAL_BRICK,
  light: BlockIds.HANGING_FROST_LANTERN,
} as const

const STAIRS = BlockIds.GLACIAL_BRICK_STAIRS

// ---------------------------------------------------------------------------
// Shared module helpers
// ---------------------------------------------------------------------------

/** Wall material by depth: undercroft modules are cut into the lake ice. */
function wallOf(ctx: ModuleContext): string {
  return ctx.level < 0 ? 'wallDeep' : 'wall'
}

/** Ceiling: black ice for modules entirely under the lake (flush with its surface). */
function ceilingOf(ctx: ModuleContext): string {
  return ctx.level + ctx.def.size[1] - 1 < 0 ? 'ice' : wallOf(ctx)
}

/** Nothing built above any of the module's top cells. */
function openAbove(ctx: ModuleContext): boolean {
  const [sx, sy, sz] = ctx.def.size
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (ctx.isCellOccupied(x, sy, z)) return false
  return true
}

/** Crenellated roof with a dusting of ash snow, on above-ground modules with nothing on top. */
function roofIfOpen(ctx: ModuleContext): void {
  if (ctx.level + ctx.def.size[1] - 1 < 0 || !openAbove(ctx)) return
  const { w, h, d } = ctx
  battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
  sprinkle(ctx, { x0: 1, y0: h, z0: 1, x1: w - 2, y1: h, z1: d - 2 }, 'snow', 0.12, 31, isAir)
}

/** Icicles hanging under every level's ceiling (or only under the top ceiling of a tall module). */
function icicles(ctx: ModuleContext, chance: number, tall = false): void {
  const ys: number[] = []
  if (tall) ys.push(ctx.h - 2)
  else for (let k = 0; k < ctx.def.size[1]; k++) ys.push(k * FH + FH - 2)
  ys.forEach((y, k) => sprinkle(ctx, { x0: 1, y0: y, z0: 1, x1: ctx.w - 2, y1: y, z1: ctx.d - 2 }, BlockIds.ICICLE, chance, 17 + k, isAir))
}

/** Keep the floor in front of every open doorway clear for `depth` blocks (after dressing near walls). */
function clearDoorLanes(ctx: ModuleContext, depth = 2): void {
  for (const c of ctx.connectors) {
    if (!c.open || c.face > 3) continue
    const b = ctx.doorwayBox(c)
    switch (c.face) {
      case Face.North: ctx.fill(b.x0, b.y0, 1, b.x1, b.y1, depth, AIR); break
      case Face.South: ctx.fill(b.x0, b.y0, ctx.d - 1 - depth, b.x1, b.y1, ctx.d - 2, AIR); break
      case Face.West: ctx.fill(1, b.y0, b.z0, depth, b.y1, b.z1, AIR); break
      case Face.East: ctx.fill(ctx.w - 1 - depth, b.y0, b.z0, ctx.w - 2, b.y1, b.z1, AIR); break
    }
  }
}

/** A frost lantern hanging from the ceiling of level k. */
function lantern(ctx: ModuleContext, x: number, z: number, k = 0): void {
  ctx.light(x, k * FH + FH - 2, z)
}

/** A frozen banner hanging on an inner wall, its cloth facing `facing`. */
function banner(ctx: DrawTarget, x: number, y: number, z: number, facing: number): void {
  ctx.set(x, y, z, BlockIds.FROZEN_BANNER, ctx.facing(facing))
}

/** A sinner frozen standing in a black-ice post (2 figure blocks + an ice cap). */
function sinnerPost(t: DrawTarget, x: number, y: number, z: number, cap = 1): void {
  t.set(x, y, z, BlockIds.ENTOMBED_UPRIGHT_LOWER)
  t.set(x, y + 1, z, BlockIds.ENTOMBED_UPRIGHT_UPPER)
  for (let i = 0; i < cap; i++) t.set(x, y + 2 + i, z, BlockIds.BLACK_ICE)
}

/** Re-open every doorway (after dressing that might have filled one). */
function reopenDoors(ctx: ModuleContext): void {
  for (const c of ctx.connectors) if (c.open) doorway(ctx, ctx.doorwayBox(c), c.face)
}

/** Standard shell of the kit. */
function shell(ctx: ModuleContext, o: { floor?: string; ceiling?: string | null; tall?: boolean; frame?: string; wall?: string } = {}): void {
  room(ctx, {
    wall: o.wall ?? wallOf(ctx),
    floor: o.floor ?? 'floor',
    ceiling: o.ceiling === undefined ? ceilingOf(ctx) : o.ceiling,
    interiorFloors: !o.tall,
    doorFrame: o.frame ?? 'trim',
  })
}

/** Grate windows on outer walls of above-ground levels. */
function grateWindows(ctx: ModuleContext, height = 3): void {
  if (ctx.level < 0) return
  windows(ctx, { block: 'grate', height, sill: 2 })
}

// ---------------------------------------------------------------------------
// Entrance
// ---------------------------------------------------------------------------

/** The icicle gatehouse: a tall vestibule; its 5×5 gate is hung with an icicle portcullis. */
const gatehouse: ModuleDef = {
  id: 'gatehouse',
  size: [1, 1, 1],
  tags: ['entrance'],
  connectors: [
    { cell: [0, 0, 0], face: Face.South, exterior: true },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  levels: [0, 0],
  overhang: { up: 3 },
  build(ctx) {
    shell(ctx, { floor: 'paving' })
    // The great gate: 5 wide, 5 tall, a carved arch over it, icicles hanging in it
    ctx.fill(1, 1, 8, 7, 6, 8, 'trim')
    ctx.fill(2, 1, 8, 6, 5, 8, AIR)
    for (let x = 2; x <= 6; x++) ctx.set(x, 5, 8, BlockIds.ICICLE)
    ctx.set(4, 4, 8, AIR) // a gap in the middle so the portcullis reads as hanging teeth
    // Banners flanking the inner door, braziers by the gate
    banner(ctx, 1, 5, 2, BlockFacing.EAST)
    banner(ctx, 7, 5, 2, BlockFacing.WEST)
    ctx.set(1, 1, 7, BlockIds.RIME_BRAZIER)
    ctx.set(7, 1, 7, BlockIds.RIME_BRAZIER)
    icicles(ctx, 0.08)
    roofIfOpen(ctx)
  },
}

// ---------------------------------------------------------------------------
// Connectors: corridors and junctions (3 variants each)
// ---------------------------------------------------------------------------

function corridor(id: string, faces: Face[], weight: number, levels: readonly [number, number] = [-1, 2]): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: levels[1] <= -2 ? ['corridor', 'crypt'] : ['corridor'],
    weight,
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    levels,
    overhang: { up: 2 },
    build(ctx) {
      const variant = ctx.rng.int(0, 2) // 0 plain, 1 pillared gallery, 2 frozen
      shell(ctx, { frame: variant === 1 ? 'trim' : undefined })
      if (variant === 1) {
        for (const [px, pz] of [[1, 1], [7, 1], [1, 7], [7, 7]]) pillar(ctx, px, pz, 1, FH - 2, 'pillar')
      }
      if (variant === 2) {
        // Snow blown in against the corners, icicles everywhere, the lantern long dead
        for (const [px, pz] of [[1, 1], [7, 1], [1, 7], [7, 7]]) if (ctx.hash(px, 1, pz, 5) < 0.7) ctx.set(px, 1, pz, 'snow')
        icicles(ctx, 0.22)
      } else {
        icicles(ctx, 0.06)
        lantern(ctx, 4, 4)
      }
      grateWindows(ctx)
      roofIfOpen(ctx)
    },
  }
}

/** A guard post at a junction: four ways, a patrol garrison in the floor. */
const guardPost: ModuleDef = {
  id: 'guard_post',
  size: [1, 1, 1],
  tags: ['garrison', 'corridor'],
  weight: 1,
  maxCount: 2,
  minDepth: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  levels: [-2, 1],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx)
    for (const [px, pz] of [[1, 1], [7, 1], [1, 7], [7, 7]]) pillar(ctx, px, pz, 1, FH - 2, 'pillar', 1, 'trim')
    ctx.garrison(4, 0, 4, CITADEL_GARRISON.patrol)
    lantern(ctx, 2, 4)
    icicles(ctx, 0.05)
    roofIfOpen(ctx)
  },
}

// ---------------------------------------------------------------------------
// Halls and rooms
// ---------------------------------------------------------------------------

/** The great hall (2 levels tall): pillars, banners or a hall of kneeling kings, a long frozen table. */
const greatHall: ModuleDef = {
  id: 'great_hall',
  size: [2, 2, 3],
  tags: ['room', 'hall'],
  weight: 2,
  minCount: 1,
  maxCount: 1,
  connectors: [
    { cell: [0, 0, 2], face: Face.South },
    { cell: [1, 0, 2], face: Face.South },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [0, 0, 1], face: Face.West },
  ],
  levels: [0, 0],
  overhang: { up: 11 },
  build(ctx) {
    const { w, h, d } = ctx
    const kings = ctx.rng.chance(0.45)
    shell(ctx, { tall: true })
    // Glacial-tile floor with a polished-ice aisle down the middle
    ctx.fill(7, 0, 1, 10, 0, d - 2, 'paving')
    // Two rows of fluted ice pillars with carved capitals
    for (const px of [4, 13]) {
      for (const pz of [4, 9, 17, 22]) {
        pillar(ctx, px, pz, 1, h - 2, 'pillar')
        ctx.set(px, h - 2, pz, 'trim')
        ctx.set(px, 1, pz, 'trim')
      }
    }
    // Long walls: banners, or kneeling ice kings on plinths facing the aisle
    for (const pz of [5, 9, 18, 22]) {
      if (kings) {
        ctx.set(1, 1, pz, 'trim')
        ctx.set(1, 2, pz, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(BlockFacing.EAST))
        ctx.set(w - 2, 1, pz, 'trim')
        ctx.set(w - 2, 2, pz, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(BlockFacing.WEST))
      } else {
        banner(ctx, 1, 9, pz, BlockFacing.EAST)
        banner(ctx, w - 2, 9, pz, BlockFacing.WEST)
      }
    }
    // The long frozen table (black ice under a polished top)
    ctx.fill(8, 1, 9, 9, 1, 17, 'ice')
    // Chandeliers
    for (const pz of [6, 13, 20]) ctx.light(8, h - 2, pz)
    void w
    // Tall grate windows high in the outer walls: ONE row (y 9-12) on the upper level's faces.
    // (windows() repeats per level: its sill 9 on level 1 put the row at y 17-20, above the roof.)
    for (let cx = 0; cx < 2; cx++) {
      for (let cz = 0; cz < 3; cz++) {
        for (const face of [Face.East, Face.South, Face.West, Face.North] as Face[]) {
          const edge = (face === Face.East && cx === 1) || (face === Face.West && cx === 0) || (face === Face.South && cz === 2) || (face === Face.North && cz === 0)
          if (!edge || !ctx.isOuterFace(cx, 1, cz, face)) continue
          const a = (face === Face.North || face === Face.South ? cx : cz) * CS + 4
          if (face === Face.East) ctx.fill(w - 1, 9, a, w - 1, 12, a, 'grate')
          else if (face === Face.West) ctx.fill(0, 9, a, 0, 12, a, 'grate')
          else if (face === Face.South) ctx.fill(a, 9, d - 1, a, 12, d - 1, 'grate')
          else ctx.fill(a, 9, 0, a, 12, 0, 'grate')
        }
      }
    }
    ctx.chest(w - 2, 1, 7, { facing: BlockFacing.WEST }) // the high table's strongbox
    icicles(ctx, 0.04, true)
    reopenDoors(ctx)
    clearDoorLanes(ctx, 1)
    // Pitched roof of glacial brick with ice spikes at the gable ends
    if (openAbove(ctx)) {
      for (let i = 0; i <= Math.floor((w - 1) / 2); i++) {
        ctx.fill(i, h + i - 1, 0, i, h + i - 1, d - 1, 'wall')
        ctx.fill(w - 1 - i, h + i - 1, 0, w - 1 - i, h + i - 1, d - 1, 'wall')
        if (i > 0) {
          ctx.fill(i, h + i - 2, 0, w - 1 - i, h + i - 2, 0, 'wall')
          ctx.fill(i, h + i - 2, d - 1, w - 1 - i, h + i - 2, d - 1, 'wall')
        }
      }
      const ridge = h + Math.floor((w - 1) / 2) - 1
      for (const z of [0, d - 1]) ctx.fill(8, ridge + 1, z, 9, ridge + 2, z, 'glacial')
    }
  },
}

/** Guard room (barracks): bunks, weapon grates, a brazier and a knight garrison. */
const guardRoom: ModuleDef = {
  id: 'guard_room',
  size: [1, 1, 2],
  tags: ['garrison', 'room'],
  weight: 2,
  maxCount: 3,
  minDepth: 1,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  levels: [-2, 1],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx)
    // Frostbound bunks along the walls (off the door lanes)
    for (const z of [1, 7, 10, 16]) {
      ctx.fill(1, 1, z, 2, 1, z, 'planks')
      ctx.fill(6, 1, z, 7, 1, z, 'planks')
    }
    // Weapon racks: grates on the walls between the bunks
    ctx.fill(1, 2, 8, 1, 3, 9, 'grate')
    ctx.fill(7, 2, 8, 7, 3, 9, 'grate')
    ctx.set(1, 1, 11, BlockIds.RIME_BRAZIER)
    ctx.garrison(4, 0, 9, CITADEL_GARRISON.guard)
    lantern(ctx, 4, 3)
    lantern(ctx, 4, 14)
    if (ctx.rng.chance(0.2)) ctx.chest(1, 1, 13, { facing: BlockFacing.EAST })
    reopenDoors(ctx)
    clearDoorLanes(ctx)
    icicles(ctx, 0.05)
    grateWindows(ctx, 2)
    roofIfOpen(ctx)
  },
}

/** Archer gallery: a long hall with arrow slits and a Rime Archer garrison. */
const archerGallery: ModuleDef = {
  id: 'archer_gallery',
  size: [2, 1, 1],
  tags: ['garrison', 'gallery'],
  weight: 1.2,
  maxCount: 2,
  minDepth: 1,
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [1, 0, 0], face: Face.North },
  ],
  levels: [1, 2],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx)
    // Arrow slits: 1-wide, 3-tall grates every 2 blocks on the outer long walls
    for (let x = 2; x < ctx.w - 2; x += 2) {
      if (ctx.isOuterFace(x < CS ? 0 : 1, 0, 0, Face.North)) ctx.fill(x, 2, 0, x, 4, 0, 'grate')
      if (ctx.isOuterFace(x < CS ? 0 : 1, 0, 0, Face.South)) ctx.fill(x, 2, ctx.d - 1, x, 4, ctx.d - 1, 'grate')
    }
    ctx.garrison(9, 0, 4, CITADEL_GARRISON.archers)
    lantern(ctx, 4, 4)
    lantern(ctx, 13, 4)
    for (const x of [1, 16]) ctx.fill(x, 1, 1, x, 1, 1, 'planks') // arrow crates
    reopenDoors(ctx)
    icicles(ctx, 0.06)
    roofIfOpen(ctx)
  },
}

/** Library of frozen tomes: shelves floor to ceiling, a reading table, snow on the boards. */
const library: ModuleDef = {
  id: 'library',
  size: [2, 1, 1],
  tags: ['room', 'library'],
  weight: 1.3,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [1, 0, 0], face: Face.North },
  ],
  levels: [0, 1],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx, { floor: 'planks' })
    for (let x = 1; x < ctx.w - 1; x++) {
      ctx.fill(x, 1, 1, x, 5, 1, 'shelf')
      ctx.fill(x, 1, ctx.d - 2, x, 5, ctx.d - 2, 'shelf')
    }
    // A reading table and drifted snow
    ctx.fill(7, 1, 2, 10, 1, 2, 'planks')
    sprinkle(ctx, { x0: 2, y0: 1, z0: 2, x1: ctx.w - 3, y1: 1, z1: 2 }, 'snow', 0.18, 41, isAir)
    reopenDoors(ctx)
    clearDoorLanes(ctx)
    // The chest hides in a gap between the shelves
    ctx.set(5, 1, 1, AIR)
    ctx.set(5, 2, 1, AIR)
    if (ctx.rng.chance(0.5)) ctx.chest(5, 1, 1, { facing: BlockFacing.SOUTH })
    lantern(ctx, 4, 4)
    lantern(ctx, 13, 4)
    icicles(ctx, 0.05)
    roofIfOpen(ctx)
  },
}

/** Chapel of penance: kneeling ice knights before a wall of the entombed. */
const chapel: ModuleDef = {
  id: 'chapel',
  size: [1, 1, 2],
  tags: ['room', 'chapel'],
  weight: 0.8,
  maxCount: 1,
  connectors: [{ cell: [0, 0, 1], face: Face.South }],
  levels: [-1, 1],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx)
    // Altar wall of black ice holding three of the damned
    ctx.fill(1, 1, 1, 7, FH - 2, 1, 'ice')
    for (const x of [2, 4, 6]) {
      ctx.set(x, 1, 1, BlockIds.ENTOMBED_UPRIGHT_LOWER)
      ctx.set(x, 2, 1, BlockIds.ENTOMBED_UPRIGHT_UPPER)
    }
    ctx.fill(3, 1, 2, 5, 1, 2, 'trim') // altar step
    // Two rows of kneeling knights facing the altar
    for (const z of [5, 8, 11]) {
      ctx.set(2, 1, z, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(BlockFacing.NORTH))
      ctx.set(6, 1, z, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(BlockFacing.NORTH))
    }
    // Rune inlay down the nave (no chests in here: the glyph is the vault signature)
    for (const z of [4, 7, 10, 13]) ctx.set(4, 0, z, 'glyph')
    lantern(ctx, 4, 4)
    icicles(ctx, 0.05)
    roofIfOpen(ctx)
  },
}

// ---------------------------------------------------------------------------
// Courtyards (open to the cavern): fountain, garden of sinners, cloister
// ---------------------------------------------------------------------------

const courtyard: ModuleDef = {
  id: 'courtyard',
  size: [2, 1, 2],
  tags: ['courtyard'],
  weight: 1.5,
  minCount: 1,
  maxCount: 3,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  levels: [0, 0],
  overhang: { up: 2 },
  build(ctx) {
    const { w, h, d } = ctx
    const variant = ctx.rng.int(0, 2) // 0 fountain, 1 garden of sinners, 2 cloister
    shell(ctx, { floor: 'paving', ceiling: null })
    battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
    if (variant === 0) {
      // Frozen fountain: black-ice basin, an ember of frozen magma at its heart, an ice spout
      ctx.fill(6, 1, 6, 11, 1, 11, 'ice')
      ctx.fill(7, 1, 7, 10, 1, 10, AIR)
      ctx.fill(7, 0, 7, 10, 0, 10, 'ice')
      ctx.fill(8, 0, 8, 9, 0, 9, BlockIds.FROZEN_MAGMA)
      pillar(ctx, 8, 8, 1, 4, 'glacial', 2)
      ctx.fill(8, 5, 8, 9, 5, 9, BlockIds.FROST_LANTERN)
      for (const [sx, sz, f] of [[3, 3, BlockFacing.SOUTH], [14, 3, BlockFacing.SOUTH], [3, 14, BlockFacing.NORTH], [14, 14, BlockFacing.NORTH]] as const) {
        ctx.set(sx, 1, sz, 'trim')
        ctx.set(sx, 2, sz, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(f))
      }
      sprinkle(ctx, { x0: 1, y0: 1, z0: 1, x1: w - 2, y1: 1, z1: d - 2 }, BlockIds.FROST_CRYSTAL, 0.025, 51, isAir)
    } else if (variant === 1) {
      // Garden of sinners: rows of frozen figures in black-ice posts, drifts, crystal "flowers"
      for (const x of [2, 7, 10, 15]) {
        for (const z of [2, 7, 10, 15]) sinnerPost(ctx, x, 1, z, ctx.hash(x, 0, z, 9) < 0.5 ? 1 : 2)
      }
      for (let x = 1; x < w - 1; x++) {
        for (const z of [1, d - 2]) if (ctx.hash(x, 1, z, 61) < 0.3) ctx.setIf(x, 1, z, 'snow', isAir)
      }
      sprinkle(ctx, { x0: 1, y0: 1, z0: 1, x1: w - 2, y1: 1, z1: d - 2 }, BlockIds.FROST_CRYSTAL, 0.035, 52, isAir)
      ctx.garrison(8, 0, 8, CITADEL_GARRISON.wraiths)
    } else {
      // Cloister: an arcade of ice pillars around a black-ice square
      ctx.fill(5, 0, 5, 12, 0, 12, 'ice')
      for (let i = 4; i <= 13; i += 3) {
        for (const [px, pz] of [[i, 4], [i, 13], [4, i], [13, i]]) {
          pillar(ctx, px, pz, 1, 4, 'pillar')
          ctx.set(px, 5, pz, 'trim')
        }
      }
      // Arcade roof ring
      for (let i = 1; i <= 16; i++) {
        for (const [px, pz] of [[i, 2], [i, 15], [2, i], [15, i]]) ctx.setIf(px, 5, pz, 'trim', isAir)
      }
      for (const [x, z] of [[7, 7], [10, 10]]) sinnerPost(ctx, x, 1, z)
      sprinkle(ctx, { x0: 5, y0: 1, z0: 5, x1: 12, y1: 1, z1: 12 }, BlockIds.FROST_CRYSTAL, 0.05, 53, isAir)
    }
    // Frost lanterns on the wall tops (between the merlons)
    for (const [lx, lz] of [[0, 9], [w - 1, 9]]) ctx.light(lx, h, lz, BlockIds.FROST_LANTERN)
    reopenDoors(ctx)
    clearDoorLanes(ctx)
  },
}

// ---------------------------------------------------------------------------
// Stairs: up (above ground) and down into the undercroft
// ---------------------------------------------------------------------------

function stairModule(id: string, levels: readonly [number, number], undercroft: boolean): ModuleDef {
  return {
    id,
    size: [1, 2, 2],
    tags: undercroft ? (levels[0] <= -2 ? ['stairs', 'undercroft', 'crypt'] : ['stairs', 'undercroft']) : ['stairs'],
    weight: undercroft ? 1.1 : 1.5,
    minCount: undercroft ? 1 : 0,
    maxCount: undercroft ? 2 : 3,
    connectors: [
      { cell: [0, 0, 1], face: Face.South },
      { cell: [0, 1, 0], face: Face.North },
    ],
    levels,
    overhang: { up: 2 },
    build(ctx) {
      shell(ctx, { tall: true, wall: undercroft ? 'wallDeep' : 'wall' })
      // Landing on the upper level (north half), solid under it
      ctx.fill(1, FH, 1, ctx.w - 2, FH, 8, 'floor')
      ctx.fill(1, 1, 1, ctx.w - 2, FH - 1, 8, undercroft ? 'wallDeep' : 'wall')
      // A flight of glacial brick stairs rising northward
      stairs(ctx, 3, 1, 16, Face.North, FH, 3, STAIRS, undercroft ? 'wallDeep' : 'wall', 1, true)
      if (undercroft) {
        // The descent: the damned frozen in the side walls, watching
        for (const z of [10, 13, 16]) {
          for (const x of [0, ctx.w - 1]) {
            const y = 17 - z + 1
            ctx.set(x, y, z, BlockIds.ENTOMBED_UPRIGHT_LOWER)
            ctx.set(x, y + 1, z, BlockIds.ENTOMBED_UPRIGHT_UPPER)
          }
        }
      } else {
        grateWindows(ctx)
      }
      lantern(ctx, 1, 15)
      ctx.light(ctx.w - 2, FH + FH - 2, 2)
      icicles(ctx, 0.05, true)
      reopenDoors(ctx)
      roofIfOpen(ctx)
    },
  }
}

// ---------------------------------------------------------------------------
// Towers: frost-lantern towers and the great spire
// ---------------------------------------------------------------------------

/** Spiral stair tower body (shared). */
function towerBody(ctx: ModuleContext): void {
  shell(ctx, { tall: true })
  if (ctx.level >= 0) windows(ctx, { block: 'grate', height: 3, sill: 3 })
  spiralStairs(ctx, 4, 4, 1, ctx.h - 1, 'trim', 'pillar', 2)
  // A ring corner step touches its neighbours only diagonally: give each one a block beneath it
  // (joined to the step before; the space under a step is never walked through)
  const steps = spiralRing(2)
  for (let y = 2; y < ctx.h - 1; y++) {
    const [ox, oz] = steps[(y - 1) % steps.length]
    if (Math.abs(ox) === 2 && Math.abs(oz) === 2) ctx.set(4 + ox, y - 1, 4 + oz, 'trim')
  }
  // Roof: the top step pierces it; the three before get headroom (a jump needs 2 clear above the feet)
  const ring = spiralRing(2)
  const top0 = ctx.h - 1
  ctx.fill(0, top0, 0, ctx.w - 1, top0, ctx.d - 1, 'wall')
  for (const y of [top0 - 3, top0 - 2, top0 - 1]) {
    const [ox, oz] = ring[(y - 1) % ring.length]
    ctx.set(4 + ox, top0, 4 + oz, AIR)
  }
  const [lx, lz] = ring[(top0 - 1) % ring.length]
  ctx.set(4 + lx, top0, 4 + lz, 'trim')
  ctx.light(1, 4, 7)
  ctx.light(7, FH + 4, 1)
  reopenDoors(ctx)
}

const frostTower: ModuleDef = {
  id: 'frost_tower',
  size: [1, 3, 1],
  tags: ['tower'],
  weight: 1.2,
  maxCount: 3,
  // Pass-through at the foot (around the spiral): a tower never seals the ground floor
  connectors: [{ cell: [0, 0, 0], face: Face.South }, { cell: [0, 0, 0], face: Face.North }],
  levels: [0, 0],
  overhang: { up: 9 },
  build(ctx) {
    towerBody(ctx)
    const { w, h, d } = ctx
    battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
    // Lantern crown: four ice posts holding a frost lantern above the stairhead
    for (const [px, pz] of [[1, 1], [7, 1], [1, 7], [7, 7]]) ctx.fill(px, h, pz, px, h + 3, pz, 'glacial')
    ctx.fill(1, h + 4, 1, 7, h + 4, 7, 'glacial')
    ctx.fill(2, h + 5, 2, 6, h + 5, 6, 'glacial')
    ctx.fill(3, h + 6, 3, 5, h + 6, 5, 'glacial')
    ctx.set(4, h + 7, 4, 'glacial')
    ctx.set(4, h + 3, 4, BlockIds.HANGING_FROST_LANTERN)
    // Archers keep some tower tops
    // (clear of the stairhead holes at (6, 2)/(6, 3) and its top step at (6, 4))
    if (ctx.rng.chance(0.4)) ctx.garrison(2, h - 1, 6, CITADEL_GARRISON.archers)
  },
}

/** The great spire: a tower whose roof becomes a 40-block cone of glacial ice, lantern at the tip. */
const greatSpire: ModuleDef = {
  id: 'great_spire',
  size: [1, 3, 1],
  tags: ['tower', 'landmark'],
  weight: 1,
  minCount: 1,
  maxCount: 1,
  // Pass-through at the foot (around the spiral): a tower never seals the ground floor
  connectors: [{ cell: [0, 0, 0], face: Face.South }, { cell: [0, 0, 0], face: Face.North }],
  levels: [0, 0],
  overhang: { up: SPIRE_RISE + 2, side: 0 },
  build(ctx) {
    towerBody(ctx)
    const { h } = ctx
    // The climb ends under the spire: the stairhead is sealed by its base
    ctx.fill(0, h - 1, 0, ctx.w - 1, h - 1, ctx.d - 1, 'wall')
    // A rim of carved brick at the top of the tower, then the cone
    battlements(ctx, 0, 0, 8, 8, h, 'trim')
    for (let i = 0; i <= SPIRE_RISE; i++) {
      const t = i / SPIRE_RISE
      const r = 4.2 * (1 - t) * (1 - t * 0.15)
      const y = h + 1 + i
      const band = i % 7 === 3
      for (let x = 0; x <= 8; x++) {
        for (let z = 0; z <= 8; z++) {
          const dx = x - 4, dz = z - 4
          if (dx * dx + dz * dz <= r * r + 0.3) ctx.set(x, y, z, band ? 'ice' : 'glacial')
        }
      }
    }
    ctx.set(4, h + 2 + SPIRE_RISE, 4, BlockIds.FROST_LANTERN)
    // The landmark's base holds a chest for those who climb in
    ctx.chest(7, 1, 1, { facing: BlockFacing.WEST })
  },
}

// ---------------------------------------------------------------------------
// The undercroft: prison of the damned, the warden, frozen cisterns
// ---------------------------------------------------------------------------

/** Cell block: a corridor between two rows of grated cells; most hold the entombed, one a chest, one is broken open. */
const prison: ModuleDef = {
  id: 'prison',
  size: [2, 1, 1],
  tags: ['room', 'prison', 'undercroft', 'garrison'],
  weight: 1.5,
  minCount: 1,
  maxCount: 2,
  minDepth: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
  ],
  levels: [-2, -1],
  overhang: { up: 1 },
  build(ctx) {
    shell(ctx, { frame: 'grate' })
    const cells: Array<[number, number]> = [] // [x0, side] side 0 = north row, 1 = south row
    for (const x0 of [1, 5, 10, 14]) for (const side of [0, 1]) cells.push([x0, side])
    const chestCell = ctx.rng.chance(0.6) ? ctx.rng.int(0, cells.length - 1) : -1 // -1: a cell holds no cache
    let broken = ctx.rng.int(0, cells.length - 1)
    if (broken === chestCell) broken = (broken + 1) % cells.length
    cells.forEach(([x0, side], i) => {
      const zIn = side === 0 ? 1 : 7
      const zGrate = side === 0 ? 2 : 6
      // Cell walls (dividers) and the grate front
      if (x0 - 1 >= 1) ctx.fill(x0 - 1, 1, zIn, x0 - 1, FH - 2, zIn, 'wallDeep')
      ctx.fill(x0 + 3, 1, zIn, x0 + 3, FH - 2, zIn, 'wallDeep')
      ctx.fill(x0, 1, zGrate, x0 + 2, 3, zGrate, i === broken || i === chestCell ? AIR : 'grate')
      ctx.fill(x0, 4, zGrate, x0 + 2, FH - 2, zGrate, 'wallDeep')
      if (i === chestCell) ctx.chest(x0 + 1, 1, zIn, { facing: side === 0 ? BlockFacing.SOUTH : BlockFacing.NORTH })
      else if (i !== broken) {
        ctx.set(x0 + 1, 1, zIn, BlockIds.ENTOMBED_UPRIGHT_LOWER)
        ctx.set(x0 + 1, 2, zIn, BlockIds.ENTOMBED_UPRIGHT_UPPER)
        ctx.fill(x0 + 1, 3, zIn, x0 + 1, 3, zIn, 'ice')
      } else {
        // The broken cell: shattered ice where a sinner tore free
        ctx.set(x0, 1, zIn, 'ice')
        ctx.set(x0 + 2, 1, zIn, BlockIds.FROST_CRYSTAL)
      }
    })
    // The damned walk again: revenants from the broken cell
    ctx.garrison(9, 0, 4, CITADEL_GARRISON.revenants)
    lantern(ctx, 4, 4)
    lantern(ctx, 13, 4)
    icicles(ctx, 0.05)
    reopenDoors(ctx)
  },
}

/** The gaol warden's room: knights and an archer, the warden's chest, a cage. */
const wardenRoom: ModuleDef = {
  id: 'warden_room',
  size: [1, 1, 1],
  tags: ['garrison', 'room', 'undercroft'],
  weight: 1,
  maxCount: 1,
  minDepth: 3,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.South },
  ],
  levels: [-2, -1],
  build(ctx) {
    shell(ctx)
    // Warden's desk and a cage with one of the damned in the corner
    ctx.fill(6, 1, 2, 7, 1, 2, 'planks')
    ctx.fill(1, 1, 6, 2, 3, 6, 'grate')
    ctx.fill(2, 1, 7, 2, 3, 7, 'grate')
    ctx.set(1, 1, 7, BlockIds.ENTOMBED_UPRIGHT_LOWER)
    ctx.set(1, 2, 7, BlockIds.ENTOMBED_UPRIGHT_UPPER)
    ctx.chest(7, 1, 6, { facing: BlockFacing.WEST })
    ctx.garrison(4, 0, 4, CITADEL_GARRISON.warden)
    lantern(ctx, 4, 2)
    icicles(ctx, 0.04)
  },
}

/** Frozen cistern: a forest of ice pillars standing in black ice, plank walkways, wraiths. */
const cistern: ModuleDef = {
  id: 'cistern',
  size: [2, 1, 2],
  tags: ['room', 'cistern', 'undercroft'],
  weight: 1.2,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  levels: [-2, -1],
  build(ctx) {
    const { w, d } = ctx
    const cracked = ctx.rng.chance(0.4)
    shell(ctx, { floor: 'ice' })
    // Plank walkways across the frozen water, then the pillar forest
    ctx.fill(8, 0, 1, 9, 0, d - 2, 'planks')
    ctx.fill(1, 0, 8, w - 2, 0, 9, 'planks')
    for (const x of [2, 7, 10, 15]) {
      for (const z of [2, 7, 10, 15]) {
        if (cracked && x === 10 && z === 10) {
          // A collapsed pillar lying in pieces
          ctx.fill(11, 1, 10, 14, 1, 10, 'pillar')
          ctx.set(10, FH - 2, 10, 'pillar')
          continue
        }
        pillar(ctx, x, z, 1, FH - 2, 'pillar')
      }
    }
    sprinkle(ctx, { x0: 1, y0: 1, z0: 1, x1: w - 2, y1: 1, z1: d - 2 }, BlockIds.FROST_CRYSTAL, 0.03, 71, isAir)
    if (ctx.rng.chance(0.45)) ctx.garrison(4, 0, 13, CITADEL_GARRISON.wraiths)
    ctx.light(8, FH - 2, 8)
    icicles(ctx, 0.14)
    if (ctx.rng.chance(0.25)) ctx.chest(16, 1, 1, { facing: BlockFacing.WEST })
    reopenDoors(ctx)
  },
}

// ---------------------------------------------------------------------------
// Vaults and dead ends
// ---------------------------------------------------------------------------

/** Vault: grate-framed door, a glowing rune inlay, two chests, a knight inside the door. */
const vault: ModuleDef = {
  id: 'vault',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 2,
  minDepth: 4,
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  levels: [-2, 1],
  build(ctx) {
    shell(ctx, { wall: 'trim', floor: 'paving', ceiling: 'trim', frame: 'grate' })
    // Rune inlay in the middle (kept 2+ blocks from the chests: the glyph is the tier-3 signature)
    for (const [gx, gz] of [[4, 3], [3, 4], [4, 4], [5, 4], [4, 5]]) ctx.set(gx, 0, gz, 'glyph')
    ctx.chest(1, 1, 1, { facing: BlockFacing.SOUTH })
    if (ctx.rng.chance(0.3)) ctx.chest(7, 1, 1, { facing: BlockFacing.SOUTH })
    ctx.set(1, 1, 4, BlockIds.FROST_CRYSTAL)
    ctx.set(7, 1, 4, BlockIds.FROST_CRYSTAL)
    banner(ctx, 4, 5, 1, BlockFacing.SOUTH)
    if (ctx.rng.chance(0.35)) ctx.garrison(4, 0, 7, CITADEL_GARRISON.guard)
    lantern(ctx, 4, 2)
  },
}

/** Dead-end alcove: a frozen sinner, a kneeling statue, a lantern shrine or a small cache. */
const alcove: ModuleDef = {
  id: 'alcove',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 8,
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  levels: [-2, 2],
  overhang: { up: 2 },
  build(ctx) {
    shell(ctx)
    ctx.fill(1, 1, 1, ctx.w - 2, ctx.h - 2, 3, wallOf(ctx))
    const kind = ctx.rng.int(0, 3)
    if (kind === 0) sinnerPost(ctx, 4, 1, 4, 2)
    else if (kind === 1) {
      ctx.set(4, 1, 4, 'trim')
      ctx.set(4, 2, 4, BlockIds.ICE_KNIGHT_STATUE, ctx.facing(BlockFacing.SOUTH))
    } else if (kind === 2) ctx.set(4, 1, 4, BlockIds.FROST_LANTERN)
    if (kind !== 2) lantern(ctx, 4, 6)
    if (ctx.rng.chance(0.08)) ctx.chest(2, 1, 4, { facing: BlockFacing.EAST })
    icicles(ctx, 0.12)
    roofIfOpen(ctx)
  },
}

// ---------------------------------------------------------------------------
// Boss: the Rime Sovereign's throne hall, under the lake
// ---------------------------------------------------------------------------

/** Floor of the sunken throne hall, relative to its doorway level. */
const THRONE_SINK = 7

const throneHall: ModuleDef = {
  id: 'throne_hall',
  size: [3, 1, 3],
  tags: ['boss', 'undercroft'],
  // Entered through any cell of its south wall (sealed: only the attaching door opens)
  connectors: [
    { cell: [1, 0, 2], face: Face.South },
    { cell: [0, 0, 2], face: Face.South },
    { cell: [2, 0, 2], face: Face.South },
  ],
  levels: [-2, -2],
  // The hall is sunk THRONE_SINK blocks below its doorway: a 14-high vault entered from a gallery
  overhang: { down: THRONE_SINK + 1 },
  build(ctx) {
    const { w, h, d } = ctx
    const y0 = -THRONE_SINK // hall floor
    const gz = d - 6 // gallery front row (north edge)
    const door = ctx.connectors.find((c) => c.open) ?? ctx.connectors[0]
    const dx = door.cell[0] * CS + 4 // doorway centre x
    const nearStair = (x: number, margin: number): boolean => Math.abs(x - dx) <= 3 + margin
    shell(ctx, { floor: 'ice', ceiling: 'ice', frame: 'trim', wall: 'wallDeep' })
    // Sink the hall: deep walls and an ice floor below the doorway level
    ctx.fill(0, y0, 0, w - 1, -1, d - 1, 'wallDeep')
    ctx.fill(0, y0, 0, w - 1, y0, d - 1, 'ice')
    ctx.fill(1, y0 + 1, 1, w - 2, 0, gz - 1, AIR)
    // The gallery along the doorway wall (solid beneath), a grate balustrade, a grand stair down
    ctx.fill(1, 0, gz, w - 2, 0, d - 2, 'floor')
    for (let x = 1; x <= w - 2; x++) if (!nearStair(x, 0)) ctx.set(x, 1, gz, 'grate')
    stairs(ctx, dx - 2, y0 + 1, gz - THRONE_SINK, Face.South, THRONE_SINK, 5, STAIRS, 'wallDeep', y0 + 1, true)
    for (const x of [dx - 3, dx + 3]) ctx.fill(x, y0 + 1, gz - THRONE_SINK, x, 0, gz - 1, 'trim') // stair cheeks
    // The damned frozen into the gallery front and the walls, watching
    for (const x of [3, 6, 10, 16, 20, 23]) {
      if (nearStair(x, 1)) continue
      ctx.set(x, y0 + 2, gz, BlockIds.ENTOMBED_UPRIGHT_LOWER)
      ctx.set(x, y0 + 3, gz, BlockIds.ENTOMBED_UPRIGHT_UPPER)
    }
    for (let i = 3; i < w - 3; i += 4) {
      for (const [x, z] of [[i, 0], [0, i], [w - 1, i]]) {
        if (z >= gz) continue
        ctx.set(x, y0 + 2, z, BlockIds.ENTOMBED_UPRIGHT_LOWER)
        ctx.set(x, y0 + 3, z, BlockIds.ENTOMBED_UPRIGHT_UPPER)
      }
    }
    // Two rows of ice pillars, a sinner frozen at each foot
    for (const px of [7, 19]) {
      for (const pz of [6, 11, 16]) {
        if (pz === 16 && nearStair(px, -1)) continue
        pillar(ctx, px, pz, y0 + 1, h - 2, 'pillar')
        ctx.set(px, h - 2, pz, 'trim')
        ctx.set(px, y0 + 1, pz, BlockIds.ENTOMBED_UPRIGHT_LOWER)
        ctx.set(px, y0 + 2, pz, BlockIds.ENTOMBED_UPRIGHT_UPPER)
      }
      if (!nearStair(px, 0)) pillar(ctx, px, gz, y0 + 1, h - 2, 'pillar') // the gallery's front pillars
    }
    // Rune path from the stair foot to the dais
    for (let z = 8; z <= gz - THRONE_SINK - 1; z += 3) for (const x of [dx - 1, dx + 1]) ctx.set(x, y0, z, 'glyph')
    // Dais and the frozen throne, an ember pit of frozen magma before it
    ctx.fill(8, y0 + 1, 1, 18, y0 + 1, 5, 'trim')
    ctx.fill(10, y0 + 2, 1, 16, y0 + 2, 3, 'paving')
    ctx.fill(12, y0 + 3, 1, 14, y0 + 9, 1, 'glacial') // throne back
    ctx.set(13, y0 + 3, 2, 'glacial') // seat
    ctx.fill(12, y0 + 3, 2, 12, y0 + 4, 2, 'trim') // arms
    ctx.fill(14, y0 + 3, 2, 14, y0 + 4, 2, 'trim')
    for (const [cx, cy] of [[12, 10], [14, 10], [13, 11]]) ctx.set(cx, y0 + cy, 1, 'glacial') // crown points
    ctx.fill(11, y0, 6, 15, y0, 6, BlockIds.FROZEN_MAGMA)
    // Banners of the Sovereign on the back wall, braziers in the corners, lanterns from the vault
    for (const x of [5, 21]) banner(ctx, x, y0 + 8, 1, BlockFacing.SOUTH)
    for (const [bx, bz] of [[3, 3], [w - 4, 3], [3, gz - 3], [w - 4, gz - 3]]) {
      ctx.set(bx, y0 + 1, bz === gz - 3 && nearStair(bx, 1) ? 9 : bz, BlockIds.RIME_BRAZIER)
    }
    for (const [lx, lz] of [[7, 13], [19, 13], [13, 9], [dx, gz + 2]]) ctx.light(lx, h - 2, lz)
    sprinkle(ctx, { x0: 1, y0: h - 2, z0: 1, x1: w - 2, y1: h - 2, z1: d - 2 }, BlockIds.ICICLE, 0.08, 91, isAir)
    // The Rime Sovereign's altar, mid-hall
    ctx.guardian(13, y0 + 1, 11, RIME_SOVEREIGN_GUARDIAN_INDEX)
    reopenDoors(ctx)
  },
}

// ---------------------------------------------------------------------------
// Passes: the frozen bailey, curtain walls, towers, gate, crevasse, drawbridge
// ---------------------------------------------------------------------------

/** Standing surface of a column: the lake ice (Y 46) or the terrain above it. */
function surfaceAt(ctx: PassContext, x: number, z: number): number {
  return Math.max(ctx.terrainHeight(x, z), LAKE_LEVEL)
}

/**
 * Lowest Y an exterior column (wall, tower) may fill down to at (x, z): the ground, but never
 * into an undercroft module below (on a shore or in a valley the ground can lie under base).
 */
function columnBottom(ctx: PassContext, x: number, z: number, nominal: number): number {
  const ground = surfaceAt(ctx, x, z) + 1
  if (ground >= nominal) return nominal
  for (const m of ctx.layout.modules) {
    if (m.cell[1] >= 0) continue
    const b = m.writeBox
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 >= ground) return Math.max(ground, b.y1 + 1)
  }
  return ground
}

/** Rectangle around every above-ground module, `BAILEY` blocks out. */
function baileyRect(L: PassContext['layout']): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const m of L.modules) {
    if (m.cell[1] + m.size[1] <= 0) continue
    x0 = Math.min(x0, m.box.x0)
    z0 = Math.min(z0, m.box.z0)
    x1 = Math.max(x1, m.box.x1)
    z1 = Math.max(z1, m.box.z1)
  }
  if (x0 === Infinity) return { x0: L.anchorX - 8, z0: L.anchorZ - 8, x1: L.anchorX + 8, z1: L.anchorZ + 8 }
  return { x0: x0 - BAILEY, z0: z0 - BAILEY, x1: x1 + BAILEY, z1: z1 + BAILEY }
}

/**
 * A 5×5 set piece in an empty bailey cell, min corner (x0, z0), on the paving at `base`:
 * 0 a bed of sinners, 1 an ember fountain, 2 a kneeling knight on a plinth,
 * 3 a grate cage holding one of the damned, 4 a broken colonnade.
 */
function yardPlot(t: PassContext, x0: number, z0: number, base: number, kind: number, facing: number): void {
  const y = base + 1
  const ring = (i: number, k: number): boolean => i === 0 || k === 0 || i === 4 || k === 4
  switch (kind) {
    case 0: // A bed of sinners: a kerb of carved brick round ash snow, the damned standing in it
      for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) t.set(x0 + i, ring(i, k) ? y : base, z0 + k, ring(i, k) ? 'trim' : 'snow')
      for (const [i, k] of [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]]) {
        if (t.hash(x0 + i, y, z0 + k, 403) < 0.7) sinnerPost(t, x0 + i, y, z0 + k, t.hash(x0 + i, y, z0 + k, 404) < 0.4 ? 2 : 1)
      }
      break
    case 1: // An ember fountain: a black-ice basin round a frozen magma heart on an ice pillar
      for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) {
        if (ring(i, k)) t.set(x0 + i, y, z0 + k, (i + k) % 4 === 0 ? 'trim' : 'glacial')
        else t.set(x0 + i, base, z0 + k, 'ice')
      }
      t.set(x0 + 2, base, z0 + 2, BlockIds.FROZEN_MAGMA)
      t.fill(x0 + 2, y, z0 + 2, x0 + 2, y + 1, z0 + 2, 'pillar')
      t.set(x0 + 2, y + 2, z0 + 2, BlockIds.FROZEN_MAGMA)
      t.set(x0 + 2, y + 3, z0 + 2, BlockIds.FROST_CRYSTAL)
      break
    case 2: // A knight kneeling on a plinth, facing the gate, crystals at its feet
      t.fill(x0 + 1, y, z0 + 1, x0 + 3, y, z0 + 3, 'trim')
      t.set(x0 + 2, y + 1, z0 + 2, BlockIds.ICE_KNIGHT_STATUE, facing)
      for (const [i, k] of [[0, 0], [4, 0], [0, 4], [4, 4]]) t.set(x0 + i, y, z0 + k, BlockIds.FROST_CRYSTAL)
      break
    case 3: // A cage of rime grates, one of the damned inside
      for (let i = 1; i <= 3; i++) for (let k = 1; k <= 3; k++) {
        if (i === 2 && k === 2) continue
        t.fill(x0 + i, y, z0 + k, x0 + i, y + 2, z0 + k, 'grate')
      }
      t.fill(x0 + 1, y + 3, z0 + 1, x0 + 3, y + 3, z0 + 3, 'trim')
      t.set(x0 + 2, y, z0 + 2, BlockIds.ENTOMBED_UPRIGHT_LOWER)
      t.set(x0 + 2, y + 1, z0 + 2, BlockIds.ENTOMBED_UPRIGHT_UPPER)
      t.set(x0 + 2, base, z0 + 2, 'ice')
      break
    default: // A broken colonnade: four ice pillars snapped at different heights
      for (const [i, k] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
        const top = y + 1 + Math.floor(t.hash(x0 + i, y, z0 + k, 405) * 5)
        t.fill(x0 + i, y, z0 + k, x0 + i, top, z0 + k, 'pillar')
        if (top >= y + 4) t.set(x0 + i, top + 1, z0 + k, 'trim')
      }
      t.set(x0 + 2, y, z0 + 2, t.hash(x0, y, z0, 406) < 0.5 ? BlockIds.FROST_CRYSTAL : 'snow')
      break
  }
}

/** Foundation: a level frozen bailey (paved ice), cut into any shore, pillars under raised modules. */
function foundationPass(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const base = L.baseY
  const r = baileyRect(ctx.layout)
  const x0 = Math.max(r.x0 - TOWER_R, clip.x0), x1 = Math.min(r.x1 + TOWER_R, clip.x1)
  const z0 = Math.max(r.z0 - TOWER_R, clip.z0), z1 = Math.min(r.z1 + TOWER_R, clip.z1)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const ground = surfaceAt(ctx, x, z)
      if (ground < base - 1) ctx.fill(x, Math.max(ground + 1, base - 40), z, x, base - 1, z, 'foundation')
      ctx.set(x, base, z, 'paving')
      // Clear ridges, frozen figures, drifts and any hill above the bailey
      ctx.fill(x, base + 1, z, x, Math.max(base + 6, ground), z, AIR)
    }
  }
  // The open bailey is the Garden of the Damned: in empty grid cells a frozen set piece
  // (sinner beds, ember fountains, statues, cages, broken colonnades); elsewhere sinners frozen
  // in black-ice posts, drifts against the curtain wall, frost crystals. Kept off the gate lane
  // and 2+ blocks from every building.
  const e = L.entrance
  const alongX = e.face === Face.North || e.face === Face.South
  const inGateLane = (x: number, z: number): boolean => {
    if (!(alongX ? Math.abs(x - e.x) <= 3 : Math.abs(z - e.z) <= 3)) return false
    const ahead = alongX ? (z - e.z) * (e.face === Face.South ? 1 : -1) : (x - e.x) * (e.face === Face.East ? 1 : -1)
    return ahead >= -1
  }
  const cellFree = (cx: number, cz: number): boolean => {
    for (let level = 0; level <= 2; level++) if (L.moduleAt(cx, level, cz) >= 0) return false
    return true
  }
  const cellOf = (x: number, z: number): [number, number] => [Math.floor((x - L.originX) / CS), Math.floor((z - L.originZ) / CS)]
  /** Does this empty cell host a set piece (whole 9×9 inside the bailey, off the gate lane)? */
  const plotKind = (cx: number, cz: number): number => {
    const x0 = L.originX + cx * CS, z0 = L.originZ + cz * CS
    if (x0 < r.x0 + 2 || z0 < r.z0 + 2 || x0 + CS - 1 > r.x1 - 2 || z0 + CS - 1 > r.z1 - 2) return -1
    if (!cellFree(cx, cz)) return -1
    for (const [px, pz] of [[x0, z0], [x0 + CS - 1, z0], [x0, z0 + CS - 1], [x0 + CS - 1, z0 + CS - 1]]) if (inGateLane(px, pz)) return -1
    const hsh = ctx.hash(cx, 7, cz, 409)
    return hsh < 0.5 ? Math.floor(ctx.hash(cx, 8, cz, 410) * 5) : -1
  }
  const isOpenYard = (x: number, z: number): boolean => {
    for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]) {
      const [cx, cz] = cellOf(x + ox, z + oz)
      if (!cellFree(cx, cz)) return false
    }
    if (inGateLane(x, z)) return false
    const [cx, cz] = cellOf(x, z)
    if (plotKind(cx, cz) >= 0) return false
    return x > r.x0 + 1 && x < r.x1 - 1 && z > r.z0 + 1 && z < r.z1 - 1
  }
  for (let x = Math.max(r.x0, clip.x0); x <= Math.min(r.x1, clip.x1); x++) {
    for (let z = Math.max(r.z0, clip.z0); z <= Math.min(r.z1, clip.z1); z++) {
      if (!isOpenYard(x, z)) continue
      const hsh = ctx.hash(x, base, z, 401)
      if ((x & 7) === 3 && (z & 7) === 3 && hsh < 0.55) {
        sinnerPost(ctx, x, base + 1, z, hsh < 0.25 ? 2 : 1)
      } else if ((x <= r.x0 + 3 || x >= r.x1 - 3 || z <= r.z0 + 3 || z >= r.z1 - 3) && hsh < 0.22) {
        ctx.set(x, base + 1, z, 'snow')
      } else if (hsh > 0.985) {
        ctx.set(x, base + 1, z, BlockIds.FROST_CRYSTAL)
      }
    }
  }
  const statueFacing = [BlockFacing.EAST, BlockFacing.SOUTH, BlockFacing.WEST, BlockFacing.NORTH][e.face] ?? BlockFacing.SOUTH
  const [ccx0, ccz0] = cellOf(Math.max(r.x0, clip.x0) - CS, Math.max(r.z0, clip.z0) - CS)
  const [ccx1, ccz1] = cellOf(Math.min(r.x1, clip.x1) + CS, Math.min(r.z1, clip.z1) + CS)
  for (let cx = ccx0; cx <= ccx1; cx++) {
    for (let cz = ccz0; cz <= ccz1; cz++) {
      const kind = plotKind(cx, cz)
      // Jittered within the cell (always 1+ block from its edge)
      const jx = Math.floor(ctx.hash(cx, 9, cz, 411) * 3) - 1
      const jz = Math.floor(ctx.hash(cx, 10, cz, 412) * 3) - 1
      if (kind >= 0) yardPlot(ctx, L.originX + cx * CS + 2 + jx, L.originZ + cz * CS + 2 + jz, base, kind, statueFacing)
    }
  }
  // Raised modules (level >= 1 with nothing under them) stand on glacial brick piers
  for (const m of L.modules) {
    if (m.cell[1] < 1) continue
    const below = L.moduleAt(m.cell[0], m.cell[1] - 1, m.cell[2])
    if (below >= 0) continue
    for (const [px, pz] of [[m.box.x0, m.box.z0], [m.box.x1, m.box.z0], [m.box.x0, m.box.z1], [m.box.x1, m.box.z1]]) {
      ctx.fill(px, base + 1, pz, px, m.box.y0 - 1, pz, 'foundation')
    }
  }
}

/** A round-ish tower: solid core of masonry, battlements, a glacial-ice cone and a lantern on top. */
function cornerTower(ctx: PassContext, cx: number, cz: number, base: number): void {
  const top = base + TOWER_TOP
  for (let dx = -TOWER_R; dx <= TOWER_R; dx++) {
    for (let dz = -TOWER_R; dz <= TOWER_R; dz++) {
      const d2 = dx * dx + dz * dz
      if (d2 > TOWER_R * TOWER_R + 2) continue
      ctx.fill(cx + dx, columnBottom(ctx, cx + dx, cz + dz, base - 2), cz + dz, cx + dx, top, cz + dz, d2 > (TOWER_R - 1) * (TOWER_R - 1) + 1 && (dx + dz) % 5 === 0 ? 'trim' : 'wall')
      // Merlons on the rim
      if (d2 > (TOWER_R - 1) * (TOWER_R - 1) + 1 && ((dx + dz) & 1) === 0) ctx.set(cx + dx, top + 1, cz + dz, 'wall')
    }
  }
  // Cone roof
  for (let i = 0; i < 8; i++) {
    const rr = (TOWER_R - 1) * (1 - i / 8)
    for (let dx = -TOWER_R; dx <= TOWER_R; dx++) {
      for (let dz = -TOWER_R; dz <= TOWER_R; dz++) {
        if (dx * dx + dz * dz <= rr * rr + 0.3) ctx.set(cx + dx, top + 1 + i, cz + dz, i % 3 === 2 ? 'ice' : 'glacial')
      }
    }
  }
  ctx.set(cx, top + 9, cz, BlockIds.FROST_LANTERN)
}

/** Exterior: curtain wall, frost-lantern towers, the gate with its icicle portcullis, the crevasse and the drawbridge. */
function exteriorPass(ctx: PassContext): void {
  if (ctx.dryRun) return
  const L = ctx.layout
  const base = L.baseY
  const r = baileyRect(ctx.layout)
  const e = L.entrance
  const alongX = e.face === Face.North || e.face === Face.South
  const gateHalf = 3

  // Curtain wall (1 thick, crenellated), banners on its outer face
  const inGate = (x: number, z: number): boolean =>
    alongX ? Math.abs(x - e.x) <= gateHalf && (e.face === Face.South ? z === r.z1 : z === r.z0)
      : Math.abs(z - e.z) <= gateHalf && (e.face === Face.East ? x === r.x1 : x === r.x0)
  const wallColumn = (x: number, z: number): void => {
    if (inGate(x, z)) return
    ctx.fill(x, columnBottom(ctx, x, z, base), z, x, base + WALL_TOP, z, 'wall')
    if (((x + z) & 1) === 0) ctx.set(x, base + WALL_TOP + 1, z, 'wall')
  }
  for (let x = r.x0; x <= r.x1; x++) { wallColumn(x, r.z0); wallColumn(x, r.z1) }
  for (let z = r.z0 + 1; z < r.z1; z++) { wallColumn(r.x0, z); wallColumn(r.x1, z) }
  for (let x = r.x0 + 6; x < r.x1 - 4; x += 10) {
    if (!inGate(x, r.z0)) banner(ctx, x, base + 9, r.z0 - 1, BlockFacing.NORTH)
    if (!inGate(x, r.z1)) banner(ctx, x, base + 9, r.z1 + 1, BlockFacing.SOUTH)
  }
  for (let z = r.z0 + 6; z < r.z1 - 4; z += 10) {
    if (!inGate(r.x0, z)) banner(ctx, r.x0 - 1, base + 9, z, BlockFacing.WEST)
    if (!inGate(r.x1, z)) banner(ctx, r.x1 + 1, base + 9, z, BlockFacing.EAST)
  }
  // Frost-lantern towers at the corners
  for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) cornerTower(ctx, cx, cz, base)

  // The gate in the curtain wall: carved arch, icicle portcullis, brazier-topped gate towers
  const wallPlane = e.face === Face.South ? r.z1 : e.face === Face.North ? r.z0 : e.face === Face.East ? r.x1 : r.x0
  const [fx, , fz] = FACE_DIR[e.face]
  const at = (along: number, across: number): [number, number] =>
    alongX ? [e.x + across, wallPlane + fz * along] : [wallPlane + fx * along, e.z + across]
  for (let k = -gateHalf - 1; k <= gateHalf + 1; k++) {
    const [gx, gz] = at(0, k)
    if (Math.abs(k) === gateHalf + 1) { ctx.fill(gx, base + 1, gz, gx, base + 8, gz, 'trim'); continue }
    ctx.fill(gx, base + 1, gz, gx, base + 6, gz, AIR)
    ctx.fill(gx, base + 7, gz, gx, base + 8, gz, 'trim')
    ctx.set(gx, base, gz, 'paving')
    if (Math.abs(k) <= gateHalf - 1) ctx.set(gx, base + 6, gz, BlockIds.ICICLE)
  }
  for (const side of [-1, 1]) {
    for (let a = -1; a <= 1; a++) {
      for (let k = gateHalf + 2; k <= gateHalf + 4; k++) {
        const [gx, gz] = at(a, side * k)
        ctx.fill(gx, columnBottom(ctx, gx, gz, base), gz, gx, base + 14, gz, 'wall')
      }
    }
    const [bx, bz] = at(0, side * (gateHalf + 3))
    ctx.set(bx, base + 15, bz, BlockIds.RIME_BRAZIER)
    const [mx, mz] = at(2, side * (gateHalf + 3))
    banner(ctx, mx, base + 12, mz, [BlockFacing.EAST, BlockFacing.SOUTH, BlockFacing.WEST, BlockFacing.NORTH][e.face] ?? BlockFacing.SOUTH)
  }

  // The crevasse: a trench cut into the lake ice across the approach, with ice steps out at both ends
  const c0 = CREVASSE_GAP, c1 = CREVASSE_GAP + CREVASSE_LENGTH - 1
  for (let a = c0; a <= c1; a++) {
    for (let k = -CREVASSE_HALF_WIDTH; k <= CREVASSE_HALF_WIDTH; k++) {
      const [gx, gz] = at(a, k)
      const floor = base - CREVASSE_DEPTH
      const endStep = CREVASSE_HALF_WIDTH - Math.abs(k) // 1-block steps up to both ends: climbable
      const bottom = Math.min(base - 1, floor + Math.max(0, CREVASSE_DEPTH - 1 - endStep))
      // Open to the sky: up past the lake's pressure ridges and sinner posts (LAKE_LEVEL + 4)
      // and any rimestone ridge the trench crosses - a lower cut left their tops floating
      ctx.fill(gx, bottom, gz, gx, Math.max(base + 2, LAKE_LEVEL + MAX_RIDGE_HEIGHT, surfaceAt(ctx, gx, gz)), gz, AIR)
      ctx.set(gx, bottom - 1, gz, 'ice')
      if (ctx.hash(gx, bottom, gz, 81) < 0.12) ctx.set(gx, bottom, gz, BlockIds.FROST_CRYSTAL)
    }
  }
  // The drawbridge: frostbound planks over the crevasse on glacial-brick sills
  for (let a = 1; a <= c1 + 1; a++) {
    for (let k = -2; k <= 2; k++) {
      const [gx, gz] = at(a, k)
      ctx.set(gx, base, gz, a >= c0 && a <= c1 ? 'planks' : 'trim')
      ctx.fill(gx, base + 1, gz, gx, Math.max(base + 4, surfaceAt(ctx, gx, gz)), gz, AIR)
    }
    for (const k of [-3, 3]) {
      const [gx, gz] = at(a, k)
      if (a === c0 - 1 || a === c1 + 1) ctx.fill(gx, base, gz, gx, base + 2, gz, 'trim') // bridge posts
    }
  }
  // The Way of the Damned: a paved causeway over the lake ice, cut through any ice ridge in its
  // path (ramping at most 1 block per block), sinners frozen in posts along both sides
  let level = base
  for (let a = c1 + 2; a <= c1 + 1 + APPROACH_LENGTH; a++) {
    let ground = -Infinity
    for (let k = -2; k <= 2; k++) { const [gx, gz] = at(a, k); ground = Math.max(ground, surfaceAt(ctx, gx, gz)) }
    if (ground < level) level = Math.max(ground, level - 1)
    else if (ground > level) level = Math.min(ground, level + 1)
    for (let k = -2; k <= 2; k++) {
      const [gx, gz] = at(a, k)
      const g = surfaceAt(ctx, gx, gz)
      if (g < level - 1) ctx.fill(gx, g + 1, gz, gx, level - 1, gz, 'foundation')
      ctx.set(gx, level, gz, 'paving')
      ctx.fill(gx, level + 1, gz, gx, Math.max(level + 4, g), gz, AIR)
    }
    if ((a - c1) % 6 === 4) {
      for (const k of [-3, 3]) {
        const [gx, gz] = at(a, k)
        const g = surfaceAt(ctx, gx, gz)
        if (g <= level) {
          if (g < level) ctx.fill(gx, g + 1, gz, gx, level, gz, 'foundation')
          sinnerPost(ctx, gx, level + 1, gz, 1)
        }
      }
    }
  }
}

export const frozenCitadelKit: DungeonKit = {
  id: FROZEN_CITADEL_KIT_ID,
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-2, 2],
  worldYRange: [4, 136],
  modules: [
    gatehouse,
    corridor('corridor', [Face.North, Face.South], 3),
    corridor('corner', [Face.South, Face.East], 2),
    corridor('tee', [Face.South, Face.East, Face.West], 2),
    corridor('crossing', [Face.North, Face.South, Face.East, Face.West], 1.4),
    corridor('crypt_passage', [Face.North, Face.South], 1.4, [-2, -2]),
    corridor('crypt_turn', [Face.South, Face.East], 1, [-2, -2]),
    guardPost,
    greatHall,
    guardRoom,
    archerGallery,
    library,
    chapel,
    courtyard,
    stairModule('stair_up', [0, 1], false),
    stairModule('undercroft_stair', [-1, -1], true),
    stairModule('crypt_stair', [-2, -2], true),
    frostTower,
    greatSpire,
    prison,
    wardenRoom,
    cistern,
    vault,
    alcove,
    throneHall,
  ],
  targetModules: [24, 31],
  // The throne hall is always on the lowest level (-2), the physical bottom of the undercroft;
  // a branch may run a little further from the gate than the stair down to it
  bossDepthFraction: 0.5,
  // Big ground-floor set pieces (great hall, courtyard, spire) and a 3×3 throne hall on level -2
  // are demanding; ~4% of castles needed more than the default 24 tries
  maxAttempts: 64,
  require: [
    { tag: 'vault', count: 2 },
    { tag: 'garrison', count: 4 },
    { tag: 'undercroft', count: 4 },
    { tag: 'crypt', count: 3 },
  ],
  palette,
  // Vaults always hold tier 3; the library, warden and spire tier 2; working rooms at least tier 1
  tierFor(m, info) {
    const band = Math.min(2, Math.floor((3 * m.depth) / (info.maxDepth + 1)))
    switch (m.def.id) {
      case 'vault':
      case 'throne_hall':
        return 3
      case 'library':
      case 'warden_room':
      case 'great_spire':
        return 2
      case 'alcove':
      case 'corridor':
        return band
      default:
        return Math.max(1, band)
    }
  },
  // Tier signature under each chest: plain brick, an ember slab, pale glacial ice, a glowing rune
  lootTierBlocks: [BlockIds.GLACIAL_BRICK, BlockIds.FROZEN_MAGMA, BlockIds.GLACIAL_ICE, BlockIds.RIME_GLYPH],
  // Covers the causeway (the longest reach, out from the gate side's grid edge: bailey, crevasse,
  // bridge sill, causeway) with 3 to spare; the corner towers need only BAILEY + TOWER_R
  exteriorMargin: BAILEY + CREVASSE_GAP + CREVASSE_LENGTH + 1 + APPROACH_LENGTH + 3,
  exteriorHeight: 14,
  baseY(ctx) {
    // On the lake: one above the ice; on a shore: the median terrain (cut into it)
    const heights: number[] = []
    const r = ctx.radius * 0.75
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) heights.push(ctx.terrainHeight(Math.round(ctx.anchorX + (i * r) / 2), Math.round(ctx.anchorZ + (j * r) / 2)))
    }
    heights.sort((a, b) => a - b)
    return Math.max(LAKE_LEVEL + 1, heights[Math.floor(heights.length / 2)])
  },
  baseYRange: [LAKE_LEVEL + 1, 64],
  foundation: foundationPass,
  exterior: exteriorPass,
}

registerDungeonKit(frozenCitadelKit)
