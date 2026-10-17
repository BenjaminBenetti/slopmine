import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, type ModuleContext, type ModuleDef } from '../../DungeonTypes.ts'
import { battlements, doorways, pillar, roofPitched, room, spiralRing, spiralStairs, stairs, walls } from '../../DungeonBuild.ts'
import { BASTION_GARRISON as G, PYRE_TYRANT_INDEX } from './BastionConfig.ts'
import {
  CS,
  FH,
  banner,
  barWindows,
  brazier,
  clearDoorways,
  crenellate,
  hangLantern,
  hasOpenRoof,
  rack,
  scatter,
  spiralCornerSupports,
} from './BastionBuild.ts'

/**
 * The Infernal Bastion's modules (cell 9 blocks, level 7 blocks). Builders
 * draw in module-local canonical coordinates: x east, z south, y up, y = 0
 * is the bottom floor; the writer rotates. Every builder is pure (seam-safe):
 * the same calls in every sub-chunk, randomness only from ctx.rng (fresh per
 * call) and ctx.hash (world-anchored).
 */

const STAIRS = BlockIds.INFERNAL_BRICK_STAIRS
const SLAB = BlockIds.INFERNAL_BRICK_SLAB
const BARS = BlockIds.INFERNAL_IRON_BARS
const AIR = BlockIds.AIR

/** Walls of the undercroft and smoky rooms. */
function darkWalls(ctx: ModuleContext): string {
  return ctx.level < 0 ? 'wallDark' : 'wall'
}

// ===========================================================================
// Entrance
// ===========================================================================

/** Gatehouse: drum turrets with brazier crowns, raised portcullis, gate guard. */
const gatehouse: ModuleDef = {
  id: 'gatehouse',
  size: [1, 1, 1],
  tags: ['entrance', 'garrison'],
  weight: 2,
  levels: [0, 0],
  overhang: { up: 8 },
  connectors: [
    { cell: [0, 0, 0], face: Face.South, exterior: true },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    crenellate(ctx)
    // Drum turrets flanking the gate, crowned with braziers
    for (const x0 of [0, w - 3]) {
      ctx.fill(x0, 0, d - 3, x0 + 2, h + 5, d - 1, 'wall')
      battlements(ctx, x0, d - 3, x0 + 2, d - 1, h + 6, 'wall')
      ctx.light(x0 + 1, h + 6, d - 2, BlockIds.INFERNAL_BRAZIER)
      ctx.set(x0 + 1, h + 2, d - 1, 'glyph')
    }
    // Raised portcullis in the top of the gate arch, a glyph keystone above
    ctx.fill(3, 4, d - 1, 5, 4, d - 1, BARS, ctx.facing(BlockFacing.SOUTH))
    ctx.set(4, h - 1, d - 1, 'glyph')
    banner(ctx, 1, 3, 2, Face.West)
    banner(ctx, w - 2, 3, 2, Face.East)
    hangLantern(ctx, 4, 4)
    ctx.garrison(4, 0, 4, G.GATE_GUARD)
  },
}

/** Gate keep: one tall square tower over the gate passage, pyramid roof and beacon. */
const gateKeep: ModuleDef = {
  id: 'gate_keep',
  size: [1, 1, 1],
  tags: ['entrance', 'garrison'],
  weight: 1,
  levels: [0, 0],
  overhang: { up: 14 },
  connectors: [
    { cell: [0, 0, 0], face: Face.South, exterior: true },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    // The tower shaft above the gate passage (sealed), bar windows, a stepped roof
    walls(ctx, { x0: 0, y0: h, z0: 0, x1: w - 1, y1: h + 6, z1: d - 1 }, 'wall')
    ctx.fill(1, h + 6, 1, w - 2, h + 6, d - 2, 'wall')
    for (const [x, z, f] of [[4, 0, BlockFacing.SOUTH], [4, d - 1, BlockFacing.SOUTH], [0, 4, BlockFacing.EAST], [w - 1, 4, BlockFacing.EAST]] as const) {
      ctx.fill(x, h + 2, z, x, h + 3, z, BARS, ctx.facing(f))
    }
    battlements(ctx, 0, 0, w - 1, d - 1, h + 7, 'wall')
    ctx.fill(2, h + 7, 2, w - 3, h + 8, d - 3, 'roof')
    ctx.fill(3, h + 9, 3, w - 4, h + 10, d - 4, 'roof')
    ctx.set(4, h + 11, 4, 'trim')
    ctx.light(4, h + 12, 4, BlockIds.INFERNAL_BRAZIER)
    ctx.fill(3, 4, d - 1, 5, 4, d - 1, BARS, ctx.facing(BlockFacing.SOUTH))
    ctx.set(4, h - 1, d - 1, 'glyph')
    ctx.set(4, h + 4, d - 1, 'glyph')
    banner(ctx, 1, 3, 4, Face.West)
    banner(ctx, w - 2, 3, 4, Face.East)
    hangLantern(ctx, 4, 4)
    ctx.garrison(4, 0, 4, G.GATE_GUARD)
  },
}

