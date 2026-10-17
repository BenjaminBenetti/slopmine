import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, type ModuleContext, type ModuleDef } from '../../DungeonTypes.ts'
import { doorways, stairs } from '../../DungeonBuild.ts'
import { HIVE_GARRISON, SPOREMOTHER_GUARDIAN_INDEX } from './hiveConstants.ts'
import { CS, FH, ceilingLamp, hiveRoom, inZones, isAir, podCluster, rootBore } from './hiveShapes.ts'

/**
 * Sporeheart Hive modules. Cell 9 × 9, level height 7; the hive starts at
 * ground level inside the mound (level 0) and descends to level -2, where
 * the Sporemother's throne waits. A few crown rooms climb to level 1 under
 * the crown fungus.
 */

const STAIRS = BlockIds.EMBERWOOD_STAIRS

/** Glowcaps and sprouts on the floor along the walls (hash-scattered, air only). */
function floorGrowth(ctx: ModuleContext, y: number, chance: number, salt: number): void {
  const { w, d } = ctx
  for (let x = 1; x < w - 1; x++) {
    for (let z = 1; z < d - 1; z++) {
      const edge = x <= 2 || z <= 2 || x >= w - 3 || z >= d - 3
      if (!edge) continue
      const r = ctx.hash(x, y, z, salt)
      if (r < chance * 0.35) ctx.setIf(x, y, z, BlockIds.GLOWCAP, isAir)
      else if (r < chance) ctx.setIf(x, y, z, BlockIds.CRIMSON_SPROUTS, isAir)
    }
  }
}

/** Hanging spore strands under a ceiling at yCeil (air only). */
function strands(ctx: ModuleContext, yCeil: number, chance: number, maxLen: number, salt: number): void {
  for (let x = 2; x < ctx.w - 2; x++) {
    for (let z = 2; z < ctx.d - 2; z++) {
      if (ctx.hash(x, yCeil, z, salt) >= chance) continue
      const len = 1 + Math.floor(ctx.hash(x, yCeil, z, salt + 1) * maxLen)
      for (let i = 1; i <= len; i++) ctx.setIf(x, yCeil - i, z, BlockIds.SPORE_STRAND, isAir)
    }
  }
}

// ---------------------------------------------------------------------------
// Entrances
// ---------------------------------------------------------------------------

/** Root arch: the main gate, root ribs framing a crimson hall with spore-sac lanterns. */
const rootArch: ModuleDef = {
  id: 'root_arch',
  size: [1, 1, 1],
  tags: ['entrance'],
  weight: 2,
  levels: [0, 0],
  connectors: [
    { cell: [0, 0, 0], face: Face.South, exterior: true },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.East },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    hiveRoom(ctx, { wall: 'wall', frame: 'rib', tendrils: 0.02 })
    // Spore-sac lanterns in the gate wall, either side of the opening
    ctx.set(1, 3, d - 1, 'sac')
    ctx.set(w - 2, 3, d - 1, 'sac')
    floorGrowth(ctx, 1, 0.12, 31)
    ceilingLamp(ctx, 4, h - 1, 3)
    doorways(ctx)
  },
}

/** Gill maw: a narrow gate lined with glowing gill walls and chitin fangs. */
const gillMaw: ModuleDef = {
  id: 'gill_maw',
  size: [1, 1, 1],
  tags: ['entrance'],
  weight: 1,
  levels: [0, 0],
  connectors: [
    { cell: [0, 0, 0], face: Face.South, exterior: true },
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.East },
  ],
  build(ctx) {
    const { h, d } = ctx
    hiveRoom(ctx, { wall: 'gill', frame: 'chitin', ribs: 'chitin', bulge: 0.05, tendrils: 0.02 })
    // Fangs over the gate (above the 4-high doorway)
    for (const x of [3, 5]) ctx.set(x, 5, d - 2, 'chitin')
    for (const x of [2, 6]) ctx.set(x, 4, d - 2, 'chitin')
    strands(ctx, h - 1, 0.08, 2, 33)
    ceilingLamp(ctx, 4, h - 1, 3)
    doorways(ctx)
  },
}

