import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, carve, dome, roofPitched, windows, type ModuleDef } from '../../index.ts'
import {
  GARRISON_ACOLYTE_COVEN, GARRISON_SENTINEL_COURT, GARRISON_SENTINEL_GUARD, GARRISON_SHARD_SWARM,
  PRISM_WARDEN_GUARDIAN_INDEX,
} from './PrismSanctumConfig.ts'
import {
  FH, banner, chamfer, column, cornice, facingToward, gabledRoof, lantern, openAbove, pyramidRoof, reopenDoors,
  ring6, roofPyramid, rosette, shell, switchback, topOpen,
} from './sanctumBuild.ts'

/**
 * Prism Sanctum modules (see kit-design.md): gates, halls, galleries,
 * colonnades, terraces, bridges, stair halls, the observatory spire,
 * reliquaries, cells, scriptoria, acolyte quarters, sentinel courts, the
 * undercroft and the Warden's lens chamber.
 *
 * Loot-signature rule (tier tables use signatureRadius 1): mirrors only stand
 * where no chest below tier 2 is within one block, and inlaid tiles where no
 * chest below tier 3 is within one block.
 */

const N = Face.North
const S = Face.South
const E = Face.East
const W = Face.West
const AIR = BlockIds.AIR

// ===========================================================================
// Entrances
// ===========================================================================

/** Gatehouse: a vestibule behind a pedimented facade flanked by tall pylons. */
const prismGate: ModuleDef = {
  id: 'prism_gate',
  size: [1, 1, 2],
  tags: ['entrance'],
  weight: 2,
  connectors: [
    { cell: [0, 0, 1], face: S, exterior: true },
    { cell: [0, 0, 0], face: N },
    { cell: [0, 0, 0], face: E },
    { cell: [0, 0, 0], face: W },
  ],
  levels: [0, 0],
  overhang: { up: 9 },
  build(ctx) {
    const { d, h } = ctx
    shell(ctx)
    ctx.fill(4, 0, 1, 4, 0, d - 2, 'inlay')
    // Pylons framing the gate, gilded capitals, crystal finials, and the
    // pediment over the door - above the roof line only where nothing is
    // built over the front cell
    const tall = openAbove(ctx, 4, d - 1)
    for (const px of [0, 7]) {
      ctx.fill(px, 0, d - 2, px + 1, tall ? h + 4 : h - 1, d - 1, 'pillar')
      if (tall) {
        ctx.fill(px, h + 5, d - 2, px + 1, h + 5, d - 1, 'trim')
        ctx.fill(px, h + 6, d - 2, px + 1, h + 6, d - 1, 'crystal')
        ctx.set(px === 0 ? 1 : 7, h + 7, d - 1, 'rose')
      }
      ctx.light(px === 0 ? 1 : 7, 4, d - 1)
    }
    if (tall) {
      ctx.fill(2, h, d - 1, 6, h, d - 1, 'carved')
      ctx.fill(3, h + 1, d - 1, 5, h + 1, d - 1, 'wall')
      ctx.set(4, h + 2, d - 1, 'trim')
      ctx.set(4, h + 1, d - 1, 'rose')
    }
    // Crystal transom
    ctx.fill(3, h - 1, d - 1, 5, h - 1, d - 1, 'glass')
    // Vestibule dressing
    banner(ctx, 1, 5, 7, BlockFacing.EAST)
    banner(ctx, 7, 5, 7, BlockFacing.WEST)
    banner(ctx, 1, 5, 12, BlockFacing.EAST)
    banner(ctx, 7, 5, 12, BlockFacing.WEST)
    ctx.set(2, 1, 13, BlockIds.PRISM_PEDESTAL)
    ctx.set(6, 1, 13, BlockIds.PRISM_PEDESTAL)
    lantern(ctx, 4, 5, 8)
    if (topOpen(ctx)) {
      cornice(ctx)
      roofPyramid(ctx, 2, 1, 6, d - 3, h, 'roof')
    }
  },
}

/** Grand gate: a three-bay portico, crystal windows in the side bays. */
const grandGate: ModuleDef = {
  id: 'grand_gate',
  size: [3, 1, 1],
  tags: ['entrance'],
  weight: 1,
  connectors: [
    { cell: [1, 0, 0], face: S, exterior: true },
    { cell: [1, 0, 0], face: N },
    { cell: [0, 0, 0], face: W },
    { cell: [2, 0, 0], face: E },
  ],
  levels: [0, 0],
  overhang: { up: 9 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx)
    ctx.fill(1, 0, 4, w - 2, 0, 4, 'inlay')
    // Blind arches with crystal glass in the side bays
    for (const x0 of [3, 21]) {
      ctx.fill(x0 - 1, 1, d - 1, x0 + 3, 5, d - 1, 'carved')
      ctx.fill(x0, 2, d - 1, x0 + 2, 4, d - 1, 'glass')
    }
    // Pylons flanking the central door and at the corners
    // (above the roof line only where nothing is built over that cell)
    for (const [px, tallTop] of [[9, h + 6], [16, h + 6], [0, h + 3], [25, h + 3]] as const) {
      const top = openAbove(ctx, px, d - 1) ? tallTop : h - 2
      ctx.fill(px, 0, d - 2, px + 1, top - 1, d - 1, 'pillar')
      ctx.fill(px, top, d - 2, px + 1, top, d - 1, 'trim')
      ctx.set(px, top + 1, d - 1, 'rose')
    }
    ctx.light(10, 4, d - 1)
    ctx.light(16, 4, d - 1)
    // Pediment over the central bay
    if (openAbove(ctx, 13, d - 1)) {
      ctx.fill(11, h, d - 1, 15, h, d - 1, 'carved')
      ctx.fill(12, h + 1, d - 1, 14, h + 1, d - 1, 'wall')
      ctx.set(13, h + 2, d - 1, 'trim')
      ctx.set(13, h + 1, d - 1, 'rose')
    }
    banner(ctx, 6, 5, 1, BlockFacing.SOUTH)
    banner(ctx, 20, 5, 1, BlockFacing.SOUTH)
    ctx.set(7, 1, 2, BlockIds.PRISM_PEDESTAL)
    ctx.set(19, 1, 2, BlockIds.PRISM_PEDESTAL)
    lantern(ctx, 13, 5, 4)
    if (topOpen(ctx)) {
      cornice(ctx)
      roofPitched(ctx, 1, 1, w - 2, d - 2, h, 'roof', true, 'wall')
    }
  },
}

// ===========================================================================
// Halls
// ===========================================================================