// ===========================================================================
// Passages
// ===========================================================================

/** Arcaded passage pieces (any level; brick tunnels in the undercroft). */
function arcade(id: string, faces: Face[], weight: number): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: ['corridor'],
    weight,
    levels: [-1, 2],
    overhang: { up: 1 },
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    build(ctx) {
      const deep = ctx.level < 0
      room(ctx, {
        wall: darkWalls(ctx),
        floor: ctx.level >= 1 ? 'planks' : 'floor',
        ceiling: darkWalls(ctx),
        doorFrame: 'trim',
      })
      for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) ctx.fill(x, 1, z, x, 5, z, 'trim')
      if (deep) {
        // Hanging chains and soot in the tunnels
        if (ctx.hash(0, 0, 0, 0x41) < 0.6) for (const y of [4, 5]) ctx.set(2, y, 6, BlockIds.INFERNAL_CHAIN)
        if (ctx.hash(0, 0, 0, 0x42) < 0.6) hangLantern(ctx, 4, 4)
        scatter(ctx, 2, 1, 2, 6, 6, 'ash', 0.06, 0x43)
        clearDoorways(ctx)
      } else {
        barWindows(ctx)
        hangLantern(ctx, 4, 4)
        if (ctx.level >= 1 && ctx.rng.chance(0.1)) ctx.garrison(4, 0, 4, G.WALL_PATROL)
      }
      crenellate(ctx)
    },
  }
}

/** A hall crossed by a lava channel under two slab bridges. */
const lavaBridge: ModuleDef = {
  id: 'lava_bridge',
  size: [1, 1, 2],
  tags: ['corridor', 'lava'],
  weight: 1.2,
  maxCount: 3,
  levels: [-1, 0],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
  ],
  build(ctx) {
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wallDark', doorFrame: 'trim' })
    // Channel across the hall (x 1..7, z 8..9), magma rims, a slab bridge in the middle
    ctx.fill(1, 0, 8, 7, 0, 9, BlockIds.LAVA)
    for (const z of [7, 10]) {
      for (let x = 1; x <= 7; x++) ctx.set(x, 1, z, x % 2 === 0 ? 'magma' : 'wallDark')
    }
    ctx.fill(3, 1, 7, 5, 1, 10, SLAB)
    hangLantern(ctx, 4, 3)
    hangLantern(ctx, 4, 14)
    clearDoorways(ctx)
    crenellate(ctx)
  },
}

// ===========================================================================
// Bailey and keep rooms
// ===========================================================================

/** Open inner yard: parapet walls, gate posts, and a lava feature. */
const courtyard: ModuleDef = {
  id: 'courtyard',
  size: [2, 1, 2],
  tags: ['courtyard', 'open'],
  weight: 1.5,
  maxCount: 2,
  levels: [0, 0],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    ctx.fill(0, 0, 0, w - 1, 0, d - 1, 'floor')
    ctx.fill(0, 1, 0, w - 1, h - 1, d - 1, AIR)
    walls(ctx, { x0: 0, y0: 1, z0: 0, x1: w - 1, y1: 2, z1: d - 1 }, 'wall')
    walls(ctx, { x0: 0, y0: 3, z0: 0, x1: w - 1, y1: 3, z1: d - 1 }, SLAB)
    doorways(ctx, 'trim')
    // Ash drifted onto the flagstones
    for (let x = 1; x < w - 1; x++) {
      for (let z = 1; z < d - 1; z++) if (ctx.hash(x, 0, z, 0x51) < 0.05) ctx.set(x, 0, z, 'ash')
    }
    const variant = ctx.rng.int(0, 2)
    if (variant === 0) {
      // A lava channel across the yard with two slab bridges
      ctx.fill(2, 0, 8, w - 3, 0, 9, BlockIds.LAVA)
      for (const z of [7, 10]) for (let x = 2; x <= w - 3; x++) ctx.set(x, 1, z, x % 2 === 0 ? 'magma' : 'wall')
      for (const x0 of [4, 12]) ctx.fill(x0, 1, 7, x0 + 1, 1, 10, SLAB)
    } else if (variant === 1) {
      // A glyph obelisk in a ring of lava, crowned with a brazier
      ctx.fill(6, 0, 6, 11, 0, 11, BlockIds.LAVA)
      walls(ctx, { x0: 5, y0: 1, z0: 5, x1: 12, y1: 1, z1: 12 }, 'magma')
      ctx.fill(6, 0, 6, 11, 0, 6, 'floor')
      ctx.fill(8, 0, 8, 9, 0, 9, 'floor')
      ctx.fill(8, 1, 8, 9, 5, 9, 'trim')
      ctx.set(8, 3, 8, 'glyph')
      ctx.set(9, 3, 9, 'glyph')
      ctx.light(8, 6, 8, BlockIds.INFERNAL_BRAZIER)
    } else {
      // A forge yard: anvils on a scorched apron, a magma vent
      ctx.fill(5, 0, 5, 12, 0, 12, 'wallDark')
      ctx.set(6, 1, 6, BlockIds.INFERNAL_ANVIL, ctx.facing(BlockFacing.SOUTH))
      ctx.set(11, 1, 11, BlockIds.INFERNAL_ANVIL, ctx.facing(BlockFacing.EAST))
      ctx.set(8, 0, 9, BlockIds.HELL_MAGMA)
      ctx.light(9, 1, 6, BlockIds.INFERNAL_BRAZIER)
    }
    // Brazier posts in the four corners
    for (const [x, z] of [[2, 2], [w - 3, 2], [2, d - 3], [w - 3, d - 3]]) {
      ctx.fill(x, 1, z, x, 2, z, 'trim')
      ctx.light(x, 3, z, BlockIds.INFERNAL_BRAZIER)
    }
  },
}