// ---------------------------------------------------------------------------
// Root tunnels
// ---------------------------------------------------------------------------

function tunnel(id: string, faces: Face[], weight: number): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: ['corridor'],
    weight,
    levels: [-2, 1],
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    build(ctx) {
      rootBore(ctx)
      // Glowcaps at the bore's foot; a glow bulb in about two junctions of three
      for (let x = 1; x < 8; x++) {
        for (let z = 1; z < 8; z++) {
          if (ctx.hash(x, 1, z, 41) < 0.05) ctx.setIf(x, 1, z, BlockIds.GLOWCAP, isAir)
        }
      }
      if (ctx.hash(4, 5, 4, 42) < 0.65) ceilingLamp(ctx, 4, 6, 4)
    },
  }
}

// ---------------------------------------------------------------------------
// Level links
// ---------------------------------------------------------------------------

/** Root ramp: a two-cell hall with a flight of emberwood stairs down to the level below. */
const rootRamp: ModuleDef = {
  id: 'root_ramp',
  size: [1, 2, 2],
  tags: ['stairs'],
  weight: 2.4,
  maxCount: 6,
  levels: [-2, -1],
  connectors: [
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 1, 0], face: Face.North },
  ],
  build(ctx) {
    const { w, h } = ctx
    hiveRoom(ctx, { wall: 'wall', tall: true, tendrils: 0.015 })
    // Upper landing over the north cell, solid root under it
    ctx.fill(1, FH, 1, w - 2, FH, 7, 'floor')
    ctx.fill(1, 1, 1, w - 2, FH - 1, 7, 'mass')
    // Gill-lined flight down to the south door
    ctx.fill(1, 1, 8, 1, h - 2, 16, 'gill')
    ctx.fill(w - 2, 1, 8, w - 2, h - 2, 16, 'gill')
    stairs(ctx, 3, 1, 14, Face.North, FH, 3, STAIRS, 'mass', 1, true)
    ceilingLamp(ctx, 4, h - 1, 12)
    doorways(ctx)
  },
}

/** Root climb: a steep single-cell stair shaft between two levels. */
function rootClimb(id: string, levels: [number, number], weight: number, maxCount: number): ModuleDef {
  return {
    id,
    size: [1, 2, 1],
    tags: ['stairs'],
    weight,
    maxCount,
    levels,
    connectors: [
      { cell: [0, 0, 0], face: Face.South },
      { cell: [0, 1, 0], face: Face.North },
    ],
    build(ctx) {
      const { w, h } = ctx
      hiveRoom(ctx, { wall: 'wall', tall: true, ribs: null, bulge: 0.04, tendrils: 0 })
      // Root walls hugging the flight
      ctx.fill(1, 1, 1, 2, h - 2, 7, 'mass')
      ctx.fill(w - 3, 1, 1, w - 2, h - 2, 7, 'mass')
      stairs(ctx, 3, 1, 7, Face.North, FH, 3, STAIRS, 'mass', 1, true)
      // A spore sac lights the shaft from the side wall
      ctx.set(2, 9, 4, 'sac')
      doorways(ctx)
    },
  }
}

// ---------------------------------------------------------------------------
// Nurseries and brood
// ---------------------------------------------------------------------------

/** Spore nursery: a comb-walled cell of egg pods with a small cache. */
const sporeNursery: ModuleDef = {
  id: 'spore_nursery',
  size: [1, 1, 1],
  tags: ['room', 'nursery'],
  weight: 1.5,
  maxCount: 4,
  levels: [-2, 1],
  connectors: [
    { cell: [0, 0, 0], face: Face.South },
    { cell: [0, 0, 0], face: Face.East },
  ],
  build(ctx) {
    const { h } = ctx
    const zones = hiveRoom(ctx, { wall: 'comb', frame: 'rib', bulge: 0.08 })
    podCluster(ctx, 4, 1, 4, 2, 0.5, 51)
    if (ctx.rng.chance(0.65)) {
      const spot = inZones(zones, 2, 1, 2) ? [6, 2] : [2, 2]
      ctx.chest(spot[0], 1, spot[1], { tier: Math.max(1, ctx.tier), facing: BlockFacing.SOUTH })
    }
    ceilingLamp(ctx, 4, h - 1, 4)
    doorways(ctx)
  },
}

