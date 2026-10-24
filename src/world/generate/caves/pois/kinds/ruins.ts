import { arch, pillar } from '../../../dungeons/DungeonBuild.ts'
import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, masonry, mix, scatter, walledRoom } from './shared.ts'

/** Ruins: a cistern, a bridge over a chasm, a gaol, a buried arena, a black monolith. */

/** A vaulted cistern: rows of columns standing in a shallow pool, a dais at the back. */
export const SUNKEN_CISTERN: PoiBuildDef = {
  kind: getPoiKind('sunken_cistern'),
  radius: 12, above: 8, below: 3,
  build(b) {
    const wall = masonry(b, 0.3, 0.15)
    walledRoom(b, -9, 0, -10, 9, 6, 2, wall, B.ANCIENT_TILES)
    // The pool: one water deep over a tiled bottom, held in by the walls, the
    // entrance landing, the dais and the column bases
    for (let z = -7; z <= 1; z++) {
      for (let x = -9; x <= 9; x++) {
        b.set(x, -2, z, B.ANCIENT_TILES)
        b.set(x, -1, z, B.WATER)
      }
    }
    // Dais across the back, a step up out of the water; a walkway along the front
    b.fill(-9, -1, -10, 9, -1, -8, B.CARVED_ANCIENT_BRICKS)
    b.fill(-9, -1, 2, 9, -1, 2, B.ANCIENT_TILES)
    // Entrance arch in the front wall and a landing outside
    b.fill(-2, 0, 3, 2, 3, 3, B.AIR)
    b.fill(-3, 0, 3, -3, 4, 3, B.CARVED_ANCIENT_BRICKS)
    b.fill(3, 0, 3, 3, 4, 3, B.CARVED_ANCIENT_BRICKS)
    b.fill(-2, 4, 3, 2, 4, 3, B.CARVED_ANCIENT_BRICKS)
    b.fill(-3, 0, 4, 3, 4, 6, B.AIR)
    b.floor(-3, 4, 3, 6, -1, B.ANCIENT_TILES)
    // Columns marching into the dark, groin-vaulted together; a few have fallen
    const cols = [-6, -2, 2, 6]
    const rows = [-6, -2]
    for (const x of cols) {
      for (const z of rows) {
        const fallen = b.hash(x, 0, z, 271) < 0.18
        const top = fallen ? 1 + Math.floor(b.hash(x, 1, z, 272) * 2) : 6
        pillar(b, x, z, -1, top, wall, 1, B.CARVED_ANCIENT_BRICKS)
        if (fallen) {
          // The drum that fell lies in the water beside it
          const dx = b.hash(x, 2, z, 273) < 0.5 ? 1 : -1
          b.set(x + dx, -1, z, B.CRACKED_ANCIENT_BRICKS)
          b.set(x + dx * 2, -1, z, B.MOSSY_ANCIENT_BRICKS)
        }
      }
    }
    for (const z of rows) for (const [x0, x1] of [[-10, -6], [-6, -2], [-2, 2], [2, 6], [6, 10]]) arch(b, true, x0, x1, z, 4, 2, wall)
    for (const x of cols) for (const [z0, z1] of [[-11, -6], [-6, -2], [-2, 3]]) arch(b, false, z0, z1, x, 4, 2, wall)
    // Lanterns on plinths standing out of the water
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 0], [4, 0]]) {
      b.set(x, -1, z, B.CARVED_ANCIENT_BRICKS)
      b.set(x, 0, z, B.CARVED_ANCIENT_BRICKS)
      b.set(x, 1, z, B.MINERS_LANTERN)
    }
    // Lily pads drifting on the still water
    for (let z = -7; z <= 1; z++) {
      for (let x = -9; x <= 9; x++) {
        if (cols.includes(x) && rows.includes(z)) continue
        if (b.hash(x, 0, z, 274) < 0.06) b.set(x, 0, z, B.LILY_PAD)
      }
    }
    // On the dais: a carved stone face over an offering table, the chest, urns
    b.fill(-2, 0, -10, 2, 3, -10, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 1, -10, B.STONE_BUST, b.facing(FRONT))
    b.set(0, 0, -10, B.CARVED_ANCIENT_BRICKS)
    b.chest(0, 0, -9, FRONT)
    b.set(-3, 0, -9, B.FUNERARY_URN)
    b.set(3, 0, -9, B.FUNERARY_URN)
    scatter(b, -8, -10, 8, -8, 0, 275, (h, x) => (Math.abs(x) <= 1 ? 0 : h < 0.06 ? B.SKULL : h < 0.12 ? B.PEBBLES : 0))
    hangFromCeiling(b, -9, -10, 9, 2, 1, 6, 276, (h) => (h < 0.05 ? B.HANGING_ROOTS : h < 0.08 ? B.COBWEB : 0))
    b.keystone(0, -3, -8)
  },
}

