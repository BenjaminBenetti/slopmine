import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, type DungeonKit, type ModuleContext, type ModuleDef, type PassContext } from '../../DungeonTypes.ts'
import {
  approach,
  battlements,
  doorway,
  isFaceOpen,
  pillar,
  roofPyramid,
  room,
  shaftLadder,
  spiralRing,
  spiralStairs,
  sprinkle,
  stairs,
  walls,
  windows,
} from '../../DungeonBuild.ts'
import { foundationUnderModules } from '../../DungeonContexts.ts'

/**
 * REFERENCE KIT - "Test Keep" (dev only).
 *
 * A small stone keep built from existing blocks that exercises every part of
 * the dungeon framework: entrance gatehouse, corridors/junctions, halls,
 * a library, garrison barracks, a courtyard, a two-level staircase (up and
 * down - one def serves both), underground crypts, a landmark tower with a
 * spiral stair, dead-end alcoves as caps, vaults (minDepth 4, tier+1
 * chests) and a boss arena placed at the deepest point. The foundation pass
 * levels a bailey platform; the exterior pass adds a curtain wall, corner
 * towers, a gate gap and an approach path.
 *
 * NOT registered in production: the Node harness and dev-only verification
 * register it explicitly (`registerDungeonKit(referenceKeepKit)`). Read it as
 * the worked example for biome kits.
 */

/** Garrison index the reference kit writes (castlekit test range 1-9). */
export const REFERENCE_GARRISON_INDEX = 1
/** Guardian index the reference kit writes (a dev test guardian). */
export const REFERENCE_GUARDIAN_INDEX = 9

const CS = 9
const FH = 7
/** Gate path length beyond the curtain wall (the bailey is 3 blocks out; exteriorMargin must cover both). */
const APPROACH_LENGTH = 20

const palette = {
  wall: [
    [BlockIds.STONE, 70],
    [BlockIds.MOSSY_STONE, 22],
    [BlockIds.BASALT, 8],
  ],
  trim: BlockIds.BASALT,
  floor: [
    [BlockIds.STONE, 80],
    [BlockIds.MOSSY_STONE, 20],
  ],
  planks: BlockIds.OAK_PLANKS,
  log: BlockIds.OAK_LOG,
  roof: BlockIds.BASALT,
  foundation: BlockIds.STONE,
  ground: BlockIds.GRASS,
  path: BlockIds.BASALT,
  glass: BlockIds.GLASS,
  light: BlockIds.TORCH,
  gold: BlockIds.GOLD_BLOCK,
} as const

/** Wall torches: two per level on the inside of the long walls. */
function interiorLights(ctx: ModuleContext, y = 3): void {
  const { w, d } = ctx
  const levels = ctx.def.size[1]
  for (let k = 0; k < levels; k++) {
    const ly = k * FH + y
    ctx.light(Math.floor(w / 2), ly, 1)
    ctx.light(Math.floor(w / 2), ly, d - 2)
  }
}

/** A flat roof with battlements on modules with nothing above them. */
function roofIfOpen(ctx: ModuleContext): void {
  const { w, h, d } = ctx
  const [sx, sy, sz] = ctx.def.size
  let open = true
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (ctx.isCellOccupied(x, sy, z)) open = false
  if (!open) return
  battlements(ctx, 0, 0, w - 1, d - 1, h, 'wall')
  void sy
}

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
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    ctx.light(1, 3, 1)
    ctx.light(ctx.w - 2, 3, 1)
    roofIfOpen(ctx)
  },
}

function corridor(id: string, faces: Face[], weight: number): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: ['corridor'],
    weight,
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    levels: [-1, 2],
    overhang: { up: 2 },
    build(ctx) {
      room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall' })
      windows(ctx, { block: 'glass' })
      ctx.light(4, 3, 4)
      roofIfOpen(ctx)
    },
  }
}