/** Nursery hall: a long comb hall with a glowing sap trough between pod beds. */
const nurseryHall: ModuleDef = {
  id: 'nursery_hall',
  size: [2, 1, 1],
  tags: ['room', 'nursery'],
  weight: 1.1,
  maxCount: 2,
  levels: [-2, 0],
  connectors: [
    { cell: [0, 0, 0], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.South },
  ],
  build(ctx) {
    const { h } = ctx
    hiveRoom(ctx, { wall: 'comb', frame: 'rib', bulge: 0.06 })
    // Sap trough down the middle, rimmed with root
    ctx.fill(5, 0, 3, 12, 0, 5, 'mass')
    ctx.fill(6, 0, 4, 11, 0, 4, 'sap')
    podCluster(ctx, 4, 1, 2, 1, 0.6, 53)
    podCluster(ctx, 13, 1, 6, 1, 0.6, 54)
    podCluster(ctx, 9, 1, 7, 1, 0.5, 55)
    if (ctx.rng.chance(0.7)) ctx.chest(8, 1, 1, { tier: Math.max(1, ctx.tier), facing: BlockFacing.SOUTH })
    ceilingLamp(ctx, 4, h - 1, 4)
    ceilingLamp(ctx, 13, h - 1, 4)
    doorways(ctx)
  },
}

/** Brood chamber: membrane-partitioned pod beds where a drone swarm waits (garrison). */
const broodChamber: ModuleDef = {
  id: 'brood_chamber',
  size: [2, 1, 2],
  tags: ['room', 'garrison'],
  weight: 2,
  maxCount: 3,
  minDepth: 1,
  levels: [-2, 0],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    const zones = hiveRoom(ctx, { wall: 'comb', frame: 'rib', bulge: 0.06, tendrils: 0.02 })
    // Membrane partitions jutting from the long walls form pod alcoves
    for (const x of [6, 11]) {
      for (const [z0, z1] of [[1, 3], [d - 4, d - 2]] as const) {
        for (let z = z0; z <= z1; z++) {
          for (let y = 1; y <= 4; y++) if (!inZones(zones, x, y, z)) ctx.set(x, y, z, 'membrane')
        }
      }
    }
    for (const [x, z] of [[3, 2], [8, 2], [14, 2], [3, d - 3], [8, d - 3], [14, d - 3]] as const) podCluster(ctx, x, 1, z, 1, 0.55, 61)
    ctx.garrison(Math.floor(w / 2), 0, Math.floor(d / 2), HIVE_GARRISON.BROOD)
    ceilingLamp(ctx, 5, h - 1, 9)
    ceilingLamp(ctx, 12, h - 1, 9)
    doorways(ctx)
  },
}

// ---------------------------------------------------------------------------
// Galleries, cisterns, bridges
// ---------------------------------------------------------------------------

/** Gill gallery: a long hall walled in glowing gill lamellae between root pillars. */
const gillGallery: ModuleDef = {
  id: 'gill_gallery',
  size: [1, 1, 3],
  tags: ['room', 'gallery'],
  weight: 1.3,
  maxCount: 3,
  levels: [-2, 1],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 2], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
    { cell: [0, 0, 1], face: Face.West },
  ],
  build(ctx) {
    const { h } = ctx
    const zones = hiveRoom(ctx, { wall: 'gill', frame: 'pillar', ribs: 'pillar', bulge: 0.03, tendrils: 0 })
    strands(ctx, h - 1, 0.06, 3, 71)
    if (ctx.rng.chance(0.45) && !inZones(zones, 1, 1, 6)) ctx.chest(1, 1, 6, { facing: BlockFacing.EAST })
    ceilingLamp(ctx, 4, h - 1, 7)
    ceilingLamp(ctx, 4, h - 1, 19)
    doorways(ctx)
  },
}