/** Barracks: bunks, weapon racks, the garrison and its stores chest. */
const barracks: ModuleDef = {
  id: 'barracks',
  size: [2, 1, 1],
  tags: ['garrison', 'room'],
  weight: 2,
  maxCount: 2,
  minDepth: 1,
  levels: [0, 1],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.South },
  ],
  build(ctx) {
    const { w, d } = ctx
    room(ctx, { wall: 'wallDark', floor: 'planks', ceiling: 'wall', doorFrame: 'trim' })
    // Bunks: plank berths with slab upper bunks on posts
    for (const bx of [7, 10, 13]) {
      ctx.fill(bx, 1, 1, bx + 1, 1, 2, 'planks')
      ctx.fill(bx, 2, 1, bx, 2, 1, 'trim')
      ctx.fill(bx, 3, 1, bx + 1, 3, 2, SLAB)
    }
    for (const bx of [4, 7, 10]) {
      ctx.fill(bx, 1, d - 3, bx + 1, 1, d - 2, 'planks')
      ctx.fill(bx, 3, d - 3, bx + 1, 3, d - 2, SLAB)
    }
    rack(ctx, w - 3, 1, d - 2, Face.South)
    rack(ctx, w - 2, 1, d - 2, Face.South)
    banner(ctx, 1, 3, 1, Face.West)
    // Stores chest on a tile pad, clear of the plank berths (planks mark loot tier 1)
    ctx.fill(0, 0, d - 3, 2, 0, d - 1, 'floor')
    ctx.chest(1, 1, d - 2, { facing: BlockFacing.EAST })
    hangLantern(ctx, 4, 4)
    hangLantern(ctx, 13, 4)
    barWindows(ctx)
    clearDoorways(ctx)
    ctx.garrison(9, 0, 4, G.BARRACKS)
    crenellate(ctx)
  },
}

/** Forge hall: double height, hearths, anvils, a lava trough, a gallery above. */
const forgeHall: ModuleDef = {
  id: 'forge_hall',
  size: [2, 2, 2],
  tags: ['garrison', 'room', 'forge'],
  weight: 1.5,
  maxCount: 1,
  minDepth: 1,
  levels: [0, 0],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 1], face: Face.West },
    { cell: [1, 1, 1], face: Face.East },
    { cell: [0, 1, 0], face: Face.North },
  ],
  build(ctx) {
    const { w, d } = ctx
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wallDark', interiorFloors: false, doorFrame: 'trim' })
    // Gallery along the east side (level 1 floor), railings, stairs up
    ctx.fill(11, FH, 1, w - 2, FH, d - 2, 'planks')
    for (let z = 3; z <= d - 2; z++) if (z < 9 || z > 11) ctx.set(11, FH + 1, z, BARS, ctx.facing(BlockFacing.EAST))
    // North gallery strip for the level-1 north door (x 1..10, z 1..2)
    ctx.fill(1, FH, 1, 10, FH, 2, 'planks')
    for (let x = 1; x <= 10; x++) ctx.set(x, FH + 1, 3, BARS, ctx.facing(BlockFacing.SOUTH))
    stairs(ctx, 9, 1, 16, Face.North, FH, 2, STAIRS, 'wallDark', 1, true)
    // Hearths against the west wall: magma-brick fireboxes holding lava, hoods to the ceiling
    for (const z0 of [5, 9]) {
      ctx.fill(1, 1, z0, 3, 2, z0 + 2, 'magma')
      ctx.set(2, 1, z0 + 1, BlockIds.LAVA)
      ctx.set(2, 2, z0 + 1, AIR)
      ctx.fill(1, 3, z0, 1, FH - 1, z0 + 2, 'wallDark')
      ctx.set(5, 1, z0 + 1, BlockIds.INFERNAL_ANVIL, ctx.facing(BlockFacing.WEST))
    }
    // Lava trough along the south wall behind a magma rim
    ctx.fill(2, 0, d - 2, 7, 0, d - 2, BlockIds.LAVA)
    for (let x = 2; x <= 7; x++) ctx.set(x, 1, d - 3, x % 2 === 0 ? 'magma' : 'wallDark')
    // Chains and lanterns from the high ceiling
    hangLantern(ctx, 6, 5, 1, 3)
    hangLantern(ctx, 6, 13, 1, 3)
    hangLantern(ctx, 14, 5, 1, 1)
    ctx.chest(w - 2, 1, 1, { facing: BlockFacing.WEST })
    barWindows(ctx)
    clearDoorways(ctx)
    ctx.garrison(6, 0, 9, G.FORGE)
    crenellate(ctx)
  },
}