const hall: ModuleDef = {
  id: 'hall',
  size: [2, 1, 2],
  tags: ['room'],
  weight: 3,
  maxCount: 5,
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
  levels: [0, 1],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'planks', ceiling: 'wall', doorFrame: 'trim' })
    windows(ctx, { block: 'glass', width: 2 })
    for (const [px, pz] of [[5, 5], [12, 5], [5, 12], [12, 12]]) {
      pillar(ctx, px, pz, 1, FH - 2, 'log')
      ctx.light(px, 3, pz - 1)
    }
    // A table and, sometimes, a chest by the far wall
    ctx.fill(7, 1, 8, 10, 1, 9, 'planks')
    if (ctx.rng.chance(0.5)) ctx.chest(8, 1, 1, { facing: BlockFacing.SOUTH })
    roofIfOpen(ctx)
  },
}

const library: ModuleDef = {
  id: 'library',
  size: [2, 1, 1],
  tags: ['room'],
  weight: 1.5,
  maxCount: 3,
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [1, 0, 0], face: Face.North },
  ],
  levels: [0, 2],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'planks', ceiling: 'planks', doorFrame: 'log' })
    // Shelf rows along the long walls (planks with gaps)
    for (let x = 2; x <= ctx.w - 3; x++) {
      if (x % 3 === 0) continue
      ctx.fill(x, 1, 1, x, 3, 1, 'planks')
      ctx.fill(x, 1, ctx.d - 2, x, 3, ctx.d - 2, 'planks')
    }
    // Shelves must not block doorways
    for (const c of ctx.connectors) if (c.open) doorway(ctx, ctx.doorwayBox(c), c.face)
    ctx.chest(Math.floor(ctx.w / 2), 1, 4, { facing: BlockFacing.SOUTH })
    interiorLights(ctx, 4)
    roofIfOpen(ctx)
  },
}

const barracks: ModuleDef = {
  id: 'barracks',
  size: [2, 1, 2],
  tags: ['garrison', 'room'],
  weight: 2,
  maxCount: 5,
  minDepth: 1,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 0], face: Face.West },
  ],
  levels: [-1, 1],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', doorFrame: 'trim' })
    // Bunks along the walls
    for (let z = 2; z <= ctx.d - 3; z += 3) {
      ctx.fill(1, 1, z, 3, 1, z + 1, 'planks')
      ctx.fill(ctx.w - 4, 1, z, ctx.w - 2, 1, z + 1, 'planks')
    }
    for (const c of ctx.connectors) if (c.open) doorway(ctx, ctx.doorwayBox(c), c.face)
    ctx.garrison(Math.floor(ctx.w / 2), 0, Math.floor(ctx.d / 2), REFERENCE_GARRISON_INDEX)
    interiorLights(ctx)
    roofIfOpen(ctx)
  },
}

const courtyard: ModuleDef = {
  id: 'courtyard',
  size: [2, 1, 2],
  tags: ['courtyard'],
  weight: 1,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  levels: [0, 0],
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'ground', ceiling: null, doorFrame: 'trim' })
    // Open to the sky: no roof; walls one block lower than a room's ceiling
    ctx.fill(1, ctx.h - 1, 1, ctx.w - 2, ctx.h - 1, ctx.d - 2, BlockIds.AIR)
    battlements(ctx, 0, 0, ctx.w - 1, ctx.d - 1, ctx.h, 'wall')
    pillar(ctx, 8, 8, 1, 3, 'trim', 2)
    ctx.light(8, 4, 8)
    ctx.light(9, 4, 9)
  },
  overhang: { up: 2 },
}

const stairwell: ModuleDef = {
  id: 'stairwell',
  size: [1, 2, 2],
  tags: ['stairs'],
  weight: 2,
  maxCount: 4,
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 1, 0], face: Face.North },
  ],
  levels: [-1, 1],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', interiorFloors: false })
    // Landing at level 1 (north half) and a flight of 7 oak stairs rising northward
    ctx.fill(1, FH, 1, ctx.w - 2, FH, 7, 'planks')
    ctx.fill(1, 1, 1, ctx.w - 2, FH - 1, 7, 'wall')
    stairs(ctx, 3, 1, 14, Face.North, FH, 3, BlockIds.OAK_STAIRS, 'wall', 1)
    ctx.light(1, 3, 15)
    ctx.light(ctx.w - 2, FH + 3, 2)
    windows(ctx, { block: 'glass' })
    roofIfOpen(ctx)
  },
}