/**
 * Gill balcony: a two-level hall; a root balcony along the upper doors
 * overlooks the lower floor, with climbable tendrils hanging from its edge.
 */
const gillBalcony: ModuleDef = {
  id: 'gill_balcony',
  size: [2, 2, 1],
  tags: ['room', 'gallery', 'stairs'],
  weight: 1,
  maxCount: 2,
  levels: [-2, -1],
  connectors: [
    { cell: [0, 1, 0], face: Face.North },
    { cell: [1, 1, 0], face: Face.North },
    { cell: [0, 0, 0], face: Face.South },
    { cell: [1, 0, 0], face: Face.South },
  ],
  build(ctx) {
    const { w, h } = ctx
    hiveRoom(ctx, { wall: 'gill', tall: true, ribs: 'pillar', bulge: 0.03, tendrils: 0.01 })
    // The balcony (upper floor, z 1-3) with root corbels below and a railing
    ctx.fill(1, FH, 1, w - 2, FH, 3, 'mass')
    for (let x = 3; x < w - 2; x += 4) ctx.fill(x, FH - 2, 3, x, FH - 1, 3, 'rib')
    const climbs = [4, w - 5]
    for (let x = 1; x < w - 1; x++) {
      if (climbs.includes(x)) continue
      if (x % 2 === 0) ctx.set(x, FH + 1, 3, 'rib')
    }
    // Tendrils down from the balcony edge: the way back up
    for (const x of climbs) ctx.fill(x, 1, 4, x, FH + 1, 4, BlockIds.HANGING_TENDRILS)
    strands(ctx, h - 1, 0.04, 3, 81)
    ceilingLamp(ctx, 5, h - 1, 6)
    ceilingLamp(ctx, w - 6, h - 1, 6)
    doorways(ctx)
  },
}

/** Sap cistern: two curbed pools of glowing sap; a cache waits in one of them. */
const sapCistern: ModuleDef = {
  id: 'sap_cistern',
  size: [2, 1, 2],
  tags: ['room', 'cistern'],
  weight: 1.2,
  maxCount: 2,
  minDepth: 2,
  levels: [-2, 0],
  // Everything stays inside the box: the chest's tier block must never be another module's ceiling
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 0], face: Face.East },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
  ],
  build(ctx) {
    const { h } = ctx
    hiveRoom(ctx, { wall: 'wall', frame: 'rib', bulge: 0.08, tendrils: 0.02 })
    // Two pools in the floor: channels of glowing sap between chitin ribs (light budget: half the
    // cells glow), a chitin rim and a low chitin curb along their long sides
    for (const [x0, x1] of [[3, 7], [10, 14]] as const) {
      ctx.fill(x0 - 1, 0, 4, x1 + 1, 0, 13, 'chitin')
      for (let z = 5; z <= 12; z++) if (z % 2 === 1) ctx.fill(x0, 0, z, x1, 0, z, 'sap')
      ctx.fill(x0 - 1, 1, 5, x0 - 1, 1, 12, 'chitin')
      ctx.fill(x1 + 1, 1, 5, x1 + 1, 1, 12, 'chitin')
    }
    // Root columns at the pools' corners
    for (const [x, z] of [[2, 4], [8, 4], [9, 13], [15, 13]] as const) ctx.fill(x, 1, z, x, h - 2, z, 'rib')
    ctx.chest(5, 1, 8, { tier: Math.max(2, ctx.tier), facing: BlockFacing.EAST })
    ceilingLamp(ctx, 8, h - 1, 8)
    doorways(ctx)
  },
}