/** A deep chasm crossed by an arched stone bridge whose middle span fell in long ago. */
export const OLD_BRIDGE: PoiBuildDef = {
  kind: getPoiKind('old_bridge'),
  radius: 12, above: 7, below: 10,
  build(b) {
    // A long hall of cave over the crossing
    b.chamber(0, 2, 0, 11.6, 4.4, 9.6, 0, B.STONE, 0.15)
    // The chasm: a crevasse across the site, pinching out at both ends
    const halfWidth = (x: number): number => 4.2 * Math.sqrt(Math.max(0, 1 - (x / 11.5) ** 4))
    for (let x = -11; x <= 11; x++) {
      for (let z = -6; z <= 6; z++) {
        // Never under the landings (|z| >= 5)
        const w = Math.min(4.4, halfWidth(x) + (b.smoothNoise(x, 0, z, 281) - 0.5) * 1.6)
        if (Math.abs(z) > w) continue
        b.fill(x, -9, z, x, -1, z, B.AIR)
        b.set(x, -10, z, weighted3(b.hash(x, -10, z, 282)))
      }
    }
    // Landings on firm ground at both ends
    b.fill(-3, 0, -8, 3, 3, -5, B.AIR)
    b.fill(-3, 0, 5, 3, 3, 8, B.AIR)
    b.floor(-3, 5, 3, 8, -1, B.ANCIENT_TILES)
    b.floor(-3, -8, 3, -5, -1, B.ANCIENT_TILES)
    const wall = masonry(b, 0.22, 0.2)
    // The bridge: a 5-wide deck on a single arch, railings along both sides
    for (let x = -2; x <= 2; x++) {
      arch(b, false, -5, 5, x, -6, 4, wall)
      b.fill(x, -1, -8, x, -1, 8, Math.abs(x) === 2 ? wall : B.ANCIENT_TILES)
    }
    for (let z = -5; z <= 5; z++) {
      for (const x of [-2, 2]) if (Math.abs(z) > 1 && b.hash(x, 0, z, 283) > 0.22) b.set(x, 0, z, B.OAK_FENCE)
    }
    // The middle span is gone: a two-block gap down into the dark, its stones on the chasm floor
    b.fill(-2, -6, -1, 2, 0, 0, B.AIR)
    for (let x = -2; x <= 2; x++) {
      for (const z of [-2, 1]) if (b.hash(x, -2, z, 284) < 0.45) b.set(x, -2, z, B.AIR)
    }
    scatter(b, -4, -3, 4, 2, -9, 285, (h) => (h < 0.3 ? B.CRACKED_ANCIENT_BRICKS : h < 0.45 ? B.GRAVEL : 0))
    scatter(b, -11, -6, 11, 6, -9, 286, (h) => (h < 0.04 ? B.BONE_PILE : h < 0.06 ? B.SKULL : h < 0.1 ? B.CAVE_BONES : h < 0.13 ? B.PEBBLES : h < 0.15 ? B.GLOW_BLOOM : 0))
    // Gatehouses: carved posts and a lintel at both ends of the bridge
    for (const z of [6, -6]) {
      for (const x of [-3, 3]) pillar(b, x, z, -1, 3, B.CARVED_ANCIENT_BRICKS)
      b.fill(-3, 4, z, 3, 4, z, wall)
      b.fill(-2, 3, z, 2, 3, z, B.CARVED_ANCIENT_BRICKS)
    }
    b.chest(2, 0, -8, FRONT)
    b.set(-2, 0, -8, B.BARREL)
    b.set(-2, 1, -8, B.MINERS_LANTERN)
    b.set(1, 0, -8, B.BEDROLL, b.facing(F.WEST))
    b.set(2, 0, 7, B.MINERS_LANTERN)
    b.keystone(0, -2, -7)
  },
}