/** Square pylon hall (three variants: pylons, fountain of light, mirror hall). */
const pylonHall: ModuleDef = {
  id: 'pylon_hall',
  size: [2, 1, 2],
  tags: ['room', 'hall'],
  weight: 3,
  maxCount: 5,
  connectors: [
    { cell: [0, 0, 0], face: N }, { cell: [1, 0, 0], face: N },
    { cell: [1, 0, 0], face: E }, { cell: [1, 0, 1], face: E },
    { cell: [1, 0, 1], face: S }, { cell: [0, 0, 1], face: S },
    { cell: [0, 0, 1], face: W }, { cell: [0, 0, 0], face: W },
  ],
  levels: [0, 1],
  overhang: { up: 5 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx)
    const variant = ctx.rng.int(0, 2)
    const wantChest = ctx.rng.chance(0.45)
    // Inlay frame (3 in from the walls) and a central lozenge
    ctx.fill(3, 0, 3, w - 4, 0, 3, 'inlay')
    ctx.fill(3, 0, d - 4, w - 4, 0, d - 4, 'inlay')
    ctx.fill(3, 0, 3, 3, 0, d - 4, 'inlay')
    ctx.fill(w - 4, 0, 3, w - 4, 0, d - 4, 'inlay')
    ctx.fill(8, 0, 8, 9, 0, 9, 'inlay')
    for (const [px, pz] of [[5, 5], [12, 5], [5, 12], [12, 12]]) column(ctx, px, pz, 1, 5)
    if (variant === 0) {
      // Pylons: lamps set into the four columns
      for (const [px, pz] of [[5, 5], [12, 12]]) ctx.light(px, 3, pz)
      lantern(ctx, 8, 5, 9)
    } else if (variant === 1) {
      // Fountain of light: a crystal column under a lantern, ringed by pedestals
      ctx.fill(8, 1, 8, 9, 2, 9, 'crystal')
      ctx.set(8, 3, 8, 'rose')
      ctx.set(9, 3, 9, 'rose')
      lantern(ctx, 9, 5, 8)
      for (const [px, pz] of [[8, 6], [11, 8], [9, 11], [6, 9]]) ctx.set(px, 1, pz, BlockIds.PRISM_PEDESTAL)
    } else {
      // Mirror hall: mirror panels between the doors, pedestals before them
      ctx.fill(7, 1, 0, 10, 4, 0, 'mirror')
      ctx.fill(7, 1, d - 1, 10, 4, d - 1, 'mirror')
      ctx.fill(0, 1, 7, 0, 4, 10, 'mirror')
      ctx.fill(w - 1, 1, 7, w - 1, 4, 10, 'mirror')
      for (const [px, pz] of [[8, 2], [9, d - 3], [2, 9], [w - 3, 8]]) ctx.set(px, 1, pz, BlockIds.PRISM_PEDESTAL)
      lantern(ctx, 8, 5, 8)
    }
    // A chest against a plain wall stretch (never beside a mirror or inlay)
    if (wantChest && variant !== 2) ctx.chest(1, 1, 8, { facing: BlockFacing.EAST })
    if (topOpen(ctx)) {
      cornice(ctx)
      const top = roofPyramid(ctx, 1, 1, w - 2, d - 2, h, 'roof', 2)
      ctx.fill(8, top - 1, 8, 9, top - 1, 9, 'glass')
    }
  },
}

/**
 * Octagonal hall (the hubs): mirrored chamfers, 8 columns, star inlay and a
 * dome that opens the hall to its crystal oculus. Variants: the star
 * (a prism pedestal under a lantern), the fountain of light (a crystal
 * column in a glittering basin) and the orrery (gilded armillary rings
 * around a rose crystal, hung in the open dome).
 */