/** Root bridge: a root span over a sap-lit pit, sometimes half collapsed (shelf-fungus stepping path). */
const rootBridge: ModuleDef = {
  id: 'root_bridge',
  size: [1, 2, 2],
  tags: ['room', 'bridge'],
  weight: 1.1,
  maxCount: 2,
  levels: [-2, -1],
  connectors: [
    { cell: [0, 1, 0], face: Face.North },
    { cell: [0, 1, 1], face: Face.South },
    { cell: [0, 0, 0], face: Face.West },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    hiveRoom(ctx, { wall: 'wall', tall: true, bulge: 0.08, tendrils: 0.02 })
    // Pit floor: a sap pool, glowcaps
    ctx.fill(3, 0, 6, 5, 0, 11, 'sap')
    floorGrowth(ctx, 1, 0.1, 91)
    // The span (3 wide) with railings
    const collapsed = ctx.rng.chance(0.35)
    for (let z = 1; z <= d - 2; z++) {
      const broken = collapsed && z >= 7 && z <= 10
      if (!broken) {
        ctx.fill(3, FH, z, 5, FH, z, 'mass')
        // Railing posts stand on the span's edges (never beside it, over the drop)
        if (z % 4 === 1) {
          ctx.set(3, FH + 1, z, 'rib')
          ctx.set(5, FH + 1, z, 'rib')
        }
      } else {
        // A crooked line of shelf fungi across the gap
        const x = 3 + Math.floor(ctx.hash(0, FH, z, 93) * 3)
        ctx.set(x, FH, z, BlockIds.SHELF_FUNGUS)
        if (z > 7) {
          const px = 3 + Math.floor(ctx.hash(0, FH, z - 1, 93) * 3)
          for (let xx = Math.min(x, px); xx <= Math.max(x, px); xx++) ctx.set(xx, FH, z, BlockIds.SHELF_FUNGUS)
        }
      }
      if (ctx.hash(4, FH - 1, z, 94) < 0.3) ctx.setIf(4, FH - 1, z, BlockIds.HANGING_TENDRILS, isAir)
    }
    // Root stairs from the pit floor up along the east wall to the span (south of any collapse)
    stairs(ctx, 6, 1, 6, Face.South, FH, 2, STAIRS, 'mass', 0, true)
    ctx.fill(6, FH, 13, 7, FH, 13, 'mass') // landing
    ctx.fill(6, FH + 1, 12, 7, FH + 3, 13, BlockIds.AIR)
    ceilingLamp(ctx, 4, h - 1, 4)
    ceilingLamp(ctx, 4, h - 1, 13)
    void w
    doorways(ctx)
  },
}

// ---------------------------------------------------------------------------
// Garrison halls and dens
// ---------------------------------------------------------------------------

function wardenHall(id: string, antechamber: boolean): ModuleDef {
  return {
    id,
    size: [2, 1, 2],
    tags: antechamber ? ['room', 'garrison', 'antechamber'] : ['room', 'garrison'],
    weight: antechamber ? 0.8 : 1.4,
    maxCount: antechamber ? 1 : 2,
    minDepth: antechamber ? 5 : 3,
    levels: antechamber ? [-2, -1] : [-2, 0],
    connectors: [
      { cell: [0, 0, 0], face: Face.North },
      { cell: [1, 0, 0], face: Face.North },
      { cell: [1, 0, 1], face: Face.South },
      { cell: [0, 0, 1], face: Face.West },
      { cell: [1, 0, 1], face: Face.East },
    ],
    build(ctx) {
      const { w, h, d } = ctx
      const zones = hiveRoom(ctx, { wall: 'chitinWall', floor: 'chitin', frame: 'pillar', ribs: 'pillar', bulge: 0.05 })
      // Four root pillars crowned with spore sacs
      for (const [px, pz] of [[5, 5], [12, 5], [5, 12], [12, 12]] as const) {
        ctx.fill(px, 1, pz, px, h - 2, pz, 'pillar')
        ctx.set(px, h - 2, pz, 'sac')
      }
      // Membrane curtains hanging between the pillars
      for (let x = 6; x <= 11; x++) {
        for (const z of [5, 12]) {
          if (ctx.hash(x, h - 2, z, 101) < (antechamber ? 0.8 : 0.5) && !inZones(zones, x, h - 2, z)) ctx.set(x, h - 2, z, 'membrane')
        }
      }
      if (antechamber) {
        strands(ctx, h - 1, 0.1, 3, 103)
        podCluster(ctx, 3, 1, 9, 1, 0.5, 104)
        podCluster(ctx, 14, 1, 9, 1, 0.5, 105)
      }
      ctx.garrison(Math.floor(w / 2), 0, Math.floor(d / 2), HIVE_GARRISON.WARDEN)
      doorways(ctx)
    },
  }
}