/** Kennels: iron pens with ash floors along an aisle - a hellhound pack. */
const kennels: ModuleDef = {
  id: 'kennels',
  size: [1, 1, 2],
  tags: ['garrison', 'room'],
  weight: 1,
  maxCount: 1,
  minDepth: 1,
  levels: [0, 0],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
  ],
  build(ctx) {
    const { d } = ctx
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    for (const [x0, x1, barX] of [[1, 2, 3], [6, 7, 5]]) {
      ctx.fill(x0, 0, 1, x1, 0, d - 2, 'ash')
      for (let z = 2; z <= d - 3; z++) {
        if (z % 5 === 4) continue // pen gates (gaps)
        ctx.fill(barX, 1, z, barX, 3, z, BARS, ctx.facing(BlockFacing.EAST))
      }
      for (const z of [6, 11]) ctx.fill(x0, 1, z, x1, 3, z, 'wallDark')
    }
    hangLantern(ctx, 4, 4)
    hangLantern(ctx, 4, 13)
    clearDoorways(ctx)
    ctx.garrison(4, 0, 9, G.KENNEL)
    crenellate(ctx)
  },
}

/** Armory: racked weapons, an anvil, a stores chest. */
const armory: ModuleDef = {
  id: 'armory',
  size: [1, 1, 1],
  tags: ['room', 'armory'],
  weight: 1.2,
  maxCount: 2,
  levels: [0, 2],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.East },
  ],
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    for (const x of [2, 3, 5, 6]) rack(ctx, x, 1, 1, Face.North)
    for (const z of [2, 4, 6]) rack(ctx, 1, 1, z, Face.West)
    banner(ctx, 1, 3, 4, Face.West)
    ctx.set(5, 1, 5, BlockIds.INFERNAL_ANVIL, ctx.facing(BlockFacing.SOUTH))
    ctx.chest(7, 1, 1, { facing: BlockFacing.SOUTH })
    hangLantern(ctx, 4, 4)
    barWindows(ctx)
    clearDoorways(ctx)
    crenellate(ctx)
  },
}

/** Great hall: the feasting hall of the keep - long table, pillars, banners, pitched roof. */
const greatHall: ModuleDef = {
  id: 'great_hall',
  size: [2, 1, 3],
  tags: ['room', 'hall'],
  weight: 1.5,
  maxCount: 2,
  levels: [0, 2],
  overhang: { up: 10 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [0, 0, 2], face: Face.South },
    { cell: [1, 0, 2], face: Face.South },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [0, 0, 1], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    room(ctx, { wall: 'wall', floor: 'planks', ceiling: 'wall', doorFrame: 'trim' })
    for (const x of [4, w - 5]) for (const z of [5, 11, 16, 22]) ctx.fill(x, 1, z, x, h - 2, z, 'trim')
    // The long table with slab benches
    ctx.fill(8, 1, 6, 9, 1, d - 7, 'planks')
    ctx.fill(7, 1, 6, 7, 1, d - 7, SLAB)
    ctx.fill(10, 1, 6, 10, 1, d - 7, SLAB)
    for (const z of [8, 13, 18]) hangLantern(ctx, 8 + (z % 2), z, 0, 2)
    for (const z of [3, 9, 18, 24]) {
      banner(ctx, 1, 3, z, Face.West)
      banner(ctx, w - 2, 3, z, Face.East)
    }
    for (const [x, z] of [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2]]) brazier(ctx, x, 1, z)
    barWindows(ctx, 3, 2)
    clearDoorways(ctx)
    if (ctx.rng.chance(0.35)) ctx.garrison(5, 0, 13, G.BARRACKS)
    if (hasOpenRoof(ctx)) roofPitched(ctx, 0, 0, w - 1, d - 1, h, 'roof', false, 'wall')
  },
}

/** Caster sanctum: a ritual ring of glyphs, braziers, the casters' nest. */
const casterSanctum: ModuleDef = {
  id: 'caster_sanctum',
  size: [1, 1, 1],
  tags: ['garrison', 'room'],
  weight: 1.3,
  maxCount: 2,
  minDepth: 2,
  levels: [0, 2],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    for (const [x, z] of [[4, 2], [4, 6], [2, 4], [6, 4]]) ctx.set(x, 0, z, 'glyph')
    brazier(ctx, 1, 1, 1)
    brazier(ctx, 7, 1, 1)
    banner(ctx, 4, 3, 1, Face.North)
    barWindows(ctx)
    clearDoorways(ctx)
    ctx.garrison(4, 0, 4, G.CASTER_NEST)
    crenellate(ctx)
  },
}