const octagonHall: ModuleDef = {
  id: 'octagon_hall',
  size: [3, 1, 3],
  tags: ['room', 'hall', 'hub'],
  weight: 3,
  maxCount: 2,
  connectors: [
    { cell: [1, 0, 0], face: N },
    { cell: [2, 0, 1], face: E },
    { cell: [1, 0, 2], face: S },
    { cell: [0, 0, 1], face: W },
  ],
  levels: [0, 1],
  overhang: { up: 16 },
  build(ctx) {
    const { h } = ctx
    const open = topOpen(ctx)
    let variant = ctx.rng.int(0, 2)
    if (variant === 2 && !open) variant = 0
    shell(ctx)
    chamfer(ctx, 1, 1, 25, 25, 7, 1, h - 2, 'wall', 'mirror', 2, 4)
    // Eight-pointed star and an octagon ring in the floor
    for (let t = -9; t <= 9; t++) {
      ctx.set(13 + t, 0, 13, 'inlay')
      ctx.set(13, 0, 13 + t, 'inlay')
      if (Math.abs(t) <= 6) {
        ctx.set(13 + t, 0, 13 + t, 'inlay')
        ctx.set(13 + t, 0, 13 - t, 'inlay')
      }
    }
    for (let dz = -11; dz <= 11; dz++) {
      for (let dx = -11; dx <= 11; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz), Math.round((Math.abs(dx) + Math.abs(dz)) * 0.7071))
        if (m === 10) ctx.set(13 + dx, 0, 13 + dz, 'inlay')
      }
    }
    // Eight columns on a ring turned off the door axes (clear sightlines from every door)
    const cols: Array<[number, number]> = [[21, 10], [16, 5], [10, 5], [5, 10], [5, 16], [10, 21], [16, 21], [21, 16]]
    cols.forEach(([px, pz], i) => {
      column(ctx, px, pz, 1, h - 2)
      if (i % 2 === 0) ctx.light(px, 3, pz)
    })
    const R = 12
    const y0 = h - 1
    if (open) {
      // Roof-tile dome with a crystal-glass oculus, crowned by a prism finial;
      // the ceiling inside its rim opens the hall into the dome
      cornice(ctx)
      // Two blocks thick: a 1-thick voxel shell of this radius is not
      // face-connected at its crown (the top disc only touches the ring
      // below at edges - a floating oculus)
      dome(ctx, 13, y0, 13, R, 'roof', 2)
      for (let dz = -(R - 1); dz <= R - 1; dz++) {
        for (let dx = -(R - 1); dx <= R - 1; dx++) {
          if (dx * dx + dz * dz < (R - 0.5) * (R - 0.5)) ctx.set(13 + dx, y0, 13 + dz, AIR)
        }
      }
      // Gilded ring where the dome meets the walls
      for (let a = 0; a < 96; a++) {
        const t = (a / 96) * Math.PI * 2
        ctx.set(13 + Math.round(Math.cos(t) * (R - 0.5)), y0, 13 + Math.round(Math.sin(t) * (R - 0.5)), 'trim')
      }
      const r2o = (R + 0.5) * (R + 0.5)
      const r2i = (R - 1.5) * (R - 1.5)
      for (let dy = R - 2; dy <= R; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          for (let dx = -4; dx <= 4; dx++) {
            const d2 = dx * dx + dy * dy + dz * dz
            if (d2 <= r2o && d2 > r2i) ctx.set(13 + dx, y0 + dy, 13 + dz, 'glass')
          }
        }
      }
      ctx.fill(13, y0 + R + 1, 13, 13, y0 + R + 2, 13, 'crystal')
      ctx.set(13, y0 + R + 3, 13, BlockIds.ROSE_CRYSTAL)
      ctx.light(13, y0 + R + 4, 13)
    }
    const lanternY = open ? y0 + R - 3 : h - 2
    if (variant === 0) {
      // The star: a prism pedestal under a hanging lantern
      ctx.set(13, 1, 13, BlockIds.PRISM_PEDESTAL)
      lantern(ctx, 13, lanternY, 13)
      if (open) ctx.fill(13, lanternY + 1, 13, 13, y0 + R - 1, 13, 'crystal')
    } else if (variant === 1) {
      // Fountain of light: a crystal column rising from a glittering basin
      ctx.fill(11, 0, 11, 15, 0, 15, BlockIds.GLITTERING_ABYSSAL_STONE)
      for (let k = -2; k <= 2; k++) {
        ctx.set(13 + k, 1, 11, 'trim')
        ctx.set(13 + k, 1, 15, 'trim')
        ctx.set(11, 1, 13 + k, 'trim')
        ctx.set(15, 1, 13 + k, 'trim')
      }
      ctx.fill(13, 1, 13, 13, 4, 13, 'crystal')
      ctx.set(12, 1, 13, 'crystal')
      ctx.set(14, 1, 13, 'crystal')
      ctx.set(13, 1, 12, 'crystal')
      ctx.set(13, 1, 14, 'crystal')
      ctx.set(13, 5, 13, 'rose')
      lantern(ctx, 13, lanternY, 13)
      if (open) ctx.fill(13, lanternY + 1, 13, 13, y0 + R - 1, 13, 'crystal')
    } else {
      // The orrery: two crossed gilded rings and a level one around a rose
      // crystal, hung high in the open dome on a crystal thread
      const cy = y0 + 4
      ring6(5, (c, sn) => {
        ctx.set(13 + c, cy + sn, 13, 'trim')
        ctx.set(13, cy + sn, 13 + c, 'trim')
        ctx.set(13 + c, cy, 13 + sn, 'trim')
      })
      ctx.fill(13, cy - 1, 13, 13, cy + 1, 13, 'rose')
      // the crystal thread: rose crystal -> ring top -> dome apex
      ctx.fill(13, cy + 2, 13, 13, cy + 4, 13, 'crystal')
      ctx.fill(13, cy + 6, 13, 13, y0 + R - 1, 13, 'crystal')
      ctx.set(13, 1, 13, BlockIds.PRISM_PEDESTAL)
      // a lantern hung from the lowest point of the rings, over the pedestal
      lantern(ctx, 13, cy - 6, 13)
    }
  },
}

// ===========================================================================
// Galleries, colonnades, terraces, bridges
// ===========================================================================

function galleryDef(id: string, withSide: boolean, weight: number): ModuleDef {
  return {
    id,
    size: [1, 1, 2],
    tags: ['corridor', 'gallery'],
    weight,
    connectors: withSide
      ? [{ cell: [0, 0, 0], face: N }, { cell: [0, 0, 1], face: S }, { cell: [0, 0, 1], face: E }]
      : [{ cell: [0, 0, 0], face: N }, { cell: [0, 0, 1], face: S }],
    levels: [0, 2],
    overhang: { up: 6 },
    build(ctx) {
      const { d, h } = ctx
      shell(ctx)
      ctx.fill(4, 0, 1, 4, 0, d - 2, 'inlay')
      for (const z of [2, 6, 11, 15]) {
        column(ctx, 1, z, 1, h - 2)
        column(ctx, 7, z, 1, h - 2)
      }
      // Mirror bays between the columns (no chests in galleries)
      const eastDoor = withSide && ctx.connectors[2].open
      for (const [z0, z1] of [[3, 5], [7, 10], [12, 14]]) {
        ctx.fill(0, 1, z0, 0, 4, z1, 'mirror')
        if (!(eastDoor && z0 === 12)) ctx.fill(8, 1, z0, 8, 4, z1, 'mirror')
      }
      ctx.set(1, 1, 4, BlockIds.PRISM_PEDESTAL)
      ctx.set(1, 1, 13, BlockIds.PRISM_PEDESTAL)
      windows(ctx, { block: 'glass', height: 1, sill: 5, width: 3 })
      reopenDoors(ctx)
      if (topOpen(ctx)) {
        roofPitched(ctx, 0, 0, 8, d - 1, h, 'roof', false, 'wall')
        ctx.set(4, h + 5, 0, 'rose')
        ctx.set(4, h + 5, d - 1, 'rose')
      }
    },
  }
}

function junctionDef(id: string, faces: Face[], weight: number): ModuleDef {
  return {
    id,
    size: [1, 1, 1],
    tags: ['corridor', 'gallery'],
    weight,
    connectors: faces.map((face) => ({ cell: [0, 0, 0] as const, face })),
    levels: [-1, 2],
    overhang: { up: 6 },
    build(ctx) {
      const { h } = ctx
      shell(ctx)
      for (const [px, pz] of [[1, 1], [7, 1], [1, 7], [7, 7]]) column(ctx, px, pz, 1, h - 2)
      rosette(ctx, 4, 4, 2)
      lantern(ctx, 4, h - 2, 4)
      if (topOpen(ctx)) {
        cornice(ctx)
        const top = roofPyramid(ctx, 0, 0, 8, 8, h, 'roof')
        ctx.set(4, top, 4, 'rose')
      }
    },
  }
}