const crypt: ModuleDef = {
  id: 'crypt',
  size: [2, 1, 2],
  tags: ['room', 'crypt'],
  weight: 2,
  maxCount: 4,
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  levels: [-1, -1],
  build(ctx) {
    room(ctx, { wall: 'trim', floor: 'floor', ceiling: 'trim', doorFrame: 'wall' })
    // Sarcophagi
    for (const [x, z] of [[4, 4], [11, 4], [4, 11], [11, 11]]) ctx.fill(x, 1, z, x + 2, 1, z + 1, 'wall')
    sprinkle(ctx, { x0: 1, y0: 1, z0: 1, x1: ctx.w - 2, y1: 1, z1: ctx.d - 2 }, BlockIds.MOSSY_STONE, 0.04, 7, (id) => id === BlockIds.AIR)
    for (const c of ctx.connectors) if (c.open) doorway(ctx, ctx.doorwayBox(c), c.face)
    if (ctx.rng.chance(0.6)) ctx.chest(8, 1, 8, { facing: BlockFacing.SOUTH })
    interiorLights(ctx)
  },
}

const tower: ModuleDef = {
  id: 'tower',
  size: [1, 3, 1],
  tags: ['tower', 'landmark'],
  weight: 1,
  maxCount: 2,
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  levels: [0, 0],
  overhang: { up: 10 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall', interiorFloors: false })
    windows(ctx, { block: 'glass' })
    spiralStairs(ctx, 4, 4, 1, ctx.h - 1, 'planks', 'log', 2)
    // Roof platform: the top step sits in the roof; the two before it get headroom holes
    const ring = spiralRing(2)
    const top0 = ctx.h - 1
    ctx.fill(0, top0, 0, ctx.w - 1, top0, ctx.d - 1, 'wall')
    for (const y of [top0 - 2, top0 - 1]) {
      const [ox, oz] = ring[(y - 1) % ring.length]
      ctx.set(4 + ox, top0, 4 + oz, BlockIds.AIR)
    }
    const [lx, lz] = ring[(top0 - 1) % ring.length]
    ctx.set(4 + lx, top0, 4 + lz, 'planks')
    battlements(ctx, 0, 0, ctx.w - 1, ctx.d - 1, ctx.h, 'wall')
    // A slim spire in the middle of the roof (clear of the stair exit on the ring)
    const spireBase = roofPyramid(ctx, 3, 3, 5, 5, ctx.h, 'roof')
    pillar(ctx, 4, 4, spireBase, spireBase + 4, 'roof')
    ctx.light(4, spireBase + 5, 4)
    ctx.light(1, 3, 7)
  },
}

/** A hatch room: a ladder climbs through a hole in the ceiling to the loft above (Up/Down 'shaft' connectors). */
const hatchRoom: ModuleDef = {
  id: 'hatch_room',
  size: [1, 1, 1],
  tags: ['room', 'shaft'],
  weight: 1,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.Up, kind: 'shaft' },
  ],
  levels: [-1, 1],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall' })
    if (ctx.connectors[1].open) {
      // Backing post and a ladder up through the ceiling hole (centre column)
      pillar(ctx, 4, 3, 1, FH - 2, 'log')
      shaftLadder(ctx, ctx.connectors[1], BlockFacing.SOUTH)
    }
    ctx.light(1, 3, 4)
    roofIfOpen(ctx)
  },
}