function weighted3(h: number): number {
  return h < 0.5 ? B.GRAVEL : h < 0.8 ? B.STONE : B.ANDESITE
}

/** A gaol of barred cells off a masonry corridor, the warden's desk at the end. */
export const FORGOTTEN_GAOL: PoiBuildDef = {
  kind: getPoiKind('forgotten_gaol'),
  radius: 9, above: 5, below: 3,
  build(b) {
    const wall = masonry(b, 0.22, 0.22)
    walledRoom(b, -5, 0, -9, 5, 3, 5, wall, B.ANCIENT_TILES)
    // Doorway and a landing in front
    b.fill(-1, 0, 6, 1, 2, 6, B.AIR)
    b.fill(-2, 0, 7, 2, 3, 8, B.AIR)
    b.floor(-2, 7, 2, 8, -1, B.ANCIENT_TILES)
    b.fill(-2, 3, 6, 2, 3, 6, B.CARVED_ANCIENT_BRICKS)
    // Cell partitions (three cells a side), the back of the cell block, lintels over the bars
    for (const s of [-1, 1]) {
      for (const z of [2, -2, -6]) b.fill(Math.min(s * 2, s * 5), 0, z, Math.max(s * 2, s * 5), 3, z, wall)
      b.fill(s * 2, 3, -6, s * 2, 3, 5, wall)
    }
    // Barred fronts; one cell door stands open
    const open = b.rng.int(0, 5)
    let cell = 0
    for (const s of [-1, 1]) {
      for (const [z0, z1] of [[3, 5], [-1, 1], [-5, -3]]) {
        const isOpen = cell++ === open
        for (let z = z0; z <= z1; z++) {
          for (let y = 0; y <= 2; y++) {
            if (isOpen && z === z0 + 1 && y <= 1) continue
            b.set(s * 2, y, z, B.IRON_BARS, b.facing(F.EAST))
          }
        }
        // Inside: straw-strewn gravel, a bedroll, what's left of the prisoner
        for (let z = z0; z <= z1; z++) {
          for (let x = 3; x <= 5; x++) b.set(s * x, -1, z, b.hash(s * x, -1, z, 291) < 0.45 ? B.GRAVEL : B.ANCIENT_TILES)
        }
        const h = b.hash(s, 0, z0, 292)
        b.set(s * 5, 0, z0 + (h < 0.5 ? 0 : 2), B.BEDROLL, b.facing(s < 0 ? F.EAST : F.WEST))
        if (h < 0.75) {
          b.set(s * 4, 0, z0 + 1, B.BONE_PILE)
          b.set(s * 5, 0, z0 + 1, B.SKULL, b.facing(s < 0 ? F.EAST : F.WEST))
        } else {
          b.set(s * 4, 0, z0 + 1, B.CAVE_BONES)
        }
      }
    }
    // The warden's corner: desk, chair, lantern, ledgers, a rack of confiscated arms
    b.set(0, 0, -8, B.OAK_TABLE)
    b.set(0, 1, -8, B.MINERS_LANTERN)
    b.set(0, 0, -7, B.OAK_CHAIR, b.facing(F.NORTH))
    b.set(1, 0, -9, B.BOOK_PILE, b.facing(FRONT))
    b.set(4, 0, -9, B.WEAPON_RACK, b.facing(FRONT))
    b.set(5, 0, -7, B.BARREL)
    b.set(5, 1, -7, B.TANKARDS)
    b.chest(-3, 0, -9, FRONT)
    b.set(-5, 0, -7, B.BARREL)
    // Torches by the door
    b.set(-1, 0, 5, B.TORCH)
    b.set(1, 0, 5, B.TORCH)
    scatter(b, -1, -6, 1, 4, 0, 293, (h) => (h < 0.05 ? B.PEBBLES : h < 0.08 ? B.CAVE_BONES : 0))
    hangFromCeiling(b, -5, -9, 5, 5, 1, 3, 294, (h) => (h < 0.12 ? B.COBWEB : 0))
    b.keystone(0, -2, -5)
  },
}