/** Open colonnade walk: pillars, gilded architrave, roof tiles; balustrades on open sides. */
const colonnade: ModuleDef = {
  id: 'colonnade',
  size: [1, 1, 2],
  tags: ['corridor', 'colonnade'],
  weight: 2,
  maxCount: 4,
  connectors: [{ cell: [0, 0, 0], face: N }, { cell: [0, 0, 1], face: S }],
  levels: [0, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { w, d, h } = ctx
    ctx.fill(0, 0, 0, w - 1, 0, d - 1, 'floor')
    ctx.fill(0, 1, 0, w - 1, h - 1, d - 1, AIR)
    ctx.fill(4, 0, 0, 4, 0, d - 1, 'inlay')
    const cols = [1, 6, 11, 16]
    // Balustrades where the side faces open country, and across closed ends
    for (const [x, face] of [[0, W], [w - 1, E]] as const) {
      for (let cz = 0; cz < 2; cz++) {
        if (!ctx.isOuterFace(0, 0, cz, face)) continue
        ctx.fill(x, 1, cz * 9, x, 1, cz * 9 + 8, 'trim')
      }
    }
    if (!ctx.connectors[0].open) ctx.fill(1, 1, 0, w - 2, 1, 0, 'trim')
    if (!ctx.connectors[1].open) ctx.fill(1, 1, d - 1, w - 2, 1, d - 1, 'trim')
    for (const z of cols) {
      column(ctx, 0, z, 1, h - 2, false)
      column(ctx, w - 1, z, 1, h - 2, false)
    }
    // Architrave and ceiling
    ctx.fill(0, h - 1, 0, w - 1, h - 1, d - 1, 'trim')
    ctx.fill(1, h - 1, 1, w - 2, h - 1, d - 2, 'roof')
    lantern(ctx, 4, h - 2, 4)
    lantern(ctx, 4, h - 2, 13)
    if (topOpen(ctx)) roofPitched(ctx, 0, 0, w - 1, d - 1, h, 'roof', false, 'trim')
  },
}

/** Open terrace / roof garden: balustrade, crystal planters, a crystal obelisk. */
const terrace: ModuleDef = {
  id: 'terrace',
  size: [2, 1, 2],
  tags: ['courtyard', 'terrace'],
  weight: 1.2,
  maxCount: 2,
  connectors: [
    { cell: [1, 0, 0], face: N },
    { cell: [1, 0, 1], face: E },
    { cell: [0, 0, 1], face: S },
    { cell: [0, 0, 0], face: W },
  ],
  levels: [0, 1],
  overhang: { up: 3 },
  build(ctx) {
    const { w, d, h } = ctx
    ctx.fill(0, 0, 0, w - 1, 0, d - 1, 'floor')
    ctx.fill(0, 1, 0, w - 1, h - 1, d - 1, AIR)
    // Balustrade with posts
    ctx.fill(0, 1, 0, w - 1, 1, 0, 'trim')
    ctx.fill(0, 1, d - 1, w - 1, 1, d - 1, 'trim')
    ctx.fill(0, 1, 0, 0, 1, d - 1, 'trim')
    ctx.fill(w - 1, 1, 0, w - 1, 1, d - 1, 'trim')
    for (const p of [0, 6, 11, 17]) {
      for (const [x, z] of [[p, 0], [p, d - 1], [0, p], [w - 1, p]]) ctx.fill(x, 1, z, x, 2, z, 'pillar')
    }
    for (const c of ctx.connectors) if (c.open) carve(ctx, ctx.doorwayBox(c))
    // Diagonal inlay paths to the centre
    for (let t = 2; t <= 15; t++) {
      ctx.set(t, 0, t, 'inlay')
      ctx.set(t, 0, d - 1 - t, 'inlay')
    }
    // Crystal planters (one shard cluster each) and a crystal obelisk
    for (const [px, pz] of [[3, 3], [13, 3], [3, 13], [13, 13]]) {
      ctx.fill(px, 0, pz, px + 1, 0, pz + 1, BlockIds.GLITTERING_ABYSSAL_STONE)
      ctx.set(px, 1, pz, BlockIds.PRISM_CLUSTER)
      ctx.set(px + 1, 1, pz + 1, 'crystal')
    }
    ctx.fill(8, 1, 8, 9, 3, 9, 'crystal')
    ctx.fill(8, 4, 8, 9, 4, 9, 'trim')
    ctx.set(8, 5, 8, 'rose')
    ctx.light(9, 5, 9)
  },
}

/** Bridge: a railed deck between wings (piers come from the foundation pass). */
const bridge: ModuleDef = {
  id: 'bridge',
  size: [1, 1, 2],
  tags: ['corridor', 'bridge'],
  weight: 1,
  maxCount: 2,
  connectors: [{ cell: [0, 0, 0], face: N }, { cell: [0, 0, 1], face: S }],
  levels: [0, 0],
  build(ctx) {
    const { w, d, h } = ctx
    // The deck only: beside it the ground (or the chasm) shows through
    ctx.fill(0, 1, 0, w - 1, h - 1, d - 1, AIR)
    ctx.fill(2, 0, 0, 6, 0, d - 1, 'floor')
    ctx.fill(4, 0, 0, 4, 0, d - 1, 'inlay')
    ctx.fill(2, 0, 0, 2, 0, d - 1, 'trim')
    ctx.fill(6, 0, 0, 6, 0, d - 1, 'trim')
    ctx.fill(2, 1, 1, 2, 1, d - 2, 'trim')
    ctx.fill(6, 1, 1, 6, 1, d - 2, 'trim')
    for (const z of [1, 8, 16]) {
      column(ctx, 2, z, 1, 2, false)
      column(ctx, 6, z, 1, 2, false)
    }
    ctx.light(2, 3, 8)
    ctx.light(6, 3, 8)
  },
}

// ===========================================================================
// Stairs and the observatory spire
// ===========================================================================

/** Stair hall: one switchback flight between two levels (both doors on the south side). */
const stairHall: ModuleDef = {
  id: 'stair_hall',
  size: [1, 2, 1],
  tags: ['stairs'],
  weight: 3,
  maxCount: 5,
  connectors: [{ cell: [0, 0, 0], face: S }, { cell: [0, 1, 0], face: S }],
  levels: [-1, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { h } = ctx
    shell(ctx)
    switchback(ctx, 0, FH)
    windows(ctx, { block: 'glass', height: 2, sill: 2 })
    ctx.light(8, 3, 2)
    ctx.light(8, FH + 3, 2)
    banner(ctx, 4, FH + 5, 1, BlockFacing.SOUTH)
    reopenDoors(ctx)
    if (topOpen(ctx)) {
      cornice(ctx)
      const top = roofPyramid(ctx, 0, 0, 8, 8, h, 'roof')
      ctx.set(4, top, 4, 'rose')
    }
  },
}