/** Trophy hall: racks and banners of the Tyrant's conquests, a chest. */
const trophyHall: ModuleDef = {
  id: 'trophy_hall',
  size: [1, 1, 2],
  tags: ['room'],
  weight: 1,
  maxCount: 1,
  minDepth: 2,
  levels: [0, 2],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
  ],
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'planks', ceiling: 'wall', doorFrame: 'trim' })
    for (let z = 2; z <= 15; z += 2) rack(ctx, 1, 1, z, Face.West)
    for (const z of [3, 8, 13]) banner(ctx, 1, 3, z, Face.West)
    ctx.set(5, 1, 8, BlockIds.INFERNAL_ANVIL, ctx.facing(BlockFacing.EAST))
    // Chest on a tile pad (the plank floor marks loot tier 1)
    ctx.fill(6, 0, 0, 8, 0, 2, 'floor')
    ctx.chest(7, 1, 1, { facing: BlockFacing.SOUTH })
    hangLantern(ctx, 4, 4)
    hangLantern(ctx, 4, 13)
    barWindows(ctx)
    clearDoorways(ctx)
    crenellate(ctx)
  },
}

// ===========================================================================
// Undercroft
// ===========================================================================

/** Prison block: iron-barred cells along an aisle, chains, the jailors. */
const prisonBlock: ModuleDef = {
  id: 'prison_block',
  size: [1, 1, 2],
  tags: ['garrison', 'room', 'prison'],
  weight: 2.5,
  maxCount: 1,
  levels: [-1, -1],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
  ],
  build(ctx) {
    const { d } = ctx
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wallDark', doorFrame: 'trim' })
    for (const [x0, x1, barX] of [[1, 2, 3], [6, 7, 5]]) {
      for (const z of [5, 9, 13]) ctx.fill(x0, 1, z, x1, 5, z, 'wallDark')
      for (let z = 2; z <= d - 2; z++) {
        const gate = z % 4 === 3 // a cell door gap in each cell
        ctx.fill(barX, gate ? 3 : 1, z, barX, 5, z, BARS, ctx.facing(BlockFacing.EAST))
      }
      // Chains hanging in the cells, ash on their floors
      for (const z of [3, 11]) for (const y of [4, 5]) ctx.set(x0, y, z, BlockIds.INFERNAL_CHAIN)
      ctx.fill(x0, 0, 1, x1, 0, d - 2, 'ash')
    }
    // The prisoners' cache in one cell
    ctx.chest(1, 1, 11, { facing: BlockFacing.EAST })
    hangLantern(ctx, 4, 9)
    clearDoorways(ctx)
    ctx.garrison(4, 0, 6, G.PRISON)
  },
}

/** Lava cistern: a sunken lava pool crossed by a flagstone cross, glowing rims. */
const lavaCistern: ModuleDef = {
  id: 'lava_cistern',
  size: [2, 1, 2],
  tags: ['room', 'lava'],
  weight: 2.2,
  maxCount: 1,
  levels: [-1, -1],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, d } = ctx
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wallDark', doorFrame: 'trim' })
    ctx.fill(4, 0, 4, w - 5, 0, d - 5, BlockIds.LAVA)
    // Rim around the pool (on the floor), alternating magma and dark brick
    for (let x = 3; x <= w - 4; x++) {
      for (const z of [3, d - 4]) ctx.set(x, 1, z, (x + z) % 2 === 0 ? 'magma' : 'wallDark')
    }
    for (let z = 4; z <= d - 5; z++) {
      for (const x of [3, w - 4]) ctx.set(x, 1, z, (x + z) % 2 === 0 ? 'magma' : 'wallDark')
    }
    // The flagstone cross over the pool and an island in the middle
    ctx.fill(8, 0, 3, 9, 0, d - 4, 'floor')
    ctx.fill(3, 0, 8, w - 4, 0, 9, 'floor')
    ctx.fill(7, 0, 7, 10, 0, 10, 'floor')
    ctx.fill(8, 1, 3, 9, 1, d - 4, AIR)
    ctx.fill(3, 1, 8, w - 4, 1, 9, AIR)
    ctx.set(8, 0, 8, 'glyph')
    ctx.set(9, 0, 9, 'glyph')
    clearDoorways(ctx)
  },
}