/** Stalker den: a cramped root lair with low, lumpy ceilings (garrison). */
const stalkerDen: ModuleDef = {
  id: 'stalker_den',
  size: [1, 1, 2],
  tags: ['room', 'garrison'],
  weight: 1.1,
  maxCount: 2,
  minDepth: 2,
  levels: [-2, 0],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [0, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.East },
  ],
  build(ctx) {
    const { w, h, d } = ctx
    const zones = hiveRoom(ctx, { wall: 'mass', frame: 'rib', bulge: 0.22, tendrils: 0.05 })
    // Lumpy low ceiling
    for (let x = 1; x < w - 1; x++) {
      for (let z = 1; z < d - 1; z++) {
        if (ctx.hash(x, h - 2, z, 111) < 0.35 && !inZones(zones, x, h - 2, z)) ctx.set(x, h - 2, z, 'mass')
      }
    }
    podCluster(ctx, 2, 1, 14, 1, 0.4, 112)
    floorGrowth(ctx, 1, 0.12, 113)
    ctx.garrison(4, 0, 9, HIVE_GARRISON.STALKERS)
    ceilingLamp(ctx, 4, h - 2, 4)
    doorways(ctx)
  },
}

// ---------------------------------------------------------------------------
// Vaults, caps, crown rooms
// ---------------------------------------------------------------------------

/** Sap vault: a chitin-plated cell behind a root lattice grate with a narrow crawl gap. */
const sapVault: ModuleDef = {
  id: 'sap_vault',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 3,
  minDepth: 3,
  levels: [-2, 0],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    const { w, d } = ctx
    hiveRoom(ctx, { wall: 'chitin', floor: 'chitin', ceiling: 'chitin', frame: 'chitin', ribs: null, bulge: 0, tendrils: 0 })
    // The grate across the vault, with a crawl gap (1 wide, 2 high)
    const gap = 2 + Math.floor(ctx.hash(0, 1, 0, 121) * 5)
    ctx.fill(1, 1, 4, w - 2, 5, 4, 'lattice')
    ctx.fill(gap, 1, 4, gap, 2, 4, BlockIds.AIR)
    ctx.chest(2, 1, 2, { facing: BlockFacing.SOUTH })
    if (ctx.rng.chance(0.5)) ctx.chest(6, 1, 2, { facing: BlockFacing.SOUTH })
    // A sac lantern in the back wall, glowcaps by the grate
    ctx.set(4, 3, 0, 'sac')
    for (const x of [1, w - 2]) ctx.setIf(x, 1, d - 3, BlockIds.GLOWCAP, isAir)
    doorways(ctx)
  },
}

/** Pod alcove: a dead-end grotto of egg pods and glowcaps, sometimes a cache. */
const podAlcove: ModuleDef = {
  id: 'pod_alcove',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1.4,
  maxCount: 6,
  levels: [-2, 1],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    rootBore(ctx)
    podCluster(ctx, 4, 1, 3, 2, 0.6, 131)
    for (const [x, z] of [[2, 2], [6, 2]] as const) ctx.setIf(x, 1, z, BlockIds.GLOWCAP, isAir)
    if (ctx.rng.chance(0.35)) ctx.chest(4, 1, 2, { facing: BlockFacing.SOUTH })
    if (ctx.hash(4, 5, 4, 132) < 0.5) ceilingLamp(ctx, 4, 6, 4)
  },
}