/**
 * Undercroft descent: always from the ground floor down into the
 * undercroft (level -1): a carved stairwell lit by one lamp, banners, and
 * a squat pyramid roof with a crystal finial above ground.
 */
const undercroftStair: ModuleDef = {
  id: 'undercroft_stair',
  size: [1, 2, 1],
  tags: ['stairs', 'descent'],
  weight: 1.5,
  maxCount: 2,
  connectors: [{ cell: [0, 0, 0], face: S }, { cell: [0, 1, 0], face: S }],
  levels: [-1, -1],
  overhang: { up: 6 },
  build(ctx) {
    const { w, h } = ctx
    shell(ctx)
    // Carved band around the lower flight, a lamp at the landing
    ctx.fill(0, 3, 1, 0, 3, 7, 'carved')
    ctx.fill(w - 1, 3, 1, w - 1, 3, 7, 'carved')
    switchback(ctx, 0, FH)
    ctx.light(4, 5, 1)
    banner(ctx, 4, FH + 5, 1, BlockFacing.SOUTH)
    banner(ctx, 1, 5, 7, BlockFacing.EAST)
    windows(ctx, { block: 'glass', height: 2, sill: 2 })
    reopenDoors(ctx)
    if (topOpen(ctx)) {
      cornice(ctx)
      const top = roofPyramid(ctx, 0, 0, 8, 8, h, 'roof')
      ctx.set(4, top, 4, 'crystal')
      ctx.set(4, top + 1, 4, 'rose')
    }
  },
}

/**
 * Grand stair: a tall vaulted hall holding one straight, full-width flight
 * from the ground floor (north door) up to the upper floor (south door):
 * the processional way between the wings.
 */
const grandStair: ModuleDef = {
  id: 'grand_stair',
  size: [1, 2, 2],
  tags: ['stairs', 'ascent'],
  weight: 2,
  maxCount: 2,
  connectors: [{ cell: [0, 0, 0], face: N }, { cell: [0, 1, 1], face: S }],
  levels: [0, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx, false)
    // Seven steps of two blocks (a stair block, then a tread), then the
    // upper landing (the upper floor). Stairs ascend southward: their low
    // front faces north.
    const stair = ctx.facing(BlockFacing.NORTH)
    for (let i = 0; i < FH; i++) {
      const z0 = 2 + 2 * i
      if (i > 0) ctx.fill(1, 1, z0, w - 2, i, z0 + 1, 'wall')
      ctx.fill(1, i + 1, z0, w - 2, i + 1, z0, BlockIds.SANCTUM_STAIRS, stair)
      ctx.fill(1, i + 1, z0 + 1, w - 2, i + 1, z0 + 1, 'floor')
      ctx.set(4, i + 1, z0 + 1, 'inlay')
    }
    ctx.fill(1, 1, 2 + 2 * FH, w - 2, FH, d - 2, 'wall')
    ctx.fill(1, FH, 2 + 2 * FH, w - 2, FH, d - 2, 'floor')
    // Wall columns rising the full height, banners and lamps between them
    for (const z of [1, 6, 11, 16]) {
      column(ctx, 1, z, Math.max(1, Math.floor((z - 2) / 2) + 2), h - 2, false)
      column(ctx, w - 2, z, Math.max(1, Math.floor((z - 2) / 2) + 2), h - 2, false)
    }
    banner(ctx, 1, h - 3, 9, BlockFacing.EAST)
    banner(ctx, w - 2, h - 3, 9, BlockFacing.WEST)
    ctx.light(0, 6, 8)
    ctx.light(w - 1, 10, 13)
    lantern(ctx, 4, h - 2, 9)
    // Clerestory glass high in the side walls
    for (const x of [0, w - 1]) {
      for (const z0 of [3, 13]) ctx.fill(x, h - 4, z0, x, h - 3, z0 + 1, 'glass')
    }
    reopenDoors(ctx)
    if (topOpen(ctx)) {
      cornice(ctx)
      roofPitched(ctx, 0, 0, w - 1, d - 1, h, 'roof', false, 'wall')
      ctx.set(4, h + 5, 0, 'rose')
      ctx.set(4, h + 5, d - 1, 'rose')
    }
  },
}

/** The observatory: a three-level tower, roof deck and a crystal spire with armillary lens rings. */
const observatory: ModuleDef = {
  id: 'observatory',
  size: [1, 3, 1],
  tags: ['tower', 'landmark'],
  weight: 1.5,
  minCount: 1,
  maxCount: 1,
  connectors: [{ cell: [0, 0, 0], face: S }],
  levels: [0, 0],
  overhang: { up: 27 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx)
    // Fluted corner pilasters
    for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) ctx.fill(x, 0, z, x, h - 1, z, 'pillar')
    switchback(ctx, 0, FH)
    switchback(ctx, FH, FH)
    switchback(ctx, 2 * FH, h - 1 - 2 * FH)
    windows(ctx, { block: 'glass', height: 3, sill: 2 })
    for (let k = 0; k < 3; k++) ctx.light(w - 1, k * FH + 3, 6)
    // A tier-2 reward on the top floor (no mirrors or inlay nearby)
    ctx.chest(4, 2 * FH + 1, 6, { facing: BlockFacing.SOUTH })
    reopenDoors(ctx)
    // Roof deck: balustrade, corner obelisks
    const deck = h
    ctx.fill(0, deck, 0, w - 1, deck, 0, 'trim')
    ctx.fill(0, deck, d - 1, w - 1, deck, d - 1, 'trim')
    ctx.fill(0, deck, 0, 0, deck, d - 1, 'trim')
    ctx.fill(w - 1, deck, 0, w - 1, deck, d - 1, 'trim')
    for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) {
      ctx.fill(x, deck, z, x, deck + 3, z, 'pillar')
      ctx.set(x, deck + 4, z, 'trim')
      ctx.set(x, deck + 5, z, 'rose')
    }
    // Spire: a 3×3 crystal shaft (lamps at its shoulders), a slender needle,
    // two crossed armillary rings and a lit crystal tip
    ctx.fill(3, deck, 3, 5, deck + 9, 5, 'crystal')
    for (const [x, z] of [[3, 3], [5, 3], [3, 5], [5, 5]]) ctx.light(x, deck + 9, z)
    ctx.fill(4, deck + 10, 4, 4, deck + 22, 4, 'crystal')
    const cy = deck + 16
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2
      const ox = Math.round(Math.cos(t) * 4)
      const oy = Math.round(Math.sin(t) * 4)
      ctx.set(4 + ox, cy + oy, 4, 'trim')
      ctx.set(4, cy + oy, 4 + ox, 'trim')
    }
    ctx.fill(4, deck + 23, 4, 4, deck + 24, 4, BlockIds.ROSE_CRYSTAL)
    ctx.light(4, deck + 25, 4)
  },
}