/** A buried arena: tiers of seats stepping down to a pit of sand, a royal box and a barred gladiators' gate. */
export const BURIED_ARENA: PoiBuildDef = {
  kind: getPoiKind('buried_arena'),
  radius: 13, above: 9, below: 7,
  build(b) {
    b.chamber(0, 3, 0, 12.6, 5.4, 10.6, 0, B.STONE, 0.12)
    const wall = masonry(b, 0.16, 0.16)
    const AX = 11, AZ = 9
    const ring = (x: number, z: number): number => Math.hypot(x / AX, z / AZ)
    // Surface height of each ring: walkway 0, three tiers stepping down, the pit 2 lower again
    const surfaceAt = (x: number, z: number): number => {
      const e = ring(x, z)
      if (e > 1) return 0
      if (e > 0.83) return -1
      if (e > 0.66) return -2
      if (e > 0.5) return -3
      // The aisle down into the pit at the front
      if (z > 0 && Math.abs(x) <= 1 && e > 0.38) return -4
      return -5
    }
    for (let z = -12; z <= 12; z++) {
      for (let x = -13; x <= 13; x++) {
        const e = ring(x, z)
        if (e > 1.12) continue
        const s = surfaceAt(x, z)
        const pit = s <= -4 && e <= 0.5
        b.fill(x, -6, z, x, s - 2, z, wall)
        b.set(x, s - 1, z, pit ? (b.hash(x, s - 1, z, 301) < 0.15 ? B.GRAVEL : B.SAND) : B.ANCIENT_TILES)
        if (s < 0) b.fill(x, s, z, x, -1, z, B.AIR)
        b.foundation(x, z, -7, B.STONE, 1)
      }
    }
    // The gladiators' gate: a barred archway in the back of the pit
    for (let x = -1; x <= 1; x++) {
      for (let z = -7; z <= -5; z++) {
        b.fill(x, -5, z, x, -3, z, B.AIR)
        b.set(x, -6, z, B.ANCIENT_TILES)
      }
      b.fill(x, -2, -7, x, -2, -5, B.CARVED_ANCIENT_BRICKS)
      for (let y = -5; y <= -3; y++) b.set(x, y, -5, B.IRON_BARS)
    }
    for (const x of [-2, 2]) b.fill(x, -5, -5, x, -2, -5, B.CARVED_ANCIENT_BRICKS)
    b.fill(-1, -5, -8, 1, -3, -8, wall)
    b.set(0, -5, -7, B.SKULL, b.facing(FRONT))
    // Weapon racks against the pit wall, facing the sand
    for (const s of [-1, 1]) {
      for (const z of [-2, 0, 2]) {
        let x = s
        while (ring(x + s, z) <= 0.5) x += s
        b.set(x, -5, z, B.WEAPON_RACK, b.facing(s < 0 ? F.EAST : F.WEST))
      }
    }
    // The royal box over the back tiers: a raised dais under a canopy
    for (let z = -10; z <= -8; z++) {
      for (let x = -2; x <= 2; x++) {
        b.fill(x, surfaceAt(x, z), z, x, -1, z, wall)
        b.set(x, 0, z, B.ANCIENT_TILES)
        b.fill(x, 1, z, x, 3, z, B.AIR)
        b.set(x, 4, z, B.CARVED_ANCIENT_BRICKS)
      }
    }
    for (const x of [-2, 2]) for (const z of [-10, -8]) pillar(b, x, z, 1, 3, B.CARVED_ANCIENT_BRICKS)
    for (let x = -1; x <= 1; x++) b.set(x, 1, -8, B.OAK_FENCE)
    b.chest(0, 1, -10, FRONT)
    b.set(-1, 1, -10, B.STONE_BUST, b.facing(FRONT))
    b.set(1, 1, -10, B.STONE_BUST, b.facing(FRONT))
    // Braziers burning on the walkway
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const x = Math.round(AX * 1.06 * Math.cos(a)), z = Math.round(AZ * 1.06 * Math.sin(a))
      b.set(x, 0, z, B.CAMPFIRE)
    }
    // Bones and skulls on the sand
    scatter(b, -6, -5, 6, 5, -5, 302, (h, x, z) => {
      if (ring(x, z) > 0.46) return 0
      return h < 0.04 ? B.SKULL : h < 0.1 ? B.CAVE_BONES : h < 0.12 ? B.BONE_PILE : 0
    })
    b.keystone(0, -3, -9)
  },
}