/** Collapsed tunnel: a dead end choked with roots. */
const collapsedTunnel: ModuleDef = {
  id: 'collapsed_tunnel',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 6,
  levels: [-2, 1],
  connectors: [{ cell: [0, 0, 0], face: Face.South }],
  build(ctx) {
    rootBore(ctx)
    // A heap of fallen roots fills the far half (columns rising from the floor: nothing hangs loose)
    for (let x = 1; x < 8; x++) {
      for (let z = 1; z <= 4; z++) {
        const height = Math.floor((2.2 + (4 - z) * 0.9) * (0.6 + 0.6 * ctx.hash(x, 0, z, 141)))
        if (height > 0) ctx.fill(x, 1, z, x, Math.min(5, height), z, 'mass')
      }
    }
    for (let x = 2; x < 7; x++) if (ctx.hash(x, 1, 5, 142) < 0.3) ctx.setIf(x, 1, 5, BlockIds.GLOWCAP, isAir)
  },
}

/** Crown gallery: the high chamber under the crown fungus (level 1), ceiling of gills. */
const crownGallery: ModuleDef = {
  id: 'crown_gallery',
  size: [2, 1, 2],
  tags: ['room', 'crown'],
  weight: 1.5,
  maxCount: 1,
  levels: [1, 1],
  connectors: [
    { cell: [0, 0, 0], face: Face.North },
    { cell: [1, 0, 1], face: Face.South },
    { cell: [0, 0, 1], face: Face.West },
    { cell: [1, 0, 0], face: Face.East },
  ],
  build(ctx) {
    const { h } = ctx
    hiveRoom(ctx, { wall: 'wall', ceiling: 'gill', frame: 'rib', bulge: 0.06, tendrils: 0 })
    // A hanging cap chandelier: ember cap ring with gills below and a sac core
    ctx.fill(7, h - 2, 7, 10, h - 2, 10, BlockIds.EMBER_CAP)
    ctx.fill(8, h - 3, 8, 9, h - 3, 9, BlockIds.EMBER_GILLS)
    ctx.set(8, h - 2, 8, 'sac')
    strands(ctx, h - 1, 0.07, 2, 151)
    ctx.chest(2, 1, 2, { tier: Math.max(1, ctx.tier), facing: BlockFacing.SOUTH })
    doorways(ctx)
  },
}

// ---------------------------------------------------------------------------
// The throne
// ---------------------------------------------------------------------------

/**
 * The Sporemother's throne: a domed chitin-floored hall (3×3 cells, two
 * levels) at the bottom of the hive - a ring of root pillars, a moat of
 * glowing sap, a fungal throne (root stem under an ember cap) behind the
 * guardian altar, and a cluster of spore sacs swelling from the dome.
 */