// ===========================================================================
// Rooms
// ===========================================================================

/** Reliquary vault: mirror-lined, lens instruments flanking the chest. */
const reliquary: ModuleDef = {
  id: 'reliquary',
  size: [1, 1, 1],
  tags: ['vault'],
  weight: 1,
  maxCount: 3,
  minDepth: 4,
  connectors: [{ cell: [0, 0, 0], face: S }],
  levels: [-1, 1],
  overhang: { up: 7 },
  build(ctx) {
    const { w, d } = ctx
    shell(ctx)
    ctx.fill(0, 1, 1, 0, 5, d - 2, 'mirror')
    ctx.fill(w - 1, 1, 1, w - 1, 5, d - 2, 'mirror')
    ctx.fill(1, 1, 0, 2, 5, 0, 'mirror')
    ctx.fill(6, 1, 0, 7, 5, 0, 'mirror')
    rosette(ctx, 4, 5, 1)
    ctx.set(2, 1, 1, BlockIds.LENS_APPARATUS, ctx.facing(BlockFacing.SOUTH))
    ctx.set(6, 1, 1, BlockIds.LENS_APPARATUS, ctx.facing(BlockFacing.SOUTH))
    ctx.set(1, 1, 6, BlockIds.PRISM_PEDESTAL)
    ctx.set(7, 1, 6, BlockIds.PRISM_PEDESTAL)
    lantern(ctx, 4, 5, 3)
    ctx.chest(4, 1, 1, { facing: BlockFacing.SOUTH })
    reopenDoors(ctx)
    pyramidRoof(ctx)
  },
}

/** Grand reliquary: the treasure of the sanctum (always tier 3, two chests). */
const grandReliquary: ModuleDef = {
  id: 'grand_reliquary',
  size: [2, 1, 1],
  tags: ['vault', 'treasure'],
  weight: 0.8,
  maxCount: 1,
  minDepth: 4,
  connectors: [{ cell: [0, 0, 0], face: S }],
  levels: [-1, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { w, d } = ctx
    shell(ctx)
    ctx.fill(0, 1, 1, 0, 5, d - 2, 'mirror')
    ctx.fill(w - 1, 1, 1, w - 1, 5, d - 2, 'mirror')
    ctx.fill(1, 1, 0, w - 2, 5, 0, 'mirror')
    ctx.fill(1, 0, 3, w - 2, 0, 3, 'inlay')
    rosette(ctx, 12, 5, 2)
    for (const x of [3, 9, 15]) ctx.set(x, 1, 1, BlockIds.LENS_APPARATUS, ctx.facing(BlockFacing.SOUTH))
    ctx.set(1, 1, 6, BlockIds.PRISM_PEDESTAL)
    ctx.set(w - 2, 1, 6, BlockIds.PRISM_PEDESTAL)
    ctx.fill(12, 1, 1, 13, 2, 1, 'crystal')
    ctx.set(12, 3, 1, 'rose')
    lantern(ctx, 5, 5, 4)
    lantern(ctx, 13, 5, 4)
    ctx.chest(6, 1, 1, { facing: BlockFacing.SOUTH })
    ctx.chest(11, 1, 1, { facing: BlockFacing.SOUTH })
    reopenDoors(ctx)
    gabledRoof(ctx)
  },
}

/** Meditation cells: a corridor with four small cells (banners, pedestals, archive niches). */
const meditationCells: ModuleDef = {
  id: 'meditation_cells',
  size: [2, 1, 1],
  tags: ['room', 'cells'],
  weight: 1.5,
  maxCount: 2,
  connectors: [{ cell: [0, 0, 0], face: N }, { cell: [1, 0, 0], face: N }],
  levels: [-1, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { w, d } = ctx
    shell(ctx)
    // Front wall of the cells at z = 4, partitions between them
    ctx.fill(1, 1, 4, w - 2, 5, 4, 'wall')
    for (const x of [5, 9, 13]) ctx.fill(x, 1, 5, x, 5, d - 2, 'wall')
    const cells = [2, 7, 11, 15]
    const chestCell = ctx.rng.chance(0.5) ? ctx.rng.int(0, 3) : -1
    cells.forEach((cx, i) => {
      ctx.fill(cx, 1, 4, cx, 2, 4, AIR)
      ctx.set(cx, 3, 4, 'carved')
      banner(ctx, cx, 4, d - 2, BlockFacing.NORTH)
      if (i === chestCell) ctx.chest(cx, 1, d - 2, { facing: BlockFacing.NORTH })
      else if (i % 2 === 0) ctx.set(cx, 1, d - 2, BlockIds.PRISM_PEDESTAL)
      else ctx.fill(cx - 1, 1, d - 2, cx + 1, 2, d - 2, 'archive')
    })
    lantern(ctx, 4, 5, 2)
    lantern(ctx, 13, 5, 2)
    reopenDoors(ctx)
    gabledRoof(ctx)
  },
}

/** Scriptorium: archive walls, free-standing shelves, reading pedestals. */
const scriptorium: ModuleDef = {
  id: 'scriptorium',
  size: [2, 1, 2],
  tags: ['room', 'library'],
  weight: 1.5,
  maxCount: 2,
  connectors: [
    { cell: [0, 0, 0], face: N },
    { cell: [1, 0, 1], face: E },
    { cell: [1, 0, 1], face: S },
    { cell: [0, 0, 0], face: W },
  ],
  levels: [0, 2],
  overhang: { up: 5 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx)
    // Archive walls (the carved door frames and doorways stay clear)
    ctx.fill(0, 1, 7, 0, 4, d - 2, 'archive')
    ctx.fill(w - 1, 1, 1, w - 1, 4, 10, 'archive')
    ctx.fill(7, 1, 0, w - 2, 4, 0, 'archive')
    ctx.fill(1, 1, d - 1, 10, 4, d - 1, 'archive')
    for (const z of [6, 11]) {
      ctx.fill(4, 1, z, 7, 3, z, 'archive')
      ctx.fill(10, 1, z, 13, 3, z, 'archive')
    }
    ctx.fill(2, 0, 8, w - 3, 0, 9, 'inlay')
    ctx.set(8, 1, 3, BlockIds.PRISM_PEDESTAL)
    ctx.set(9, 1, 14, BlockIds.PRISM_PEDESTAL)
    lantern(ctx, 8, 5, 8)
    if (ctx.rng.chance(0.6)) ctx.chest(15, 1, 15, { facing: BlockFacing.NORTH })
    reopenDoors(ctx)
    if (topOpen(ctx)) {
      cornice(ctx)
      roofPitched(ctx, 1, 1, w - 2, d - 2, h, 'roof', true, 'wall')
    }
  },
}