/** Treasury: gilded walls, two treasury-tier chests, sometimes guarded. */
const treasury: ModuleDef = {
  id: 'treasury',
  size: [1, 1, 1],
  tags: ['treasury', 'room'],
  weight: 1,
  maxCount: 1,
  minDepth: 3,
  levels: [-1, 0],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.North },
  ],
  build(ctx) {
    room(ctx, { wall: 'gilded', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    ctx.chest(1, 1, 1, { facing: BlockFacing.SOUTH })
    ctx.chest(7, 1, 1, { facing: BlockFacing.SOUTH })
    ctx.set(4, 1, 4, BlockIds.INFERNAL_HOARD)
    brazier(ctx, 1, 1, 7)
    brazier(ctx, 7, 1, 7)
    clearDoorways(ctx)
    if (ctx.rng.chance(0.6)) ctx.garrison(4, 0, 6, G.VAULT_GUARD)
    crenellate(ctx)
  },
}

/** Vault: obsidian strongroom behind iron bars - the best loot, and its guards. */
const vault: ModuleDef = {
  id: 'vault',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 2,
  minDepth: 4,
  levels: [-1, 1],
  overhang: { up: 1 },
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    const { d } = ctx
    room(ctx, { wall: 'obsidian', floor: 'obsidian', ceiling: 'obsidian', doorFrame: 'gilded' })
    // Bars across the doorway, one bar's gap to squeeze through
    for (const x of [3, 5]) ctx.fill(x, 1, d - 1, x, 4, d - 1, BARS, ctx.facing(BlockFacing.SOUTH))
    // A gilded band at eye level
    walls(ctx, { x0: 1, y0: 3, z0: 1, x1: 7, y1: 3, z1: d - 2 }, 'gilded')
    ctx.chest(2, 1, 1, { facing: BlockFacing.SOUTH })
    ctx.chest(6, 1, 1, { facing: BlockFacing.SOUTH })
    for (const [x, z] of [[4, 1], [1, 4], [7, 4]]) ctx.set(x, 1, z, BlockIds.INFERNAL_HOARD)
    brazier(ctx, 1, 1, 7)
    brazier(ctx, 7, 1, 7)
    ctx.garrison(4, 0, 4, G.VAULT_GUARD)
    crenellate(ctx, 'obsidian')
  },
}

/** Cellar: crates and chains, sometimes a chest. */
const cellar: ModuleDef = {
  id: 'cellar',
  size: [1, 1, 1],
  tags: ['room'],
  weight: 1.8,
  maxCount: 3,
  levels: [-1, -1],
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.North },
  ],
  build(ctx) {
    room(ctx, { wall: 'wallDark', floor: 'floor', ceiling: 'wallDark', doorFrame: 'trim' })
    for (const [x, y, z] of [[1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2], [7, 1, 7], [6, 1, 7], [7, 2, 7], [1, 1, 7]]) ctx.set(x, y, z, 'planks')
    for (const y of [4, 5]) ctx.set(6, y, 2, BlockIds.INFERNAL_CHAIN)
    if (ctx.rng.chance(0.4)) ctx.chest(1, 1, 5, { facing: BlockFacing.EAST })
    if (ctx.hash(0, 0, 0, 0x61) < 0.6) hangLantern(ctx, 4, 4)
    clearDoorways(ctx)
  },
}

// ===========================================================================
// Stairs and towers
// ===========================================================================

/** Stairwell: a straight flight between two levels (serves the undercroft and the keep). */
const stairwell: ModuleDef = {
  id: 'stairwell',
  size: [1, 2, 2],
  tags: ['stairs'],
  weight: 2.2,
  maxCount: 5,
  levels: [-1, 1],
  overhang: { up: 1 },
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 1, 0], face: Face.North },
    { cell: [0, 1, 0], face: Face.West },
  ],
  build(ctx) {
    const { w } = ctx
    const wall = darkWalls(ctx)
    room(ctx, { wall, floor: 'floor', ceiling: 'wall', interiorFloors: false, doorFrame: 'trim' })
    // Landing at the upper level (north half), solid under it
    ctx.fill(1, 1, 1, w - 2, FH - 1, 7, wall)
    ctx.fill(1, FH, 1, w - 2, FH, 7, 'floor')
    stairs(ctx, 3, 1, 14, Face.North, FH, 3, STAIRS, wall, 1, true)
    hangLantern(ctx, 2, 15, 0, 1)
    hangLantern(ctx, 6, 3, 1, 1)
    barWindows(ctx)
    clearDoorways(ctx)
    crenellate(ctx)
  },
}

/**
 * The flight down into the undercroft: a stairwell that always descends
 * from the ground floor, placed early (minCount) so the undercroft grows
 * rooms instead of a capped landing.
 */
const undercroftStair: ModuleDef = {
  ...stairwell,
  id: 'undercroft_stair',
  tags: ['stairs', 'undercroft'],
  weight: 1.5,
  minCount: 1,
  maxCount: 2,
  levels: [-1, -1],
}