/** A slab of black obsidian in a perfectly smooth round chamber, a ring of runes around it. */
export const BLACK_MONOLITH: PoiBuildDef = {
  kind: getPoiKind('black_monolith'),
  radius: 8, above: 9, below: 3,
  build(b) {
    // Smooth as glass: a basalt skin and no roughness at all
    b.ellipsoid(0, 3, 0, 8, 6.4, 8, B.BASALT, 0, PoiBuilder.natural)
    b.chamber(0, 3, 0, 7.2, 5.6, 7.2, 0, B.BASALT, 0)
    for (let z = -7; z <= 7; z++) {
      for (let x = -7; x <= 7; x++) {
        const d = dist(x, z)
        if (d > 7) continue
        const ring = Math.abs(d - 4.2) < 0.55
        b.set(x, -1, z, ring ? B.RUNESTONE : d < 1.8 ? B.OBSIDIAN : mix(b, 311, [[B.BASALT, 80], [B.OBSIDIAN, 20]]))
        b.set(x, -2, z, B.BASALT)
      }
    }
    // The monolith: three wide, one thick, seven tall
    b.fill(-1, 0, -1, 1, 6, -1, B.OBSIDIAN)
    // The faithful who knelt before it, facing it still
    for (const a of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      const x = Math.round(3 * Math.cos(Math.PI * a)), z = Math.round(3 * Math.sin(Math.PI * a))
      b.set(x, 0, z, B.SKULL, b.facing(Math.abs(x) > z ? (x > 0 ? F.WEST : F.EAST) : F.NORTH))
      if (b.hash(x, 0, z, 312) < 0.6) b.set(x + Math.sign(x), 0, z + 1, B.BONE_PILE)
    }
    b.chest(0, 0, 0, FRONT)
    scatter(b, -6, -6, 6, 6, 0, 313, (h, x, z) => {
      const d = dist(x, z)
      if (d < 2 || d > 6.4) return 0
      return h < 0.08 ? B.CINDERS : h < 0.11 ? B.CAVE_BONES : 0
    })
    b.keystone(0, -2, 0)
  },
}

export const RUIN_KINDS: readonly PoiBuildDef[] = [SUNKEN_CISTERN, OLD_BRIDGE, FORGOTTEN_GAOL, BURIED_ARENA, BLACK_MONOLITH]