/** The loft above a hatch room: the ladder arrives through its floor. */
const loft: ModuleDef = {
  id: 'loft',
  size: [1, 1, 1],
  tags: ['room', 'shaft'],
  weight: 1,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: Face.Down, kind: 'shaft' },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  levels: [0, 2],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'planks', ceiling: 'wall' })
    if (ctx.connectors[0].open) shaftLadder(ctx, ctx.connectors[0], BlockFacing.SOUTH)
    windows(ctx, { block: 'glass' })
    ctx.light(4, 3, 7)
    if (ctx.rng.chance(0.4)) ctx.chest(7, 1, 7, { facing: BlockFacing.WEST })
    roofIfOpen(ctx)
  },
}

const vault: ModuleDef = {
  id: 'vault',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 3,
  minDepth: 4,
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  levels: [-1, 1],
  build(ctx) {
    room(ctx, { wall: 'trim', floor: 'gold', ceiling: 'trim', doorFrame: 'gold' })
    ctx.chest(2, 1, 2, { facing: BlockFacing.SOUTH })
    ctx.chest(6, 1, 2, { facing: BlockFacing.SOUTH })
    ctx.light(4, 3, 1)
  },
}

const alcove: ModuleDef = {
  id: 'alcove',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 6,
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  levels: [-1, 2],
  build(ctx) {
    room(ctx, { wall: 'wall', floor: 'floor', ceiling: 'wall' })
    // Narrow the alcove to a niche
    ctx.fill(1, 1, 1, ctx.w - 2, ctx.h - 2, 4, 'wall')
    ctx.light(4, 2, 5)
    if (ctx.rng.chance(0.35)) ctx.chest(4, 1, 6, { facing: BlockFacing.SOUTH })
  },
}

const bossArena: ModuleDef = {
  id: 'boss_arena',
  size: [3, 2, 3],
  tags: ['boss'],
  connectors: [{ cell: [1, 0, 2], face: Face.South }],
  levels: [-1, 1],
  overhang: { up: 2 },
  build(ctx) {
    room(ctx, { wall: 'trim', floor: 'floor', ceiling: 'trim', interiorFloors: false, doorFrame: 'gold' })
    const { w, d } = ctx
    // Ring of pillars
    for (const [px, pz] of [[5, 5], [w - 6, 5], [5, d - 6], [w - 6, d - 6], [13, 4], [13, d - 5], [4, 13], [w - 5, 13]]) {
      pillar(ctx, px, pz, 1, ctx.h - 2, 'log')
      ctx.light(px, 4, pz + 1)
    }
    // Raised dais with the guardian altar
    ctx.fill(10, 1, 10, 16, 1, 16, 'trim')
    ctx.guardian(13, 2, 13, REFERENCE_GUARDIAN_INDEX)
    interiorLights(ctx, 5)
    roofIfOpen(ctx)
  },
}

/** Foundation pass: a levelled bailey inside the curtain wall, foundations under ground modules. */
function foundationPass(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const rect = baileyRect(ctx)
  // Platform: fill up to the base floor, clear the air above (cut into hills)
  for (let x = Math.max(rect.x0, clip.x0); x <= Math.min(rect.x1, clip.x1); x++) {
    for (let z = Math.max(rect.z0, clip.z0); z <= Math.min(rect.z1, clip.z1); z++) {
      const ground = ctx.terrainHeight(x, z)
      if (ground < L.baseY - 1) ctx.fill(x, Math.max(ground + 1, L.baseY - 40), z, x, L.baseY - 1, z, 'foundation')
      ctx.set(x, L.baseY, z, 'ground')
      if (ground > L.baseY) ctx.fill(x, L.baseY + 1, z, x, Math.min(ground, L.baseY + 3 * FH), z, BlockIds.AIR)
    }
  }
  foundationUnderModules(ctx, 'foundation', (m) => m.cell[1] >= 0)
}

/** Rectangle enclosing every ground-level module, 2 blocks out. */
function baileyRect(ctx: PassContext): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const m of ctx.layout.modules) {
    if (m.cell[1] > 0 || m.cell[1] + m.size[1] <= 0) continue
    x0 = Math.min(x0, m.box.x0)
    z0 = Math.min(z0, m.box.z0)
    x1 = Math.max(x1, m.box.x1)
    z1 = Math.max(z1, m.box.z1)
  }
  return { x0: x0 - 3, z0: z0 - 3, x1: x1 + 3, z1: z1 + 3 }
}