function throne(id: string, ledge: boolean): ModuleDef {
  return {
  id,
  size: [3, 2, 3],
  tags: ['boss'],
  levels: [-2, -2],
  // The ledge variant is entered high in the dome (from level -1) and descends on root stairs
  connectors: [{ cell: [1, ledge ? 1 : 0, 2], face: Face.South }],
  build(ctx) {
    const { w, h, d } = ctx
    const c = Math.floor(w / 2) // 13
    hiveRoom(ctx, { wall: 'chitinWall', floor: 'chitin', ceiling: 'mass', frame: 'pillar', tall: true, ribs: null, bulge: 0.04, tendrils: 0 })
    // Dome: fill everything outside a hemispheroid above the walls' base
    const R = 12.6
    for (let y = 4; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let z = 1; z < d - 1; z++) {
          const dx = (x - c) / R, dz = (z - c) / R, dy = (y - 1) / (h - 1.5)
          if (dx * dx + dz * dz + dy * dy > 1) ctx.set(x, y, z, 'mass')
        }
      }
    }
    // Sap moat ring (every third block glows; chitin between)
    for (let x = 1; x < w - 1; x++) {
      for (let z = 1; z < d - 1; z++) {
        const r = Math.hypot(x - c, z - c)
        if (r >= 7.5 && r <= 8.7) ctx.set(x, 0, z, (x + z) % 3 === 0 ? 'sap' : 'chitin')
      }
    }
    // Root pillars on a ring
    for (let k = 0; k < 6; k++) {
      if (ledge && k === 1) continue // the ledge stands there
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      const px = Math.round(c + Math.cos(a) * 10)
      const pz = Math.round(c + Math.sin(a) * 10)
      ctx.fill(px, 1, pz, px, h - 2, pz, 'pillar')
    }
    // The fungal throne behind the altar (north): root stem, ember cap canopy, gills
    ctx.fill(c - 1, 1, 4, c + 1, 7, 6, 'pillar')
    ctx.fill(c - 2, 1, 4, c + 2, 2, 7, 'mass') // the seat
    for (let x = c - 5; x <= c + 5; x++) {
      for (let z = 0; z <= 10; z++) {
        const r = Math.hypot(x - c, z - 5)
        if (r <= 5.2) ctx.setIf(x, 8, z, BlockIds.EMBER_CAP, (id) => id === BlockIds.AIR || id === BlockIds.HIVE_ROOT)
        if (r <= 4.2) ctx.setIf(x, 7, z, BlockIds.EMBER_GILLS, isAir)
      }
    }
    // The altar on a ring of spore sacs set in the floor
    for (let x = c - 3; x <= c + 3; x++) {
      for (let z = c - 3; z <= c + 3; z++) {
        const r = Math.hypot(x - c, z - c)
        if (r >= 2.5 && r < 3.5) ctx.set(x, 0, z, (x + 2 * z) % 3 === 0 ? 'sac' : BlockIds.EMBER_GILLS)
      }
    }
    ctx.guardian(c, 1, c, SPOREMOTHER_GUARDIAN_INDEX)
    // The sporeheart: sacs swelling from the dome apex, strands around it
    for (let x = c - 2; x <= c + 2; x++) {
      for (let z = c - 2; z <= c + 2; z++) {
        const r = Math.hypot(x - c, z - c)
        // (a shell: buried sacs would only cost light updates)
        if (r <= 0.8) ctx.fill(x, h - 4, z, x, h - 2, z, 'sac')
        else if (r <= 1.5) ctx.set(x, h - 3, z, 'sac')
        else if (r <= 2.3) ctx.set(x, h - 2, z, (x + z) % 2 === 0 ? 'sac' : 'mass')
      }
    }
    strands(ctx, h - 2, 0.06, 4, 161)
    if (ledge) {
      // Ledge inside the south door (level -1 floor), root stairs down the dome wall to the west
      ctx.fill(12, 1, 22, 14, FH, 25, 'mass')
      ctx.fill(12, FH + 1, 22, 14, FH + 4, 25, BlockIds.AIR)
      ctx.fill(11, FH + 1, 22, 11, FH + 4, 23, BlockIds.AIR)
      stairs(ctx, 5, 1, 22, Face.East, FH, 2, STAIRS, 'mass', 0, true)
      for (let x = 12; x <= 15; x++) ctx.set(x, FH + 1, 21, 'rib')
      for (let z = 21; z <= 24; z++) ctx.set(15, FH + 1, z, 'rib')
      ctx.set(12, FH + 2, 21, 'sac')
      ctx.set(15, FH + 2, 24, 'sac')
    }
    doorways(ctx)
  },
  }
}

export const HIVE_MODULES: readonly ModuleDef[] = [
  rootArch,
  gillMaw,
  tunnel('root_tunnel', [Face.North, Face.South], 3),
  tunnel('root_bend', [Face.South, Face.East], 2),
  tunnel('root_fork', [Face.South, Face.East, Face.West], 2),
  tunnel('root_knot', [Face.North, Face.South, Face.East, Face.West], 0.8),
  rootRamp,
  rootClimb('root_climb', [-2, -1], 1.2, 3),
  rootClimb('crown_climb', [0, 0], 0.5, 1),
  sporeNursery,
  nurseryHall,
  broodChamber,
  gillGallery,
  gillBalcony,
  sapCistern,
  rootBridge,
  wardenHall('warden_hall', false),
  wardenHall('heart_antechamber', true),
  stalkerDen,
  sapVault,
  podAlcove,
  collapsedTunnel,
  crownGallery,
  throne('sporemother_throne', false),
  throne('sporemother_throne_ledge', true),
]

void CS