/** Acolyte quarters (garrison): bunks under banners, a refectory table. */
const acolyteQuarters: ModuleDef = {
  id: 'acolyte_quarters',
  size: [2, 1, 1],
  tags: ['room', 'garrison', 'quarters'],
  weight: 2,
  maxCount: 2,
  minDepth: 2,
  connectors: [{ cell: [0, 0, 0], face: W }, { cell: [1, 0, 0], face: E }, { cell: [1, 0, 0], face: N }],
  levels: [-1, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { d } = ctx
    shell(ctx)
    for (const x of [2, 6, 11, 15]) {
      ctx.fill(x, 1, d - 3, x + 1, 1, d - 2, 'floor')
      ctx.set(x, 2, d - 2, 'carved')
      banner(ctx, x, 5, d - 2, BlockFacing.NORTH)
    }
    ctx.fill(6, 1, 3, 11, 1, 3, 'trim')
    ctx.garrison(3, 0, 3, GARRISON_ACOLYTE_COVEN)
    lantern(ctx, 4, 5, 4)
    lantern(ctx, 13, 5, 4)
    if (ctx.rng.chance(0.35)) ctx.chest(16, 1, 1, { facing: BlockFacing.SOUTH })
    reopenDoors(ctx)
    gabledRoof(ctx)
  },
}

/** Sentinel court (garrison): an open-roofed court with crystal statues on plinths. */
const sentinelCourt: ModuleDef = {
  id: 'sentinel_court',
  size: [2, 1, 2],
  tags: ['room', 'garrison', 'court'],
  weight: 1.8,
  maxCount: 2,
  minDepth: 2,
  connectors: [
    { cell: [0, 0, 0], face: N },
    { cell: [1, 0, 1], face: E },
    { cell: [1, 0, 1], face: S },
    { cell: [0, 0, 0], face: W },
  ],
  levels: [0, 1],
  overhang: { up: 2 },
  build(ctx) {
    const { w, d, h } = ctx
    shell(ctx, true, null)
    cornice(ctx)
    ctx.fill(0, h - 1, 0, w - 1, h - 1, 0, 'trim')
    ctx.fill(0, h - 1, d - 1, w - 1, h - 1, d - 1, 'trim')
    ctx.fill(0, h - 1, 0, 0, h - 1, d - 1, 'trim')
    ctx.fill(w - 1, h - 1, 0, w - 1, h - 1, d - 1, 'trim')
    ctx.fill(8, 0, 2, 9, 0, d - 3, 'inlay')
    ctx.fill(2, 0, 8, w - 3, 0, 9, 'inlay')
    for (const [px, pz] of [[2, 2], [14, 2], [2, 14], [14, 14]]) {
      ctx.fill(px, 1, pz, px + 1, 1, pz + 1, 'floor')
      ctx.light(px, 1, pz)
      ctx.fill(px + 1, 2, pz + 1, px + 1, 4, pz + 1, 'crystal')
      ctx.set(px + 1, 5, pz + 1, 'rose')
    }
    ctx.garrison(8, 0, 8, ctx.rng.chance(0.5) ? GARRISON_SENTINEL_COURT : GARRISON_SENTINEL_GUARD)
    reopenDoors(ctx)
  },
}

/** Lens antechamber (garrison): a mirror corridor guarded by sentinels. */
const lensAntechamber: ModuleDef = {
  id: 'lens_antechamber',
  size: [1, 1, 2],
  tags: ['corridor', 'garrison'],
  weight: 1.5,
  maxCount: 1,
  minDepth: 4,
  connectors: [{ cell: [0, 0, 0], face: N }, { cell: [0, 0, 1], face: S }],
  levels: [-1, 1],
  overhang: { up: 6 },
  build(ctx) {
    const { d, h } = ctx
    shell(ctx)
    ctx.fill(0, 1, 1, 0, 5, d - 2, 'mirror')
    ctx.fill(8, 1, 1, 8, 5, d - 2, 'mirror')
    for (const z of [3, 8, 14]) {
      column(ctx, 1, z, 1, h - 2)
      column(ctx, 7, z, 1, h - 2)
    }
    ctx.set(1, 1, 11, BlockIds.LENS_APPARATUS, ctx.facing(BlockFacing.EAST))
    ctx.set(7, 1, 11, BlockIds.LENS_APPARATUS, ctx.facing(BlockFacing.WEST))
    ctx.fill(4, 0, 1, 4, 0, d - 2, 'inlay')
    ctx.garrison(4, 0, 9, GARRISON_SENTINEL_GUARD)
    lantern(ctx, 4, 5, 4)
    lantern(ctx, 4, 5, 13)
    reopenDoors(ctx)
    if (topOpen(ctx)) roofPitched(ctx, 0, 0, 8, d - 1, h, 'roof', false, 'wall')
  },
}

/** Undercroft hall: heavy piers, carved bands, dim lamps (and sometimes a chest). */
function undercroftDef(id: string, garrison: boolean): ModuleDef {
  return {
    id,
    size: [2, 1, 2],
    tags: garrison ? ['room', 'crypt', 'garrison'] : ['room', 'crypt'],
    weight: garrison ? 1.5 : 2,
    maxCount: garrison ? 1 : 3,
    minDepth: garrison ? 3 : 0,
    connectors: [
      { cell: [0, 0, 0], face: N },
      { cell: [1, 0, 1], face: E },
      { cell: [1, 0, 1], face: S },
      { cell: [0, 0, 0], face: W },
    ],
    levels: [-1, -1],
    build(ctx) {
      const { d } = ctx
      shell(ctx)
      for (const [px, pz] of [[4, 4], [12, 4], [4, 12], [12, 12]]) {
        ctx.fill(px, 1, pz, px + 1, 5, pz + 1, 'wall')
        ctx.fill(px, 3, pz, px + 1, 3, pz + 1, 'carved')
      }
      ctx.light(4, 2, 4)
      ctx.light(13, 2, 13)
      // Reliquary cases along the walls
      ctx.fill(7, 1, 1, 10, 1, 2, 'carved')
      ctx.fill(7, 1, d - 3, 10, 1, d - 2, 'carved')
      ctx.set(8, 2, 1, 'crystal')
      ctx.set(9, 2, d - 2, 'crystal')
      if (garrison) ctx.garrison(8, 0, 8, GARRISON_SHARD_SWARM)
      else if (ctx.rng.chance(0.5)) ctx.chest(8, 1, 8, { facing: BlockFacing.SOUTH })
      reopenDoors(ctx)
    },
  }
}