/** Exterior pass: curtain wall with corner towers, a gate gap and an approach path. */
function exteriorPass(ctx: PassContext): void {
  if (ctx.dryRun) return
  const L = ctx.layout
  const r = baileyRect(ctx)
  const y0 = L.baseY + 1
  const top = L.baseY + 6
  walls(ctx, { x0: r.x0, y0, z0: r.z0, x1: r.x1, y1: top, z1: r.z1 }, 'wall')
  battlements(ctx, r.x0, r.z0, r.x1, r.z1, top + 1, 'wall')
  for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    const b = { x0: cx - 2, y0: L.baseY - 2, z0: cz - 2, x1: cx + 2, y1: top + 4, z1: cz + 2 }
    ctx.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 'wall')
    battlements(ctx, b.x0, b.z0, b.x1, b.z1, b.y1 + 1, 'wall')
    ctx.light(cx, b.y1 + 1, cz)
  }
  // Torches along the wall walk
  for (let x = r.x0 + 4; x < r.x1 - 2; x += 8) {
    ctx.light(x, top + 1, r.z0 + 0)
    ctx.light(x, top + 1, r.z1)
  }
  // Gate: a gap in front of the entrance opening, then the approach
  const e = L.entrance
  const half = 2
  const alongX = e.face === Face.North || e.face === Face.South
  const wallPlane = e.face === Face.South ? r.z1 : e.face === Face.North ? r.z0 : e.face === Face.East ? r.x1 : r.x0
  if (alongX) {
    ctx.fill(e.x - half, y0, Math.min(e.z, wallPlane), e.x + half, top + 1, Math.max(e.z, wallPlane), BlockIds.AIR)
    ctx.fill(e.x - half, L.baseY, Math.min(e.z, wallPlane), e.x + half, L.baseY, Math.max(e.z, wallPlane), 'path')
  } else {
    ctx.fill(Math.min(e.x, wallPlane), y0, e.z - half, Math.max(e.x, wallPlane), top + 1, e.z + half, BlockIds.AIR)
    ctx.fill(Math.min(e.x, wallPlane), L.baseY, e.z - half, Math.max(e.x, wallPlane), L.baseY, e.z + half, 'path')
  }
  const dir = e.face
  const sx = alongX ? e.x : wallPlane + (dir === Face.East ? 1 : -1)
  const sz = alongX ? wallPlane + (dir === Face.South ? 1 : -1) : e.z
  approach(ctx, sx, L.baseY, sz, dir, APPROACH_LENGTH, 5, 'path', 'foundation', BlockIds.OAK_STAIRS)
  void isFaceOpen
}

export const referenceKeepKit: DungeonKit = {
  id: 'reference_keep',
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-1, 2],
  worldYRange: [2, 500],
  modules: [
    gatehouse,
    corridor('corridor', [Face.North, Face.South], 3),
    corridor('corner', [Face.South, Face.East], 2),
    corridor('tee', [Face.South, Face.East, Face.West], 2),
    corridor('crossing', [Face.North, Face.South, Face.East, Face.West], 1.5),
    hall,
    library,
    barracks,
    courtyard,
    stairwell,
    crypt,
    tower,
    hatchRoom,
    loft,
    vault,
    alcove,
    bossArena,
  ],
  targetModules: [20, 30],
  require: [
    { tag: 'vault', count: 2 },
    { tag: 'garrison', count: 3 },
  ],
  palette,
  lootTierBlocks: [BlockIds.COPPER_BLOCK, BlockIds.IRON_BLOCK, BlockIds.GOLD_BLOCK, BlockIds.DIAMOND_BLOCK],
  // Curtain wall (3 out) + corner towers (2 more) + the gate approach: everything the exterior pass draws
  exteriorMargin: 4 + APPROACH_LENGTH,
  foundation: foundationPass,
  exterior: exteriorPass,
}