/** Watchtower: spiral stair to a brazier-crowned roof; sometimes casters on top. */
const watchtower: ModuleDef = {
  id: 'watchtower',
  size: [1, 3, 1],
  tags: ['tower'],
  weight: 1,
  maxCount: 2,
  levels: [0, 0],
  overhang: { up: 2 },
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    const { w, h, d } = ctx
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', interiorFloors: false })
    barWindows(ctx)
    for (const y of [5, 12, 19]) {
      ctx.set(4, y, 0, 'glyph')
      ctx.set(0, y, 4, 'glyph')
    }
    spiralStairs(ctx, 4, 4, 1, h - 1, 'floor', 'trim', 2)
    spiralCornerSupports(ctx, 4, 4, 1, h - 1, 2, 'trim')
    // Roof platform: the top step reaches it through a hole
    const ring = spiralRing(2)
    const top = h - 1
    ctx.fill(0, top, 0, w - 1, top, d - 1, 'wall')
    // Headroom holes above the last steps (a full-block step needs two clear blocks over the one below)
    for (const y of [top - 3, top - 2, top - 1]) {
      const [ox, oz] = ring[(y - 1) % ring.length]
      ctx.set(4 + ox, top, 4 + oz, AIR)
    }
    const [lx, lz] = ring[(top - 1) % ring.length]
    ctx.set(4 + lx, top, 4 + lz, 'floor')
    battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
    ctx.light(0, h + 1, 0, BlockIds.INFERNAL_BRAZIER)
    ctx.light(w - 1, h + 1, d - 1, BlockIds.INFERNAL_BRAZIER)
    hangLantern(ctx, 1, 7, 0, 1)
    if (ctx.rng.chance(0.4)) ctx.garrison(7, top, 7, G.CASTER_NEST)
  },
}

/**
 * Citadel: the landmark - a four-storey obsidian-and-brick keep tower with a
 * spiral stair through every floor, crowned by a stepped spire with a
 * glowing glyph spine and a brazier beacon (~44 blocks above the bailey).
 */
const citadel: ModuleDef = {
  id: 'citadel',
  size: [2, 4, 2],
  tags: ['landmark', 'tower'],
  weight: 1,
  minCount: 1,
  maxCount: 1,
  levels: [0, 0],
  overhang: { up: 18 },
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 1, 0], face: Face.East },
    { cell: [0, 1, 1], face: Face.West },
    { cell: [0, 2, 0], face: Face.North },
    { cell: [1, 2, 1], face: Face.South },
    { cell: [1, 3, 1], face: Face.East },
    { cell: [0, 3, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    const shell = (_x: number, y: number): string => (y < 2 * FH ? 'obsidian' : y === 2 * FH ? 'gilded' : 'wall')
    room(ctx, { wall: shell, floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    // The spiral stair through every floor (it carves its own shaft)
    spiralStairs(ctx, 9, 9, 1, 3 * FH + 1, 'floor', 'trim', 3)
    spiralCornerSupports(ctx, 9, 9, 1, 3 * FH + 1, 3, 'trim')
    for (let k = 0; k < 4; k++) {
      hangLantern(ctx, 2, 2, k, 1)
      hangLantern(ctx, w - 3, d - 3, k, 1)
    }
    barWindows(ctx)
    clearDoorways(ctx)
    // Roof and spire
    battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
    for (const [x, z] of [[2, 2], [w - 3, 2], [2, d - 3], [w - 3, d - 3]]) ctx.light(x, h, z, BlockIds.INFERNAL_BRAZIER)
    ctx.fill(4, h, 4, 13, h + 5, 13, 'obsidian')
    ctx.fill(6, h + 6, 6, 11, h + 11, 11, 'obsidian')
    ctx.fill(8, h + 12, 8, 9, h + 15, 9, 'obsidian')
    for (const y of [h + 1, h + 3, h + 5]) {
      ctx.set(8, y, 4, 'glyph')
      ctx.set(9, y, 13, 'glyph')
      ctx.set(4, y, 9, 'glyph')
      ctx.set(13, y, 8, 'glyph')
    }
    for (const y of [h + 7, h + 9, h + 11]) {
      ctx.set(8, y, 6, 'glyph')
      ctx.set(9, y, 11, 'glyph')
      ctx.set(6, y, 9, 'glyph')
      ctx.set(11, y, 8, 'glyph')
    }
    ctx.light(8, h + 16, 8, BlockIds.INFERNAL_BRAZIER)
  },
}

// ===========================================================================
// Caps (dead ends closing spare doorways)
// ===========================================================================

/** Shrine alcove: a glyph-lit niche with braziers, sometimes an offering chest. */
const shrineAlcove: ModuleDef = {
  id: 'shrine_alcove',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1.5,
  maxCount: 6,
  levels: [-1, 2],
  overhang: { up: 1 },
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    room(ctx, { wall: darkWalls(ctx), floor: 'floor', ceiling: darkWalls(ctx), doorFrame: 'trim' })
    ctx.fill(1, 1, 1, 7, 5, 3, darkWalls(ctx))
    ctx.set(4, 3, 3, 'glyph')
    ctx.set(4, 2, 3, 'trim')
    brazier(ctx, 2, 1, 4)
    brazier(ctx, 6, 1, 4)
    if (ctx.rng.chance(0.25)) ctx.chest(4, 1, 4, { facing: BlockFacing.SOUTH })
    crenellate(ctx)
  },
}

/** Collapsed passage: a rubble heap where the vault ceiling came down. */
const collapsed: ModuleDef = {
  id: 'collapsed',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 4,
  levels: [-1, 2],
  overhang: { up: 1 },
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    room(ctx, { wall: darkWalls(ctx), floor: 'floor', ceiling: darkWalls(ctx), doorFrame: 'trim' })
    for (let x = 1; x <= 7; x++) {
      for (let z = 1; z <= 6; z++) {
        const pile = Math.floor((7 - z) * 0.8 + ctx.hash(x, 0, z, 0x71) * 2)
        if (pile > 0) ctx.fill(x, 1, z, x, Math.min(5, pile), z, (x + z) % 3 === 0 ? 'ash' : 'rubble')
      }
    }
    ctx.set(4, 0, 6, BlockIds.HELL_MAGMA)
    crenellate(ctx)
  },
}