/** Dead-end shrine: a niche with a pedestal under a banner (sometimes a chest). */
const shrine: ModuleDef = {
  id: 'shrine',
  size: [1, 1, 1],
  tags: ['cap'],
  weight: 1,
  maxCount: 8,
  connectors: [{ cell: [0, 0, 0], face: S }],
  levels: [-1, 2],
  overhang: { up: 7 },
  build(ctx) {
    shell(ctx)
    ctx.fill(1, 1, 1, 7, 5, 3, 'wall')
    ctx.fill(3, 1, 3, 5, 4, 3, AIR)
    ctx.fill(3, 5, 3, 5, 5, 3, 'carved')
    ctx.set(4, 1, 3, BlockIds.PRISM_PEDESTAL)
    banner(ctx, 4, 5, 4, BlockFacing.SOUTH)
    if (ctx.rng.chance(0.3)) ctx.chest(2, 1, 6, { facing: BlockFacing.EAST })
    reopenDoors(ctx)
    pyramidRoof(ctx)
  },
}

// ===========================================================================
// The Warden's lens chamber (boss)
// ===========================================================================

const lensChamber: ModuleDef = {
  id: 'lens_chamber',
  size: [3, 2, 3],
  tags: ['boss'],
  connectors: [{ cell: [1, 0, 2], face: S }],
  levels: [-1, 0],
  overhang: { up: 18 },
  build(ctx) {
    const { h } = ctx
    shell(ctx, false)
    chamfer(ctx, 1, 1, 25, 25, 7, 1, h - 2, 'wall', 'mirror', 2, 10)
    // Floor: star, octagon ring, dais
    for (let t = -10; t <= 10; t++) {
      ctx.set(13 + t, 0, 13, 'inlay')
      ctx.set(13, 0, 13 + t, 'inlay')
      if (Math.abs(t) <= 7) {
        ctx.set(13 + t, 0, 13 + t, 'inlay')
        ctx.set(13 + t, 0, 13 - t, 'inlay')
      }
    }
    for (let dz = -11; dz <= 11; dz++) {
      for (let dx = -11; dx <= 11; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz), Math.round((Math.abs(dx) + Math.abs(dz)) * 0.7071))
        if (m === 4 || m === 11) ctx.set(13 + dx, 0, 13 + dz, 'inlay')
      }
    }
    // Eight tall columns (lamps in the cardinal four)
    const cols: Array<[number, number]> = [[22, 9], [17, 4], [9, 4], [4, 9], [4, 17], [9, 22], [17, 22], [22, 17]]
    cols.forEach(([px, pz], i) => {
      column(ctx, px, pz, 1, h - 2)
      ctx.set(px, 7, pz, 'trim')
      if (i % 2 === 0) ctx.light(px, 5, pz)
    })
    // Lens instruments in a ring, all turned toward the altar
    for (const [lx, lz] of [[13, 6], [20, 13], [13, 20], [6, 13], [9, 9], [17, 9], [9, 17], [17, 17]]) {
      ctx.set(lx, 1, lz, BlockIds.LENS_APPARATUS, ctx.facing(facingToward(lx, lz, 13, 13)))
    }
    // Lanterns high in the corners of the vault
    // (under the ceiling ring around the dome opening when the vault opens up)
    const lanterns = topOpen(ctx) ? [[3, 13], [23, 13], [13, 3], [13, 23]] : [[8, 8], [18, 8], [8, 18], [18, 18]]
    for (const [x, z] of lanterns) lantern(ctx, x, h - 2, z)
    // Banners by the entrance
    banner(ctx, 10, h - 3, 25, BlockFacing.NORTH)
    banner(ctx, 16, h - 3, 25, BlockFacing.NORTH)
    // Dais and the guardian altar
    ctx.fill(12, 1, 12, 14, 1, 14, 'floor')
    ctx.guardian(13, 1, 13, PRISM_WARDEN_GUARDIAN_INDEX)
    reopenDoors(ctx)
    if (topOpen(ctx)) {
      cornice(ctx)
      const R = 10
      const y0 = h - 1
      dome(ctx, 13, y0, 13, R, 'roof')
      // The vault opens into the dome above the Warden's altar
      for (let dz = -(R - 1); dz <= R - 1; dz++) {
        for (let dx = -(R - 1); dx <= R - 1; dx++) {
          if (dx * dx + dz * dz < (R - 0.5) * (R - 0.5)) ctx.set(13 + dx, y0, 13 + dz, AIR)
        }
      }
      for (let a = 0; a < 80; a++) {
        const t = (a / 80) * Math.PI * 2
        ctx.set(13 + Math.round(Math.cos(t) * (R - 0.5)), y0, 13 + Math.round(Math.sin(t) * (R - 0.5)), 'trim')
      }
      ctx.fill(12, y0 + R - 1, 12, 14, y0 + R, 14, 'glass')
      ctx.fill(12, y0 + R + 1, 12, 14, y0 + R + 3, 14, 'crystal')
      ctx.fill(13, y0 + R + 4, 13, 13, y0 + R + 5, 13, BlockIds.ROSE_CRYSTAL)
      ctx.light(13, y0 + R + 6, 13)
    }
  },
}

export const PRISM_SANCTUM_MODULES: readonly ModuleDef[] = [
  prismGate,
  grandGate,
  pylonHall,
  octagonHall,
  galleryDef('prism_gallery', false, 3),
  galleryDef('prism_gallery_side', true, 2),
  junctionDef('gallery_turn', [S, E], 2),
  junctionDef('gallery_tee', [S, E, W], 2),
  junctionDef('gallery_cross', [N, S, E, W], 1.2),
  colonnade,
  terrace,
  bridge,
  stairHall,
  undercroftStair,
  grandStair,
  observatory,
  reliquary,
  grandReliquary,
  meditationCells,
  scriptorium,
  acolyteQuarters,
  sentinelCourt,
  lensAntechamber,
  undercroftDef('undercroft_hall', false),
  undercroftDef('undercroft_crypt', true),
  shrine,
  lensChamber,
]