// ===========================================================================
// Boss arena
// ===========================================================================

/**
 * The Throne Crucible: the Pyre Tyrant's arena (27 x 27) - obsidian ring
 * floor, four lava basins at (±7, ±7) from the altar (the Tyrant summons
 * Hell magma slimes from them), pillars with braziers, the throne. Open to
 * the cavern when nothing is built above it; an enclosed forge-throne hall
 * otherwise (e.g. in the undercroft).
 */
const throneCrucible: ModuleDef = {
  id: 'throne_crucible',
  size: [3, 2, 3],
  tags: ['boss'],
  levels: [-1, 1],
  overhang: { up: 2 },
  connectors: [{ cell: [1, 0, 2], face: Face.South }],
  build(ctx) {
    const { w, h, d } = ctx
    const open = ctx.level >= 0 && hasOpenRoof(ctx)
    const C = Math.floor(w / 2) // 13
    room(ctx, {
      wall: (_x, y) => (y < FH ? 'obsidian' : 'wall'),
      floor: 'floor',
      ceiling: open ? null : 'obsidian',
      interiorFloors: false,
      doorFrame: 'gilded',
    })
    if (open) {
      ctx.fill(1, h - 1, 1, w - 2, h - 1, d - 2, AIR)
      battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
    }
    // Floor: obsidian outer ring, flagstones inside, a glyph cross
    for (let x = 1; x <= w - 2; x++) {
      for (let z = 1; z <= d - 2; z++) {
        const ring = Math.max(Math.abs(x - C), Math.abs(z - C))
        if (ring >= 10) ctx.set(x, 0, z, 'obsidian')
        else if ((x === C || z === C) && ring >= 2 && ring % 2 === 0) ctx.set(x, 0, z, 'glyph')
      }
    }
    // Lava basins at (±7, ±7) from the altar
    for (const bx of [C - 7, C + 7]) {
      for (const bz of [C - 7, C + 7]) {
        ctx.fill(bx - 1, 0, bz - 1, bx + 1, 0, bz + 1, BlockIds.LAVA)
        walls(ctx, { x0: bx - 2, y0: 1, z0: bz - 2, x1: bx + 2, y1: 1, z1: bz + 2 }, (x, _y, z) => ((x + z) % 2 === 0 ? 'magma' : 'obsidian'))
      }
    }
    // Corner pillars with braziers, mid-wall pillars
    for (const px of [2, w - 4]) {
      for (const pz of [2, d - 4]) {
        pillar(ctx, px, pz, 1, h - 3, 'trim', 2)
        ctx.light(px, h - 2, pz, BlockIds.INFERNAL_BRAZIER)
      }
    }
    for (const [px, pz] of [[C, 1], [1, C], [w - 2, C]]) ctx.fill(px, 1, pz, px, h - 2, pz, 'trim')
    // The throne on a gilded dais at the back (north), banners flanking it
    ctx.fill(C - 2, 1, 2, C + 2, 1, 4, 'gilded')
    ctx.set(C, 2, 3, BlockIds.INFERNAL_THRONE, ctx.facing(BlockFacing.SOUTH))
    banner(ctx, C - 3, 4, 1, Face.North)
    banner(ctx, C + 3, 4, 1, Face.North)
    if (!open) {
      for (const [x, z] of [[C - 6, C], [C + 6, C], [C, C + 6]]) hangLantern(ctx, x, z, 1, 3)
    }
    // The altar: a dais with the guardian spawner
    ctx.fill(C - 1, 1, C - 1, C + 1, 1, C + 1, 'obsidian')
    ctx.guardian(C, 2, C, PYRE_TYRANT_INDEX)
    clearDoorways(ctx)
  },
}

export const BASTION_MODULES: readonly ModuleDef[] = [
  gatehouse,
  gateKeep,
  arcade('arcade', [Face.North, Face.South], 3),
  arcade('arcade_corner', [Face.South, Face.East], 2),
  arcade('arcade_tee', [Face.South, Face.East, Face.West], 2),
  arcade('arcade_cross', [Face.North, Face.South, Face.East, Face.West], 1.5),
  lavaBridge,
  courtyard,
  barracks,
  forgeHall,
  kennels,
  armory,
  greatHall,
  casterSanctum,
  trophyHall,
  prisonBlock,
  lavaCistern,
  treasury,
  vault,
  cellar,
  stairwell,
  undercroftStair,
  watchtower,
  citadel,
  shrineAlcove,
  collapsed,
  throneCrucible,
]

void CS
